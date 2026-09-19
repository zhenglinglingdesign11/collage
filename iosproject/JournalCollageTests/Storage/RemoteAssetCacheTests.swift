import CryptoKit
import XCTest
@testable import JournalCollage

final class RemoteAssetCacheTests: XCTestCase {
    private var rootURL: URL!

    override func setUpWithError() throws {
        rootURL = FileManager.default.temporaryDirectory.appendingPathComponent("RemoteAssetCacheTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: rootURL)
        rootURL = nil
    }

    func testDownloadsAndAtomicallyStoresVerifiedPNG() async throws {
        let data = try fixturePNG()
        let loader = FixtureLoader(download: RemoteAssetDownload(data: data, mimeType: "image/png"))
        let cache = try RemoteAssetCache(rootURL: rootURL, loader: loader)
        let descriptor = descriptor(for: data)

        let url = try await cache.downloadAndStore(descriptor)
        XCTAssertEqual(try Data(contentsOf: url), data)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.deletingLastPathComponent().appendingPathComponent("record.json").path))
        let cachedURL = try await cache.cachedURL(for: descriptor)
        let callCount = await loader.callCount()
        XCTAssertEqual(cachedURL, url)
        XCTAssertEqual(callCount, 1)
    }

    func testHashMismatchLeavesNoVerifiedCacheRecord() async throws {
        let data = try fixturePNG()
        let loader = FixtureLoader(download: RemoteAssetDownload(data: data, mimeType: "image/png"))
        let cache = try RemoteAssetCache(rootURL: rootURL, loader: loader)
        var descriptor = descriptor(for: data)
        descriptor.sha256 = String(repeating: "0", count: 64)

        do {
            _ = try await cache.downloadAndStore(descriptor)
            XCTFail("Expected hash mismatch")
        } catch let error as RemoteAssetIntegrityError {
            XCTAssertEqual(error, .hashMismatch)
        }

        let cachedURL = try await cache.cachedURL(for: descriptor)
        XCTAssertNil(cachedURL)
        let children = try FileManager.default.contentsOfDirectory(at: rootURL, includingPropertiesForKeys: nil)
        XCTAssertTrue(children.isEmpty)
    }

    func testConcurrentRequestsShareOneDownload() async throws {
        let data = try fixturePNG()
        let loader = FixtureLoader(download: RemoteAssetDownload(data: data, mimeType: "image/png"), delayNanoseconds: 50_000_000)
        let cache = try RemoteAssetCache(rootURL: rootURL, loader: loader)
        let descriptor = descriptor(for: data)

        async let first = cache.downloadAndStore(descriptor)
        async let second = cache.downloadAndStore(descriptor)
        let (firstURL, secondURL) = try await (first, second)
        let callCount = await loader.callCount()

        XCTAssertEqual(firstURL, secondURL)
        XCTAssertEqual(callCount, 1)
    }

    private func descriptor(for data: Data) -> RemoteAssetIntegrityDescriptor {
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return RemoteAssetIntegrityDescriptor(
            reference: RemoteAssetReference(id: "asset://pack/zhenzhi01/1", kind: "image", revision: "1"),
            packRevision: "1",
            mimeType: "image/png",
            byteLength: data.count,
            sha256: hash,
            pixelWidth: 1,
            pixelHeight: 1,
            sourceURL: URL(string: "https://assets.example.test/packs/zhenzhi01/items/1.png")!
        )
    }

    private func fixturePNG() throws -> Data {
        let base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL6xQAAAABJRU5ErkJggg=="
        return try XCTUnwrap(Data(base64Encoded: base64))
    }
}

private actor FixtureLoader: RemoteAssetDataLoading {
    private let download: RemoteAssetDownload
    private let delayNanoseconds: UInt64
    private var count = 0

    init(download: RemoteAssetDownload, delayNanoseconds: UInt64 = 0) {
        self.download = download
        self.delayNanoseconds = delayNanoseconds
    }

    func load(from url: URL) async throws -> RemoteAssetDownload {
        count += 1
        if delayNanoseconds > 0 {
            try await Task.sleep(nanoseconds: delayNanoseconds)
        }
        return download
    }

    func callCount() -> Int { count }
}
