import Foundation

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
                "fontId": .string("system"),
                "fontLabel": .string("系统"),
                "fontSize": .number(54),
                "color": .string("#111111")
            ]
        )
    }

    private static func nextLayerOrder(in draft: Draft) -> Int {
        (draft.layers.map(\.zIndex).max() ?? 0) + 1
    }
}
