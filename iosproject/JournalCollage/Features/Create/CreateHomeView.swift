import PhotosUI
import SwiftUI
import UIKit

struct CreateHomeView: View {
    @State private var draft = Draft()
    @State private var recentDrafts: [DraftSummary] = []
    @State private var draftStore: DraftStore?
    @State private var imageStore: ImageStore?
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var editorDraft: Draft?
    @State private var isShowingAssets = false
    @State private var statusMessage: String?

    private let assetEntryContextStore = AssetEntryContextStore()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: JournalSpacing.xl) {
                    newCollageSection
                    startFromAssetsButton
                    recentDraftsSection
                }
                .padding(JournalSpacing.lg)
            }
            .background(JournalColors.page.ignoresSafeArea())
            .navigationDestination(
                isPresented: Binding(
                    get: { editorDraft != nil },
                    set: { isPresented in
                        if !isPresented {
                            editorDraft = nil
                            refreshRecentDrafts()
                        }
                    }
                )
            ) {
                if let editorDraft {
                    EditorView(draft: editorDraft)
                }
            }
            .navigationDestination(isPresented: $isShowingAssets) {
                AssetsView()
            }
            .onAppear {
                setupStores()
                refreshRecentDrafts()
            }
            .onChange(of: selectedPhotoItem) { _, item in
                importPhoto(item)
            }
        }
    }

    private var newCollageSection: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.sm) {
            Text("新拼贴")
                .font(JournalTypography.pageTitle)
                .foregroundStyle(JournalColors.ink)

            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
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

            if let statusMessage {
                Text(statusMessage)
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)
            }
        }
    }

    private var startFromAssetsButton: some View {
        Button {
            startFromAssets()
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
    }

    private var recentDraftsSection: some View {
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
                        HStack(spacing: JournalSpacing.md) {
                            DraftSummaryThumbnail(summary: summary)
                                .frame(width: 46, height: 58)
                                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))

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

    private func setupStores() {
        if draftStore == nil {
            draftStore = try? DraftStore()
        }
        if imageStore == nil {
            imageStore = try? ImageStore()
        }
    }

    private func refreshRecentDrafts() {
        setupStores()
        if let store = draftStore, let summaries = try? store.list(limit: DraftStore.createRecentDraftLimit) {
            recentDrafts = summaries
        } else {
            recentDrafts = []
        }
    }

    private func loadDraft(id: String) -> Draft? {
        guard let draftStore else { return nil }
        return try? draftStore.load(id: id)
    }

    private func importPhoto(_ item: PhotosPickerItem?) {
        guard let item else { return }
        setupStores()
        statusMessage = "正在导入照片"

        Task { @MainActor in
            guard let imageStore else {
                statusMessage = "图片存储未就绪"
                return
            }
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let stored = try? imageStore.saveImageData(data) else {
                statusMessage = "图片导入失败"
                return
            }

            var nextDraft = Draft()
            var imageLayer = DraftFactory.makeImageLayer(
                source: stored.source,
                imageSize: stored.size,
                draft: nextDraft
            )
            imageLayer.shadow = true
            nextDraft.layers.append(imageLayer)
            nextDraft = DraftThumbnailGenerator.draftWithUpdatedThumbnail(nextDraft, imageStore: imageStore)

            try? draftStore?.save(nextDraft)
            selectedPhotoItem = nil
            statusMessage = nil
            editorDraft = nextDraft
        }
    }

    private func startFromAssets() {
        setupStores()
        var nextDraft = Draft()
        nextDraft = DraftThumbnailGenerator.draftWithUpdatedThumbnail(nextDraft, imageStore: imageStore)

        do {
            try draftStore?.save(nextDraft)
            assetEntryContextStore.save(draftId: nextDraft.id)
            draft = nextDraft
            statusMessage = nil
            isShowingAssets = true
        } catch {
            statusMessage = "草稿创建失败"
        }
    }
}

private struct DraftSummaryThumbnail: View {
    let summary: DraftSummary

    var body: some View {
        Group {
            if let thumbnailPath = summary.thumbnailPath,
               let image = UIImage(contentsOfFile: thumbnailPath) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous)
                    .fill(JournalColors.paper)
                    .overlay(
                        Image(systemName: "photo")
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(JournalColors.textTertiary)
                    )
            }
        }
    }
}

#Preview {
    CreateHomeView()
}
