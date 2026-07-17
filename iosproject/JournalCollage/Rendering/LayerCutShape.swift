import SwiftUI

struct LayerCutLine: Equatable, Sendable {
    var startX: Double
    var startY: Double
    var endX: Double
    var endY: Double

    init(startX: Double, startY: Double, endX: Double, endY: Double) {
        self.startX = startX
        self.startY = startY
        self.endX = endX
        self.endY = endY
    }

    init?(jsonValue: JSONValue?) {
        guard case .object(let object) = jsonValue,
              case .number(let startX)? = object["startX"],
              case .number(let startY)? = object["startY"],
              case .number(let endX)? = object["endX"],
              case .number(let endY)? = object["endY"] else {
            return nil
        }
        self.init(startX: startX, startY: startY, endX: endX, endY: endY)
    }
}

struct LayerCutShape: Shape {
    let style: CutStyle
    let line: LayerCutLine
    let sourceWidth: Double
    let sourceHeight: Double
    let waveAmplitude: Double
    let waveFrequency: Double

    init?(_ layer: Layer) {
        guard LayerClipPolygon.visiblePolygon(for: layer) == nil,
              let style = layer.cutStyle,
              style == .straight || style == .wave,
              let line = LayerCutLine(jsonValue: layer.style[LayerStyleKey.cutLine]) else {
            return nil
        }
        self.style = style
        self.line = line
        self.sourceWidth = max(1, layer.width)
        self.sourceHeight = max(1, layer.height)
        self.waveAmplitude = layer.styleNumber(LayerStyleKey.waveAmplitude) ?? 0
        self.waveFrequency = layer.styleNumber(LayerStyleKey.waveFrequency) ?? 1
    }

    func path(in rect: CGRect) -> Path {
        let start = mapPoint(x: line.startX, y: line.startY, in: rect)
        let end = mapPoint(x: line.endX, y: line.endY, in: rect)
        let dx = end.x - start.x
        let dy = end.y - start.y
        let length = max(0.001, hypot(dx, dy))
        let tangent = CGVector(dx: dx / length, dy: dy / length)
        let normal = CGVector(dx: -tangent.dy, dy: tangent.dx)
        let far = max(rect.width, rect.height) * 3
        let samples = style == .wave ? max(18, Int(max(1, waveFrequency) * 14)) : 1
        let amplitude = style == .wave ? CGFloat(waveAmplitude) * localToRectScale(in: rect) : 0

        var edgePoints: [CGPoint] = []
        for index in 0...samples {
            let t = CGFloat(index) / CGFloat(samples)
            let base = CGPoint(
                x: start.x + dx * t,
                y: start.y + dy * t
            )
            let wave = CGFloat(sin(Double(t * CGFloat(waveFrequency) * 2 * .pi))) * amplitude
            edgePoints.append(CGPoint(
                x: base.x + normal.dx * wave,
                y: base.y + normal.dy * wave
            ))
        }

        let first = edgePoints.first ?? start
        let last = edgePoints.last ?? end
        var path = Path()
        path.move(to: first)
        edgePoints.dropFirst().forEach { path.addLine(to: $0) }
        path.addLine(to: CGPoint(
            x: last.x + tangent.dx * far + normal.dx * far,
            y: last.y + tangent.dy * far + normal.dy * far
        ))
        path.addLine(to: CGPoint(
            x: first.x - tangent.dx * far + normal.dx * far,
            y: first.y - tangent.dy * far + normal.dy * far
        ))
        path.closeSubpath()
        return path
    }

    private func mapPoint(x: Double, y: Double, in rect: CGRect) -> CGPoint {
        CGPoint(
            x: rect.minX + CGFloat(x / sourceWidth) * rect.width,
            y: rect.minY + CGFloat(y / sourceHeight) * rect.height
        )
    }

    private func localToRectScale(in rect: CGRect) -> CGFloat {
        min(rect.width / CGFloat(sourceWidth), rect.height / CGFloat(sourceHeight))
    }
}

extension View {
    @ViewBuilder
    func cutMask(_ shape: LayerCutShape?) -> some View {
        if let shape {
            mask(shape)
        } else {
            self
        }
    }
}

private extension Layer {
    func styleNumber(_ key: String) -> Double? {
        guard case .number(let value)? = style[key] else { return nil }
        return value
    }
}
