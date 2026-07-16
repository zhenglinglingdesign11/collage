import CoreGraphics

struct CanvasViewport: Equatable, Sendable {
    var canvasSize: CGSize
    var containerSize: CGSize
    var contentInsets: CanvasInsets

    init(
        canvasSize: CGSize,
        containerSize: CGSize,
        contentInsets: CanvasInsets = .zero
    ) {
        self.canvasSize = canvasSize
        self.containerSize = containerSize
        self.contentInsets = contentInsets
    }

    var availableSize: CGSize {
        CGSize(
            width: max(0, containerSize.width - contentInsets.leading - contentInsets.trailing),
            height: max(0, containerSize.height - contentInsets.top - contentInsets.bottom)
        )
    }

    var scale: CGFloat {
        guard canvasSize.width > 0, canvasSize.height > 0 else { return 1 }
        let fitWidth = availableSize.width / canvasSize.width
        let fitHeight = availableSize.height / canvasSize.height
        return max(0, min(fitWidth, fitHeight))
    }

    var renderedSize: CGSize {
        CGSize(width: canvasSize.width * scale, height: canvasSize.height * scale)
    }

    var canvasRect: CGRect {
        let size = renderedSize
        let origin = CGPoint(
            x: contentInsets.leading + (availableSize.width - size.width) / 2,
            y: contentInsets.top + (availableSize.height - size.height) / 2
        )
        return CGRect(origin: origin, size: size)
    }

    func canvasPoint(fromScreen point: CGPoint) -> CGPoint {
        let rect = canvasRect
        guard scale > 0 else { return .zero }
        return CGPoint(
            x: (point.x - rect.minX) / scale,
            y: (point.y - rect.minY) / scale
        )
    }

    func screenPoint(fromCanvas point: CGPoint) -> CGPoint {
        let rect = canvasRect
        return CGPoint(
            x: rect.minX + point.x * scale,
            y: rect.minY + point.y * scale
        )
    }

    func canvasVector(fromScreen vector: CGVector) -> CGVector {
        guard scale > 0 else { return .zero }
        return CGVector(dx: vector.dx / scale, dy: vector.dy / scale)
    }
}

struct CanvasInsets: Equatable, Sendable {
    static let zero = CanvasInsets(top: 0, leading: 0, bottom: 0, trailing: 0)

    var top: CGFloat
    var leading: CGFloat
    var bottom: CGFloat
    var trailing: CGFloat
}
