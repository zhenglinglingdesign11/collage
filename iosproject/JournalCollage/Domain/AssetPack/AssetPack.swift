import Foundation

struct AssetPackCatalog: Codable, Equatable, Sendable {
    var schemaVersion: Int
    var generatedFrom: String
    var packs: [AssetPack]
}

struct AssetPack: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var name: String
    var category: String
    var tone: String
    var cover: String
    var version: Int
    var items: [AssetPackItem]
}

struct AssetPackItem: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var type: LayerType
    var name: String
    var source: String
    var width: Int
    var height: Int
}
