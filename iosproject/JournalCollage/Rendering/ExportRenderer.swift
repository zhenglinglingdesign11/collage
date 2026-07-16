import SwiftUI
import UIKit

struct ExportedImage: Identifiable {
    let id = UUID()
    let image: UIImage
    let pixelSize: CGSize
}

enum ExportRendererError: LocalizedError {
    case emptyCanvas
    case renderFailed

    var errorDescription: String? {
        switch self {
        case .emptyCanvas:
            return L10n.t("export.error.empty")
        case .renderFailed:
            return L10n.t("export.error.render_failed")
        }
    }
}

@MainActor
enum ExportRenderer {
    static func recommendedPixelSize(for draft: Draft) -> CGSize {
        switch draft.ratio {
        case .portrait:
            return CGSize(width: 1800, height: 2400)
        case .square:
            return CGSize(width: 2000, height: 2000)
        case .story:
            return CGSize(width: 1800, height: 3200)
        }
    }

    static func render(
        draft: Draft,
        imageStore: ImageStore? = nil,
        pixelSize: CGSize? = nil
    ) throws -> ExportedImage {
        guard draft.width > 0, draft.height > 0 else {
            throw ExportRendererError.emptyCanvas
        }

        let targetSize = pixelSize ?? recommendedPixelSize(for: draft)
        let content = ExportCanvasView(
            draft: draft,
            imageStore: imageStore,
            pixelSize: targetSize
        )
        .frame(width: targetSize.width, height: targetSize.height)

        let renderer = ImageRenderer(content: content)
        renderer.proposedSize = ProposedViewSize(width: targetSize.width, height: targetSize.height)
        renderer.scale = 1
        renderer.isOpaque = true

        guard let image = renderer.uiImage else {
            throw ExportRendererError.renderFailed
        }

        return ExportedImage(image: image, pixelSize: targetSize)
    }
}

private struct ExportCanvasView: View {
    let draft: Draft
    let imageStore: ImageStore?
    let pixelSize: CGSize

    private var scale: CGFloat {
        guard draft.width > 0 else { return 1 }
        return pixelSize.width / CGFloat(draft.width)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(color(from: draft.background) ?? JournalColors.paper)
                .frame(width: pixelSize.width, height: pixelSize.height)
                .overlay(backgroundPattern)

            ForEach(draft.orderedLayers) { layer in
                layerView(layer)
            }
        }
        .frame(width: pixelSize.width, height: pixelSize.height)
        .clipped()
    }

    @ViewBuilder
    private func layerView(_ layer: Layer) -> some View {
        let renderedWidth = CGFloat(layer.width * layer.scale) * scale
        let renderedHeight = CGFloat(layer.height * layer.scale) * scale
        let center = CGPoint(
            x: CGFloat(layer.x + layer.width / 2) * scale,
            y: CGFloat(layer.y + layer.height / 2) * scale
        )

        layerContent(layer)
            .frame(width: renderedWidth, height: renderedHeight)
            .layerMask(maskShape(for: layer), cornerRadius: CGFloat(layer.radius ?? 6) * scale)
            .alphaMask(alphaMaskImage(for: layer))
            .shadow(
                color: layer.shadow == true ? .black.opacity(0.18) : .clear,
                radius: layer.shadow == true ? 10 * scale : 0,
                x: 0,
                y: layer.shadow == true ? 6 * scale : 0
            )
            .overlay(tearPlaceholder(for: layer, width: renderedWidth, height: renderedHeight))
            .opacity(layer.opacity)
            .rotationEffect(.degrees(layer.rotation))
            .position(center)
    }

    @ViewBuilder
    private func layerContent(_ layer: Layer) -> some View {
        switch layer.type {
        case .text:
            ZStack {
                if let background = textBackground(for: layer) {
                    RoundedRectangle(cornerRadius: 10 * scale, style: .continuous)
                        .fill(background)
                }

                Text(layer.text ?? "")
                    .font(textFont(for: layer))
                    .foregroundStyle(color(from: styleString(layer, key: "color") ?? "#111111") ?? JournalColors.ink)
                    .minimumScaleFactor(0.4)
                    .multilineTextAlignment(.center)
                    .padding(6 * scale)
            }
        case .tape:
            Rectangle()
                .fill(color(from: styleString(layer, key: "color") ?? "#ead48a") ?? JournalColors.tapeYellow)
                .overlay(tapeStripes())
        case .paper:
            RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 4) * scale, style: .continuous)
                .fill(color(from: styleString(layer, key: "color") ?? "#efe7d8") ?? JournalColors.paperBeige)
        case .image, .sticker, .cut:
            if let url = ImageSourceResolver.url(for: layer.source, imageStore: imageStore),
               let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: ImageCropper.crop(image, cropBox: layer.crop))
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 6) * scale, style: .continuous))
            } else {
                RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 6) * scale, style: .continuous)
                    .fill(JournalColors.weak)
            }
        }
    }

    private var backgroundPattern: some View {
        Canvas { context, size in
            guard let pattern = draft.backgroundPattern else { return }
            let spacing = 32 * scale
            let stroke = StrokeStyle(lineWidth: max(1, 0.6 * scale))
            var path = Path()
            if pattern == "line" {
                stride(from: spacing, through: size.height, by: spacing).forEach { y in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                }
            } else if pattern == "square" {
                stride(from: spacing, through: size.width, by: spacing).forEach { x in
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: size.height))
                }
                stride(from: spacing, through: size.height, by: spacing).forEach { y in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                }
            }
            context.stroke(path, with: .color(JournalColors.ink.opacity(0.10)), style: stroke)
        }
    }

    private func tapeStripes() -> some View {
        HStack(spacing: 12 * scale) {
            ForEach(0..<8, id: \.self) { _ in
                Rectangle()
                    .fill(Color.white.opacity(0.25))
                    .frame(width: 6 * scale)
            }
        }
    }

    private func color(from hex: String) -> Color? {
        Color(hexString: hex)
    }

    private func styleString(_ layer: Layer, key: String) -> String? {
        if case .string(let value) = layer.style[key] {
            return value
        }
        return nil
    }

    private func styleNumber(_ layer: Layer, key: String) -> Double? {
        if case .number(let value) = layer.style[key] {
            return value
        }
        return nil
    }

    private func textFont(for layer: Layer) -> Font {
        let size = max(10, CGFloat(styleNumber(layer, key: "fontSize") ?? 54) / 2.2) * scale
        switch styleString(layer, key: "fontId") {
        case "serif":
            return .system(size: size, weight: .semibold, design: .serif)
        case "rounded":
            return .system(size: size, weight: .semibold, design: .rounded)
        default:
            return .system(size: size, weight: .semibold)
        }
    }

    private func textBackground(for layer: Layer) -> Color? {
        guard let value = styleString(layer, key: "background"),
              value != "transparent" else {
            return nil
        }
        return color(from: value)
    }

    private func maskShape(for layer: Layer) -> LayerMaskShape? {
        guard case .string(let value) = layer.style["maskShape"] else { return nil }
        return LayerMaskShape(rawValue: value)
    }

    private func alphaMaskImage(for layer: Layer) -> UIImage? {
        guard case .string(let source) = layer.style["maskSource"],
              let url = ImageSourceResolver.url(for: source, imageStore: imageStore) else {
            return nil
        }
        return UIImage(contentsOfFile: url.path)
    }

    @ViewBuilder
    private func tearPlaceholder(for layer: Layer, width: CGFloat, height: CGFloat) -> some View {
        if layer.tear == true {
            RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 4) * scale, style: .continuous)
                .stroke(
                    JournalColors.ink.opacity(0.22),
                    style: StrokeStyle(lineWidth: max(1, scale), dash: [5 * scale, 4 * scale])
                )
                .frame(width: width, height: height)
        }
    }
}
