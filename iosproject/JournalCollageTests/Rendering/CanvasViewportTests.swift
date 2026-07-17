import CoreGraphics
import XCTest
@testable import JournalCollage

final class CanvasViewportTests: XCTestCase {
    func testFitsPortraitCanvasInsideContainer() {
        let viewport = CanvasViewport(
            canvasSize: CGSize(width: 900, height: 1200),
            containerSize: CGSize(width: 390, height: 600)
        )

        XCTAssertEqual(viewport.scale, CGFloat(390.0 / 900.0), accuracy: 0.0001)
        XCTAssertEqual(viewport.renderedSize.width, 390, accuracy: 0.0001)
        XCTAssertEqual(viewport.renderedSize.height, 520, accuracy: 0.0001)
        XCTAssertEqual(viewport.canvasRect.minY, 40, accuracy: 0.0001)
    }

    func testScreenAndCanvasPointRoundTrip() {
        let viewport = CanvasViewport(
            canvasSize: CGSize(width: 1000, height: 1000),
            containerSize: CGSize(width: 500, height: 700)
        )
        let canvasPoint = CGPoint(x: 250, y: 400)
        let screenPoint = viewport.screenPoint(fromCanvas: canvasPoint)

        XCTAssertEqual(viewport.canvasPoint(fromScreen: screenPoint).x, canvasPoint.x, accuracy: 0.0001)
        XCTAssertEqual(viewport.canvasPoint(fromScreen: screenPoint).y, canvasPoint.y, accuracy: 0.0001)
    }
}
