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

    func testCutStyleSchemaRoundTrip() throws {
        var draft = Draft()
        var layer = DraftFactory.makeImageLayer(
            source: "images/photo.jpg",
            imageSize: CanvasSize(width: 1000, height: 1200),
            draft: draft
        )
        layer.style[LayerStyleKey.cutStyle] = .string(CutStyle.wave.rawValue)
        layer.style[LayerStyleKey.waveAmplitude] = .number(18)
        layer.style[LayerStyleKey.waveFrequency] = .number(6)
        draft.layers = [layer]

        let data = try JSONEncoder().encode(draft)
        let decoded = try JSONDecoder().decode(Draft.self, from: data)

        XCTAssertEqual(decoded.layers.first?.cutStyle, .wave)
        XCTAssertEqual(decoded.layers.first?.style[LayerStyleKey.waveAmplitude], .number(18))
    }

    func testEmbossShapeLayerUsesSharedSchema() {
        let draft = Draft()
        let layer = DraftFactory.makeEmbossShapeLayer(shape: .stamp, draft: draft)

        XCTAssertEqual(layer.type, .cut)
        XCTAssertEqual(layer.embossMode, .fill)
        XCTAssertEqual(layer.style[LayerStyleKey.embossShape], .string("stamp"))
        XCTAssertEqual(layer.style[LayerStyleKey.maskShape], .string("stamp"))
    }
}
