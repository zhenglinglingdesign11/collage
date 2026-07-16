import SwiftUI
import UIKit

enum LayerMaskShape: String, CaseIterable, Identifiable, Sendable {
    case none
    case circle
    case heart
    case star
    case tag
    case stamp

    var id: String { rawValue }

    var label: String {
        switch self {
        case .none:
            return "无"
        case .circle:
            return "圆形"
        case .heart:
            return "心形"
        case .star:
            return "星形"
        case .tag:
            return "标签"
        case .stamp:
            return "邮票"
        }
    }
}

struct LayerMaskView: View {
    let shape: LayerMaskShape
    var cornerRadius: CGFloat

    var body: some View {
        GeometryReader { proxy in
            switch shape {
            case .none:
                Rectangle()
            case .circle:
                Circle()
            case .heart:
                HeartShape()
            case .star:
                StarShape(points: 5)
            case .tag:
                TagShape(cornerRadius: min(cornerRadius, min(proxy.size.width, proxy.size.height) * 0.18))
            case .stamp:
                StampShape(notchCount: 9)
            }
        }
    }
}

extension View {
    @ViewBuilder
    func layerMask(_ shape: LayerMaskShape?, cornerRadius: CGFloat) -> some View {
        if let shape, shape != .none {
            mask(LayerMaskView(shape: shape, cornerRadius: cornerRadius))
        } else {
            self
        }
    }

    @ViewBuilder
    func alphaMask(_ image: UIImage?) -> some View {
        if let image {
            mask(
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            )
        } else {
            self
        }
    }
}

private struct HeartShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let width = rect.width
        let height = rect.height
        path.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addCurve(
            to: CGPoint(x: rect.minX, y: rect.midY - height * 0.08),
            control1: CGPoint(x: rect.midX - width * 0.42, y: rect.maxY - height * 0.25),
            control2: CGPoint(x: rect.minX, y: rect.maxY - height * 0.48)
        )
        path.addCurve(
            to: CGPoint(x: rect.midX, y: rect.midY - height * 0.12),
            control1: CGPoint(x: rect.minX, y: rect.minY + height * 0.12),
            control2: CGPoint(x: rect.midX - width * 0.26, y: rect.minY)
        )
        path.addCurve(
            to: CGPoint(x: rect.maxX, y: rect.midY - height * 0.08),
            control1: CGPoint(x: rect.midX + width * 0.26, y: rect.minY),
            control2: CGPoint(x: rect.maxX, y: rect.minY + height * 0.12)
        )
        path.addCurve(
            to: CGPoint(x: rect.midX, y: rect.maxY),
            control1: CGPoint(x: rect.maxX, y: rect.maxY - height * 0.48),
            control2: CGPoint(x: rect.midX + width * 0.42, y: rect.maxY - height * 0.25)
        )
        path.closeSubpath()
        return path
    }
}

private struct StarShape: Shape {
    let points: Int

    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outerRadius = min(rect.width, rect.height) / 2
        let innerRadius = outerRadius * 0.45
        let count = max(2, points * 2)
        var path = Path()

        for index in 0..<count {
            let angle = Double(index) * .pi / Double(points) - .pi / 2
            let radius = index.isMultiple(of: 2) ? outerRadius : innerRadius
            let point = CGPoint(
                x: center.x + CGFloat(cos(angle)) * radius,
                y: center.y + CGFloat(sin(angle)) * radius
            )
            if index == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        return path
    }
}

private struct TagShape: Shape {
    let cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let notch = min(rect.width, rect.height) * 0.20
        let radius = max(0, cornerRadius)
        path.move(to: CGPoint(x: rect.minX + radius, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - notch, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX - notch, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + radius, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - radius), control: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
        path.addQuadCurve(to: CGPoint(x: rect.minX + radius, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        path.closeSubpath()
        return path
    }
}

private struct StampShape: Shape {
    let notchCount: Int

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let count = max(4, notchCount)
        let notch = min(rect.width, rect.height) * 0.035
        let stepX = rect.width / CGFloat(count)
        let stepY = rect.height / CGFloat(count)

        path.move(to: CGPoint(x: rect.minX, y: rect.minY + notch))
        for index in 0..<count {
            let x = rect.minX + CGFloat(index) * stepX
            path.addLine(to: CGPoint(x: x + stepX * 0.5, y: rect.minY))
            path.addLine(to: CGPoint(x: x + stepX, y: rect.minY + notch))
        }
        for index in 0..<count {
            let y = rect.minY + CGFloat(index) * stepY
            path.addLine(to: CGPoint(x: rect.maxX, y: y + stepY * 0.5))
            path.addLine(to: CGPoint(x: rect.maxX - notch, y: y + stepY))
        }
        for index in stride(from: count, to: 0, by: -1) {
            let x = rect.minX + CGFloat(index) * stepX
            path.addLine(to: CGPoint(x: x - stepX * 0.5, y: rect.maxY))
            path.addLine(to: CGPoint(x: x - stepX, y: rect.maxY - notch))
        }
        for index in stride(from: count, to: 0, by: -1) {
            let y = rect.minY + CGFloat(index) * stepY
            path.addLine(to: CGPoint(x: rect.minX, y: y - stepY * 0.5))
            path.addLine(to: CGPoint(x: rect.minX + notch, y: y - stepY))
        }
        path.closeSubpath()
        return path
    }
}
