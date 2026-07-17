import CoreGraphics
import SwiftUI

enum LayerClipPolygon {
    static func visiblePolygon(for layer: Layer) -> [BrushPoint]? {
        let polygons = clipPolygons(for: layer)
        guard let first = polygons.first else { return nil }
        return polygons.dropFirst().reduce(first) { result, polygon in
            clipPolygon(result, byConvexPolygon: polygon)
        }.validPolygon
    }

    static func clipPolygons(for layer: Layer) -> [[BrushPoint]] {
        var polygons: [[BrushPoint]] = []
        if let clipPolygons = layer.clipPolygons {
            polygons.append(contentsOf: clipPolygons.compactMap { $0.validPolygon })
        }
        if let clipPolygon = layer.clipPolygon?.validPolygon {
            polygons.append(clipPolygon)
        }
        return polygons
    }

    static func fullRectPolygon(width: Double, height: Double) -> [BrushPoint] {
        [
            BrushPoint(x: 0, y: 0),
            BrushPoint(x: width, y: 0),
            BrushPoint(x: width, y: height),
            BrushPoint(x: 0, y: height)
        ]
    }

    static func splitRect(width: Double, height: Double, line: LayerCutLine, style: CutStyle) -> [[BrushPoint]]? {
        switch style {
        case .straight:
            return splitRectByLine(width: width, height: height, start: line.start, end: line.end)
        case .wave:
            return splitRectByWave(width: width, height: height, start: line.start, end: line.end)
        case .brush, .subject:
            return nil
        }
    }

    static func splitVisiblePolygon(layer: Layer, line: LayerCutLine, style: CutStyle) -> [[BrushPoint]]? {
        let base = visiblePolygon(for: layer) ?? fullRectPolygon(width: layer.width, height: layer.height)
        guard let halves = splitRect(width: layer.width, height: layer.height, line: line, style: style) else {
            return nil
        }
        let pieces = halves.compactMap { half in
            clipPolygon(base, byConvexPolygon: half).validPolygon
        }.filter { polygonArea($0) >= 1 }
        return pieces.count == 2 ? pieces : nil
    }

    static func contains(localPoint: CGPoint, in layer: Layer) -> Bool {
        guard let polygon = visiblePolygon(for: layer) else { return true }
        let scale = max(0.0001, layer.scale)
        let point = BrushPoint(
            x: Double(localPoint.x) / scale + layer.width / 2,
            y: Double(localPoint.y) / scale + layer.height / 2
        )
        return pointInPolygon(point, polygon: polygon)
    }

    static func polygonArea(_ points: [BrushPoint]) -> Double {
        guard points.count >= 3 else { return 0 }
        var area = 0.0
        for index in points.indices {
            let current = points[index]
            let next = points[(index + 1) % points.count]
            area += current.x * next.y - next.x * current.y
        }
        return abs(area / 2)
    }

    private static func splitRectByLine(width: Double, height: Double, start: CGPoint, end: CGPoint) -> [[BrushPoint]]? {
        guard hypot(end.x - start.x, end.y - start.y) >= 8 else { return nil }
        let corners = fullRectPolygon(width: width, height: height).map(\.cgPoint)
        var first: [BrushPoint] = []
        var second: [BrushPoint] = []
        for index in corners.indices {
            let current = corners[index]
            let next = corners[(index + 1) % corners.count]
            let currentSide = lineSide(start: start, end: end, point: current)
            let nextSide = lineSide(start: start, end: end, point: next)
            if currentSide >= 0 { first.append(current.brushPoint) }
            if currentSide <= 0 { second.append(current.brushPoint) }
            if (currentSide > 0 && nextSide < 0) || (currentSide < 0 && nextSide > 0),
               let intersection = segmentLineIntersection(segStart: current, segEnd: next, lineStart: start, lineEnd: end) {
                first.append(intersection.brushPoint)
                second.append(intersection.brushPoint)
            }
        }
        let normalized = [dedupe(first), dedupe(second)].compactMap(\.validPolygon)
        return normalized.count == 2 ? normalized : nil
    }

    private static func splitRectByWave(width: Double, height: Double, start: CGPoint, end: CGPoint) -> [[BrushPoint]]? {
        let path = wavePathPoints(width: width, height: height, start: start, end: end)
        guard path.count >= 2 else { return nil }
        let normal = lineNormal(start: start, end: end)
        let offset = hypot(width, height) * 2
        let firstSide = path + path.reversed().map {
            BrushPoint(x: $0.x + Double(normal.dx) * offset, y: $0.y + Double(normal.dy) * offset)
        }
        let secondSide = Array(path.reversed()) + path.map {
            BrushPoint(x: $0.x - Double(normal.dx) * offset, y: $0.y - Double(normal.dy) * offset)
        }
        let first = clipPolygonToRect(firstSide, width: width, height: height).validPolygon
        let second = clipPolygonToRect(secondSide, width: width, height: height).validPolygon
        guard let first, let second, polygonArea(first) >= 1, polygonArea(second) >= 1 else {
            return nil
        }
        return [dedupe(first), dedupe(second)]
    }

    private static func wavePathPoints(width: Double, height: Double, start: CGPoint, end: CGPoint) -> [BrushPoint] {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let length = hypot(dx, dy)
        guard length >= 8 else { return [] }
        let unit = CGVector(dx: dx / length, dy: dy / length)
        let normal = CGVector(dx: -unit.dy, dy: unit.dx)
        let corners = fullRectPolygon(width: width, height: height).map(\.cgPoint)
        let projections = corners.map { point in
            (point.x - start.x) * unit.dx + (point.y - start.y) * unit.dy
        }
        let padding = max(width, height, 76)
        let minS = Double(projections.min() ?? 0) - padding
        let maxS = Double(projections.max() ?? 0) + padding
        let amplitude = min(22, max(10, min(width, height) * 0.08))
        let wavelength = max(36, min(76, max(36, Double(length) * 0.55)))
        let step = max(4, min(10, wavelength / 6))
        var points: [BrushPoint] = []
        var s = minS
        while s <= maxS {
            points.append(wavePoint(start: start, unit: unit, normal: normal, s: s, amplitude: amplitude, wavelength: wavelength))
            s += step
        }
        points.append(wavePoint(start: start, unit: unit, normal: normal, s: maxS, amplitude: amplitude, wavelength: wavelength))
        return points
    }

    private static func wavePoint(start: CGPoint, unit: CGVector, normal: CGVector, s: Double, amplitude: Double, wavelength: Double) -> BrushPoint {
        let wave = sin(s / wavelength * Double.pi * 2) * amplitude
        return BrushPoint(
            x: Double(start.x) + Double(unit.dx) * s + Double(normal.dx) * wave,
            y: Double(start.y) + Double(unit.dy) * s + Double(normal.dy) * wave
        )
    }

    private static func clipPolygonToRect(_ points: [BrushPoint], width: Double, height: Double) -> [BrushPoint] {
        clipPolygon(points, byEdges: [
            PolygonClipEdge(inside: { $0.x >= 0 }, intersection: { intersectAtX(a: $0, b: $1, x: 0) }),
            PolygonClipEdge(inside: { $0.x <= width }, intersection: { intersectAtX(a: $0, b: $1, x: width) }),
            PolygonClipEdge(inside: { $0.y >= 0 }, intersection: { intersectAtY(a: $0, b: $1, y: 0) }),
            PolygonClipEdge(inside: { $0.y <= height }, intersection: { intersectAtY(a: $0, b: $1, y: height) })
        ])
    }

    private static func clipPolygon(_ subject: [BrushPoint], byConvexPolygon clip: [BrushPoint]) -> [BrushPoint] {
        guard clip.count >= 3 else { return [] }
        let clockwise = signedArea(clip) < 0
        let edges = clip.indices.map { index in
            let start = clip[index]
            let end = clip[(index + 1) % clip.count]
            return PolygonClipEdge(
                inside: { point in
                    let side = lineSide(start: start.cgPoint, end: end.cgPoint, point: point.cgPoint)
                    return clockwise ? side <= 0.001 : side >= -0.001
                },
                intersection: { previous, current in
                    segmentLineIntersection(segStart: previous.cgPoint, segEnd: current.cgPoint, lineStart: start.cgPoint, lineEnd: end.cgPoint)?.brushPoint ?? current
                }
            )
        }
        return clipPolygon(subject, byEdges: edges)
    }

    private static func clipPolygon(_ points: [BrushPoint], byEdges edges: [PolygonClipEdge]) -> [BrushPoint] {
        edges.reduce(points) { polygon, edge in
            guard !polygon.isEmpty else { return [] }
            var output: [BrushPoint] = []
            for index in polygon.indices {
                let current = polygon[index]
                let previous = polygon[(index + polygon.count - 1) % polygon.count]
                let currentInside = edge.inside(current)
                let previousInside = edge.inside(previous)
                if currentInside {
                    if !previousInside {
                        output.append(edge.intersection(previous, current))
                    }
                    output.append(current)
                } else if previousInside {
                    output.append(edge.intersection(previous, current))
                }
            }
            return dedupe(output)
        }
    }

    private static func lineSide(start: CGPoint, end: CGPoint, point: CGPoint) -> CGFloat {
        (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
    }

    private static func segmentLineIntersection(segStart: CGPoint, segEnd: CGPoint, lineStart: CGPoint, lineEnd: CGPoint) -> CGPoint? {
        let sx = segEnd.x - segStart.x
        let sy = segEnd.y - segStart.y
        let lx = lineEnd.x - lineStart.x
        let ly = lineEnd.y - lineStart.y
        let denominator = sx * ly - sy * lx
        guard abs(denominator) >= 0.001 else { return nil }
        let t = ((lineStart.x - segStart.x) * ly - (lineStart.y - segStart.y) * lx) / denominator
        return CGPoint(x: segStart.x + sx * t, y: segStart.y + sy * t)
    }

    private static func lineNormal(start: CGPoint, end: CGPoint) -> CGVector {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let length = hypot(dx, dy)
        guard length > 0 else { return CGVector(dx: 0, dy: 1) }
        return CGVector(dx: -dy / length, dy: dx / length)
    }

    private static func intersectAtX(a: BrushPoint, b: BrushPoint, x: Double) -> BrushPoint {
        let dx = b.x - a.x
        guard abs(dx) >= 0.001 else { return BrushPoint(x: x, y: a.y) }
        let t = (x - a.x) / dx
        return BrushPoint(x: x, y: a.y + (b.y - a.y) * t)
    }

    private static func intersectAtY(a: BrushPoint, b: BrushPoint, y: Double) -> BrushPoint {
        let dy = b.y - a.y
        guard abs(dy) >= 0.001 else { return BrushPoint(x: a.x, y: y) }
        let t = (y - a.y) / dy
        return BrushPoint(x: a.x + (b.x - a.x) * t, y: y)
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

struct LayerClipPolygonShape: Shape {
    let layer: Layer

    func path(in rect: CGRect) -> Path {
        guard let polygon = LayerClipPolygon.visiblePolygon(for: layer), polygon.count >= 3 else {
            return Path(rect)
        }
        var path = Path()
        for (index, point) in polygon.enumerated() {
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

extension View {
    @ViewBuilder
    func clipPolygonMask(_ layer: Layer) -> some View {
        if LayerClipPolygon.visiblePolygon(for: layer) != nil {
            mask(LayerClipPolygonShape(layer: layer))
        } else {
            self
        }
    }
}

private struct PolygonClipEdge {
    let inside: (BrushPoint) -> Bool
    let intersection: (BrushPoint, BrushPoint) -> BrushPoint
}

private extension Array where Element == BrushPoint {
    var validPolygon: [BrushPoint]? {
        count >= 3 ? self : nil
    }
}

private extension BrushPoint {
    var cgPoint: CGPoint {
        CGPoint(x: CGFloat(x), y: CGFloat(y))
    }
}

private extension CGPoint {
    var brushPoint: BrushPoint {
        BrushPoint(x: Double(x), y: Double(y))
    }
}

private extension LayerCutLine {
    var start: CGPoint {
        CGPoint(x: CGFloat(startX), y: CGFloat(startY))
    }

    var end: CGPoint {
        CGPoint(x: CGFloat(endX), y: CGFloat(endY))
    }
}
