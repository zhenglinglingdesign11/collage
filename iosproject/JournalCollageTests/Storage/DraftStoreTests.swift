import Foundation
import XCTest
@testable import JournalCollage

final class DraftStoreTests: XCTestCase {
    private var tempURL: URL!

    override func setUpWithError() throws {
        tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("JournalCollageTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDownWithError() throws {
        if let tempURL, FileManager.default.fileExists(atPath: tempURL.path) {
            try FileManager.default.removeItem(at: tempURL)
        }
    }

    func testSaveLoadListAndDeleteDraft() throws {
        let store = try DraftStore(rootURL: tempURL)
        var draft = Draft(ratio: .story)
        draft.id = "draft:unsafe/name"
        draft.layers = [
            DraftFactory.makeTextLayer(text: "saved", draft: draft)
        ]

        try store.save(draft)

        let summaries = try store.list()
        XCTAssertEqual(summaries.count, 1)
        XCTAssertEqual(summaries.first?.ratio, .story)

        let loaded = try store.load(id: draft.id)
        XCTAssertEqual(loaded.layers.first?.text, "saved")

        try store.delete(id: draft.id)
        XCTAssertTrue(try store.list().isEmpty)
    }

    func testSavePrunesRecentDraftsToLimit() throws {
        let store = try DraftStore(rootURL: tempURL)

        for index in 0..<4 {
            var draft = Draft()
            draft.id = "draft-\(index)"
            draft.layers = [
                DraftFactory.makeTextLayer(text: "draft \(index)", draft: draft)
            ]
            try store.save(draft)
            Thread.sleep(forTimeInterval: 0.01)
        }

        let summaries = try store.list()
        XCTAssertEqual(summaries.count, DraftStore.maxRecentDrafts)
        XCTAssertEqual(summaries.map(\.id), ["draft-3", "draft-2", "draft-1"])
        XCTAssertThrowsError(try store.load(id: "draft-0"))
    }
}
