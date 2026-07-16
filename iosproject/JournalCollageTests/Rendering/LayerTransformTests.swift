import CoreGraphics
import XCTest
@testable import JournalCollage

final class LayerTransformTests: XCTestCase {
    func testAppliesTranslationScaleAndRotation() {
        let layer = Layer(
            id: "layer",
            type: .image,
            x: 10,
            y: 20,
            width: 100,
            height: 120,
            rotation: 350,
            scale: 1,
            zIndex: 1
        )

        let next = LayerTransform.applying(
            LayerTransformGesture(
                translation: CGVector(dx: 15, dy: -5),
                scale: 1.5,
                rotationDelta: 20
            ),
            to: layer
        )

        XCTAssertEqual(next.x, 25)
        XCTAssertEqual(next.y, 15)
        XCTAssertEqual(next.scale, 1.5)
        XCTAssertEqual(next.rotation, 10)
    }

    func testReplacingLayerUpdatesDraft() {
        var draft = Draft()
        let layer = DraftFactory.makeTextLayer(text: "before", draft: draft)
        draft.layers = [layer]

        var changed = layer
        changed.text = "after"
        let next = LayerTransform.replacingLayer(changed, in: draft)

        XCTAssertEqual(next.layers.first?.text, "after")
    }
}
