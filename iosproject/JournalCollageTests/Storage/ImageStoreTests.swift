import UIKit
import XCTest
@testable import JournalCollage

final class ImageStoreTests: XCTestCase {
    private var tempURL: URL!

    override func setUpWithError() throws {
        tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("JournalCollageImageTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDownWithError() throws {
        if let tempURL, FileManager.default.fileExists(atPath: tempURL.path) {
            try FileManager.default.removeItem(at: tempURL)
        }
    }

    func testSavesImageDataAndReturnsStableSource() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 16))
        let data = renderer.jpegData(withCompressionQuality: 0.8) { context in
            UIColor.black.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 24, height: 16))
        }

        let store = try ImageStore(rootURL: tempURL)
        let stored = try store.saveImageData(data)

        XCTAssertTrue(stored.source.hasPrefix("images/"))
        XCTAssertEqual(stored.size.width, 24.0)
        XCTAssertEqual(stored.size.height, 16.0)
        XCTAssertNotNil(store.url(for: stored.source))
    }

    func testSavesMaskImageAndReturnsStableSource() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32))
        let image = renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
        }

        let store = try ImageStore(rootURL: tempURL)
        let source = try store.saveMaskImage(image)

        XCTAssertTrue(source.hasPrefix("masks/"))
        XCTAssertNotNil(store.url(for: source))
    }

    func testSavesPNGImageDataAndReturnsStableSource() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 18, height: 18))
        let data = renderer.pngData { context in
            UIColor.clear.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 18, height: 18))
            UIColor.white.setFill()
            context.fill(CGRect(x: 4, y: 4, width: 10, height: 10))
        }

        let store = try ImageStore(rootURL: tempURL)
        let stored = try store.savePNGImageData(data)

        XCTAssertTrue(stored.source.hasPrefix("images/"))
        XCTAssertTrue(stored.source.hasSuffix(".png"))
        XCTAssertEqual(stored.size.width, 18.0)
        XCTAssertEqual(stored.size.height, 18.0)
        XCTAssertNotNil(store.url(for: stored.source))
    }

    func testSavesLiveVideoDataAndReturnsStableSource() throws {
        let store = try ImageStore(rootURL: tempURL)
        let source = try store.saveLiveVideoData(Data([0x00, 0x01, 0x02]), fileExtension: "mov")

        XCTAssertTrue(source.hasPrefix("live/"))
        XCTAssertTrue(source.hasSuffix(".mov"))
        XCTAssertNotNil(store.url(for: source))
    }

    func testDeleteAllRemovesImagesAndMasks() throws {
        let imageRenderer = UIGraphicsImageRenderer(size: CGSize(width: 18, height: 18))
        let data = imageRenderer.pngData { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 18, height: 18))
        }
        let maskRenderer = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32))
        let mask = maskRenderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
        }

        let store = try ImageStore(rootURL: tempURL)
        let stored = try store.savePNGImageData(data)
        let maskSource = try store.saveMaskImage(mask)
        let liveSource = try store.saveLiveVideoData(Data([0x00, 0x01]), fileExtension: "mov")

        XCTAssertNotNil(store.url(for: stored.source))
        XCTAssertNotNil(store.url(for: maskSource))
        XCTAssertNotNil(store.url(for: liveSource))

        try store.deleteAll()

        XCTAssertNil(store.url(for: stored.source))
        XCTAssertNil(store.url(for: maskSource))
        XCTAssertNil(store.url(for: liveSource))
    }

    func testSavesThumbnailPath() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 48, height: 64))
        let image = renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 48, height: 64))
        }

        let store = try ImageStore(rootURL: tempURL)
        let path = try store.saveThumbnail(image, draftId: "draft:unsafe/name")

        XCTAssertTrue(path.hasSuffix("draft-unsafe-name.jpg"))
        XCTAssertTrue(FileManager.default.fileExists(atPath: path))
    }
}
