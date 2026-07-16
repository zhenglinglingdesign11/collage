import SwiftUI

enum JournalColors {
    static let ink = Color(hex: 0x111111)
    static let nearInk = Color(hex: 0x1F1F1F)
    static let textSecondary = Color(hex: 0x6F6F6F)
    static let textTertiary = Color(hex: 0x9A9A9A)
    static let page = Color(hex: 0xFAFAF8)
    static let panel = Color.white
    static let weak = Color(hex: 0xF7F7F5)
    static let paper = Color(hex: 0xFDFDFB)
    static let border = Color(hex: 0xE8E6E1)
    static let divider = Color(hex: 0xECEAE5)
    static let tapeYellow = Color(hex: 0xE9D28A)
    static let paperBeige = Color(hex: 0xEFE7D8)
    static let sageTape = Color(hex: 0x8C9A8D)
    static let stampRed = Color(hex: 0xD94A38)
}

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }

    init?(hexString: String) {
        var value = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") {
            value.removeFirst()
        }
        guard let number = UInt(value, radix: 16) else { return nil }
        self.init(hex: number)
    }
}
