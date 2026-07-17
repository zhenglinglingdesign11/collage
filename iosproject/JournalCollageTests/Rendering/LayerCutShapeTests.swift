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

    func testSplitsRectIntoTwoStraightCutPolygons() throws {
        let line = LayerCutLine(startX: 0, startY: 60, endX: 200, endY: 60)

        let pieces = try XCTUnwrap(LayerClipPolygon.splitRect(width: 200, height: 120, line: line, style: .straight))

        XCTAssertEqual(pieces.count, 2)
        XCTAssertEqual(LayerClipPolygon.polygonArea(pieces[0]), 12000, accuracy: 0.1)
        XCTAssertEqual(LayerClipPolygon.polygonArea(pieces[1]), 12000, accuracy: 0.1)
    }

    func testSplitsRectIntoTwoWaveCutPolygons() throws {
        let line = LayerCutLine(startX: 0, startY: 60, endX: 200, endY: 60)

        let pieces = try XCTUnwrap(LayerClipPolygon.splitRect(width: 200, height: 120, line: line, style: .wave))

        XCTAssertEqual(pieces.count, 2)
        XCTAssertGreaterThan(LayerClipPolygon.polygonArea(pieces[0]), 1000)
        XCTAssertGreaterThan(LayerClipPolygon.polygonArea(pieces[1]), 1000)
    }

    func testSecondCutIntersectsExistingClipPolygon() throws {
        var layer = Layer(
            type: .image,
            x: 0,
            y: 0,
            width: 200,
            height: 120
        )
        let firstLine = LayerCutLine(startX: 0, startY: 60, endX: 200, endY: 60)
        let firstPieces = try XCTUnwrap(LayerClipPolygon.splitVisiblePolygon(layer: layer, line: firstLine, style: .straight))
        layer.clipPolygon = firstPieces[0]

        let secondLine = LayerCutLine(startX: 100, startY: 0, endX: 100, endY: 120)
        let secondPieces = try XCTUnwrap(LayerClipPolygon.splitVisiblePolygon(layer: layer, line: secondLine, style: .straight))

        XCTAssertEqual(secondPieces.count, 2)
        XCTAssertLessThan(LayerClipPolygon.polygonArea(secondPieces[0]), LayerClipPolygon.polygonArea(firstPieces[0]))
        XCTAssertLessThan(LayerClipPolygon.polygonArea(secondPieces[1]), LayerClipPolygon.polygonArea(firstPieces[0]))
    }

    func testTearPathIsStableForSeed() {
        let layer = Layer(
            id: "paper-1",
            type: .paper,
            x: 0,
            y: 0,
            width: 200,
            height: 120,
            tear: true,
            tearSeed: 42
        )

        let first = LayerTearPath.points(for: layer)
        let second = LayerTearPath.points(for: layer)

        XCTAssertEqual(first, second)
        XCTAssertGreaterThan(first.count, 12)
        XCTAssertGreaterThan(first.first?.y ?? 0, 0)
    }

    func testTearPathFollowsExistingClipPolygon() throws {
        var layer = Layer(
            id: "cut-paper",
            type: .paper,
            x: 0,
            y: 0,
            width: 200,
            height: 120,
            tear: true,
            tearSeed: 99
        )
        layer.clipPolygon = [
            BrushPoint(x: 0, y: 0),
            BrushPoint(x: 200, y: 0),
            BrushPoint(x: 100, y: 120)
        ]

        let points = LayerTearPath.points(for: layer)

        XCTAssertGreaterThan(points.count, 8)
        XCTAssertLessThan(LayerClipPolygon.polygonArea(points), 200 * 120)
        XCTAssertGreaterThan(LayerClipPolygon.polygonArea(points), 1000)
    }
}
