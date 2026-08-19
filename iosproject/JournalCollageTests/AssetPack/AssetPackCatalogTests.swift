import XCTest
@testable import JournalCollage

final class AssetPackCatalogTests: XCTestCase {
    func testBundledCatalogLoadsRealMiniProgramMetadata() throws {
        let catalog = try AssetPackRepository.loadBundledCatalog()

        XCTAssertEqual(catalog.schemaVersion, 1)
        XCTAssertEqual(catalog.packs.count, 10)
        XCTAssertEqual(catalog.packs.reduce(0) { $0 + $1.items.count }, 100)
        XCTAssertTrue(catalog.packs.contains { $0.id == "papers" })
        XCTAssertTrue(catalog.packs.contains { $0.id == "jiaodai" })
    }

    func testAssetItemsHaveRequiredFields() throws {
        let catalog = try AssetPackRepository.loadBundledCatalog()
        let items = catalog.packs.flatMap(\.items)

        XCTAssertFalse(items.isEmpty)
        XCTAssertTrue(items.allSatisfy { !$0.id.isEmpty })
        XCTAssertTrue(items.allSatisfy { !$0.source.isEmpty })
        XCTAssertTrue(items.allSatisfy { $0.width > 0 && $0.height > 0 })
    }

    func testAssetSourcesUseRemoteURLsWhenAvailable() throws {
        let catalog = try AssetPackRepository.loadBundledCatalog()
        let items = catalog.packs.flatMap(\.items)

        XCTAssertFalse(items.isEmpty)
        XCTAssertTrue(items.allSatisfy { $0.source.hasPrefix("http://") || $0.source.hasPrefix("https://") })
        XCTAssertNotNil(ImageSourceResolver.url(for: "https://assets.zllarchi.site/packs/stickers/items/1.png"))
    }
}
