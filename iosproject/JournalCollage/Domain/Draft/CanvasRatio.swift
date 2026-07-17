import Foundation

enum CanvasRatio: String, Codable, CaseIterable, Identifiable, Sendable {
    case portrait = "3:4"
    case square = "1:1"
    case story = "9:16"

    var id: String { rawValue }

    var logicalSize: CanvasSize {
        switch self {
        case .portrait:
            return CanvasSize(width: 900, height: 1200)
        case .square:
            return CanvasSize(width: 1000, height: 1000)
        case .story:
            return CanvasSize(width: 900, height: 1600)
        }
    }
}

struct CanvasSize: Codable, Equatable, Sendable {
    var width: Double
    var height: Double
}
