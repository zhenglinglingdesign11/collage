import Foundation

enum ImageSourceResolver {
    static func url(for source: String?, imageStore: ImageStore? = nil) -> URL? {
        guard let source, !source.isEmpty else { return nil }
        if let url = URL(string: source), url.scheme == "file" {
            return url
        }
        if let localURL = imageStore?.url(for: source) {
            return localURL
        }
        if let bundleURL = Bundle.main.url(forResource: source, withExtension: nil) {
            return bundleURL
        }
        if let bundleURL = Bundle.main.url(forResource: source, withExtension: nil, subdirectory: "AssetPacks") {
            return bundleURL
        }
        return nil
    }
}
