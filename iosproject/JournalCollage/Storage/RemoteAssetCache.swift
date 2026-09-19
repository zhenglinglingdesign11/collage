import CryptoKit
import Foundation
import ImageIO

struct RemoteAssetReference: Codable, Equatable, Hashable, Sendable {
    var id: String
    var kind: String
    var revision: String
}

struct RemoteAssetIntegrityDescriptor: Equatable, Sendable {
    var reference: RemoteAssetReference
    var packRevision: String
    var mimeType: String
    var byteLength: Int
    var sha256: String
    var pixelWidth: Int
    var pixelHeight: Int
    var sourceURL: URL
}

struct RemoteAssetDownload: Sendable {
    var data: Data
    var mimeType: String?
}

protocol RemoteAssetDataLoading: Sendable {
    func load(from url: URL) async throws -> RemoteAssetDownload
}

struct URLSessionRemoteAssetDataLoader: RemoteAssetDataLoading {
    func load(from url: URL) async throws -> RemoteAssetDownload {
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            throw RemoteAssetIntegrityError.downloadFailed
        }
        return RemoteAssetDownload(data: data, mimeType: response.value(forHTTPHeaderField: "Content-Type"))
    }
}

enum RemoteAssetIntegrityError: Error, Equatable, Sendable {
    case referenceInvalid
    case revisionUnavailable
    case offlineUnavailable
    case downloadFailed
    case contentTypeInvalid
    case sizeMismatch
    case hashMismatch
    case cacheWriteFailed
    case cacheRecordInvalid
}

struct VerifiedRemoteAssetCacheRecord: Codable, Equatable, Sendable {
    var formatVersion: Int
    var reference: RemoteAssetReference
    var packRevision: String
    var mimeType: String
    var byteLength: Int
    var sha256: String
    var pixelWidth: Int
    var pixelHeight: Int
    var relativePath: String
    var verifiedAt: Date
    var lastAccessedAt: Date
}

actor RemoteAssetCache {
    private let rootURL: URL
    private let fileManager: FileManager
    private let loader: any RemoteAssetDataLoading
    private var inFlight: [String: Task<URL, Error>] = [:]

    init(
        rootURL: URL? = nil,
        fileManager: FileManager = .default,
        loader: any RemoteAssetDataLoading = URLSessionRemoteAssetDataLoader()
    ) throws {
        self.fileManager = fileManager
        self.loader = loader
        if let rootURL {
            self.rootURL = rootURL
        } else {
            let appSupport = try fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            self.rootURL = appSupport.appendingPathComponent("JournalCollage/RemoteAssetCache/v1", isDirectory: true)
        }
        try fileManager.createDirectory(at: self.rootURL, withIntermediateDirectories: true)
    }

    func cachedURL(for descriptor: RemoteAssetIntegrityDescriptor) throws -> URL? {
        try Self.validateDescriptor(descriptor)
        let location = Self.location(for: descriptor, rootURL: rootURL)
        guard fileManager.fileExists(atPath: location.assetURL.path), fileManager.fileExists(atPath: location.recordURL.path) else {
            return nil
        }

        do {
            let record = try JSONDecoder().decode(VerifiedRemoteAssetCacheRecord.self, from: Data(contentsOf: location.recordURL))
            let data = try Data(contentsOf: location.assetURL)
            guard record.reference == descriptor.reference,
                  record.packRevision == descriptor.packRevision,
                  record.mimeType == descriptor.mimeType,
                  record.byteLength == descriptor.byteLength,
                  record.sha256 == descriptor.sha256,
                  record.pixelWidth == descriptor.pixelWidth,
                  record.pixelHeight == descriptor.pixelHeight,
                  record.relativePath == location.relativePath else {
                try invalidate(location)
                throw RemoteAssetIntegrityError.cacheRecordInvalid
            }
            try Self.validate(data: data, responseMimeType: record.mimeType, descriptor: descriptor)
            var updated = record
            updated.lastAccessedAt = Date()
            try Self.writeRecord(updated, to: location.recordURL)
            return location.assetURL
        } catch let error as RemoteAssetIntegrityError {
            throw error
        } catch {
            try? invalidate(location)
            throw RemoteAssetIntegrityError.cacheRecordInvalid
        }
    }

    func downloadAndStore(_ descriptor: RemoteAssetIntegrityDescriptor) async throws -> URL {
        if let cached = try cachedURL(for: descriptor) {
            return cached
        }

        let key = Self.cacheKey(for: descriptor)
        if let task = inFlight[key] {
            return try await task.value
        }

        let rootURL = rootURL
        let loader = loader
        let task = Task<URL, Error> {
            let download: RemoteAssetDownload
            do {
                download = try await loader.load(from: descriptor.sourceURL)
            } catch let error as RemoteAssetIntegrityError {
                throw error
            } catch {
                throw RemoteAssetIntegrityError.downloadFailed
            }
            return try Self.validateAndPersist(download: download, descriptor: descriptor, rootURL: rootURL)
        }
        inFlight[key] = task
        defer { inFlight[key] = nil }
        return try await task.value
    }

    private func invalidate(_ location: CacheLocation) throws {
        if fileManager.fileExists(atPath: location.assetURL.path) {
            try fileManager.removeItem(at: location.assetURL)
        }
        if fileManager.fileExists(atPath: location.recordURL.path) {
            try fileManager.removeItem(at: location.recordURL)
        }
    }

    private static func validateAndPersist(
        download: RemoteAssetDownload,
        descriptor: RemoteAssetIntegrityDescriptor,
        rootURL: URL
    ) throws -> URL {
        try validateDescriptor(descriptor)
        try validate(data: download.data, responseMimeType: download.mimeType, descriptor: descriptor)

        let fileManager = FileManager.default
        let location = location(for: descriptor, rootURL: rootURL)
        do {
            try fileManager.createDirectory(at: location.directoryURL, withIntermediateDirectories: true)
            let temporaryURL = location.directoryURL.appendingPathComponent(".asset-\(UUID().uuidString).tmp")
            defer { try? fileManager.removeItem(at: temporaryURL) }
            try download.data.write(to: temporaryURL)

            if fileManager.fileExists(atPath: location.assetURL.path) {
                try fileManager.removeItem(at: location.assetURL)
            }
            try fileManager.moveItem(at: temporaryURL, to: location.assetURL)

            let now = Date()
            let record = VerifiedRemoteAssetCacheRecord(
                formatVersion: 1,
                reference: descriptor.reference,
                packRevision: descriptor.packRevision,
                mimeType: descriptor.mimeType,
                byteLength: descriptor.byteLength,
                sha256: descriptor.sha256,
                pixelWidth: descriptor.pixelWidth,
                pixelHeight: descriptor.pixelHeight,
                relativePath: location.relativePath,
                verifiedAt: now,
                lastAccessedAt: now
            )
            try writeRecord(record, to: location.recordURL)
            return location.assetURL
        } catch {
            try? fileManager.removeItem(at: location.assetURL)
            try? fileManager.removeItem(at: location.recordURL)
            throw RemoteAssetIntegrityError.cacheWriteFailed
        }
    }

    private static func validateDescriptor(_ descriptor: RemoteAssetIntegrityDescriptor) throws {
        let reference = descriptor.reference
        guard reference.kind == "image",
              reference.id.range(of: #"^asset://pack/[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil,
              isDecimalRevision(reference.revision),
              isDecimalRevision(descriptor.packRevision),
              descriptor.byteLength > 0,
              descriptor.pixelWidth > 0,
              descriptor.pixelHeight > 0,
              descriptor.sha256.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil,
              ["image/png", "image/jpeg"].contains(descriptor.mimeType),
              descriptor.sourceURL.scheme?.lowercased() == "https",
              descriptor.sourceURL.host != nil else {
            throw RemoteAssetIntegrityError.referenceInvalid
        }
    }

    private static func validate(
        data: Data,
        responseMimeType: String?,
        descriptor: RemoteAssetIntegrityDescriptor
    ) throws {
        guard normalizedMimeType(responseMimeType) == descriptor.mimeType else {
            throw RemoteAssetIntegrityError.contentTypeInvalid
        }
        guard data.count == descriptor.byteLength else {
            throw RemoteAssetIntegrityError.sizeMismatch
        }
        let actualHash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard actualHash == descriptor.sha256 else {
            throw RemoteAssetIntegrityError.hashMismatch
        }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) == 1,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width == descriptor.pixelWidth,
              height == descriptor.pixelHeight else {
            throw RemoteAssetIntegrityError.sizeMismatch
        }
    }

    private static func normalizedMimeType(_ value: String?) -> String? {
        value?
            .split(separator: ";", maxSplits: 1)
            .first?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private static func isDecimalRevision(_ value: String) -> Bool {
        value.range(of: #"^[1-9][0-9]*$"#, options: .regularExpression) != nil
    }

    private static func cacheKey(for descriptor: RemoteAssetIntegrityDescriptor) -> String {
        "\(descriptor.reference.id)\u{0}\(descriptor.reference.kind)\u{0}\(descriptor.reference.revision)\u{0}\(descriptor.sha256)"
    }

    private static func location(for descriptor: RemoteAssetIntegrityDescriptor, rootURL: URL) -> CacheLocation {
        let identityHash = SHA256.hash(data: Data(cacheKey(for: descriptor).utf8)).map { String(format: "%02x", $0) }.joined()
        let fileExtension = descriptor.mimeType == "image/png" ? "png" : "jpg"
        let directoryURL = rootURL.appendingPathComponent(identityHash, isDirectory: true)
        return CacheLocation(
            directoryURL: directoryURL,
            assetURL: directoryURL.appendingPathComponent("asset.\(fileExtension)"),
            recordURL: directoryURL.appendingPathComponent("record.json"),
            relativePath: "\(identityHash)/asset.\(fileExtension)"
        )
    }

    private static func writeRecord(_ record: VerifiedRemoteAssetCacheRecord, to url: URL) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(record).write(to: url, options: .atomic)
    }
}

private struct CacheLocation {
    var directoryURL: URL
    var assetURL: URL
    var recordURL: URL
    var relativePath: String
}
