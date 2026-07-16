import SwiftUI

struct MineView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: JournalSpacing.xl) {
                    VStack(alignment: .leading, spacing: JournalSpacing.sm) {
                        Text("最近草稿")
                            .font(JournalTypography.sectionTitle)
                        Text("最近草稿可在创作页继续编辑。")
                            .font(JournalTypography.caption)
                            .foregroundStyle(JournalColors.textSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(JournalSpacing.md)
                    .background(JournalColors.panel)
                    .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))

                    HStack {
                        VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                            Text("清理缓存")
                                .font(JournalTypography.bodyStrong)
                            Text("后续清理临时素材、缩略图和导出缓存。")
                                .font(JournalTypography.caption)
                                .foregroundStyle(JournalColors.textSecondary)
                        }
                        Spacer()
                        JournalIconButton(systemName: "trash") {
                        }
                    }
                    .padding(JournalSpacing.md)
                    .background(JournalColors.panel)
                    .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
                }
                .padding(JournalSpacing.lg)
            }
            .background(JournalColors.page.ignoresSafeArea())
            .navigationTitle("我的")
        }
    }
}

#Preview {
    MineView()
}
