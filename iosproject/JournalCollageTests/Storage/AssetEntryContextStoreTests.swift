import Foundation
import XCTest
@testable import JournalCollage

final class AssetEntryContextStoreTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUpWithError() throws {
        suiteName = "AssetEntryContextStoreTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDownWithError() throws {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
    }

    func testStoresAndClearsActiveDraftId() {
        let store = AssetEntryContextStore(defaults: defaults, keyPrefix: "test")

        store.save(draftId: "draft-a", now: Date(timeIntervalSince1970: 100))

        XCTAssertEqual(store.activeDraftId(now: Date(timeIntervalSince1970: 110)), "draft-a")

        store.clear()
        XCTAssertNil(store.activeDraftId(now: Date(timeIntervalSince1970: 111)))
    }

    func testExpiredContextIsIgnoredAndCleared() {
        let store = AssetEntryContextStore(defaults: defaults, keyPrefix: "test", maxAge: 10)

        store.save(draftId: "draft-a", now: Date(timeIntervalSince1970: 100))

        XCTAssertNil(store.activeDraftId(now: Date(timeIntervalSince1970: 120)))
        XCTAssertNil(defaults.string(forKey: "test.draftId"))
    }
}
