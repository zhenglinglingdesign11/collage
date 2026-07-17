import CoreGraphics

enum AlignmentGuideAxis: Equatable, Sendable {
    case vertical
    case horizontal
}

enum AlignmentGuideKind: Equatable, Sendable {
    case center
    case edge
}

struct AlignmentGuideLine: Identifiable, Equatable, Sendable {
    let id: String
    let axis: AlignmentGuideAxis
    let position: Double
    let kind: AlignmentGuideKind
}

struct LayerSnapResult: Equatable, Sendable {
    var layer: Layer
    var guides: [AlignmentGuideLine]
}

enum AlignmentSnapping {
    static let translationThreshold = 10.0
    static let rotationThreshold = 4.0
    static let rotationTargets = [0.0, 45.0, 90.0, 180.0, 270.0, 315.0, 360.0]

    static func snappedLayer(_ layer: Layer, in draft: Draft) -> LayerSnapResult {
        var next = layer
        var guides: [AlignmentGuideLine] = []

        let visualWidth = layer.width * layer.scale
        let visualHeight = layer.height * layer.scale
        let centerX = layer.x + layer.width / 2
        let centerY = layer.y + layer.height / 2
        let left = centerX - visualWidth / 2
        let right = centerX + visualWidth / 2
        let top = centerY - visualHeight / 2
        let bottom = centerY + visualHeight / 2

        if let snap = closestSnap(
            values: [
                SnapValue(value: centerX),
                SnapValue(value: left),
                SnapValue(value: right)
            ],
            targets: [
                SnapTarget(value: draft.width / 2, kind: .center),
                SnapTarget(value: 0, kind: .edge),
                SnapTarget(value: draft.width, kind: .edge)
            ]
        ) {
            next.x += snap.delta
            guides.append(
                AlignmentGuideLine(
                    id: "vertical-\(snap.target)",
                    axis: .vertical,
                    position: snap.target,
                    kind: snap.kind
                )
            )
        }

        if let snap = closestSnap(
            values: [
                SnapValue(value: centerY),
                SnapValue(value: top),
                SnapValue(value: bottom)
            ],
            targets: [
                SnapTarget(value: draft.height / 2, kind: .center),
                SnapTarget(value: 0, kind: .edge),
                SnapTarget(value: draft.height, kind: .edge)
            ]
        ) {
            next.y += snap.delta
            guides.append(
                AlignmentGuideLine(
                    id: "horizontal-\(snap.target)",
                    axis: .horizontal,
                    position: snap.target,
                    kind: snap.kind
                )
            )
        }

        return LayerSnapResult(layer: next, guides: guides)
    }

    static func snappedRotation(_ degrees: Double) -> Double {
        let normalized = normalize(degrees)
        guard let target = rotationTargets.min(by: {
            circularDistance(from: normalized, to: $0) < circularDistance(from: normalized, to: $1)
        }) else {
            return normalized
        }
        guard circularDistance(from: normalized, to: target) <= rotationThreshold else {
            return normalized
        }
        return normalize(target)
    }

    private static func closestSnap(values: [SnapValue], targets: [SnapTarget]) -> SnapCandidate? {
        let candidates = values.flatMap { value in
            targets.map { target in
                SnapCandidate(
                    delta: target.value - value.value,
                    distance: abs(target.value - value.value),
                    target: target.value,
                    kind: target.kind
                )
            }
        }
        return candidates
            .filter { $0.distance <= translationThreshold }
            .min { $0.distance < $1.distance }
    }

    private static func normalize(_ value: Double) -> Double {
        let normalized = value.truncatingRemainder(dividingBy: 360)
        return normalized < 0 ? normalized + 360 : normalized
    }

    private static func circularDistance(from value: Double, to target: Double) -> Double {
        let distance = abs(normalize(value) - normalize(target))
        return min(distance, 360 - distance)
    }
}

private struct SnapValue {
    let value: Double
}

private struct SnapTarget {
    let value: Double
    let kind: AlignmentGuideKind
}

private struct SnapCandidate {
    let delta: Double
    let distance: Double
    let target: Double
    let kind: AlignmentGuideKind
}
