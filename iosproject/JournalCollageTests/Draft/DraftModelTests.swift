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
        XCTAssertEqual(layer.style[LayerStyleKey.textFontId], .string("system"))
        XCTAssertEqual(layer.style[LayerStyleKey.textColor], .string("#111111"))
        XCTAssertEqual(layer.style[LayerStyleKey.textBackground], .string("transparent"))
        XCTAssertEqual(layer.style[LayerStyleKey.textBackgroundLabel], .string("\u{65E0}"))
        XCTAssertEqual(layer.style[LayerStyleKey.textCanvasFontFamily], .string("PingFang SC, sans-serif"))
    }

    func testTextLayerStyleRoundTripSupportsMiniProgramFields() throws {
        var draft = Draft()
        var layer = DraftFactory.makeTextLayer(text: "note", draft: draft)
        layer.opacity = 0.7
        layer.style[LayerStyleKey.textFontId] = .string("little_kids")
        layer.style[LayerStyleKey.textFontLabel] = .string("Little Kids")
        layer.style[LayerStyleKey.textFontFamily] = .string("JournalLittleKids, Kaiti SC, STKaiti, cursive")
        layer.style[LayerStyleKey.textCanvasFontFamily] = .string("JournalLittleKids")
        layer.style[LayerStyleKey.textFontSize] = .number(88)
        layer.style[LayerStyleKey.textColor] = .string("#d94a38")
        layer.style[LayerStyleKey.textBackgroundLabel] = .string("\u{80F6}\u{5E26}")
        layer.style[LayerStyleKey.textBackground] = .string("#ead48a")
        draft.layers = [layer]

        let data = try JSONEncoder().encode(draft)
        let decoded = try JSONDecoder().decode(Draft.self, from: data)
        let decodedLayer = try XCTUnwrap(decoded.layers.first)

        XCTAssertEqual(decodedLayer.opacity, 0.7)
        XCTAssertEqual(decodedLayer.style[LayerStyleKey.textFontId], .string("little_kids"))
        XCTAssertEqual(decodedLayer.style[LayerStyleKey.textCanvasFontFamily], .string("JournalLittleKids"))
        XCTAssertEqual(decodedLayer.style[LayerStyleKey.textFontSize], .number(88))
        XCTAssertEqual(decodedLayer.style[LayerStyleKey.textBackground], .string("#ead48a"))
    }

    func testTextStyleCatalogMatchesMiniProgramOptions() {
        XCTAssertTrue(LayerTextStyle.fonts.contains { $0.id == "little_kids" })
        XCTAssertTrue(LayerTextStyle.fonts.contains { $0.id == "gemini" })
        XCTAssertTrue(LayerTextStyle.fonts.contains { $0.id == "kelsi" })
        XCTAssertEqual(LayerTextStyle.colors, ["#111111", "#4a4a4a", "#9a9a9a", "#ffffff", "#d94a38", "#e9d28a", "#8c9a8d"])
        XCTAssertEqual(LayerTextStyle.backgroundValue(for: "\u{80F6}\u{5E26}"), "#ead48a")
        XCTAssertEqual(LayerTextStyle.backgroundLabel(for: "#111111"), "\u{9ED1}\u{5E95}")
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

    func testDecorativeBrushLayerUsesMiniProgramSchemaFields() {
        let draft = Draft()
        let strokes = [
            BrushStroke(
                type: .stitch,
                color: "#d94a38",
                size: 10,
                points: [
                    BrushPoint(x: 100, y: 120),
                    BrushPoint(x: 180, y: 220)
                ]
            )
        ]

        let layer = DraftFactory.makeBrushLayer(strokes: strokes, draft: draft)

        XCTAssertEqual(layer.type, .brush)
        XCTAssertEqual(layer.strokes?.first?.type, .stitch)
        XCTAssertEqual(layer.strokes?.first?.color, "#d94a38")
        XCTAssertEqual(layer.style[LayerStyleKey.brushType], .string("decorative"))
        XCTAssertNotNil(layer.brushWidth)
        XCTAssertNotNil(layer.brushHeight)
    }

    func testBrushOutlineAndImageEffectRoundTrip() throws {
        var draft = Draft()
        var layer = Layer(
            type: .image,
            x: 0,
            y: 0,
            width: 200,
            height: 120,
            source: "images/photo.jpg"
        )
        layer.outline = LayerOutline(style: .double, color: "#ffffff", width: 14, secondaryColor: "#111111", secondaryWidth: 3)
        layer.effect = LayerImageEffect(type: .crossStitch, options: [
            "grid": .number(18),
            "colors": .number(6),
            "style": .string("classic")
        ])
        layer.style[LayerStyleKey.outlineStyle] = .string(LayerOutlineStyle.double.rawValue)
        layer.style[LayerStyleKey.imageEffectType] = .string(ImageEffectType.crossStitch.rawValue)
        draft.layers = [layer]

        let data = try JSONEncoder().encode(draft)
        let decoded = try JSONDecoder().decode(Draft.self, from: data)
        let decodedLayer = try XCTUnwrap(decoded.layers.first)

        XCTAssertEqual(decodedLayer.outline?.style, .double)
        XCTAssertEqual(decodedLayer.outline?.secondaryColor, "#111111")
        XCTAssertEqual(decodedLayer.imageEffectType, .crossStitch)
        XCTAssertEqual(decodedLayer.effect?.options["grid"], .number(18))
    }

    func testDecodesMiniProgramFlatImageEffectObject() throws {
        let json = """
        {
          "schemaVersion": 1,
          "id": "draft",
          "ratio": "portrait",
          "width": 900,
          "height": 1200,
          "background": "#fdfdfb",
          "updatedAt": 0,
          "layers": [
            {
              "id": "image",
              "type": "image",
              "x": 0,
              "y": 0,
              "width": 200,
              "height": 120,
              "rotation": 0,
              "scale": 1,
              "opacity": 1,
              "zIndex": 1,
              "source": "images/photo.jpg",
              "effect": {
                "type": "cross-stitch",
                "grid": 18,
                "colors": 6,
                "style": "classic",
                "createdAt": 1234567890
              },
              "style": {}
            }
          ],
          "assets": []
        }
        """

        let decoded = try JSONDecoder().decode(Draft.self, from: Data(json.utf8))
        let layer = try XCTUnwrap(decoded.layers.first)

        XCTAssertEqual(layer.effect?.type, .crossStitch)
        XCTAssertEqual(layer.effect?.options["grid"], .number(18))
        XCTAssertEqual(layer.effect?.options["style"], .string("classic"))
        XCTAssertEqual(layer.effect?.createdAt, "1234567890")
    }

    func testClipPolygonRoundTrip() throws {
        var draft = Draft()
        var layer = DraftFactory.makeImageLayer(
            source: "images/photo.jpg",
            imageSize: CanvasSize(width: 1000, height: 800),
            draft: draft
        )
        layer.clipPolygon = [
            BrushPoint(x: 0, y: 0),
            BrushPoint(x: 200, y: 0),
            BrushPoint(x: 200, y: 100),
            BrushPoint(x: 0, y: 100)
        ]
        draft.layers = [layer]

        let data = try JSONEncoder().encode(draft)
        let decoded = try JSONDecoder().decode(Draft.self, from: data)

        XCTAssertEqual(decoded.layers.first?.clipPolygon?.count, 4)
        XCTAssertEqual(decoded.layers.first?.clipPolygon?.last?.y, 100)
    }

    func testTearSeedRoundTrip() throws {
        var draft = Draft()
        var layer = Layer(
            type: .paper,
            x: 0,
            y: 0,
            width: 200,
            height: 120,
            tear: true,
            tearSeed: 12345
        )
        layer.style["color"] = .string("#efe7d8")
        draft.layers = [layer]

        let data = try JSONEncoder().encode(draft)
        let decoded = try JSONDecoder().decode(Draft.self, from: data)

        XCTAssertEqual(decoded.layers.first?.tear, true)
        XCTAssertEqual(decoded.layers.first?.tearSeed, 12345)
    }
}
