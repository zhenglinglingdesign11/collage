import UIKit
import XCTest
@testable import JournalCollage

final class ImageEffectGeneratorTests: XCTestCase {
    private var tempURL: URL!

    override func setUpWithError() throws {
        tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("JournalCollageEffectTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDownWithError() throws {
        if let tempURL, FileManager.default.fileExists(atPath: tempURL.path) {
            try FileManager.default.removeItem(at: tempURL)
        }
    }

    func testGeneratesCrossStitchImage() throws {
        let (layer, store) = try makeStoredImageLayer()
        var effectLayer = layer
        effectLayer.effect = LayerImageEffect(type: .crossStitch, options: [
            "grid": .number(24),
            "colors": .number(4),
            "style": .string("stitch")
        ])

        let result = try ImageEffectGenerator.render(layer: effectLayer, imageStore: store)

        XCTAssertGreaterThan(result.size.width, 0)
        XCTAssertGreaterThan(result.size.height, 0)
        XCTAssertNotNil(result.image.pngData())
    }

    func testGeneratesMatisseImage() throws {
        let (layer, store) = try makeStoredImageLayer()
        var effectLayer = layer
        effectLayer.effect = LayerImageEffect(type: .matisse, options: [
            "detail": .number(44),
            "palette": .string("soft")
        ])

        let result = try ImageEffectGenerator.render(layer: effectLayer, imageStore: store)

        XCTAssertEqual(result.size.width, 980)
        XCTAssertNotNil(result.image.pngData())
    }

    func testGeneratesBotanicalImage() throws {
        let (layer, store) = try makeStoredImageLayer()
        var effectLayer = layer
        effectLayer.effect = LayerImageEffect(type: .botanical, options: [
            "tone": .string("sepia"),
            "detail": .string("soft")
        ])

        let result = try ImageEffectGenerator.render(layer: effectLayer, imageStore: store)

        XCTAssertEqual(result.size.width, 1050)
        XCTAssertNotNil(result.image.pngData())
    }

    private func makeStoredImageLayer() throws -> (Layer, ImageStore) {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 48, height: 32))
        let data = renderer.pngData { context in
            UIColor(red: 0.92, green: 0.24, blue: 0.18, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 24, height: 32))
            UIColor(red: 0.15, green: 0.45, blue: 0.72, alpha: 1).setFill()
            context.fill(CGRect(x: 24, y: 0, width: 24, height: 32))
        }

        let store = try ImageStore(rootURL: tempURL)
        let stored = try store.savePNGImageData(data)
        let layer = Layer(
            type: .image,
            x: 0,
            y: 0,
            width: 240,
            height: 160,
            source: stored.source,
            sourceWidth: stored.size.width,
            sourceHeight: stored.size.height
        )
        return (layer, store)
    }
}
