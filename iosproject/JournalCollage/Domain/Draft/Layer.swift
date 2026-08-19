import Foundation

enum LayerType: String, Codable, CaseIterable, Sendable {
    case image
    case text
    case sticker
    case tape
    case paper
    case cut
    case brush
}

struct CropBox: Codable, Equatable, Sendable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double
}

enum BrushType: String, Codable, CaseIterable, Identifiable, Sendable {
    case line
    case stitch
    case knit
    case bead
    case lace
    case bow

    var id: String { rawValue }
}

struct BrushStroke: Codable, Equatable, Sendable {
    var type: BrushType
    var stampSource: String?
    var color: String
    var size: Double
    var points: [BrushPoint]

    init(
        type: BrushType = .line,
        stampSource: String? = nil,
        color: String = "#111111",
        size: Double = 10,
        points: [BrushPoint] = []
    ) {
        self.type = type
        self.stampSource = stampSource
        self.color = color
        self.size = size
        self.points = points
    }
}

enum LayerOutlineStyle: String, Codable, CaseIterable, Identifiable, Sendable {
    case none
    case white
    case cream
    case dark
    case red
    case double

    var id: String { rawValue }
}

struct LayerOutline: Codable, Equatable, Sendable {
    var style: LayerOutlineStyle
    var color: String
    var width: Double
    var opacity: Double
    var secondaryColor: String?
    var secondaryWidth: Double?

    init(
        style: LayerOutlineStyle = .none,
        color: String = "#ffffff",
        width: Double = 0,
        opacity: Double = 1,
        secondaryColor: String? = nil,
        secondaryWidth: Double? = nil
    ) {
        self.style = style
        self.color = color
        self.width = width
        self.opacity = opacity
        self.secondaryColor = secondaryColor
        self.secondaryWidth = secondaryWidth
    }
}

enum ImageEffectType: String, Codable, CaseIterable, Identifiable, Sendable {
    case crossStitch = "pixel-cross-stitch"
    case matisse = "matisse-cutout"
    case botanical = "vintage-botanical"

    var id: String { rawValue }

    static func miniProgramValue(_ value: String) -> ImageEffectType? {
        switch value {
        case "cross-stitch", "pixel-cross-stitch":
            return .crossStitch
        case "matisse", "matisse-cutout":
            return .matisse
        case "botanical", "vintage-botanical":
            return .botanical
        default:
            return ImageEffectType(rawValue: value)
        }
    }
}

struct LayerImageEffect: Codable, Equatable, Sendable {
    var type: ImageEffectType
    var options: [String: JSONValue]
    var createdAt: String?

    init(type: ImageEffectType, options: [String: JSONValue] = [:], createdAt: String? = nil) {
        self.type = type
        self.options = options
        self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicCodingKey.self)
        let typeValue = try container.decode(String.self, forKey: DynamicCodingKey("type"))
        guard let type = ImageEffectType.miniProgramValue(typeValue) else {
            throw DecodingError.dataCorruptedError(
                forKey: DynamicCodingKey("type"),
                in: container,
                debugDescription: "Unknown image effect type: \(typeValue)"
            )
        }
        self.type = type
        if let createdAtValue = try container.decodeIfPresent(JSONValue.self, forKey: DynamicCodingKey("createdAt")) {
            switch createdAtValue {
            case .string(let value):
                self.createdAt = value
            case .number(let value):
                self.createdAt = String(Int(value))
            default:
                self.createdAt = nil
            }
        } else {
            self.createdAt = nil
        }

        if let nestedOptions = try container.decodeIfPresent([String: JSONValue].self, forKey: DynamicCodingKey("options")) {
            self.options = nestedOptions
        } else {
            var nextOptions: [String: JSONValue] = [:]
            for key in container.allKeys where key.stringValue != "type" && key.stringValue != "createdAt" {
                nextOptions[key.stringValue] = try container.decode(JSONValue.self, forKey: key)
            }
            self.options = nextOptions
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: DynamicCodingKey.self)
        try container.encode(type.rawValue, forKey: DynamicCodingKey("type"))
        try container.encodeIfPresent(createdAt, forKey: DynamicCodingKey("createdAt"))
        for option in options {
            try container.encode(option.value, forKey: DynamicCodingKey(option.key))
        }
    }
}

private struct DynamicCodingKey: CodingKey {
    var stringValue: String
    var intValue: Int?

    init(_ stringValue: String) {
        self.stringValue = stringValue
        self.intValue = nil
    }

    init?(stringValue: String) {
        self.init(stringValue)
    }

    init?(intValue: Int) {
        self.stringValue = "\(intValue)"
        self.intValue = intValue
    }
}

struct Layer: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var type: LayerType
    var x: Double
    var y: Double
    var width: Double
    var height: Double
    var rotation: Double
    var scale: Double
    var opacity: Double
    var zIndex: Int
    var source: String?
    var text: String?
    var assetId: String?
    var sourceWidth: Double?
    var sourceHeight: Double?
    var crop: CropBox?
    var radius: Double?
    var shadow: Bool?
    var tear: Bool?
    var tearSeed: Double?
    var brushWidth: Double?
    var brushHeight: Double?
    var strokes: [BrushStroke]?
    var outline: LayerOutline?
    var effect: LayerImageEffect?
    var clipPolygon: [BrushPoint]?
    var clipPolygons: [[BrushPoint]]?
    var style: [String: JSONValue]

    init(
        id: String = UUID().uuidString,
        type: LayerType,
        x: Double,
        y: Double,
        width: Double,
        height: Double,
        rotation: Double = 0,
        scale: Double = 1,
        opacity: Double = 1,
        zIndex: Int = 1,
        source: String? = nil,
        text: String? = nil,
        assetId: String? = nil,
        sourceWidth: Double? = nil,
        sourceHeight: Double? = nil,
        crop: CropBox? = nil,
        radius: Double? = nil,
        shadow: Bool? = nil,
        tear: Bool? = nil,
        tearSeed: Double? = nil,
        brushWidth: Double? = nil,
        brushHeight: Double? = nil,
        strokes: [BrushStroke]? = nil,
        outline: LayerOutline? = nil,
        effect: LayerImageEffect? = nil,
        clipPolygon: [BrushPoint]? = nil,
        clipPolygons: [[BrushPoint]]? = nil,
        style: [String: JSONValue] = [:]
    ) {
        self.id = id
        self.type = type
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.rotation = rotation
        self.scale = scale
        self.opacity = opacity
        self.zIndex = zIndex
        self.source = source
        self.text = text
        self.assetId = assetId
        self.sourceWidth = sourceWidth
        self.sourceHeight = sourceHeight
        self.crop = crop
        self.radius = radius
        self.shadow = shadow
        self.tear = tear
        self.tearSeed = tearSeed
        self.brushWidth = brushWidth
        self.brushHeight = brushHeight
        self.strokes = strokes
        self.outline = outline
        self.effect = effect
        self.clipPolygon = clipPolygon
        self.clipPolygons = clipPolygons
        self.style = style
    }
}
