import SwiftUI
import UIKit

struct MineView: View {
    @State private var recentDrafts: [DraftSummary] = []
    @State private var draftStore: DraftStore?
    @State private var draftToEdit: Draft?
    @State private var isShowingDeleteConfirmation = false
    @State private var draftPendingDeletion: DraftSummary?
    @State private var statusMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: JournalSpacing.xl) {
                    VStack(alignment: .leading, spacing: JournalSpacing.md) {
                        Text("最近草稿")
                            .font(JournalTypography.sectionTitle)

                        if recentDrafts.isEmpty {
                            EmptyDraftState()
                        } else {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: JournalSpacing.md) {
                                    ForEach(recentDrafts) { summary in
                                        RecentDraftCard(
                                            summary: summary,
                                            onOpen: {
                                                openDraft(summary)
                                            },
                                            onDelete: {
                                                draftPendingDeletion = summary
                                            }
                                        )
                                    }
                                }
                                .padding(.vertical, JournalSpacing.xs)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    HStack {
                        VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                            Text("删除本地数据")
                                .font(JournalTypography.bodyStrong)
                            Text("可删除草稿；图片缓存仅随全部本地数据一起删除。")
                                .font(JournalTypography.caption)
                                .foregroundStyle(JournalColors.textSecondary)
                        }
                        Spacer()
                        JournalIconButton(systemName: "trash") {
                            isShowingDeleteConfirmation = true
                        }
                    }
                    .padding(JournalSpacing.md)
                    .background(JournalColors.panel)
                    .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                            .stroke(JournalColors.border)
                    )

                    if let statusMessage {
                        Text(statusMessage)
                            .font(JournalTypography.caption)
                            .foregroundStyle(JournalColors.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(JournalSpacing.lg)
            }
            .background(JournalColors.page.ignoresSafeArea())
            .navigationTitle("我的")
            .navigationDestination(
                isPresented: Binding(
                    get: { draftToEdit != nil },
                    set: { isPresented in
                        if !isPresented {
                            draftToEdit = nil
                            refreshRecentDrafts()
                        }
                    }
                )
            ) {
                if let draftToEdit {
                    EditorView(draft: draftToEdit)
                }
            }
            .confirmationDialog(
                "选择清理范围",
                isPresented: $isShowingDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("删除草稿", role: .destructive) {
                    deleteDrafts()
                }
                Button("删除全部本地数据", role: .destructive) {
                    deleteAllLocalData()
                }
                Button("取消", role: .cancel) {}
            } message: {
                Text("删除全部本地数据会同时删除草稿、本地图片缓存和抠图 Mask 文件，无法撤销。")
            }
            .confirmationDialog(
                "删除这个草稿？",
                item: $draftPendingDeletion,
                titleVisibility: .visible
            ) { summary in
                Button("删除草稿", role: .destructive) {
                    deleteDraft(summary)
                }
                Button("取消", role: .cancel) {}
            } message: { _ in
                Text("此操作只删除这个草稿，无法撤销。")
            }
            .onAppear {
                refreshRecentDrafts()
            }
        }
    }

    private func refreshRecentDrafts() {
        if draftStore == nil {
            draftStore = try? DraftStore()
        }
        if let store = draftStore, let summaries = try? store.list(limit: DraftStore.mineRecentDraftLimit) {
            recentDrafts = summaries
        } else {
            recentDrafts = []
        }
    }

    private func openDraft(_ summary: DraftSummary) {
        guard let store = draftStore ?? (try? DraftStore()) else { return }
        draftStore = store
        draftToEdit = (try? store.load(id: summary.id)) ?? Draft(ratio: summary.ratio)
    }

    private func deleteDrafts() {
        guard let store = draftStore ?? (try? DraftStore()) else {
            statusMessage = "无法访问本地草稿。"
            return
        }
        draftStore = store

        do {
            try store.deleteAll()
            recentDrafts = []
            statusMessage = "草稿已删除。"
        } catch {
            statusMessage = "删除失败，请稍后再试。"
        }
    }

    private func deleteDraft(_ summary: DraftSummary) {
        guard let store = draftStore ?? (try? DraftStore()) else {
            statusMessage = "无法访问本地草稿。"
            return
        }
        draftStore = store

        do {
            try store.delete(id: summary.id)
            refreshRecentDrafts()
            statusMessage = "草稿已删除。"
        } catch {
            statusMessage = "删除失败，请稍后再试。"
        }
    }

    private func deleteAllLocalData() {
        guard let store = draftStore ?? (try? DraftStore()) else {
            statusMessage = "无法访问本地草稿。"
            return
        }
        draftStore = store

        do {
            try store.deleteAll()
            try ImageStore().deleteAll()
            recentDrafts = []
            statusMessage = "全部本地数据已删除。"
        } catch {
            statusMessage = "删除失败，请稍后再试。"
        }
    }
}

private struct RecentDraftCard: View {
    let summary: DraftSummary
    let onOpen: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.xs) {
            DraftThumbnail(summary: summary)
                .frame(width: 94, height: 118)
                .background(JournalColors.paper)
                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    Button(action: onDelete) {
                        Image(systemName: "trash")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(JournalColors.ink)
                            .frame(width: 28, height: 28)
                            .background(Color.white.opacity(0.92))
                            .clipShape(Circle())
                            .overlay(Circle().stroke(JournalColors.border))
                    }
                    .buttonStyle(.plain)
                    .padding(6)
                    .accessibilityLabel("删除草稿")
                }

            Text(summary.ratio.rawValue)
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)

            Text(Date(timeIntervalSince1970: summary.updatedAt).formatted(date: .abbreviated, time: .shortened))
                .font(JournalTypography.tiny)
                .foregroundStyle(JournalColors.textSecondary)
                .lineLimit(1)
        }
        .frame(width: 110, alignment: .leading)
        .padding(JournalSpacing.xs)
        .background(JournalColors.panel)
        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                .stroke(JournalColors.border)
        )
        .contentShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
        .onTapGesture(perform: onOpen)
        .accessibilityLabel("打开最近草稿")
    }
}

private struct DraftThumbnail: View {
    let summary: DraftSummary

    var body: some View {
        Group {
            if let thumbnailPath = summary.thumbnailPath,
               let image = UIImage(contentsOfFile: thumbnailPath) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                DraftPlaceholderArt()
            }
        }
    }
}

private struct DraftPlaceholderArt: View {
    var body: some View {
        ZStack {
            JournalColors.paper

            RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous)
                .fill(JournalColors.paperBeige)
                .frame(width: 56, height: 66)
                .rotationEffect(.degrees(2))
                .shadow(color: JournalColors.ink.opacity(0.10), radius: 8, y: 4)

            Capsule()
                .fill(JournalColors.tapeYellow.opacity(0.86))
                .frame(width: 48, height: 12)
                .rotationEffect(.degrees(-8))
                .offset(y: -36)

            VStack(alignment: .leading, spacing: 6) {
                Capsule()
                    .fill(JournalColors.border)
                    .frame(width: 38, height: 4)
                Capsule()
                    .fill(JournalColors.border)
                    .frame(width: 56, height: 4)
            }
            .offset(y: 34)
        }
    }
}

private struct EmptyDraftState: View {
    var body: some View {
        Text("暂无草稿")
            .font(JournalTypography.caption)
            .foregroundStyle(JournalColors.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(JournalSpacing.md)
            .background(JournalColors.panel)
            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .stroke(JournalColors.border)
            )
    }
}

#Preview {
    MineView()
}
