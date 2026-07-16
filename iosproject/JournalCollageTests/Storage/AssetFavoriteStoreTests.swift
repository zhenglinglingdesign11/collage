import XCTest
@testable import JournalCollage

final class AssetFavoriteStoreTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "AssetFavoriteStoreTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    func testTogglePersistsFavoritePackIds() {
        let store = AssetFavoriteStore(defaults: defaults)

        XCTAssertTrue(store.toggle(packId: "papers"))
        XCTAssertEqual(store.favoritePackIds(), Set(["papers"]))
        XCTAssertTrue(store.isFavorite(packId: "papers"))

        let restored = AssetFavoriteStore(defaults: defaults)
        XCTAssertTrue(restored.isFavorite(packId: "papers"))
    }

    func testToggleRemovesExistingFavoritePackId() {
        let store = AssetFavoriteStore(defaults: defaults)

        store.setFavorite(true, packId: "papers")

        XCTAssertFalse(store.toggle(packId: "papers"))
        XCTAssertFalse(store.isFavorite(packId: "papers"))
        XCTAssertTrue(store.favoritePackIds().isEmpty)
    }
}
