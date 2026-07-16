import XCTest
@testable import JournalCollage

final class ImageCropperTests: XCTestCase {
    func testCenteredCropUsesFullHeightForWideSource() {
        let crop = ImageCropper.centeredCrop(sourceWidth: 4000, sourceHeight: 3000, ratio: 1)

        XCTAssertEqual(crop.x, 500)
        XCTAssertEqual(crop.y, 0)
        XCTAssertEqual(crop.width, 3000)
        XCTAssertEqual(crop.height, 3000)
    }

    func testCenteredCropUsesFullWidthForTallSource() {
        let crop = ImageCropper.centeredCrop(sourceWidth: 3000, sourceHeight: 4000, ratio: 4.0 / 3.0)

        XCTAssertEqual(crop.x, 0)
        XCTAssertEqual(crop.y, 875)
        XCTAssertEqual(crop.width, 3000)
        XCTAssertEqual(crop.height, 2250)
    }

    func testCropPresetRatiosMatchExpectedValues() {
        XCTAssertNil(CropPreset.free.ratio)
        XCTAssertNil(CropPreset.original.ratio)
        XCTAssertEqual(CropPreset.square.ratio, 1)
        XCTAssertEqual(CropPreset.portrait.ratio, 3.0 / 4.0)
        XCTAssertEqual(CropPreset.landscape.ratio, 4.0 / 3.0)
        XCTAssertEqual(CropPreset.story.ratio, 9.0 / 16.0)
    }

    func testConstrainedCropKeepsBoxInsideSourceBounds() {
        let crop = ImageCropper.constrainedCrop(
            CropBox(x: -40, y: 90, width: 180, height: 80),
            sourceWidth: 120,
            sourceHeight: 100,
            minimumSize: 24
        )

        XCTAssertEqual(crop.x, 0)
        XCTAssertEqual(crop.y, 20)
        XCTAssertEqual(crop.width, 120)
        XCTAssertEqual(crop.height, 80)
    }
}
