import SwiftUI

struct JournalIconButton: View {
    let systemName: String
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(isEnabled ? JournalColors.ink : JournalColors.textTertiary)
                .frame(width: 36, height: 36)
                .background(JournalColors.weak)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }
}

struct JournalPrimaryButton: View {
    let title: String
    let systemName: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: JournalSpacing.xs) {
                if let systemName {
                    Image(systemName: systemName)
                }
                Text(title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .font(JournalTypography.bodyStrong)
            .foregroundStyle(Color.white)
            .padding(.horizontal, JournalSpacing.md)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(JournalColors.ink)
            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
