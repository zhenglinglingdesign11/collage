import SwiftUI

struct CreateHomeView: View {
    @State private var draft = Draft()
    @State private var recentDrafts: [DraftSummary] = []
    @State private var draftStore: DraftStore?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: JournalSpacing.xl) {
                    VStack(alignment: .leading, spacing: JournalSpacing.sm) {
                        Text("新拼贴")
                            .font(JournalTypography.pageTitle)
                            .foregroundStyle(JournalColors.ink)

                        NavigationLink {
                            EditorView(draft: Draft())
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
                        if recentDrafts.isEmpty {
                            Text("暂无草稿")
                                .font(JournalTypography.caption)
                                .foregroundStyle(JournalColors.textSecondary)
                        } else {
                            ForEach(recentDrafts) { summary in
                                NavigationLink {
                                    EditorView(draft: loadDraft(id: summary.id) ?? Draft(ratio: summary.ratio))
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                                            Text(summary.ratio.rawValue)
                                                .font(JournalTypography.bodyStrong)
                                                .foregroundStyle(JournalColors.ink)
                                            Text(Date(timeIntervalSince1970: summary.updatedAt).formatted(date: .abbreviated, time: .shortened))
                                                .font(JournalTypography.caption)
                                                .foregroundStyle(JournalColors.textSecondary)
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 12, weight: .semibold))
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
                            }
                        }
                    }
                }
                .padding(JournalSpacing.lg)
            }
            .background(JournalColors.page.ignoresSafeArea())
            .onAppear {
                refreshRecentDrafts()
            }
        }
    }

    private func refreshRecentDrafts() {
        if draftStore == nil {
            draftStore = try? DraftStore()
        }
        if let store = draftStore, let summaries = try? store.list() {
            recentDrafts = summaries
        } else {
            recentDrafts = []
        }
    }

    private func loadDraft(id: String) -> Draft? {
        guard let draftStore else { return nil }
        return try? draftStore.load(id: id)
    }
}

#Preview {
    CreateHomeView()
}
