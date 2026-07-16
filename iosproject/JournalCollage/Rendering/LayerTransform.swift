import CoreGraphics
import Foundation

struct LayerTransformGesture: Equatable, Sendable {
    var translation: CGVector
    var scale: Double
    var rotationDelta: Double

    init(
        translation: CGVector = .zero,
        scale: Double = 1,
        rotationDelta: Double = 0
    ) {
        self.translation = translation
        self.scale = scale
        self.rotationDelta = rotationDelta
    }
}

enum LayerTransform {
    static let minimumScale = 0.08
    static let maximumScale = 8.0

    static func translated(_ layer: Layer, by delta: CGVector) -> Layer {
        var next = layer
        next.x += Double(delta.dx)
        next.y += Double(delta.dy)
        return next
    }

    static func scaled(_ layer: Layer, by factor: Double) -> Layer {
        var next = layer
        next.scale = clamp(layer.scale * factor, minimumScale, maximumScale)
        return next
    }

    static func rotated(_ layer: Layer, by degrees: Double) -> Layer {
        var next = layer
        next.rotation = normalizedDegrees(layer.rotation + degrees)
        return next
    }

    static func applying(_ gesture: LayerTransformGesture, to layer: Layer) -> Layer {
        var next = translated(layer, by: gesture.translation)
        next = scaled(next, by: gesture.scale)
        next = rotated(next, by: gesture.rotationDelta)
        return next
    }

    static func replacingLayer(_ layer: Layer, in draft: Draft) -> Draft {
        var next = draft
        next.layers = draft.layers.map { $0.id == layer.id ? layer : $0 }
        next.updatedAt = Date().timeIntervalSince1970
        return next
    }

    private static func normalizedDegrees(_ value: Double) -> Double {
        let normalized = value.truncatingRemainder(dividingBy: 360)
        return normalized < 0 ? normalized + 360 : normalized
    }

    private static func clamp(_ value: Double, _ minValue: Double, _ maxValue: Double) -> Double {
        min(maxValue, max(minValue, value))
    }
}
