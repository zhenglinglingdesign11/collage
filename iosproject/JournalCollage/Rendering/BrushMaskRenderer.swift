import CoreGraphics
import UIKit

enum BrushMaskRenderer {
    static let maskSize = CGSize(width: 1024, height: 1024)
    static let lineWidth = 72.0

    static func normalizedStrokes(from strokes: [[CGPoint]], drawingSize: CGSize) -> [[BrushPoint]] {
        guard drawingSize.width > 0, drawingSize.height > 0 else { return [] }
        return strokes
            .map { stroke in
                stroke.map { point in
                    BrushPoint(
                        x: min(1, max(0, Double(point.x / drawingSize.width))),
                        y: min(1, max(0, Double(point.y / drawingSize.height)))
                    )
                }
            }
            .filter { $0.count > 1 }
    }

    static func renderMask(strokes: [[BrushPoint]], size: CGSize = maskSize, lineWidth: Double = lineWidth) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { context in
            UIColor.clear.setFill()
            context.fill(CGRect(origin: .zero, size: size))

            let cgContext = context.cgContext
            cgContext.setStrokeColor(UIColor.white.cgColor)
            cgContext.setLineWidth(CGFloat(lineWidth))
            cgContext.setLineCap(.round)
            cgContext.setLineJoin(.round)

            for stroke in strokes where stroke.count > 1 {
                guard let first = stroke.first else { continue }
                cgContext.beginPath()
                cgContext.move(to: denormalized(first, in: size))
                for point in stroke.dropFirst() {
                    cgContext.addLine(to: denormalized(point, in: size))
                }
                cgContext.strokePath()
            }
        }
    }

    static func jsonValue(from strokes: [[BrushPoint]]) -> JSONValue {
        .array(
            strokes.map { stroke in
                .array(
                    stroke.map { point in
                        .object([
                            "x": .number(point.x),
                            "y": .number(point.y)
                        ])
                    }
                )
            }
        )
    }

    private static func denormalized(_ point: BrushPoint, in size: CGSize) -> CGPoint {
        CGPoint(
            x: CGFloat(point.x) * size.width,
            y: CGFloat(point.y) * size.height
        )
    }
}
