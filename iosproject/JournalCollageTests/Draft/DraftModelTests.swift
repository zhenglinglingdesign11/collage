import XCTest
@testable import JournalCollage

final class DraftModelTests: XCTestCase {
    func testDefaultDraftMatchesMiniProgramSchemaDefaults() {
        let draft = Draft()

        XCTAssertEqual(draft.schemaVersion, 1)
        XCTAssertEqual(draft.ratio, .portrait)
        XCTAssertEqual(draft.width, 900)
        XCTAssertEqual(draft.height, 1200)
        XCTAssertEqual(draft.background, "#fdfdfb")
        XCTAssertTrue(draft.layers.isEmpty)
    }

    func testTextLayerUsesStableFontId() {
        let draft = Draft()
        let layer = DraftFactory.makeTextLayer(text: "hello", draft: draft)

        XCTAssertEqual(layer.type, .text)
        XCTAssertEqual(layer.text, "hello")
        XCTAssertEqual(layer.style["fontId"], .string("system"))
        XCTAssertEqual(layer.style["color"], .string("#111111"))
    }

    func testDraftJSONRoundTrip() throws {
        var draft = Draft(ratio: .square)
        draft.layers = [
            DraftFactory.makeTextLayer(text: "weekend", draft: draft)
        ]

        let data = try JSONEncoder().encode(draft)
        let decoded = try JSONDecoder().decode(Draft.self, from: data)

        XCTAssertEqual(decoded.ratio, .square)
        XCTAssertEqual(decoded.width, 1000)
        XCTAssertEqual(decoded.height, 1000)
        XCTAssertEqual(decoded.layers.first?.text, "weekend")
    }
}
