import XCTest
@testable import JournalCollage

final class InspirationTests: XCTestCase {
    func testBundledInspirationsLoadP0Fields() {
        let inspirations = InspirationRepository.loadBundledInspirations()

        XCTAssertEqual(inspirations.count, 7)
        XCTAssertTrue(inspirations.allSatisfy { !$0.id.isEmpty })
        XCTAssertTrue(inspirations.allSatisfy { !$0.imageSource.isEmpty })
        XCTAssertTrue(inspirations.allSatisfy { !$0.alt.isEmpty })
        XCTAssertTrue(inspirations.allSatisfy { $0.ratio > 0 })
    }

    func testSplitInspirationColumnsUsesShorterColumn() {
        let items = [
            Inspiration(id: "a", imageSource: "a.png", alt: "a", ratio: 2, tags: []),
            Inspiration(id: "b", imageSource: "b.png", alt: "b", ratio: 1, tags: []),
            Inspiration(id: "c", imageSource: "c.png", alt: "c", ratio: 1, tags: [])
        ]

        let columns = InspirationView.splitInspirationColumns(items)

        XCTAssertEqual(columns[0].map(\.id), ["a"])
        XCTAssertEqual(columns[1].map(\.id), ["b", "c"])
    }
}
