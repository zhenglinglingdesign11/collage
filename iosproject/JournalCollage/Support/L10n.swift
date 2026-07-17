import Foundation

enum L10n {
    static func t(_ key: String, comment: String = "") -> String {
        NSLocalizedString(key, comment: comment)
    }
}
