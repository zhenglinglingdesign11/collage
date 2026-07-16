import Foundation

struct DraftSummary: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var ratio: CanvasRatio
    var thumbnailPath: String?
    var updatedAt: TimeInterval
}

final class DraftStore {
    static let maxRecentDrafts = 3

    private let fileManager: FileManager
    private let rootURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        rootURL: URL? = nil,
        fileManager: FileManager = .default
    ) throws {
        self.fileManager = fileManager
        if let rootURL {
            self.rootURL = rootURL
        } else {
            let appSupport = try fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            self.rootURL = appSupport.appendingPathComponent("JournalCollage/Drafts", isDirectory: true)
        }
        self.encoder = JSONEncoder()
        self.encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        self.decoder = JSONDecoder()
        try fileManager.createDirectory(at: self.rootURL, withIntermediateDirectories: true)
    }

    func save(_ draft: Draft) throws {
        var next = draft
        next.updatedAt = Date().timeIntervalSince1970
        let url = draftURL(id: next.id)
        let data = try encoder.encode(next)
        try data.write(to: url, options: [.atomic])
        try pruneRecentDrafts()
    }

    func load(id: String) throws -> Draft {
        let data = try Data(contentsOf: draftURL(id: id))
        return try decoder.decode(Draft.self, from: data)
    }

    func list() throws -> [DraftSummary] {
        let urls = try fileManager.contentsOfDirectory(
            at: rootURL,
            includingPropertiesForKeys: nil
        )
        return Array(try draftSummaries(from: urls).prefix(Self.maxRecentDrafts))
    }

    private func draftSummaries(from urls: [URL]) throws -> [DraftSummary] {
        try urls
            .filter { $0.pathExtension == "json" }
            .map { url in
                let data = try Data(contentsOf: url)
                let draft = try decoder.decode(Draft.self, from: data)
                return DraftSummary(
                    id: draft.id,
                    ratio: draft.ratio,
                    thumbnailPath: draft.thumbnailPath,
                    updatedAt: draft.updatedAt
                )
            }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    private func pruneRecentDrafts() throws {
        let urls = try fileManager.contentsOfDirectory(
            at: rootURL,
            includingPropertiesForKeys: nil
        )
        let summaries = try draftSummaries(from: urls)
        for summary in summaries.dropFirst(Self.maxRecentDrafts) {
            try delete(id: summary.id)
        }
    }

    func delete(id: String) throws {
        let url = draftURL(id: id)
        if fileManager.fileExists(atPath: url.path) {
            try fileManager.removeItem(at: url)
        }
    }

    private func draftURL(id: String) -> URL {
        rootURL.appendingPathComponent("\(safeFileName(id)).json")
    }

    private func safeFileName(_ value: String) -> String {
        String(value.map { character in
            character.isLetter || character.isNumber || character == "-" || character == "_"
                ? character
                : "-"
        })
    }
}
