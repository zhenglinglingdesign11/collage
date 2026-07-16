import CoreGraphics

enum HitTesting {
    static func hitTest(point: CGPoint, in layers: [Layer]) -> Layer? {
        layers
            .sorted { left, right in
                if left.zIndex == right.zIndex { return left.id < right.id }
                return left.zIndex < right.zIndex
            }
            .reversed()
            .first { contains(point: point, layer: $0) }
    }

    static func contains(point: CGPoint, layer: Layer) -> Bool {
        guard layer.opacity > 0, layer.width > 0, layer.height > 0 else { return false }
        let localPoint = localPoint(for: point, in: layer)
        let halfWidth = CGFloat(layer.width * max(layer.scale, 0.0001)) / 2
        let halfHeight = CGFloat(layer.height * max(layer.scale, 0.0001)) / 2
        return abs(localPoint.x) <= halfWidth && abs(localPoint.y) <= halfHeight
    }

    static func localPoint(for point: CGPoint, in layer: Layer) -> CGPoint {
        let center = CGPoint(
            x: CGFloat(layer.x + layer.width / 2),
            y: CGFloat(layer.y + layer.height / 2)
        )
        let dx = point.x - center.x
        let dy = point.y - center.y
        let radians = -CGFloat(layer.rotation) * .pi / 180
        return CGPoint(
            x: dx * cos(radians) - dy * sin(radians),
            y: dx * sin(radians) + dy * cos(radians)
        )
    }
}
