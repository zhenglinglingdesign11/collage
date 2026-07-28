import SwiftUI

struct InteractiveDraftCanvas: View {
    @Binding var draft: Draft
    @Binding var selectedLayerId: String?
    var imageStore: ImageStore?
    var isolatedLayerId: String?
    var onDraftChanged: () -> Void

    @State private var dragBaseLayer: Layer?
    @State private var scaleBaseLayer: Layer?
    @State private var rotationBaseLayer: Layer?
    @State private var alignmentGuides: [AlignmentGuideLine] = []

    var body: some View {
        GeometryReader { proxy in
            let viewport = CanvasViewport(
                canvasSize: CGSize(width: draft.width, height: draft.height),
                containerSize: proxy.size
            )

            ZStack {
                DraftRenderer(
                    draft: draft,
                    selectedLayerId: selectedLayerId,
                    imageStore: imageStore,
                    isolatedLayerId: isolatedLayerId
                )

                AlignmentGuidesOverlay(guides: alignmentGuides, viewport: viewport)
                    .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .simultaneousGesture(tapGesture(viewport: viewport))
            .simultaneousGesture(dragGesture(viewport: viewport))
            .simultaneousGesture(scaleGesture())
            .simultaneousGesture(rotationGesture())
        }
    }

    private func tapGesture(viewport: CanvasViewport) -> some Gesture {
        SpatialTapGesture()
            .onEnded { value in
                let canvasPoint = viewport.canvasPoint(fromScreen: value.location)
                selectedLayerId = HitTesting.hitTest(point: canvasPoint, in: draft.layers)?.id
            }
    }

    private func dragGesture(viewport: CanvasViewport) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                guard let selectedLayer = selectedLayer else { return }
                if dragBaseLayer?.id != selectedLayer.id {
                    dragBaseLayer = selectedLayer
                }
                guard let baseLayer = dragBaseLayer else { return }
                let delta = viewport.canvasVector(
                    fromScreen: CGVector(dx: value.translation.width, dy: value.translation.height)
                )
                let proposedLayer = LayerTransform.translated(baseLayer, by: delta)
                let snapResult = AlignmentSnapping.snappedLayer(proposedLayer, in: draft)
                alignmentGuides = snapResult.guides
                replaceLayer(snapResult.layer, markChanged: false)
            }
            .onEnded { _ in
                dragBaseLayer = nil
                alignmentGuides = []
                onDraftChanged()
            }
    }

    private func scaleGesture() -> some Gesture {
        MagnificationGesture()
            .onChanged { value in
                guard let selectedLayer = selectedLayer else { return }
                if scaleBaseLayer?.id != selectedLayer.id {
                    scaleBaseLayer = selectedLayer
                }
                guard let baseLayer = scaleBaseLayer else { return }
                replaceLayer(LayerTransform.scaled(baseLayer, by: Double(value)), markChanged: false)
            }
            .onEnded { _ in
                scaleBaseLayer = nil
                onDraftChanged()
            }
    }

    private func rotationGesture() -> some Gesture {
        RotationGesture()
            .onChanged { angle in
                guard let selectedLayer = selectedLayer else { return }
                if rotationBaseLayer?.id != selectedLayer.id {
                    rotationBaseLayer = selectedLayer
                }
                guard let baseLayer = rotationBaseLayer else { return }
                var proposedLayer = LayerTransform.rotated(baseLayer, by: angle.degrees)
                proposedLayer.rotation = AlignmentSnapping.snappedRotation(proposedLayer.rotation)
                replaceLayer(proposedLayer, markChanged: false)
            }
            .onEnded { _ in
                rotationBaseLayer = nil
                onDraftChanged()
            }
    }

    private var selectedLayer: Layer? {
        guard let selectedLayerId else { return nil }
        return draft.layers.first { $0.id == selectedLayerId }
    }

    private func replaceLayer(_ layer: Layer, markChanged: Bool = true) {
        draft = LayerTransform.replacingLayer(layer, in: draft)
        if markChanged {
            onDraftChanged()
        }
    }
}

private struct AlignmentGuidesOverlay: View {
    let guides: [AlignmentGuideLine]
    let viewport: CanvasViewport

    var body: some View {
        Path { path in
            for guide in guides {
                switch guide.axis {
                case .vertical:
                    let x = viewport.screenPoint(fromCanvas: CGPoint(x: guide.position, y: 0)).x
                    path.move(to: CGPoint(x: x, y: viewport.canvasRect.minY))
                    path.addLine(to: CGPoint(x: x, y: viewport.canvasRect.maxY))
                case .horizontal:
                    let y = viewport.screenPoint(fromCanvas: CGPoint(x: 0, y: guide.position)).y
                    path.move(to: CGPoint(x: viewport.canvasRect.minX, y: y))
                    path.addLine(to: CGPoint(x: viewport.canvasRect.maxX, y: y))
                }
            }
        }
        .stroke(JournalColors.textTertiary.opacity(0.75), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        .overlay(centerGuides)
    }

    private var centerGuides: some View {
        Path { path in
            for guide in guides where guide.kind == .center {
                switch guide.axis {
                case .vertical:
                    let x = viewport.screenPoint(fromCanvas: CGPoint(x: guide.position, y: 0)).x
                    path.move(to: CGPoint(x: x, y: viewport.canvasRect.minY))
                    path.addLine(to: CGPoint(x: x, y: viewport.canvasRect.maxY))
                case .horizontal:
                    let y = viewport.screenPoint(fromCanvas: CGPoint(x: 0, y: guide.position)).y
                    path.move(to: CGPoint(x: viewport.canvasRect.minX, y: y))
                    path.addLine(to: CGPoint(x: viewport.canvasRect.maxX, y: y))
                }
            }
        }
        .stroke(JournalColors.stampRed.opacity(0.9), style: StrokeStyle(lineWidth: 1.4, dash: [6, 4]))
    }
}
