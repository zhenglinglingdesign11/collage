import Foundation

final class AssetFavoriteStore {
    private let defaults: UserDefaults
    private let key: String

    init(
        defaults: UserDefaults = .standard,
        key: String = "AssetFavoriteStore.favoritePackIds"
    ) {
        self.defaults = defaults
        self.key = key
    }

    func favoritePackIds() -> Set<String> {
        Set(defaults.stringArray(forKey: key) ?? [])
    }

    func isFavorite(packId: String) -> Bool {
        favoritePackIds().contains(packId)
    }

    @discardableResult
    func toggle(packId: String) -> Bool {
        var ids = favoritePackIds()
        let isFavorite: Bool
        if ids.contains(packId) {
            ids.remove(packId)
            isFavorite = false
        } else {
            ids.insert(packId)
            isFavorite = true
        }
        save(ids)
        return isFavorite
    }

    func setFavorite(_ isFavorite: Bool, packId: String) {
        var ids = favoritePackIds()
        if isFavorite {
            ids.insert(packId)
        } else {
            ids.remove(packId)
        }
        save(ids)
    }

    private func save(_ ids: Set<String>) {
        defaults.set(ids.sorted(), forKey: key)
    }
}
