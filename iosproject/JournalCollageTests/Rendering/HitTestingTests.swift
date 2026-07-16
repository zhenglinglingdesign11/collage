import CoreGraphics
import XCTest
@testable import JournalCollage

final class HitTestingTests: XCTestCase {
    func testHitTestReturnsTopMostLayer() {
        let bottom = Layer(
            id: "bottom",
            type: .paper,
            x: 100,
            y: 100,
            width: 300,
            height: 300,
            zIndex: 1
        )
        let top = Layer(
            id: "top",
            type: .sticker,
            x: 150,
            y: 150,
            width: 100,
            height: 100,
            zIndex: 2
        )

        let hit = HitTesting.hitTest(point: CGPoint(x: 180, y: 180), in: [bottom, top])

        XCTAssertEqual(hit?.id, "top")
    }

    func testHitTestRespectsRotation() {
        let layer = Layer(
            id: "rotated",
            type: .paper,
            x: 100,
            y: 100,
            width: 200,
            height: 80,
            rotation: 45,
            zIndex: 1
        )

        XCTAssertTrue(HitTesting.contains(point: CGPoint(x: 200, y: 140), layer: layer))
        XCTAssertFalse(HitTesting.contains(point: CGPoint(x: 100, y: 100), layer: layer))
    }
}
