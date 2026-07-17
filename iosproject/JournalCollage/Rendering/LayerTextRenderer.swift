import SwiftUI

enum LayerTextStyle {
    struct FontOption: Identifiable, Hashable {
        let id: String
        let label: String
        let preview: String
        let family: String
        let canvasFamily: String
    }

    struct BackgroundOption: Identifiable, Hashable {
        let label: String
        let value: String
        let key: String

        var id: String { label }
    }

    static let fonts: [FontOption] = [
        FontOption(id: "system", label: "System", preview: "System", family: "PingFang SC, sans-serif", canvasFamily: "PingFang SC, sans-serif"),
        FontOption(id: "little_kids", label: "Little Kids", preview: "Little Kids", family: "JournalLittleKids, Kaiti SC, STKaiti, cursive", canvasFamily: "JournalLittleKids"),
        FontOption(id: "gemini", label: "Gemini", preview: "Gemini", family: "JournalGemini, serif", canvasFamily: "JournalGemini"),
        FontOption(id: "kelsi", label: "Kelsi", preview: "Kelsi", family: "JournalKelsi, sans-serif", canvasFamily: "JournalKelsi"),
        FontOption(id: "rounded", label: "\u{5706}\u{4F53}", preview: "Rounded", family: "PingFang SC, sans-serif", canvasFamily: "PingFang SC, sans-serif"),
        FontOption(id: "serif", label: "\u{886C}\u{7EBF}", preview: "Serif", family: "Songti SC, serif", canvasFamily: "Songti SC, serif")
    ]

    static let colors = ["#111111", "#4a4a4a", "#9a9a9a", "#ffffff", "#d94a38", "#e9d28a", "#8c9a8d"]

    static let backgrounds: [BackgroundOption] = [
        BackgroundOption(label: "\u{65E0}", value: "transparent", key: "editor.text.background.none"),
        BackgroundOption(label: "\u{7EB8}\u{5E95}", value: "#efe7d8", key: "editor.text.background.paper"),
        BackgroundOption(label: "\u{767D}\u{5E95}", value: "#ffffff", key: "editor.text.background.white"),
        BackgroundOption(label: "\u{9ED1}\u{5E95}", value: "#111111", key: "editor.text.background.black"),
        BackgroundOption(label: "\u{80F6}\u{5E26}", value: "#ead48a", key: "editor.text.background.tape")
    ]

    static func fontOption(for id: String?, label: String? = nil) -> FontOption {
        if let id, let option = fonts.first(where: { $0.id == id }) {
            return option
        }
        if let label, let option = fonts.first(where: { $0.label == label }) {
            return option
        }
        return fonts[0]
    }

    static func backgroundValue(for label: String) -> String {
        backgrounds.first(where: { $0.label == label })?.value ?? "transparent"
    }

    static func backgroundLabel(for value: String) -> String {
        backgrounds.first(where: { $0.value == value })?.label ?? backgrounds[0].label
    }
}

struct LayerTextView: View {
    let layer: Layer
    var renderScale: CGFloat = 1

    private var text: String {
        let value = layer.text?.isEmpty == false ? layer.text ?? "" : L10n.t("editor.sheet.text.placeholder")
        return value
    }

    private var fontId: String {
        styleString(LayerStyleKey.textFontId) ?? "system"
    }

    private var fontLabel: String {
        styleString(LayerStyleKey.textFontLabel) ?? LayerTextStyle.fontOption(for: fontId).label
    }

    private var fontSize: CGFloat {
        max(10, CGFloat(styleNumber(LayerStyleKey.textFontSize) ?? 54) / 2.2) * renderScale
    }

    private var background: String {
        styleString(LayerStyleKey.textBackground) ?? "transparent"
    }

    var body: some View {
        ZStack {
            if background != "transparent", let fill = Color(hexString: background) {
                RoundedRectangle(cornerRadius: background == "#111111" ? 18 * renderScale : 12 * renderScale, style: .continuous)
                    .fill(fill)
            }

            styledText
                .foregroundStyle(Color(hexString: styleString(LayerStyleKey.textColor) ?? "#111111") ?? JournalColors.ink)
                .minimumScaleFactor(0.38)
                .multilineTextAlignment(.center)
                .lineLimit(4)
                .padding(6 * renderScale)
        }
    }

    @ViewBuilder
    private var styledText: some View {
        switch fontId {
        case "little_kids":
            baseText(.system(size: fontSize, weight: .regular, design: .rounded))
                .rotationEffect(.degrees(-3))
        case "gemini", "serif":
            ZStack {
                baseText(.system(size: fontSize, weight: .semibold, design: .serif))
                baseText(.system(size: fontSize, weight: .semibold, design: .serif))
                    .offset(x: 1.2 * renderScale)
            }
        case "kelsi", "rounded":
            ZStack {
                baseText(.system(size: fontSize, weight: .semibold, design: .rounded))
                baseText(.system(size: fontSize, weight: .semibold, design: .rounded))
                    .offset(x: 0.8 * renderScale, y: 0.8 * renderScale)
            }
        default:
            if fontLabel == "\u{6253}\u{5B57}\u{673A}" {
                baseText(.system(size: fontSize, weight: .regular, design: .monospaced))
                    .tracking(max(0, fontSize * 0.08))
            } else {
                baseText(.system(size: fontSize, weight: .semibold))
            }
        }
    }

    private func baseText(_ font: Font) -> Text {
        Text(text)
            .font(font)
    }

    private func styleString(_ key: String) -> String? {
        if case .string(let value)? = layer.style[key] {
            return value
        }
        return nil
    }

    private func styleNumber(_ key: String) -> Double? {
        if case .number(let value)? = layer.style[key] {
            return value
        }
        return nil
    }
}
