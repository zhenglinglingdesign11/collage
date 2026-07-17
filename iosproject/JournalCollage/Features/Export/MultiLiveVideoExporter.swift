import AVFoundation
import UIKit

struct LivePhotoVideoLayer: Equatable {
    var layer: Layer
    var videoURL: URL
}

enum MultiLiveVideoExporterError: LocalizedError {
    case invalidVideo
    case writerFailed
    case pixelBufferFailed

    var errorDescription: String? {
        switch self {
        case .invalidVideo:
            return L10n.t("video.export.error.invalid_video")
        case .writerFailed:
            return L10n.t("video.export.error.writer_failed")
        case .pixelBufferFailed:
            return L10n.t("video.export.error.pixel_buffer_failed")
        }
    }
}

@MainActor
enum MultiLiveVideoExporter {
    private static let framesPerSecond: Int32 = 12
    private static let maxDurationSeconds = 6.0

    static func renderVideo(
        draft: Draft,
        imageStore: ImageStore?,
        liveLayers: [LivePhotoVideoLayer]
    ) async throws -> URL {
        guard liveLayers.count > 1 else {
            throw MultiLiveVideoExporterError.invalidVideo
        }

        let pixelSize = videoPixelSize(for: draft)
        let background = try ExportRenderer.render(draft: draft, imageStore: imageStore, pixelSize: pixelSize).image
        var clips: [VideoClip] = []
        for liveLayer in liveLayers {
            clips.append(try await VideoClip(liveLayer: liveLayer))
        }
        let duration = min(maxDurationSeconds, max(1.0, clips.map(\.duration).max() ?? 1.0))

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("JournalCollage-Video-\(UUID().uuidString).mov")
        try? FileManager.default.removeItem(at: outputURL)

        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)
        let size = CGSize(width: even(pixelSize.width), height: even(pixelSize.height))
        let input = AVAssetWriterInput(
            mediaType: .video,
            outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: Int(size.width),
                AVVideoHeightKey: Int(size.height)
            ]
        )
        input.expectsMediaDataInRealTime = false

        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
                kCVPixelBufferWidthKey as String: Int(size.width),
                kCVPixelBufferHeightKey as String: Int(size.height)
            ]
        )

        guard writer.canAdd(input) else {
            throw MultiLiveVideoExporterError.writerFailed
        }
        writer.add(input)

        guard writer.startWriting() else {
            throw writer.error ?? MultiLiveVideoExporterError.writerFailed
        }
        writer.startSession(atSourceTime: .zero)

        let frameCount = max(1, Int(ceil(duration * Double(framesPerSecond))))
        let frameDuration = CMTime(value: 1, timescale: framesPerSecond)

        for frameIndex in 0..<frameCount {
            while !input.isReadyForMoreMediaData {
                Thread.sleep(forTimeInterval: 0.01)
            }

            let presentationTime = CMTimeMultiply(frameDuration, multiplier: Int32(frameIndex))
            let seconds = Double(frameIndex) / Double(framesPerSecond)
            let frame = renderFrame(
                background: background,
                draft: draft,
                pixelSize: size,
                clips: clips,
                seconds: seconds
            )
            guard let buffer = pixelBuffer(from: frame, size: size, adaptor: adaptor),
                  adaptor.append(buffer, withPresentationTime: presentationTime) else {
                throw writer.error ?? MultiLiveVideoExporterError.pixelBufferFailed
            }
        }

        input.markAsFinished()
        try await finishWriting(writer)
        return outputURL
    }

    private static func videoPixelSize(for draft: Draft) -> CGSize {
        let recommended = ExportRenderer.recommendedPixelSize(for: draft)
        let maxEdge: CGFloat = 1920
        let longest = max(recommended.width, recommended.height)
        guard longest > maxEdge else {
            return CGSize(width: even(recommended.width), height: even(recommended.height))
        }
        let scale = maxEdge / longest
        return CGSize(width: even(recommended.width * scale), height: even(recommended.height * scale))
    }

    private static func renderFrame(
        background: UIImage,
        draft: Draft,
        pixelSize: CGSize,
        clips: [VideoClip],
        seconds: Double
    ) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true

        return UIGraphicsImageRenderer(size: pixelSize, format: format).image { context in
            background.draw(in: CGRect(origin: .zero, size: pixelSize))
            clips.forEach { clip in
                draw(clip: clip, draft: draft, pixelSize: pixelSize, seconds: seconds, context: context.cgContext)
            }
        }
    }

    private static func draw(
        clip: VideoClip,
        draft: Draft,
        pixelSize: CGSize,
        seconds: Double,
        context: CGContext
    ) {
        guard let frame = clip.image(at: seconds) else { return }

        let scale = pixelSize.width / CGFloat(draft.width)
        let layer = clip.layer
        let renderedWidth = CGFloat(layer.width * layer.scale) * scale
        let renderedHeight = CGFloat(layer.height * layer.scale) * scale
        let center = CGPoint(
            x: CGFloat(layer.x + layer.width / 2) * scale,
            y: CGFloat(layer.y + layer.height / 2) * scale
        )
        let localRect = CGRect(
            x: -renderedWidth / 2,
            y: -renderedHeight / 2,
            width: renderedWidth,
            height: renderedHeight
        )
        let image = ImageCropper.crop(frame, cropBox: layer.crop)

        context.saveGState()
        context.translateBy(x: center.x, y: center.y)
        context.rotate(by: CGFloat(layer.rotation * .pi / 180))
        context.setAlpha(CGFloat(layer.opacity))
        UIBezierPath(
            roundedRect: localRect,
            cornerRadius: CGFloat(layer.radius ?? 6) * scale
        ).addClip()
        image.draw(in: aspectFillRect(for: image.size, in: localRect))
        context.restoreGState()
    }

    private static func aspectFillRect(for sourceSize: CGSize, in targetRect: CGRect) -> CGRect {
        guard sourceSize.width > 0, sourceSize.height > 0 else { return targetRect }
        let scale = max(targetRect.width / sourceSize.width, targetRect.height / sourceSize.height)
        let width = sourceSize.width * scale
        let height = sourceSize.height * scale
        return CGRect(
            x: targetRect.midX - width / 2,
            y: targetRect.midY - height / 2,
            width: width,
            height: height
        )
    }

    private static func pixelBuffer(
        from image: UIImage,
        size: CGSize,
        adaptor: AVAssetWriterInputPixelBufferAdaptor
    ) -> CVPixelBuffer? {
        guard let pool = adaptor.pixelBufferPool else { return nil }
        var pixelBuffer: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBuffer) == kCVReturnSuccess,
              let pixelBuffer else {
            return nil
        }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer {
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        }

        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(pixelBuffer),
            width: Int(size.width),
            height: Int(size.height),
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        ) else {
            return nil
        }

        UIGraphicsPushContext(context)
        image.draw(in: CGRect(origin: .zero, size: size))
        UIGraphicsPopContext()
        return pixelBuffer
    }

    private static func finishWriting(_ writer: AVAssetWriter) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            writer.finishWriting {
                if let error = writer.error {
                    continuation.resume(throwing: error)
                } else if writer.status == .completed {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: MultiLiveVideoExporterError.writerFailed)
                }
            }
        }
    }

    private static func even(_ value: CGFloat) -> CGFloat {
        let rounded = max(2, Int(value.rounded(.down)))
        return CGFloat(rounded.isMultiple(of: 2) ? rounded : rounded - 1)
    }
}

private struct VideoClip {
    var layer: Layer
    var duration: Double

    private let generator: AVAssetImageGenerator

    init(liveLayer: LivePhotoVideoLayer) async throws {
        let asset = AVURLAsset(url: liveLayer.videoURL)
        let duration = try await asset.load(.duration)
        self.layer = liveLayer.layer
        self.duration = duration.seconds.isFinite && duration.seconds > 0 ? duration.seconds : 1.0
        self.generator = AVAssetImageGenerator(asset: asset)
        self.generator.appliesPreferredTrackTransform = true
    }

    func image(at seconds: Double) -> UIImage? {
        let localSeconds = duration > 0 ? seconds.truncatingRemainder(dividingBy: duration) : seconds
        let time = CMTime(seconds: localSeconds, preferredTimescale: 600)
        guard let cgImage = try? generator.copyCGImage(at: time, actualTime: nil) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}
