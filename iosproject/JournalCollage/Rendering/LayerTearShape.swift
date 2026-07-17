import CoreGraphics
import SwiftUI

enum LayerTearPath {
    static func points(for layer: Layer) -> [BrushPoint] {
        guard layer.tear == true, layer.type != .text else { return [] }
        let base = LayerClipPolygon.visiblePolygon(for: layer)
            ?? LayerClipPolygon.fullRectPolygon(width: layer.width, height: layer.height)
        return tornPolygon(base, layer: layer).validTearPolygon
    }

    static func contains(localPoint: CGPoint, in layer: Layer) -> Bool {
        guard layer.tear == true else { return true }
        let polygon = points(for: layer)
        guard polygon.count >= 3 else { return true }
        let scale = max(0.0001, layer.scale)
        let point = BrushPoint(
            x: Double(localPoint.x) / scale + layer.width / 2,
            y: Double(localPoint.y) / scale + layer.height / 2
        )
        return pointInPolygon(point, polygon: polygon)
    }

    static func seed(for layer: Layer) -> Int {
        if let seed = layer.tearSeed {
            return max(1, Int(seed))
        }
        var hash: UInt32 = 2_166_136_261
        for scalar in layer.id.unicodeScalars {
            hash ^= UInt32(scalar.value)
            hash = hash &* 16_777_619
        }
        return max(1, Int(hash & 0x7fff_ffff))
    }

    static func tornPolygon(_ polygon: [BrushPoint], layer: Layer) -> [BrushPoint] {
        guard polygon.count >= 3 else { return [] }
        let width = max(1, layer.width)
        let height = max(1, layer.height)
        let amplitude = max(7, min(24, min(width, height) * 0.035))
        let step = max(24, min(48, min(width, height) / 7))
        let seed = seed(for: layer)
        let useLeftNormal = signedArea(polygon) > 0
        var points: [BrushPoint] = []

        for index in polygon.indices {
            let start = polygon[index]
            let end = polygon[(index + 1) % polygon.count]
            addTearEdgePoints(
                to: &points,
                start: start,
                end: end,
                step: step,
                amplitude: amplitude,
                seed: seed + index * 97 + 11,
                useLeftNormal: useLeftNormal
            )
        }
        return dedupe(points)
    }

    private static func addTearEdgePoints(
        to points: inout [BrushPoint],
        start: BrushPoint,
        end: BrushPoint,
        step: Double,
        amplitude: Double,
        seed: Int,
        useLeftNormal: Bool
    ) {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let length = max(1, hypot(dx, dy))
        let count = max(2, Int(ceil(length / step)))
        let normalX = useLeftNormal ? -dy / length : dy / length
        let normalY = useLeftNormal ? dx / length : -dx / length

        for index in 0...count {
            if !points.isEmpty && index == 0 { continue }
            let t = Double(index) / Double(count)
            let jitter = tearJitter(seed: seed, index: index, amplitude: amplitude)
            points.append(BrushPoint(
                x: start.x + dx * t + normalX * jitter,
                y: start.y + dy * t + normalY * jitter
            ))
        }
    }

    private static func tearJitter(seed: Int, index: Int, amplitude: Double) -> Double {
        let raw = seededUnit(seed: seed + index * 97)
        let wave = sin(Double(seed % 31 + index) * 1.37) * 0.28 + 0.72
        return max(1, raw * amplitude * wave)
    }

    private static func seededUnit(seed: Int) -> Double {
        var value = UInt32(truncatingIfNeeded: seed) ^ 0x6d2b_79f5
        value = value &* 0x045d_9f3b
        value = (value ^ (value >> 16)) &* 0x045d_9f3b
        value ^= value >> 16
        return Double(value % 10_000) / 10_000
    }

    private static func signedArea(_ points: [BrushPoint]) -> Double {
        guard points.count >= 3 else { return 0 }
        var area = 0.0
        for index in points.indices {
            let current = points[index]
            let next = points[(index + 1) % points.count]
            area += current.x * next.y - next.x * current.y
        }
        return area / 2
    }

    private static func pointInPolygon(_ point: BrushPoint, polygon: [BrushPoint]) -> Bool {
        var inside = false
        var previous = polygon.last ?? point
        for current in polygon {
            let intersects = ((current.y > point.y) != (previous.y > point.y))
                && point.x < (previous.x - current.x) * (point.y - current.y) / max(0.0001, previous.y - current.y) + current.x
            if intersects { inside.toggle() }
            previous = current
        }
        return inside
    }

    private static func dedupe(_ points: [BrushPoint]) -> [BrushPoint] {
        var result: [BrushPoint] = []
        for point in points {
            if let last = result.last, hypot(last.x - point.x, last.y - point.y) <= 0.5 {
                continue
            }
            result.append(BrushPoint(x: (point.x * 100).rounded() / 100, y: (point.y * 100).rounded() / 100))
        }
        if let first = result.first, let last = result.last, result.count > 1, hypot(first.x - last.x, first.y - last.y) <= 0.5 {
            result.removeLast()
        }
        return result
    }
}

struct LayerTearShape: Shape {
    let layer: Layer

    func path(in rect: CGRect) -> Path {
        let points = LayerTearPath.points(for: layer)
        guard points.count >= 3 else { return Path(rect) }
        var path = Path()
        for (index, point) in points.enumerated() {
            let mapped = CGPoint(
                x: rect.minX + CGFloat(point.x / max(1, layer.width)) * rect.width,
                y: rect.minY + CGFloat(point.y / max(1, layer.height)) * rect.height
            )
            if index == 0 {
                path.move(to: mapped)
            } else {
                path.addLine(to: mapped)
            }
        }
        path.closeSubpath()
        return path
    }
}

struct LayerTearEdgeOverlay: View {
    let layer: Layer
    var scale: CGFloat = 1

    var body: some View {
        if layer.tear == true, layer.type != .text {
            LayerTearShape(layer: layer)
                .stroke(Color.white.opacity(0.72), style: StrokeStyle(lineWidth: max(1, 8 * scale), lineCap: .round, lineJoin: .round))
                .overlay(
                    LayerTearShape(layer: layer)
                        .stroke(JournalColors.ink.opacity(0.12), style: StrokeStyle(lineWidth: max(1, 3 * scale), lineCap: .round, lineJoin: .round))
                )
                .overlay(
                    LayerTearShape(layer: layer)
                        .stroke(JournalColors.ink.opacity(0.20), style: StrokeStyle(lineWidth: max(1, scale), lineCap: .round, lineJoin: .round))
                )
        }
    }
}

extension View {
    @ViewBuilder
    func tearMask(_ layer: Layer) -> some View {
        if layer.tear == true, layer.type != .text {
            mask(LayerTearShape(layer: layer))
        } else {
            self
        }
    }
}

private extension Array where Element == BrushPoint {
    var validTearPolygon: [BrushPoint] {
        count >= 3 ? self : []
    }
}
