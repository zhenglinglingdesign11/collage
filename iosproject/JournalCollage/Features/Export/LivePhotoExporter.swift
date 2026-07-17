import AVFoundation
import ImageIO
import Photos
import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum LivePhotoExportOutcome: Equatable {
    case staticImage
    case livePhoto
    case video
    case staticFallback
}

enum LivePhotoExporterError: LocalizedError {
    case missingVideo
    case missingImage
    case stillWriteFailed

    var errorDescription: String? {
        switch self {
        case .missingVideo:
            return L10n.t("live_photo.export.error.missing_video")
        case .missingImage:
            return L10n.t("live_photo.export.error.missing_image")
        case .stillWriteFailed:
            return L10n.t("live_photo.export.error.still_write_failed")
        }
    }
}

@MainActor
enum LivePhotoExporter {
    static func export(
        draft: Draft,
        imageStore: ImageStore?
    ) async throws -> LivePhotoExportOutcome {
        let liveLayers = livePhotoVideoLayers(in: draft, imageStore: imageStore)

        if liveLayers.count > 1 {
            do {
                let videoURL = try await MultiLiveVideoExporter.renderVideo(
                    draft: draft,
                    imageStore: imageStore,
                    liveLayers: liveLayers
                )
                defer {
                    try? FileManager.default.removeItem(at: videoURL)
                }
                try await PhotoLibrarySaver.saveVideo(fileURL: videoURL)
                return .video
            } catch PhotoLibrarySaverError.permissionDenied {
                throw PhotoLibrarySaverError.permissionDenied
            } catch {
                let exported = try ExportRenderer.render(draft: draft, imageStore: imageStore)
                try await PhotoLibrarySaver.save(exported.image)
                return .staticFallback
            }
        }

        let exported = try ExportRenderer.render(draft: draft, imageStore: imageStore)

        guard let videoURL = liveLayers.first?.videoURL else {
            try await PhotoLibrarySaver.save(exported.image)
            return .staticImage
        }

        do {
            let stillURL = try makePairedStillImage(from: exported.image, pairedVideoURL: videoURL)
            defer {
                try? FileManager.default.removeItem(at: stillURL)
            }

            try await PhotoLibrarySaver.saveLivePhoto(photoURL: stillURL, pairedVideoURL: videoURL)
            return .livePhoto
        } catch PhotoLibrarySaverError.permissionDenied {
            throw PhotoLibrarySaverError.permissionDenied
        } catch {
            try await PhotoLibrarySaver.save(exported.image)
            return .staticFallback
        }
    }

    private static func livePhotoVideoLayers(in draft: Draft, imageStore: ImageStore?) -> [LivePhotoVideoLayer] {
        draft.orderedLayers.compactMap { layer in
            guard case .string(let mediaType) = layer.style["mediaType"],
                  mediaType == "livePhoto",
                  case .string(let videoSource) = layer.style["livePhotoVideoSource"] else {
                return nil
            }
            guard let videoURL = ImageSourceResolver.url(for: videoSource, imageStore: imageStore) else {
                return nil
            }
            return LivePhotoVideoLayer(layer: layer, videoURL: videoURL)
        }
    }

    private static func makePairedStillImage(
        from image: UIImage,
        pairedVideoURL: URL
    ) throws -> URL {
        guard let assetIdentifier = livePhotoAssetIdentifier(from: pairedVideoURL) else {
            throw LivePhotoExporterError.missingVideo
        }
        guard let cgImage = image.cgImage else {
            throw LivePhotoExporterError.missingImage
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("JournalCollage-Live-\(UUID().uuidString).jpg")
        guard let destination = CGImageDestinationCreateWithURL(
            outputURL as CFURL,
            UTType.jpeg.identifier as CFString,
            1,
            nil
        ) else {
            throw LivePhotoExporterError.stillWriteFailed
        }

        let properties: NSDictionary = [
            kCGImagePropertyMakerAppleDictionary: [
                "17": assetIdentifier
            ],
            kCGImagePropertyOrientation: image.imageOrientation.cgImagePropertyOrientation.rawValue
        ]
        CGImageDestinationAddImage(destination, cgImage, properties as CFDictionary)

        guard CGImageDestinationFinalize(destination) else {
            throw LivePhotoExporterError.stillWriteFailed
        }
        return outputURL
    }

    private static func livePhotoAssetIdentifier(from pairedVideoURL: URL) -> String? {
        let asset = AVURLAsset(url: pairedVideoURL)
        return asset.metadata(forFormat: .quickTimeMetadata)
            .first { item in
                item.identifier == .quickTimeMetadataContentIdentifier
            }?
            .stringValue
    }
}

private extension UIImage.Orientation {
    var cgImagePropertyOrientation: CGImagePropertyOrientation {
        switch self {
        case .up:
            return .up
        case .upMirrored:
            return .upMirrored
        case .down:
            return .down
        case .downMirrored:
            return .downMirrored
        case .left:
            return .left
        case .leftMirrored:
            return .leftMirrored
        case .right:
            return .right
        case .rightMirrored:
            return .rightMirrored
        @unknown default:
            return .up
        }
    }
}
