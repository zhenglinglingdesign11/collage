import Foundation
import CoreGraphics

enum DraftFactory {
    static func makeImageLayer(source: String, imageSize: CanvasSize, draft: Draft) -> Layer {
        let maxWidth = draft.width * 0.72
        let scale = maxWidth / imageSize.width
        let width = maxWidth
        let height = imageSize.height * scale
        return Layer(
            type: .image,
            x: (draft.width - width) / 2,
            y: (draft.height - height) / 2,
            width: width,
            height: height,
            zIndex: nextLayerOrder(in: draft),
            source: source,
            sourceWidth: imageSize.width,
            sourceHeight: imageSize.height
        )
    }

    static func makeAssetLayer(item: AssetPackItem, draft: Draft) -> Layer {
        let sourceWidth = Double(item.width)
        let sourceHeight = Double(item.height)
        let maxWidth = draft.width * (item.type == .sticker ? 0.34 : 0.52)
        let scale = min(1, maxWidth / sourceWidth)
        let width = sourceWidth * scale
        let height = sourceHeight * scale
        return Layer(
            type: item.type,
            x: (draft.width - width) / 2,
            y: (draft.height - height) / 2,
            width: width,
            height: height,
            zIndex: nextLayerOrder(in: draft),
            source: item.source,
            assetId: item.id,
            sourceWidth: sourceWidth,
            sourceHeight: sourceHeight,
            style: [
                "name": .string(item.name)
            ]
        )
    }

    static func makeTextLayer(text: String = "weekend", draft: Draft) -> Layer {
        Layer(
            type: .text,
            x: draft.width * 0.56,
            y: draft.height * 0.68,
            width: 260,
            height: 86,
            zIndex: nextLayerOrder(in: draft),
            text: text,
            style: [
                LayerStyleKey.textFontId: .string("system"),
                LayerStyleKey.textFontLabel: .string("System"),
                LayerStyleKey.textFontFamily: .string("PingFang SC, sans-serif"),
                LayerStyleKey.textCanvasFontFamily: .string("PingFang SC, sans-serif"),
                LayerStyleKey.textFontSize: .number(54),
                LayerStyleKey.textColor: .string("#111111"),
                LayerStyleKey.textBackgroundLabel: .string("\u{65E0}"),
                LayerStyleKey.textBackground: .string("transparent")
            ]
        )
    }

    static func makeEmbossShapeLayer(shape: LayerMaskShape, draft: Draft) -> Layer {
        let size = min(draft.width, draft.height) * 0.30
        return Layer(
            type: .cut,
            x: (draft.width - size) / 2,
            y: (draft.height - size) / 2,
            width: size,
            height: size,
            opacity: 0.92,
            zIndex: nextLayerOrder(in: draft),
            radius: 8,
            shadow: true,
            style: [
                LayerStyleKey.embossMode: .string(EmbossMode.fill.rawValue),
                LayerStyleKey.embossShape: .string(shape.rawValue),
                LayerStyleKey.maskShape: .string(shape.rawValue),
                "color": .string("#efe7d8")
            ]
        )
    }

    static func makeBrushLayer(strokes: [BrushStroke], draft: Draft) -> Layer {
        let bounds = brushBounds(strokes: strokes, draft: draft)
        return Layer(
            type: .brush,
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.width,
            height: bounds.height,
            opacity: 1,
            zIndex: nextLayerOrder(in: draft),
            brushWidth: bounds.width,
            brushHeight: bounds.height,
            strokes: normalizeBrushStrokes(strokes, origin: bounds.origin),
            style: [
                LayerStyleKey.brushType: .string("decorative")
            ]
        )
    }

    private static func nextLayerOrder(in draft: Draft) -> Int {
        (draft.layers.map(\.zIndex).max() ?? 0) + 1
    }

    private static func brushBounds(strokes: [BrushStroke], draft: Draft) -> CGRect {
        let sizes = strokes.map { max(1, $0.size) }
        let padding = (sizes.max() ?? 18) * 1.5
        let points = strokes.flatMap(\.points)
        guard let first = points.first else {
            let size = min(draft.width, draft.height) * 0.24
            return CGRect(
                x: (draft.width - size) / 2,
                y: (draft.height - size) / 2,
                width: size,
                height: size
            )
        }
        let minX = max(0, points.reduce(first.x) { min($0, $1.x) } - padding)
        let minY = max(0, points.reduce(first.y) { min($0, $1.y) } - padding)
        let maxX = min(draft.width, points.reduce(first.x) { max($0, $1.x) } + padding)
        let maxY = min(draft.height, points.reduce(first.y) { max($0, $1.y) } + padding)
        return CGRect(
            x: minX,
            y: minY,
            width: max(24, maxX - minX),
            height: max(24, maxY - minY)
        )
    }

    private static func normalizeBrushStrokes(strokes: [BrushStroke], origin: CGPoint) -> [BrushStroke] {
        strokes.map { stroke in
            var next = stroke
            next.points = stroke.points.map { point in
                BrushPoint(x: point.x - origin.x, y: point.y - origin.y)
            }
            return next
        }
    }
}
