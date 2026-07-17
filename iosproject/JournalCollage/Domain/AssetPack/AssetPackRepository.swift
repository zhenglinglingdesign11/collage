import Foundation

enum AssetPackRepository {
    static func loadBundledCatalog() throws -> AssetPackCatalog {
        guard let url = bundledCatalogURL() else {
            return AssetPackCatalog(schemaVersion: 1, generatedFrom: "missing-bundle-resource", packs: [])
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(AssetPackCatalog.self, from: data)
    }

    static func bundledCatalogURL() -> URL? {
        let bundles = [Bundle.main] + Bundle.allBundles + Bundle.allFrameworks
        for bundle in bundles {
            if let url = bundle.url(forResource: "asset-packs", withExtension: "json") {
                return url
            }
            if let url = bundle.url(forResource: "asset-packs", withExtension: "json", subdirectory: "AssetPacks") {
                return url
            }
        }
        return nil
    }
}
