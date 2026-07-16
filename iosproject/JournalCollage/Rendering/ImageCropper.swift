import CoreGraphics
import UIKit

enum CropPreset: String, CaseIterable, Identifiable, Sendable {
    case free
    case original
    case square
    case portrait
    case landscape
    case story

    var id: String { rawValue }

    var label: String {
        switch self {
        case .free:
            return "自由"
        case .original:
            return "原图"
        case .square:
            return "1:1"
        case .portrait:
            return "3:4"
        case .landscape:
            return "4:3"
        case .story:
            return "9:16"
        }
    }

    var ratio: Double? {
        switch self {
        case .free:
            return nil
        case .original:
            return nil
        case .square:
            return 1
        case .portrait:
            return 3.0 / 4.0
        case .landscape:
            return 4.0 / 3.0
        case .story:
            return 9.0 / 16.0
        }
    }
}

enum ImageCropper {
    static func centeredCrop(sourceWidth: Double, sourceHeight: Double, ratio: Double) -> CropBox {
        guard sourceWidth > 0, sourceHeight > 0, ratio > 0 else {
            return CropBox(x: 0, y: 0, width: max(0, sourceWidth), height: max(0, sourceHeight))
        }

        let sourceRatio = sourceWidth / sourceHeight
        if sourceRatio > ratio {
            let width = sourceHeight * ratio
            return CropBox(
                x: (sourceWidth - width) / 2,
                y: 0,
                width: width,
                height: sourceHeight
            )
        }

        let height = sourceWidth / ratio
        return CropBox(
            x: 0,
            y: (sourceHeight - height) / 2,
            width: sourceWidth,
            height: height
        )
    }

    static func fullCrop(sourceWidth: Double, sourceHeight: Double) -> CropBox {
        CropBox(x: 0, y: 0, width: max(0, sourceWidth), height: max(0, sourceHeight))
    }

    static func constrainedCrop(_ cropBox: CropBox, sourceWidth: Double, sourceHeight: Double, minimumSize: Double = 24) -> CropBox {
        guard sourceWidth > 0, sourceHeight > 0 else {
            return CropBox(x: 0, y: 0, width: 0, height: 0)
        }

        let width = min(sourceWidth, max(minimumSize, cropBox.width))
        let height = min(sourceHeight, max(minimumSize, cropBox.height))
        return CropBox(
            x: min(sourceWidth - width, max(0, cropBox.x)),
            y: min(sourceHeight - height, max(0, cropBox.y)),
            width: width,
            height: height
        )
    }

    static func crop(_ image: UIImage, cropBox: CropBox?) -> UIImage {
        guard let cropBox,
              let cgImage = image.cgImage else {
            return image
        }

        let sourceWidth = Double(cgImage.width)
        let sourceHeight = Double(cgImage.height)
        let rect = CGRect(
            x: CGFloat(clamp(cropBox.x, 0, sourceWidth)),
            y: CGFloat(clamp(cropBox.y, 0, sourceHeight)),
            width: CGFloat(clamp(cropBox.width, 0, sourceWidth)),
            height: CGFloat(clamp(cropBox.height, 0, sourceHeight))
        ).intersection(
            CGRect(
                x: 0,
                y: 0,
                width: CGFloat(sourceWidth),
                height: CGFloat(sourceHeight)
            )
        ).integral

        guard rect.width > 0,
              rect.height > 0,
              let cropped = cgImage.cropping(to: rect) else {
            return image
        }

        return UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
    }

    private static func clamp(_ value: Double, _ minValue: Double, _ maxValue: Double) -> Double {
        min(maxValue, max(minValue, value))
    }
}
