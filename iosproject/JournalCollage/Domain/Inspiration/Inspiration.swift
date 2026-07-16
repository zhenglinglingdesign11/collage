import Foundation

struct Inspiration: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let imageSource: String
    let alt: String
    let ratio: Double
    let tags: [String]
}
