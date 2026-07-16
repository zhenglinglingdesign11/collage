import SwiftUI
import UIKit

struct DraftRenderer: View {
    let draft: Draft
    var selectedLayerId: String?
    var imageStore: ImageStore?

    var body: some View {
        GeometryReader { proxy in
            let viewport = CanvasViewport(
                canvasSize: CGSize(width: draft.width, height: draft.height),
                containerSize: proxy.size
            )

            ZStack(alignment: .topLeading) {
                Rectangle()
                    .fill(color(from: draft.background) ?? JournalColors.paper)
                    .frame(width: viewport.renderedSize.width, height: viewport.renderedSize.height)
                    .overlay(backgroundPattern(size: viewport.renderedSize))

                ForEach(draft.orderedLayers) { layer in
                    layerView(layer, viewport: viewport)
                }
            }
            .frame(width: viewport.renderedSize.width, height: viewport.renderedSize.height)
            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .stroke(JournalColors.border)
            )
            .shadow(color: .black.opacity(0.08), radius: 18, x: 0, y: 8)
            .position(x: viewport.canvasRect.midX, y: viewport.canvasRect.midY)
        }
    }

    @ViewBuilder
    private func layerView(_ layer: Layer, viewport: CanvasViewport) -> some View {
        let renderedWidth = CGFloat(layer.width * layer.scale) * viewport.scale
        let renderedHeight = CGFloat(layer.height * layer.scale) * viewport.scale
        let center = viewport.screenPoint(
            fromCanvas: CGPoint(
                x: CGFloat(layer.x + layer.width / 2),
                y: CGFloat(layer.y + layer.height / 2)
            )
        )
        let localCenter = CGPoint(
            x: center.x - viewport.canvasRect.minX,
            y: center.y - viewport.canvasRect.minY
        )

        ZStack {
            layerContent(layer)
                .frame(width: renderedWidth, height: renderedHeight)
                .layerMask(maskShape(for: layer), cornerRadius: CGFloat(layer.radius ?? 6))
                .alphaMask(alphaMaskImage(for: layer))
                .shadow(
                    color: layer.shadow == true ? .black.opacity(0.18) : .clear,
                    radius: layer.shadow == true ? 10 : 0,
                    x: 0,
                    y: layer.shadow == true ? 6 : 0
                )
                .overlay(tearPlaceholder(for: layer, width: renderedWidth, height: renderedHeight))

            if selectedLayerId == layer.id {
                RoundedRectangle(cornerRadius: 2)
                    .stroke(JournalColors.ink, lineWidth: 1.5)
                    .frame(width: renderedWidth, height: renderedHeight)
            }

            if isLivePhoto(layer) {
                Text("LIVE")
                    .font(JournalTypography.tiny)
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(JournalColors.ink.opacity(0.82))
                    .clipShape(Capsule())
                    .position(x: max(24, renderedWidth - 28), y: 16)
            }
        }
        .opacity(layer.opacity)
        .rotationEffect(.degrees(layer.rotation))
        .position(localCenter)
    }

    @ViewBuilder
    private func layerContent(_ layer: Layer) -> some View {
        switch layer.type {
        case .text:
            ZStack {
                if let background = textBackground(for: layer) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(background)
                }

                Text(layer.text ?? "")
                    .font(textFont(for: layer))
                    .foregroundStyle(color(from: styleString(layer, key: "color") ?? "#111111") ?? JournalColors.ink)
                    .minimumScaleFactor(0.4)
                    .multilineTextAlignment(.center)
                    .padding(6)
            }
        case .tape:
            Rectangle()
                .fill(color(from: styleString(layer, key: "color") ?? "#ead48a") ?? JournalColors.tapeYellow)
                .overlay(tapeStripes())
        case .paper:
            RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 4), style: .continuous)
                .fill(color(from: styleString(layer, key: "color") ?? "#efe7d8") ?? JournalColors.paperBeige)
                .overlay(RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 4)).stroke(JournalColors.border.opacity(0.8)))
        case .image, .sticker, .cut:
            if let url = ImageSourceResolver.url(for: layer.source, imageStore: imageStore),
               let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: ImageCropper.crop(image, cropBox: layer.crop))
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 6), style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 6)).stroke(JournalColors.border.opacity(0.65)))
            } else {
                RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 6), style: .continuous)
                    .fill(JournalColors.weak)
                    .overlay(
                        Image(systemName: layer.type == .image ? "photo" : "square.on.square")
                            .foregroundStyle(JournalColors.textTertiary)
                    )
                    .overlay(RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 6)).stroke(JournalColors.border))
            }
        }
    }

    private func backgroundPattern(size: CGSize) -> some View {
        Canvas { context, _ in
            guard let pattern = draft.backgroundPattern else { return }
            let stroke = StrokeStyle(lineWidth: 0.6)
            var path = Path()
            if pattern == "line" {
                stride(from: CGFloat(32), through: size.height, by: 32).forEach { y in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                }
            } else if pattern == "square" {
                stride(from: CGFloat(32), through: size.width, by: 32).forEach { x in
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: size.height))
                }
                stride(from: CGFloat(32), through: size.height, by: 32).forEach { y in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                }
            }
            context.stroke(path, with: .color(JournalColors.ink.opacity(0.10)), style: stroke)
        }
    }

    private func tapeStripes() -> some View {
        HStack(spacing: 12) {
            ForEach(0..<8, id: \.self) { _ in
                Rectangle()
                    .fill(Color.white.opacity(0.25))
                    .frame(width: 6)
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
        let size = max(10, CGFloat(styleNumber(layer, key: "fontSize") ?? 54) / 2.2)
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

    private func isLivePhoto(_ layer: Layer) -> Bool {
        guard case .string(let value) = layer.style["mediaType"] else { return false }
        return value == "livePhoto"
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
            RoundedRectangle(cornerRadius: CGFloat(layer.radius ?? 4), style: .continuous)
                .stroke(
                    JournalColors.ink.opacity(0.22),
                    style: StrokeStyle(lineWidth: 1, dash: [5, 4])
                )
                .frame(width: width, height: height)
        }
    }
}

#Preview {
    DraftRenderer(draft: SampleDrafts.starter, selectedLayerId: SampleDrafts.starter.layers.last?.id)
        .padding()
        .background(JournalColors.page)
}
