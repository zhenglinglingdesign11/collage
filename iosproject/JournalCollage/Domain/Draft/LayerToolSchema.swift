import Foundation

enum LayerStyleKey {
    static let cutStyle = "cutStyle"
    static let cutLine = "cutLine"
    static let waveAmplitude = "waveAmplitude"
    static let waveFrequency = "waveFrequency"
    static let maskShape = "maskShape"
    static let maskSource = "maskSource"
    static let brushPath = "brushPath"
    static let subjectCut = "subjectCut"
    static let embossMode = "embossMode"
    static let embossShape = "embossShape"
    static let excludeShape = "excludeShape"
    static let brushType = "brushType"
    static let brushColor = "brushColor"
    static let brushSize = "brushSize"
    static let outlineStyle = "outlineStyle"
    static let imageEffectType = "imageEffectType"
    static let clipPolygon = "clipPolygon"
    static let clipPolygons = "clipPolygons"
    static let textFontId = "fontId"
    static let textFontLabel = "fontLabel"
    static let textFontFamily = "fontFamily"
    static let textCanvasFontFamily = "canvasFontFamily"
    static let textFontSize = "fontSize"
    static let textColor = "color"
    static let textBackground = "background"
    static let textBackgroundLabel = "backgroundLabel"
}

enum CutStyle: String, CaseIterable, Hashable, Identifiable, Sendable {
    case straight
    case wave
    case brush
    case subject

    var id: String { rawValue }
}

enum EmbossMode: String, CaseIterable, Hashable, Identifiable, Sendable {
    case fill
    case mask
    case exclude

    var id: String { rawValue }

    var label: String {
        switch self {
        case .fill:
            return L10n.t("editor.emboss.mode.fill")
        case .mask:
            return L10n.t("editor.emboss.mode.mask")
        case .exclude:
            return L10n.t("editor.emboss.mode.exclude")
        }
    }
}

extension Layer {
    var cutStyle: CutStyle? {
        guard case .string(let value)? = style[LayerStyleKey.cutStyle] else { return nil }
        return CutStyle(rawValue: value)
    }

    var embossMode: EmbossMode? {
        guard case .string(let value)? = style[LayerStyleKey.embossMode] else { return nil }
        return EmbossMode(rawValue: value)
    }

    var imageEffectType: ImageEffectType? {
        effect?.type
    }
}
