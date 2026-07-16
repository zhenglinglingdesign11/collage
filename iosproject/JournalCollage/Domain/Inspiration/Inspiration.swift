import Foundation

struct Inspiration: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var imageUrl: String
    var ratio: Double
    var tags: [String]
    var recommendedAssets: [String]
    var locale: String
}
