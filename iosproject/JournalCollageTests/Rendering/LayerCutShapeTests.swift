import XCTest
@testable import JournalCollage

final class LayerCutShapeTests: XCTestCase {
    func testParsesStraightCutLineFromLayerStyle() {
        var layer = Layer(
            type: .image,
            x: 0,
            y: 0,
            width: 200,
            height: 120
        )
        layer.style[LayerStyleKey.cutStyle] = .string(CutStyle.straight.rawValue)
        layer.style[LayerStyleKey.cutLine] = .object([
            "startX": .number(0),
            "startY": .number(60),
            "endX": .number(200),
            "endY": .number(60)
        ])

        let shape = LayerCutShape(layer)

        XCTAssertEqual(shape?.style, .straight)
        XCTAssertEqual(shape?.line, LayerCutLine(startX: 0, startY: 60, endX: 200, endY: 60))
    }

    func testParsesWaveCutParametersFromLayerStyle() {
        var layer = Layer(
            type: .image,
            x: 0,
            y: 0,
            width: 200,
            height: 120
        )
        layer.style[LayerStyleKey.cutStyle] = .string(CutStyle.wave.rawValue)
        layer.style[LayerStyleKey.cutLine] = .object([
            "startX": .number(0),
            "startY": .number(60),
            "endX": .number(200),
            "endY": .number(60)
        ])
        layer.style[LayerStyleKey.waveAmplitude] = .number(18)
        layer.style[LayerStyleKey.waveFrequency] = .number(6)

        let shape = LayerCutShape(layer)

        XCTAssertEqual(shape?.style, .wave)
        XCTAssertEqual(shape?.waveAmplitude, 18)
        XCTAssertEqual(shape?.waveFrequency, 6)
    }

    func testIgnoresBrushAndSubjectCutStyles() {
        var layer = Layer(
            type: .image,
            x: 0,
            y: 0,
            width: 200,
            height: 120
        )
        layer.style[LayerStyleKey.cutStyle] = .string(CutStyle.brush.rawValue)

        XCTAssertNil(LayerCutShape(layer))
    }
}
