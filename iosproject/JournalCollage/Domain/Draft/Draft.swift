import Foundation

struct BackgroundImage: Codable, Equatable, Sendable {
    var source: String
    var width: Double?
    var height: Double?
}

struct DraftAsset: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var source: String
    var type: LayerType
}

struct Draft: Codable, Identifiable, Equatable, Sendable {
    static let schemaVersion = 1

    var schemaVersion: Int
    var id: String
    var ratio: CanvasRatio
    var width: Double
    var height: Double
    var background: String
    var backgroundImage: BackgroundImage?
    var backgroundPattern: String?
    var layers: [Layer]
    var assets: [DraftAsset]
    var thumbnailPath: String?
    var updatedAt: TimeInterval

    init(ratio: CanvasRatio = .portrait) {
        let size = ratio.logicalSize
        self.schemaVersion = Self.schemaVersion
        self.id = "draft-\(Int(Date().timeIntervalSince1970 * 1000))"
        self.ratio = ratio
        self.width = size.width
        self.height = size.height
        self.background = "#fdfdfb"
        self.backgroundImage = nil
        self.backgroundPattern = nil
        self.layers = []
        self.assets = []
        self.thumbnailPath = nil
        self.updatedAt = Date().timeIntervalSince1970
    }

    var orderedLayers: [Layer] {
        layers.sorted { left, right in
            if left.zIndex == right.zIndex {
                return left.id < right.id
            }
            return left.zIndex < right.zIndex
        }
    }
}
