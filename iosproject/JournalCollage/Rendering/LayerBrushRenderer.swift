import SwiftUI

struct LayerBrushView: View {
    let layer: Layer

    var body: some View {
        GeometryReader { proxy in
            Canvas { context, size in
                let scaleX = size.width / max(1, CGFloat(layer.brushWidth ?? layer.width))
                let scaleY = size.height / max(1, CGFloat(layer.brushHeight ?? layer.height))
                for stroke in layer.strokes ?? [] {
                    draw(stroke, context: &context, scaleX: scaleX, scaleY: scaleY)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
    }

    private func draw(_ stroke: BrushStroke, context: inout GraphicsContext, scaleX: CGFloat, scaleY: CGFloat) {
        let points = stroke.points.map { point in
            CGPoint(x: CGFloat(point.x) * scaleX, y: CGFloat(point.y) * scaleY)
        }
        guard !points.isEmpty else { return }
        let color = Color(hexString: stroke.color) ?? JournalColors.ink
        let width = max(1, CGFloat(stroke.size) * min(scaleX, scaleY))

        switch stroke.type {
        case .line:
            strokePolyline(points, context: &context, color: color, lineWidth: width, dash: [])
        case .stitch:
            drawStitches(points, context: &context, color: color, lineWidth: max(1, width * 0.16), spacing: max(8, width * 1.1), size: width)
        case .knit:
            drawKnits(points, context: &context, color: color, lineWidth: max(1, width * 0.12), spacing: max(9, width * 0.95), size: width)
        case .bead:
            drawBeads(points, context: &context, color: color, spacing: max(5, width * 0.72), radius: max(1.5, width * 0.24))
        case .lace:
            strokePolyline(points, context: &context, color: color.opacity(0.42), lineWidth: max(1, width * 0.18), dash: [])
            drawBeads(points, context: &context, color: color.opacity(0.86), spacing: max(7, width * 0.8), radius: max(1.4, width * 0.18))
        case .bow:
            drawBows(points, context: &context, color: color, spacing: max(16, width * 1.6), size: width)
        }
    }

    private func strokePolyline(
        _ points: [CGPoint],
        context: inout GraphicsContext,
        color: Color,
        lineWidth: CGFloat,
        dash: [CGFloat]
    ) {
        var path = Path()
        path.move(to: points[0])
        for point in points.dropFirst() {
            path.addLine(to: point)
        }
        context.stroke(
            path,
            with: .color(color),
            style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round, dash: dash)
        )
    }

    private func drawStitches(
        _ points: [CGPoint],
        context: inout GraphicsContext,
        color: Color,
        lineWidth: CGFloat,
        spacing: CGFloat,
        size: CGFloat
    ) {
        for sample in sampled(points, spacing: spacing) {
            var path = Path()
            let half = size * 0.36
            path.move(to: CGPoint(x: sample.point.x - half * sample.normal.dx, y: sample.point.y - half * sample.normal.dy))
            path.addLine(to: CGPoint(x: sample.point.x + half * sample.normal.dx, y: sample.point.y + half * sample.normal.dy))
            context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        }
    }

    private func drawKnits(
        _ points: [CGPoint],
        context: inout GraphicsContext,
        color: Color,
        lineWidth: CGFloat,
        spacing: CGFloat,
        size: CGFloat
    ) {
        for sample in sampled(points, spacing: spacing) {
            let half = size * 0.34
            var left = Path()
            left.move(to: sample.point)
            left.addLine(to: CGPoint(x: sample.point.x - half * sample.tangent.dx - half * sample.normal.dx, y: sample.point.y - half * sample.tangent.dy - half * sample.normal.dy))
            var right = Path()
            right.move(to: sample.point)
            right.addLine(to: CGPoint(x: sample.point.x + half * sample.tangent.dx - half * sample.normal.dx, y: sample.point.y + half * sample.tangent.dy - half * sample.normal.dy))
            context.stroke(left, with: .color(color), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            context.stroke(right, with: .color(color), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        }
    }

    private func drawBeads(
        _ points: [CGPoint],
        context: inout GraphicsContext,
        color: Color,
        spacing: CGFloat,
        radius: CGFloat
    ) {
        for sample in sampled(points, spacing: spacing) {
            let rect = CGRect(x: sample.point.x - radius, y: sample.point.y - radius, width: radius * 2, height: radius * 2)
            context.fill(Path(ellipseIn: rect), with: .color(color))
            context.stroke(Path(ellipseIn: rect), with: .color(Color.white.opacity(0.42)), lineWidth: max(0.6, radius * 0.25))
        }
    }

    private func drawBows(
        _ points: [CGPoint],
        context: inout GraphicsContext,
        color: Color,
        spacing: CGFloat,
        size: CGFloat
    ) {
        for sample in sampled(points, spacing: spacing) {
            let center = sample.point
            let half = size * 0.52
            var bow = Path()
            bow.addEllipse(in: CGRect(x: center.x - half, y: center.y - half * 0.45, width: half, height: half * 0.9))
            bow.addEllipse(in: CGRect(x: center.x, y: center.y - half * 0.45, width: half, height: half * 0.9))
            bow.addRoundedRect(in: CGRect(x: center.x - half * 0.18, y: center.y - half * 0.18, width: half * 0.36, height: half * 0.36), cornerSize: CGSize(width: half * 0.08, height: half * 0.08))
            context.fill(bow, with: .color(color.opacity(0.92)))
            context.stroke(bow, with: .color(Color.white.opacity(0.48)), lineWidth: max(0.7, size * 0.05))
        }
    }

    private func sampled(_ points: [CGPoint], spacing: CGFloat) -> [(point: CGPoint, tangent: CGVector, normal: CGVector)] {
        guard points.count > 1 else {
            return [(points[0], CGVector(dx: 1, dy: 0), CGVector(dx: 0, dy: 1))]
        }
        var output: [(CGPoint, CGVector, CGVector)] = []
        var carry: CGFloat = 0
        for index in 1..<points.count {
            let start = points[index - 1]
            let end = points[index]
            let dx = end.x - start.x
            let dy = end.y - start.y
            let length = max(0.001, hypot(dx, dy))
            let tangent = CGVector(dx: dx / length, dy: dy / length)
            let normal = CGVector(dx: -tangent.dy, dy: tangent.dx)
            var distance = spacing - carry
            while distance <= length {
                let progress = distance / length
                output.append((
                    CGPoint(x: start.x + dx * progress, y: start.y + dy * progress),
                    tangent,
                    normal
                ))
                distance += spacing
            }
            carry = length - max(0, distance - spacing)
        }
        return output.isEmpty ? [(points[0], CGVector(dx: 1, dy: 0), CGVector(dx: 0, dy: 1))] : output
    }
}

struct LayerOutlineOverlay: View {
    let layer: Layer

    var body: some View {
        GeometryReader { proxy in
            let outline = normalizedOutline
            let scale = min(
                proxy.size.width / max(1, CGFloat(layer.width)),
                proxy.size.height / max(1, CGFloat(layer.height))
            )
            let radius = CGFloat(layer.radius ?? 6) * scale
            let lineWidth = CGFloat(outline.width) * scale
            if outline.style != .none && lineWidth > 0 {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Color(hexString: outline.color)?.opacity(outline.opacity) ?? Color.white.opacity(outline.opacity), lineWidth: lineWidth)
                    .overlay {
                        if let secondaryColor = outline.secondaryColor, let secondaryWidth = outline.secondaryWidth {
                            RoundedRectangle(cornerRadius: radius, style: .continuous)
                                .stroke(Color(hexString: secondaryColor) ?? JournalColors.ink, lineWidth: CGFloat(secondaryWidth) * scale)
                        }
                    }
            }
        }
    }

    private var normalizedOutline: LayerOutline {
        guard let outline = layer.outline else {
            return LayerOutline(style: .none)
        }
        return outline
    }
}

struct LayerImageEffectOverlay: View {
    let layer: Layer

    var body: some View {
        if let effect = layer.effect {
            GeometryReader { proxy in
                switch effect.type {
                case .crossStitch:
                    crossStitchGrid(size: proxy.size)
                        .blendMode(.multiply)
                case .matisse:
                    matisseConfetti(size: proxy.size)
                        .blendMode(.softLight)
                case .botanical:
                    botanicalTint
                }
            }
            .allowsHitTesting(false)
        }
    }

    private func crossStitchGrid(size: CGSize) -> some View {
        Canvas { context, canvasSize in
            let grid = effectNumber("grid", fallback: 18)
            let spacing = max(6, CGFloat(grid))
            var path = Path()
            stride(from: CGFloat(0), through: canvasSize.width, by: spacing).forEach { x in
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: canvasSize.height))
            }
            stride(from: CGFloat(0), through: canvasSize.height, by: spacing).forEach { y in
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: canvasSize.width, y: y))
            }
            context.stroke(path, with: .color(JournalColors.ink.opacity(0.12)), lineWidth: 0.7)

            let mark = spacing * 0.24
            for x in stride(from: spacing / 2, through: canvasSize.width, by: spacing) {
                for y in stride(from: spacing / 2, through: canvasSize.height, by: spacing) {
                    var cross = Path()
                    cross.move(to: CGPoint(x: x - mark, y: y - mark))
                    cross.addLine(to: CGPoint(x: x + mark, y: y + mark))
                    cross.move(to: CGPoint(x: x + mark, y: y - mark))
                    cross.addLine(to: CGPoint(x: x - mark, y: y + mark))
                    context.stroke(cross, with: .color(Color.white.opacity(0.28)), lineWidth: 0.8)
                }
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private func matisseConfetti(size: CGSize) -> some View {
        Canvas { context, canvasSize in
            let colors = [Color(hexString: "#d94a38"), Color(hexString: "#f4d77a"), Color(hexString: "#9ec7df"), Color(hexString: "#8c9a8d")].compactMap { $0 }
            guard !colors.isEmpty else { return }
            let count = Int(max(8, min(26, canvasSize.width * canvasSize.height / 4800)))
            for index in 0..<count {
                let x = CGFloat((index * 47) % 100) / 100 * canvasSize.width
                let y = CGFloat((index * 71) % 100) / 100 * canvasSize.height
                let rect = CGRect(x: x, y: y, width: 16 + CGFloat(index % 5) * 5, height: 8 + CGFloat(index % 4) * 4)
                var path = Path(roundedRect: rect, cornerRadius: 3)
                let rotation = Angle.degrees(Double((index * 29) % 180))
                path = path.applying(CGAffineTransform(translationX: -rect.midX, y: -rect.midY))
                path = path.applying(CGAffineTransform(rotationAngle: CGFloat(rotation.radians)))
                path = path.applying(CGAffineTransform(translationX: rect.midX, y: rect.midY))
                context.fill(path, with: .color(colors[index % colors.count].opacity(0.34)))
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private var botanicalTint: some View {
        Rectangle()
            .fill(Color(hexString: "#efe7d8")?.opacity(0.24) ?? JournalColors.paperBeige.opacity(0.24))
            .overlay(
                Rectangle()
                    .stroke(Color(hexString: "#8c9a8d")?.opacity(0.38) ?? JournalColors.sageTape.opacity(0.38), lineWidth: 2)
            )
    }

    private func effectNumber(_ key: String, fallback: Double) -> Double {
        guard case .number(let value)? = layer.effect?.options[key] else { return fallback }
        return value
    }
}
