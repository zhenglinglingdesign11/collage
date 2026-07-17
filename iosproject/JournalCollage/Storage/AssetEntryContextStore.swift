import Foundation

final class AssetEntryContextStore {
    private let defaults: UserDefaults
    private let draftIdKey: String
    private let createdAtKey: String
    private let maxAge: TimeInterval

    init(
        defaults: UserDefaults = .standard,
        keyPrefix: String = "AssetEntryContextStore",
        maxAge: TimeInterval = 30 * 60
    ) {
        self.defaults = defaults
        self.draftIdKey = "\(keyPrefix).draftId"
        self.createdAtKey = "\(keyPrefix).createdAt"
        self.maxAge = maxAge
    }

    func save(draftId: String, now: Date = Date()) {
        defaults.set(draftId, forKey: draftIdKey)
        defaults.set(now.timeIntervalSince1970, forKey: createdAtKey)
    }

    func activeDraftId(now: Date = Date()) -> String? {
        guard let draftId = defaults.string(forKey: draftIdKey),
              !draftId.isEmpty else {
            return nil
        }
        let createdAt = defaults.double(forKey: createdAtKey)
        guard createdAt > 0,
              now.timeIntervalSince1970 - createdAt <= maxAge else {
            clear()
            return nil
        }
        return draftId
    }

    func clear() {
        defaults.removeObject(forKey: draftIdKey)
        defaults.removeObject(forKey: createdAtKey)
    }
}
