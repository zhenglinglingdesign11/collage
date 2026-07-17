import XCTest
@testable import JournalCollage

final class AlignmentSnappingTests: XCTestCase {
    func testSnapsLayerCenterToCanvasCenter() {
        var draft = Draft()
        let layer = Layer(
            id: "layer",
            type: .image,
            x: 404,
            y: 502,
            width: 100,
            height: 200
        )
        draft.layers = [layer]

        let result = AlignmentSnapping.snappedLayer(layer, in: draft)

        XCTAssertEqual(result.layer.x, 400)
        XCTAssertEqual(result.layer.y, 500)
        XCTAssertTrue(result.guides.contains { $0.axis == .vertical && $0.kind == .center })
        XCTAssertTrue(result.guides.contains { $0.axis == .horizontal && $0.kind == .center })
    }

    func testSnapsLayerVisualEdgesToCanvasEdges() {
        var draft = Draft()
        let layer = Layer(
            id: "layer",
            type: .image,
            x: 4,
            y: 7,
            width: 100,
            height: 120
        )
        draft.layers = [layer]

        let result = AlignmentSnapping.snappedLayer(layer, in: draft)

        XCTAssertEqual(result.layer.x, 0)
        XCTAssertEqual(result.layer.y, 0)
        XCTAssertTrue(result.guides.contains { $0.axis == .vertical && $0.kind == .edge })
        XCTAssertTrue(result.guides.contains { $0.axis == .horizontal && $0.kind == .edge })
    }

    func testDoesNotSnapWhenOutsideThreshold() {
        let draft = Draft()
        let layer = Layer(
            id: "layer",
            type: .image,
            x: 230,
            y: 270,
            width: 100,
            height: 120
        )

        let result = AlignmentSnapping.snappedLayer(layer, in: draft)

        XCTAssertEqual(result.layer.x, layer.x)
        XCTAssertEqual(result.layer.y, layer.y)
        XCTAssertTrue(result.guides.isEmpty)
    }

    func testSnapsRotationToNearestTarget() {
        XCTAssertEqual(AlignmentSnapping.snappedRotation(43), 45)
        XCTAssertEqual(AlignmentSnapping.snappedRotation(358), 0)
        XCTAssertEqual(AlignmentSnapping.snappedRotation(183), 180)
        XCTAssertEqual(AlignmentSnapping.snappedRotation(52), 52)
    }
}
