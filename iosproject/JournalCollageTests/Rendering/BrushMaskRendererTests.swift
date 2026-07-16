import CoreGraphics
import XCTest
@testable import JournalCollage

final class BrushMaskRendererTests: XCTestCase {
    func testNormalizesBrushPathPoints() {
        let strokes = [
            [
                CGPoint(x: 0, y: 0),
                CGPoint(x: 50, y: 100),
                CGPoint(x: 120, y: 240)
            ]
        ]

        let normalized = BrushMaskRenderer.normalizedStrokes(
            from: strokes,
            drawingSize: CGSize(width: 100, height: 200)
        )

        XCTAssertEqual(normalized.count, 1)
        XCTAssertEqual(normalized[0][0], BrushPoint(x: 0, y: 0))
        XCTAssertEqual(normalized[0][1], BrushPoint(x: 0.5, y: 0.5))
        XCTAssertEqual(normalized[0][2], BrushPoint(x: 1, y: 1))
    }

    func testBrushPathCanBeStoredAsJSONValue() {
        let value = BrushMaskRenderer.jsonValue(
            from: [[BrushPoint(x: 0.25, y: 0.75)]]
        )

        XCTAssertEqual(
            value,
            .array([
                .array([
                    .object([
                        "x": .number(0.25),
                        "y": .number(0.75)
                    ])
                ])
            ])
        )
    }

    func testRendersMaskImage() {
        let image = BrushMaskRenderer.renderMask(
            strokes: [[BrushPoint(x: 0.1, y: 0.1), BrushPoint(x: 0.9, y: 0.9)]],
            size: CGSize(width: 128, height: 128),
            lineWidth: 16
        )

        XCTAssertEqual(image.size.width, 128)
        XCTAssertEqual(image.size.height, 128)
        XCTAssertNotNil(image.pngData())
    }
}
