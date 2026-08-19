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
                        Text(L10n.t("mine.recent_drafts"))
                            .font(JournalTypography.sectionTitle)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)

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
                            Text(L10n.t("mine.delete_data.title"))
                                .font(JournalTypography.bodyStrong)
                                .lineLimit(2)
                                .minimumScaleFactor(0.8)
                            Text(L10n.t("mine.delete_data.note"))
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
            .navigationTitle(L10n.t("mine.title"))
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
                L10n.t("mine.delete_scope.title"),
                isPresented: $isShowingDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button(L10n.t("mine.delete_drafts"), role: .destructive) {
                    deleteDrafts()
                }
                Button(L10n.t("mine.delete_all_data"), role: .destructive) {
                    deleteAllLocalData()
                }
                Button(L10n.t("editor.leave.cancel"), role: .cancel) {}
            } message: {
                Text(L10n.t("mine.delete_all_warning"))
            }
            .confirmationDialog(
                L10n.t("mine.delete_draft.title"),
                isPresented: Binding(
                    get: { draftPendingDeletion != nil },
                    set: { isPresented in
                        if !isPresented {
                            draftPendingDeletion = nil
                        }
                    }
                ),
                titleVisibility: .visible
            ) {
                if let summary = draftPendingDeletion {
                    Button(L10n.t("mine.delete_drafts"), role: .destructive) {
                        deleteDraft(summary)
                    }
                }
                Button(L10n.t("editor.leave.cancel"), role: .cancel) {}
            } message: {
                Text(L10n.t("mine.delete_draft.warning"))
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
            statusMessage = L10n.t("mine.status.draft_store_unready")
            return
        }
        draftStore = store

        do {
            try store.deleteAll()
            recentDrafts = []
            statusMessage = L10n.t("mine.status.drafts_deleted")
        } catch {
            statusMessage = L10n.t("mine.status.delete_failed")
        }
    }

    private func deleteDraft(_ summary: DraftSummary) {
        guard let store = draftStore ?? (try? DraftStore()) else {
            statusMessage = L10n.t("mine.status.draft_store_unready")
            return
        }
        draftStore = store

        do {
            try store.delete(id: summary.id)
            refreshRecentDrafts()
            statusMessage = L10n.t("mine.status.drafts_deleted")
        } catch {
            statusMessage = L10n.t("mine.status.delete_failed")
        }
    }

    private func deleteAllLocalData() {
        guard let store = draftStore ?? (try? DraftStore()) else {
            statusMessage = L10n.t("mine.status.draft_store_unready")
            return
        }
        draftStore = store

        do {
            try store.deleteAll()
            try ImageStore().deleteAll()
            recentDrafts = []
            statusMessage = L10n.t("mine.status.all_deleted")
        } catch {
            statusMessage = L10n.t("mine.status.delete_failed")
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
                    .accessibilityLabel(L10n.t("mine.accessibility.delete_draft"))
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
        .accessibilityLabel(L10n.t("mine.accessibility.open_draft"))
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
        Text(L10n.t("create.no_drafts"))
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
