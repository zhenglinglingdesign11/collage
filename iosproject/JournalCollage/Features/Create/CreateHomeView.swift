import SwiftUI

struct CreateHomeView: View {
    @State private var draft = Draft()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: JournalSpacing.xl) {
                    VStack(alignment: .leading, spacing: JournalSpacing.sm) {
                        Text("新拼贴")
                            .font(JournalTypography.pageTitle)
                            .foregroundStyle(JournalColors.ink)

                        Button {
                        } label: {
                            VStack(spacing: JournalSpacing.sm) {
                                Image(systemName: "plus")
                                    .font(.system(size: 22, weight: .semibold))
                                    .foregroundStyle(JournalColors.ink)
                                    .frame(width: 48, height: 48)
                                    .background(JournalColors.panel)
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(JournalColors.border))

                                Text("添加照片")
                                    .font(JournalTypography.bodyStrong)
                                    .foregroundStyle(JournalColors.ink)

                                Text("从相册选择，开始你的拼贴")
                                    .font(JournalTypography.caption)
                                    .foregroundStyle(JournalColors.textSecondary)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 260)
                            .background(JournalColors.paper)
                            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                                    .stroke(JournalColors.border)
                            )
                        }
                        .buttonStyle(.plain)
                    }

                    NavigationLink {
                        EditorView(draft: draft)
                    } label: {
                        HStack(spacing: JournalSpacing.md) {
                            Image(systemName: "square.stack.3d.up")
                                .foregroundStyle(JournalColors.ink)
                            Text("从素材包开始")
                                .font(JournalTypography.bodyStrong)
                                .foregroundStyle(JournalColors.ink)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(JournalColors.textTertiary)
                        }
                        .padding(JournalSpacing.md)
                        .background(JournalColors.panel)
                        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                                .stroke(JournalColors.border)
                        )
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: JournalSpacing.sm) {
                        Text("最近草稿")
                            .font(JournalTypography.sectionTitle)
                        Text("第 1 阶段先保留入口，草稿存储在第 2 阶段接入。")
                            .font(JournalTypography.caption)
                            .foregroundStyle(JournalColors.textSecondary)
                    }
                }
                .padding(JournalSpacing.lg)
            }
            .background(JournalColors.page.ignoresSafeArea())
        }
    }
}

#Preview {
    CreateHomeView()
}
