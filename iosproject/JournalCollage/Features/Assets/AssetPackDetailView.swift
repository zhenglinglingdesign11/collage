import SwiftUI
import UIKit

struct AssetPackDetailView: View {
    @Environment(\.dismiss) private var dismiss

    let pack: AssetPack
    var onFavoriteChanged: () -> Void = {}

    @State private var selectedAssetIds: Set<String> = []
    @State private var isFavorite = false
    @State private var editorDraft: Draft?

    private let favoriteStore = AssetFavoriteStore()
    private let entryContextStore = AssetEntryContextStore()

    private var selectedItems: [AssetPackItem] {
        pack.items.filter { selectedAssetIds.contains($0.id) }
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar

            GeometryReader { proxy in
                ZStack(alignment: .bottom) {
                    AssetPaperBackground()

                    ForEach(Array(pack.items.enumerated()), id: \.element.id) { index, item in
                        FloatingAssetButton(
                            item: item,
                            index: index,
                            paperSize: proxy.size,
                            isSelected: selectedAssetIds.contains(item.id)
                        ) {
                            toggleAsset(item)
                        }
                    }

                    if !selectedItems.isEmpty {
                        selectedTray
                            .padding(.bottom, 88)
                    }

                    Button {
                        addSelectedAssetsToCanvas()
                    } label: {
                        Text("添加到画布")
                            .font(JournalTypography.bodyStrong)
                            .foregroundStyle(selectedItems.isEmpty ? JournalColors.textSecondary : Color.white)
                            .frame(minWidth: 132)
                            .frame(height: 48)
                            .padding(.horizontal, JournalSpacing.md)
                            .background(selectedItems.isEmpty ? JournalColors.weak : JournalColors.ink)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(selectedItems.isEmpty)
                    .padding(.bottom, JournalSpacing.lg)
                }
                .padding(JournalSpacing.lg)
            }
        }
        .background(JournalColors.page.ignoresSafeArea())
        .navigationBarBackButtonHidden()
        .navigationDestination(
            isPresented: Binding(
                get: { editorDraft != nil },
                set: { isPresented in
                    if !isPresented {
                        editorDraft = nil
                    }
                }
            )
        ) {
            if let editorDraft {
                EditorView(draft: editorDraft)
            }
        }
        .onAppear {
            isFavorite = favoriteStore.isFavorite(packId: pack.id)
        }
    }

    private var topBar: some View {
        HStack(spacing: JournalSpacing.sm) {
            JournalIconButton(systemName: "chevron.left") {
                dismiss()
            }

            Spacer()

            Text(pack.name)
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)
                .lineLimit(1)

            Spacer()

            JournalIconButton(systemName: isFavorite ? "star.fill" : "star") {
                isFavorite = favoriteStore.toggle(packId: pack.id)
                onFavoriteChanged()
            }
        }
        .padding(.horizontal, JournalSpacing.md)
        .padding(.vertical, JournalSpacing.sm)
        .background(JournalColors.page)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(JournalColors.border)
                .frame(height: 1)
        }
    }

    private var selectedTray: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: JournalSpacing.xs) {
                ForEach(selectedItems) { item in
                    HStack(spacing: JournalSpacing.xs) {
                        AssetThumbnail(item: item)
                            .frame(width: 34, height: 34)

                        Button {
                            selectedAssetIds.remove(item.id)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(JournalColors.ink)
                                .frame(width: 28, height: 28)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.leading, 8)
                    .padding(.trailing, 4)
                    .frame(height: 44)
                    .background(Color.white.opacity(0.92))
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(JournalColors.border))
                }
            }
            .padding(.horizontal, JournalSpacing.lg)
        }
        .frame(height: 56)
    }

    private func toggleAsset(_ item: AssetPackItem) {
        if selectedAssetIds.contains(item.id) {
            selectedAssetIds.remove(item.id)
        } else {
            selectedAssetIds.insert(item.id)
        }
    }

    private func addSelectedAssetsToCanvas() {
        let items = selectedItems
        guard !items.isEmpty else { return }
        var draft = contextualDraft() ?? latestDraft() ?? Draft()

        for (index, item) in items.enumerated() {
            var layer = DraftFactory.makeAssetLayer(item: item, draft: draft)
            layer.shadow = true
            offsetLayer(&layer, index: index, draft: draft)
            draft.layers.append(layer)
            draft.assets.append(DraftAsset(id: item.id, source: item.source, type: item.type))
        }

        if let store = try? DraftStore() {
            draft = DraftThumbnailGenerator.draftWithUpdatedThumbnail(draft, imageStore: try? ImageStore())
            try? store.save(draft)
        }
        entryContextStore.clear()
        editorDraft = draft
        selectedAssetIds.removeAll()
    }

    private func contextualDraft() -> Draft? {
        guard let draftId = entryContextStore.activeDraftId(),
              let store = try? DraftStore() else {
            return nil
        }
        return try? store.load(id: draftId)
    }

    private func latestDraft() -> Draft? {
        guard let store = try? DraftStore(),
              let summary = try? store.list().first else {
            return nil
        }
        return try? store.load(id: summary.id)
    }

    private func offsetLayer(_ layer: inout Layer, index: Int, draft: Draft) {
        let offsets: [(Double, Double)] = [
            (0, 0),
            (-72, -52),
            (72, 48),
            (-44, 82),
            (54, -86),
            (0, 104)
        ]
        let offset = offsets[index % offsets.count]
        layer.x = min(max(0, layer.x + offset.0), max(0, draft.width - layer.width))
        layer.y = min(max(0, layer.y + offset.1), max(0, draft.height - layer.height))
    }
}

private struct AssetPaperBackground: View {
    var body: some View {
        RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
            .fill(Color.white)
            .overlay {
                Canvas { context, size in
                    let step: CGFloat = 12
                    for x in stride(from: CGFloat(0), through: size.width, by: step) {
                        for y in stride(from: CGFloat(0), through: size.height, by: step) {
                            context.fill(
                                Path(ellipseIn: CGRect(x: x, y: y, width: 1, height: 1)),
                                with: .color(JournalColors.ink.opacity(0.035))
                            )
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
            }
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .stroke(JournalColors.border)
            )
    }
}

private struct FloatingAssetButton: View {
    let item: AssetPackItem
    let index: Int
    let paperSize: CGSize
    let isSelected: Bool
    let action: () -> Void

    private let slots: [(x: CGFloat, y: CGFloat, rotation: Double)] = [
        (0.18, 0.12, -7),
        (0.68, 0.13, 5),
        (0.42, 0.25, -3),
        (0.18, 0.40, 6),
        (0.70, 0.39, -6),
        (0.43, 0.53, 4),
        (0.20, 0.66, -5),
        (0.68, 0.66, 6),
        (0.42, 0.76, -4),
        (0.72, 0.82, 5),
        (0.17, 0.82, 4),
        (0.51, 0.90, -6)
    ]

    var body: some View {
        Button(action: action) {
            AssetThumbnail(item: item)
                .frame(width: assetSize.width, height: assetSize.height)
                .overlay(
                    Rectangle()
                        .stroke(isSelected ? JournalColors.ink : Color.clear, lineWidth: 2)
                )
        }
        .buttonStyle(.plain)
        .rotationEffect(.degrees(slot.rotation + Double((index % 3) - 1)))
        .position(position)
        .accessibilityLabel(item.name)
    }

    private var slot: (x: CGFloat, y: CGFloat, rotation: Double) {
        slots[index % slots.count]
    }

    private var position: CGPoint {
        let cycleOffset = CGFloat(index / slots.count) * 18
        return CGPoint(
            x: min(paperSize.width * 0.82, paperSize.width * slot.x + cycleOffset),
            y: min(paperSize.height * 0.88, paperSize.height * slot.y + cycleOffset)
        )
    }

    private var assetSize: CGSize {
        let sourceWidth = max(1, CGFloat(item.width))
        let sourceHeight = max(1, CGFloat(item.height))
        let ratio = sourceWidth / sourceHeight
        var maxWidth: CGFloat = 88
        var maxHeight: CGFloat = 88

        if ratio >= 2.2 {
            maxWidth = 150
            maxHeight = 62
        } else if ratio <= 0.35 {
            maxWidth = 61
            maxHeight = 205
        } else if ratio <= 0.65 {
            maxWidth = 73
            maxHeight = 135
        } else if ratio >= 1.45 {
            maxWidth = 118
            maxHeight = 75
        }

        let scale = min(maxWidth / sourceWidth, maxHeight / sourceHeight)
        return CGSize(
            width: max(44, sourceWidth * scale),
            height: max(44, sourceHeight * scale)
        )
    }
}

private struct AssetThumbnail: View {
    let item: AssetPackItem

    var body: some View {
        Group {
            if let url = ImageSourceResolver.url(for: item.source),
               let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                Text(item.name)
                    .font(JournalTypography.tiny)
                    .foregroundStyle(JournalColors.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(JournalSpacing.xs)
            }
        }
        .background(Color.clear)
    }
}

struct AssetItemTile: View {
    let item: AssetPackItem

    var body: some View {
        RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous)
            .fill(JournalColors.weak)
            .aspectRatio(Double(item.width) / Double(item.height), contentMode: .fit)
            .overlay(
                AssetThumbnail(item: item)
                    .padding(JournalSpacing.xs)
            )
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous)
                    .stroke(JournalColors.border)
            )
            .accessibilityLabel(item.name)
    }
}

#Preview {
    AssetPackDetailView(
        pack: AssetPack(
            id: "papers",
            name: "复古纸张",
            category: "纸张",
            tone: "#f3f1ec",
            cover: "packs/papers/pack-sheet.jpg",
            version: 1,
            items: []
        )
    )
}
