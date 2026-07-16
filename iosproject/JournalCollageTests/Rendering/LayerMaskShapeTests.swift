import XCTest
@testable import JournalCollage

final class LayerMaskShapeTests: XCTestCase {
    func testMaskShapeRawValuesAreStable() {
        XCTAssertEqual(LayerMaskShape.circle.rawValue, "circle")
        XCTAssertEqual(LayerMaskShape.heart.rawValue, "heart")
        XCTAssertEqual(LayerMaskShape.star.rawValue, "star")
        XCTAssertEqual(LayerMaskShape.tag.rawValue, "tag")
        XCTAssertEqual(LayerMaskShape.stamp.rawValue, "stamp")
    }

    func testMaskShapeCanRoundTripThroughLayerStyle() throws {
        var draft = Draft()
        var layer = Layer(
            id: "masked",
            type: .image,
            x: 0,
            y: 0,
            width: 200,
            height: 200
        )
        layer.style["maskShape"] = .string(LayerMaskShape.heart.rawValue)
        draft.layers = [layer]

        let data = try JSONEncoder().encode(draft)
        let restored = try JSONDecoder().decode(Draft.self, from: data)

        XCTAssertEqual(restored.layers.first?.style["maskShape"], .string("heart"))
    }
}
