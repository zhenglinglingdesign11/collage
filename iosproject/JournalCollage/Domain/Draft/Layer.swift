import Foundation

enum LayerType: String, Codable, CaseIterable, Sendable {
    case image
    case text
    case sticker
    case tape
    case paper
    case cut
}

struct CropBox: Codable, Equatable, Sendable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double
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
        self.style = style
    }
}
