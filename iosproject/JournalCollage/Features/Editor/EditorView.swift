import PhotosUI
import SwiftUI

struct EditorView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var draft: Draft
    @State private var selectedLayerId: String?
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var saveStatus = "未保存"
    @State private var draftStore: DraftStore?
    @State private var imageStore: ImageStore?
    @State private var assetCatalog = AssetPackCatalog(schemaVersion: 1, generatedFrom: "", packs: [])
    @State private var activeSheet: EditorSheet?
    @State private var undoStack: [Draft] = []
    @State private var redoStack: [Draft] = []
    @State private var lastCommittedDraft: Draft
    @State private var entryDraftSnapshot: Draft?
    @State private var draftExistedOnEntry = false
    @State private var leaveConfirmationVisible = false
    @State private var leaveWillPruneOldestDraft = false
    private let assetEntryContextStore = AssetEntryContextStore()
    private let restoresLatestDraft: Bool
    private let historyLimit = 50

    init(draft: Draft, restoresLatestDraft: Bool = false) {
        _draft = State(initialValue: draft)
        _selectedLayerId = State(initialValue: draft.layers.last?.id)
        _lastCommittedDraft = State(initialValue: draft)
        self.restoresLatestDraft = restoresLatestDraft
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar

            InteractiveDraftCanvas(
                draft: $draft,
                selectedLayerId: $selectedLayerId,
                imageStore: imageStore,
                onDraftChanged: commitDraftChange
            )
            .padding(.horizontal, JournalSpacing.xl)
            .padding(.vertical, JournalSpacing.lg)

            if selectedLayerId != nil {
                LayerCommandToolbar(
                    onCopy: duplicateSelectedLayer,
                    onDelete: deleteSelectedLayer,
                    onMoveUp: moveSelectedLayerUp,
                    onMoveDown: moveSelectedLayerDown,
                    onEditText: openTextPanel,
                    onEffects: { activeSheet = .effects },
                    onCrop: { activeSheet = .crop },
                    onMask: { activeSheet = .mask },
                    onBrushCut: { activeSheet = .brushCut },
                    onSubjectCut: removeSelectedImageBackground,
                    canEditText: selectedLayer?.type == .text,
                    canCrop: selectedLayer?.type == .image,
                    canMask: supportsMask(selectedLayer),
                    canBrushCut: selectedLayer?.type == .image,
                    canSubjectCut: selectedLayer?.type == .image
                )
                .padding(.horizontal, JournalSpacing.md)
                .padding(.bottom, JournalSpacing.sm)
            }

            EditorToolbar(
                selectedPhotoItem: $selectedPhotoItem,
                onAddAsset: openAssetDrawer,
                onAddTape: addTape,
                onAddBackground: { activeSheet = .background },
                onAddText: openTextPanel,
                onChangeRatio: cycleRatio
            )
            .padding(.horizontal, JournalSpacing.md)
            .padding(.bottom, JournalSpacing.md)
        }
        .background(JournalColors.page.ignoresSafeArea())
        .navigationBarBackButtonHidden()
        .task {
            setupStoresAndRestoreDraft()
        }
        .onChange(of: selectedPhotoItem) { _, item in
            importPhoto(item)
        }
        .confirmationDialog(
            "离开前保存草稿？",
            isPresented: $leaveConfirmationVisible,
            titleVisibility: .visible
        ) {
            Button("保存为草稿") {
                saveAndLeave()
            }
            Button("不保存", role: .destructive) {
                discardAndLeave()
            }
            Button("取消", role: .cancel) {
            }
        } message: {
            Text(leaveConfirmationMessage)
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .assets:
                AssetDrawerSheet(
                    catalog: assetCatalog,
                    onBrowseAll: openFullAssetBrowser
                ) { item in
                    addAsset(item)
                    activeSheet = nil
                }
                .presentationDetents([.medium, .large])
            case .assetBrowser:
                AssetsView()
            case .background:
                BackgroundPickerSheet(
                    background: draft.background,
                    pattern: draft.backgroundPattern
                ) { option in
                    applyBackground(option)
                    activeSheet = nil
                }
                .presentationDetents([.height(310)])
            case .text:
                TextStyleSheet(
                    draft: $draft,
                    layerId: selectedLayerId,
                    onDraftChanged: commitDraftChange
                )
                .presentationDetents([.medium])
            case .effects:
                LayerEffectsSheet(
                    draft: $draft,
                    layerId: selectedLayerId,
                    onDraftChanged: commitDraftChange
                )
                .presentationDetents([.height(360), .medium])
            case .crop:
                CropPresetSheet(
                    draft: $draft,
                    layerId: selectedLayerId,
                    imageStore: imageStore,
                    onDraftChanged: commitDraftChange
                )
                .presentationDetents([.large])
            case .mask:
                LayerMaskSheet(
                    draft: $draft,
                    layerId: selectedLayerId,
                    onDraftChanged: commitDraftChange
                )
                .presentationDetents([.height(300)])
            case .brushCut:
                BrushCutSheet(
                    draft: $draft,
                    layerId: selectedLayerId,
                    imageStore: imageStore,
                    onDraftChanged: commitDraftChange,
                    onStatusChanged: { saveStatus = $0 }
                )
                .presentationDetents([.large])
            case .exportPreview:
                ExportPreviewView(draft: draft, imageStore: imageStore)
            }
        }
    }

    private var topBar: some View {
        HStack(spacing: JournalSpacing.sm) {
            JournalIconButton(systemName: "chevron.left") {
                requestLeaveEditor()
            }

            Button {
                cycleRatio()
            } label: {
                Text(draft.ratio.rawValue)
                    .font(JournalTypography.bodyStrong)
                    .foregroundStyle(JournalColors.ink)
                    .padding(.horizontal, JournalSpacing.md)
                    .frame(height: 36)
                    .background(JournalColors.weak)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)

            Text(saveStatus)
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            Spacer()

            JournalIconButton(
                systemName: "arrow.uturn.backward",
                isEnabled: canUndo,
                action: undoDraftChange
            )
            JournalIconButton(
                systemName: "arrow.uturn.forward",
                isEnabled: canRedo,
                action: redoDraftChange
            )

            Button("保存") {
                saveDraft()
            }
            .font(JournalTypography.bodyStrong)
            .foregroundStyle(JournalColors.ink)

            Button("导出") {
                exportToPhotoLibrary()
            }
            .font(JournalTypography.bodyStrong)
            .foregroundStyle(Color.white)
            .frame(width: 64, height: 36)
            .background(JournalColors.ink)
            .clipShape(Capsule())
        }
        .padding(.horizontal, JournalSpacing.md)
        .padding(.top, JournalSpacing.sm)
    }

    private func setupStoresAndRestoreDraft() {
        if draftStore == nil {
            draftStore = try? DraftStore()
        }
        if imageStore == nil {
            imageStore = try? ImageStore()
        }
        if assetCatalog.packs.isEmpty {
            assetCatalog = (try? AssetPackRepository.loadBundledCatalog()) ?? assetCatalog
        }
        if restoresLatestDraft, draft.layers.isEmpty, let store = draftStore {
            do {
                if let summary = try store.list().first {
                    let restored = try store.load(id: summary.id)
                    draft = restored
                    selectedLayerId = restored.layers.last?.id
                    resetHistory(to: restored)
                    entryDraftSnapshot = restored
                    draftExistedOnEntry = true
                    saveStatus = "已恢复草稿"
                }
            } catch {
                saveStatus = "草稿恢复失败"
            }
        }
        if entryDraftSnapshot == nil {
            entryDraftSnapshot = (try? draftStore?.load(id: draft.id)) ?? draft
            draftExistedOnEntry = (try? draftStore?.list().contains { $0.id == draft.id }) ?? false
        }
    }

    private func importPhoto(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            guard let imageStore else {
                saveStatus = "图片存储未就绪"
                return
            }
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let stored = try? imageStore.saveImageData(data) else {
                saveStatus = "图片导入失败"
                return
            }
            var nextLayer = DraftFactory.makeImageLayer(
                source: stored.source,
                imageSize: stored.size,
                draft: draft
            )
            nextLayer.shadow = true
            draft.layers.append(nextLayer)
            selectedLayerId = nextLayer.id
            commitDraftChange()
        }
    }

    private func addAsset(_ item: AssetPackItem) {
        var layer = DraftFactory.makeAssetLayer(item: item, draft: draft)
        layer.shadow = true
        draft.layers.append(layer)
        draft.assets.append(DraftAsset(id: item.id, source: item.source, type: item.type))
        selectedLayerId = layer.id
        commitDraftChange()
    }

    private func openAssetDrawer() {
        saveDraft()
        assetEntryContextStore.save(draftId: draft.id)
        activeSheet = .assets
    }

    private func openFullAssetBrowser() {
        saveDraft()
        assetEntryContextStore.save(draftId: draft.id)
        activeSheet = .assetBrowser
    }

    private func addTape() {
        let layer = Layer(
            type: .tape,
            x: draft.width * 0.32,
            y: draft.height * 0.22,
            width: 280,
            height: 72,
            rotation: -8,
            opacity: 0.92,
            zIndex: nextLayerOrder(),
            style: [
                "color": .string("#e9d28a")
            ]
        )
        draft.layers.append(layer)
        selectedLayerId = layer.id
        commitDraftChange()
    }

    private func addText() {
        let layer = DraftFactory.makeTextLayer(text: "weekend", draft: draft)
        draft.layers.append(layer)
        selectedLayerId = layer.id
        commitDraftChange()
    }

    private func openTextPanel() {
        if selectedLayer?.type != .text {
            addText()
        }
        activeSheet = .text
    }

    private func applyBackground(_ option: BackgroundOption) {
        draft.background = option.colorHex
        draft.backgroundPattern = option.pattern
        commitDraftChange()
    }

    private func duplicateSelectedLayer() {
        guard let layer = selectedLayer else { return }
        var copy = layer
        copy.id = UUID().uuidString
        copy.x += 32
        copy.y += 32
        copy.zIndex = nextLayerOrder()
        draft.layers.append(copy)
        selectedLayerId = copy.id
        commitDraftChange()
    }

    private func deleteSelectedLayer() {
        guard let selectedLayerId else { return }
        draft.layers.removeAll { $0.id == selectedLayerId }
        self.selectedLayerId = nil
        normalizeLayerOrder()
        commitDraftChange()
    }

    private func moveSelectedLayerUp() {
        guard let index = selectedLayerIndex, index < draft.layers.count - 1 else { return }
        draft.layers.swapAt(index, index + 1)
        normalizeLayerOrder()
        commitDraftChange()
    }

    private func moveSelectedLayerDown() {
        guard let index = selectedLayerIndex, index > 0 else { return }
        draft.layers.swapAt(index, index - 1)
        normalizeLayerOrder()
        commitDraftChange()
    }

    private func cycleRatio() {
        let ratios = CanvasRatio.allCases
        guard let index = ratios.firstIndex(of: draft.ratio) else { return }
        let nextRatio = ratios[(index + 1) % ratios.count]
        let oldWidth = draft.width
        let oldHeight = draft.height
        let nextSize = nextRatio.logicalSize
        let scaleX = nextSize.width / oldWidth
        let scaleY = nextSize.height / oldHeight

        draft.ratio = nextRatio
        draft.width = nextSize.width
        draft.height = nextSize.height
        draft.layers = draft.layers.map { layer in
            var next = layer
            next.x *= scaleX
            next.y *= scaleY
            return next
        }
        commitDraftChange()
    }

    private var canUndo: Bool {
        !undoStack.isEmpty
    }

    private var canRedo: Bool {
        !redoStack.isEmpty
    }

    private func commitDraftChange() {
        guard draft != lastCommittedDraft else {
            saveDraft()
            return
        }
        undoStack.append(lastCommittedDraft)
        if undoStack.count > historyLimit {
            undoStack.removeFirst(undoStack.count - historyLimit)
        }
        redoStack.removeAll()
        lastCommittedDraft = draft
        normalizeSelection()
        saveDraft()
    }

    private func undoDraftChange() {
        guard let previous = undoStack.popLast() else { return }
        redoStack.append(draft)
        draft = previous
        lastCommittedDraft = previous
        normalizeSelection()
        saveDraft(status: "已撤销")
    }

    private func redoDraftChange() {
        guard let next = redoStack.popLast() else { return }
        undoStack.append(draft)
        if undoStack.count > historyLimit {
            undoStack.removeFirst(undoStack.count - historyLimit)
        }
        draft = next
        lastCommittedDraft = next
        normalizeSelection()
        saveDraft(status: "已重做")
    }

    private func resetHistory(to draft: Draft) {
        undoStack = []
        redoStack = []
        lastCommittedDraft = draft
    }

    private func requestLeaveEditor() {
        if !hasDraftContent {
            discardAndLeave()
            return
        }
        leaveWillPruneOldestDraft = (try? draftStore?.willPruneOldestDraft(onSaving: draft)) ?? false
        leaveConfirmationVisible = true
    }

    private var leaveConfirmationMessage: String {
        if leaveWillPruneOldestDraft {
            return "本地草稿已达 20 个，保存将删除最早的草稿。可以保存当前编辑，或放弃本次进入编辑器后的修改。"
        }
        return "可以保存当前编辑，或放弃本次进入编辑器后的修改。"
    }

    private func saveAndLeave() {
        saveDraft(status: "草稿已保存")
        dismiss()
    }

    private func discardAndLeave() {
        do {
            if draftExistedOnEntry, let entryDraftSnapshot {
                try draftStore?.save(entryDraftSnapshot)
            } else {
                try draftStore?.delete(id: draft.id)
            }
        } catch {
            saveStatus = "草稿处理失败"
            return
        }
        dismiss()
    }

    private var hasDraftContent: Bool {
        !draft.layers.isEmpty || draft.background != "#fdfdfb" || draft.backgroundPattern != nil || draft.backgroundImage != nil
    }

    private func saveDraft(status: String = "已保存") {
        do {
            let willPruneOldestDraft = (try draftStore?.willPruneOldestDraft(onSaving: draft)) ?? false
            draft = DraftThumbnailGenerator.draftWithUpdatedThumbnail(draft, imageStore: imageStore)
            try draftStore?.save(draft)
            lastCommittedDraft = draft
            saveStatus = willPruneOldestDraft
                ? "本地草稿已达 20 个，保存将删除最早的草稿"
                : status
        } catch {
            saveStatus = "保存失败"
        }
    }

    private func exportToPhotoLibrary() {
        saveDraft()
        saveStatus = "正在导出"
        Task { @MainActor in
            do {
                let exported = try ExportRenderer.render(draft: draft, imageStore: imageStore)
                try await PhotoLibrarySaver.save(exported.image)
                saveStatus = "已保存到相册"
            } catch {
                saveStatus = (error as? LocalizedError)?.errorDescription ?? "导出失败"
            }
        }
    }

    private func removeSelectedImageBackground() {
        guard let layer = selectedLayer,
              layer.type == .image,
              let source = layer.source,
              let imageStore,
              let fileURL = ImageSourceResolver.url(for: source, imageStore: imageStore) else {
            saveStatus = "请先选择图片"
            return
        }
        let layerId = layer.id
        saveStatus = "主体剪中..."
        Task { @MainActor in
            do {
                let data = try await RembgService().removeImageBackground(fileURL: fileURL)
                let stored = try imageStore.savePNGImageData(data)
                guard let index = draft.layers.firstIndex(where: { $0.id == layerId }) else {
                    saveStatus = "未选中图片"
                    return
                }
                draft.layers[index].source = stored.source
                draft.layers[index].sourceWidth = stored.size.width
                draft.layers[index].sourceHeight = stored.size.height
                draft.layers[index].style["subjectCut"] = .bool(true)
                commitDraftChange()
                saveStatus = "主体剪完成"
            } catch {
                saveStatus = (error as? LocalizedError)?.errorDescription ?? "主体剪失败，请稍后重试"
            }
        }
    }

    private var selectedLayer: Layer? {
        guard let selectedLayerId else { return nil }
        return draft.layers.first { $0.id == selectedLayerId }
    }

    private var selectedLayerIndex: Int? {
        guard let selectedLayerId else { return nil }
        return draft.layers.firstIndex { $0.id == selectedLayerId }
    }

    private func normalizeSelection() {
        guard let selectedLayerId else { return }
        if !draft.layers.contains(where: { $0.id == selectedLayerId }) {
            self.selectedLayerId = draft.layers.last?.id
        }
    }

    private func supportsMask(_ layer: Layer?) -> Bool {
        guard let layer else { return false }
        switch layer.type {
        case .image, .sticker, .paper, .cut:
            return true
        case .text, .tape:
            return false
        }
    }

    private func nextLayerOrder() -> Int {
        (draft.layers.map(\.zIndex).max() ?? 0) + 1
    }

    private func normalizeLayerOrder() {
        draft.layers = draft.layers.enumerated().map { index, layer in
            var next = layer
            next.zIndex = index + 1
            return next
        }
    }
}

private enum EditorSheet: String, Identifiable {
    case assets
    case assetBrowser
    case background
    case text
    case effects
    case crop
    case mask
    case brushCut
    case exportPreview

    var id: String { rawValue }
}

private struct EditorToolbar: View {
    @Binding var selectedPhotoItem: PhotosPickerItem?
    let onAddAsset: () -> Void
    let onAddTape: () -> Void
    let onAddBackground: () -> Void
    let onAddText: () -> Void
    let onChangeRatio: () -> Void

    var body: some View {
        HStack {
            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                ToolItem(systemName: "photo", label: "图片")
            }
            .buttonStyle(.plain)

            Button(action: onAddAsset) {
                ToolItem(systemName: "square.grid.2x2", label: "素材")
            }
            .buttonStyle(.plain)

            Button(action: onAddTape) {
                ToolItem(systemName: "rectangle.fill.on.rectangle.fill", label: "胶带")
            }
            .buttonStyle(.plain)

            Button(action: onAddBackground) {
                ToolItem(systemName: "square.dotted", label: "背景")
            }
            .buttonStyle(.plain)

            Button(action: onAddText) {
                ToolItem(systemName: "textformat", label: "文字")
            }
            .buttonStyle(.plain)

            Button(action: onChangeRatio) {
                ToolItem(systemName: "rectangle.3.group", label: "比例")
            }
            .buttonStyle(.plain)
        }
        .frame(height: 72)
        .background(JournalColors.panel)
        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.panel, style: .continuous))
        .shadow(color: .black.opacity(0.10), radius: 24, x: 0, y: 8)
    }
}

private struct LayerCommandToolbar: View {
    let onCopy: () -> Void
    let onDelete: () -> Void
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onEditText: () -> Void
    let onEffects: () -> Void
    let onCrop: () -> Void
    let onMask: () -> Void
    let onBrushCut: () -> Void
    let onSubjectCut: () -> Void
    let canEditText: Bool
    let canCrop: Bool
    let canMask: Bool
    let canBrushCut: Bool
    let canSubjectCut: Bool

    var body: some View {
        HStack {
            Button(action: onMoveDown) {
                ToolItem(systemName: "square.2.layers.3d.bottom.filled", label: "下移")
            }
            Button(action: onMoveUp) {
                ToolItem(systemName: "square.2.layers.3d.top.filled", label: "上移")
            }
            Button(action: onCopy) {
                ToolItem(systemName: "doc.on.doc", label: "复制")
            }
            Button(action: onDelete) {
                ToolItem(systemName: "trash", label: "删除")
            }
            Button(action: onEffects) {
                ToolItem(systemName: "slider.horizontal.3", label: "效果")
            }
            if canCrop {
                Button(action: onCrop) {
                    ToolItem(systemName: "crop", label: "裁切")
                }
            }
            if canMask {
                Button(action: onMask) {
                    ToolItem(systemName: "seal", label: "形状")
                }
            }
            if canBrushCut {
                Button(action: onBrushCut) {
                    ToolItem(systemName: "scissors", label: "涂抹")
                }
            }
            if canSubjectCut {
                Button(action: onSubjectCut) {
                    ToolItem(systemName: "person.crop.rectangle", label: "主体")
                }
            }
            if canEditText {
                Button(action: onEditText) {
                    ToolItem(systemName: "text.cursor", label: "编辑")
                }
            }
        }
        .buttonStyle(.plain)
        .frame(height: 62)
        .background(JournalColors.panel)
        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.panel, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: JournalRadius.panel, style: .continuous)
                .stroke(JournalColors.border)
        )
    }
}

private struct ToolItem: View {
    let systemName: String
    let label: String

    var body: some View {
        VStack(spacing: JournalSpacing.xs) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .medium))
            Text(label)
                .font(JournalTypography.tiny)
        }
        .foregroundStyle(JournalColors.ink)
        .frame(maxWidth: .infinity)
    }
}

private struct BrushCutSheet: View {
    @Binding var draft: Draft
    let layerId: String?
    let imageStore: ImageStore?
    let onDraftChanged: () -> Void
    let onStatusChanged: (String) -> Void

    @State private var strokes: [[CGPoint]] = []
    @State private var currentStroke: [CGPoint] = []
    @State private var drawingSize: CGSize = .zero

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            HStack {
                Text("涂抹剪")
                    .font(JournalTypography.sectionTitle)
                    .foregroundStyle(JournalColors.ink)
                Spacer()
                Button("重画") {
                    strokes = []
                    currentStroke = []
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)
            }

            ZStack {
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .fill(JournalColors.weak)

                if let previewImage {
                    Image(uiImage: previewImage)
                        .resizable()
                        .scaledToFit()
                        .opacity(0.82)
                }

                Canvas { context, size in
                    let allStrokes = strokes + (currentStroke.isEmpty ? [] : [currentStroke])
                    for stroke in allStrokes where stroke.count > 1 {
                        var path = Path()
                        path.move(to: stroke[0])
                        for point in stroke.dropFirst() {
                            path.addLine(to: point)
                        }
                        context.stroke(
                            path,
                            with: .color(JournalColors.stampRed.opacity(0.72)),
                            style: StrokeStyle(lineWidth: 18, lineCap: .round, lineJoin: .round)
                        )
                    }
                }
                .overlay(
                    GeometryReader { proxy in
                        Color.clear
                            .onAppear {
                                drawingSize = proxy.size
                            }
                            .onChange(of: proxy.size) { _, size in
                                drawingSize = size
                            }
                    }
                )
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            currentStroke.append(value.location)
                        }
                        .onEnded { _ in
                            if currentStroke.count > 1 {
                                strokes.append(currentStroke)
                            }
                            currentStroke = []
                        }
                )
            }
            .aspectRatio(layerAspectRatio, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .stroke(JournalColors.border)
            )

            Text("涂抹保留想要的区域，保存后会生成 alpha mask 并随草稿恢复。")
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            JournalPrimaryButton(title: "保存涂抹剪", systemName: "checkmark") {
                saveBrushMask()
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
    }

    private var selectedLayer: Layer? {
        guard let layerId else { return nil }
        return draft.layers.first { $0.id == layerId }
    }

    private var layerAspectRatio: Double {
        guard let selectedLayer, selectedLayer.height > 0 else { return 1 }
        return selectedLayer.width / selectedLayer.height
    }

    private var previewImage: UIImage? {
        guard let selectedLayer,
              let url = ImageSourceResolver.url(for: selectedLayer.source, imageStore: imageStore),
              let image = UIImage(contentsOfFile: url.path) else {
            return nil
        }
        return ImageCropper.crop(image, cropBox: selectedLayer.crop)
    }

    private func saveBrushMask() {
        guard let imageStore else {
            onStatusChanged("图片存储未就绪")
            return
        }
        guard let layerId,
              let index = draft.layers.firstIndex(where: { $0.id == layerId }) else {
            onStatusChanged("未选中图片")
            return
        }
        let normalized = BrushMaskRenderer.normalizedStrokes(from: strokes, drawingSize: drawingSize)
        guard !normalized.isEmpty else {
            onStatusChanged("请先涂抹区域")
            return
        }

        do {
            let image = BrushMaskRenderer.renderMask(strokes: normalized, size: maskPixelSize)
            let source = try imageStore.saveMaskImage(image)
            draft.layers[index].style["maskSource"] = .string(source)
            draft.layers[index].style["brushPath"] = BrushMaskRenderer.jsonValue(from: normalized)
            onDraftChanged()
            onStatusChanged("已保存涂抹剪")
        } catch {
            onStatusChanged("涂抹剪保存失败")
        }
    }

    private var maskPixelSize: CGSize {
        let aspectRatio = max(0.1, layerAspectRatio)
        if aspectRatio >= 1 {
            return CGSize(width: 1024, height: 1024 / aspectRatio)
        }
        return CGSize(width: 1024 * aspectRatio, height: 1024)
    }
}

private struct LayerMaskSheet: View {
    @Binding var draft: Draft
    let layerId: String?
    let onDraftChanged: () -> Void

    @State private var selectedShape: LayerMaskShape = .none

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            Text("形状蒙版")
                .font(JournalTypography.sectionTitle)
                .foregroundStyle(JournalColors.ink)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: JournalSpacing.sm) {
                ForEach(LayerMaskShape.allCases) { shape in
                    Button {
                        selectedShape = shape
                        applyShape(shape)
                    } label: {
                        VStack(spacing: JournalSpacing.xs) {
                            LayerMaskView(shape: shape, cornerRadius: 8)
                                .fillStylePreview(selected: selectedShape == shape)
                                .frame(height: 44)

                            Text(shape.label)
                                .font(JournalTypography.tiny)
                                .foregroundStyle(selectedShape == shape ? JournalColors.ink : JournalColors.textSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, JournalSpacing.xs)
                        .background(selectedShape == shape ? JournalColors.weak : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }

            Text("当前为形状蒙版初版，压花材质会在后续阶段叠加。")
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
        .onAppear(perform: loadSelectedShape)
    }

    private func loadSelectedShape() {
        guard let layer = selectedLayer,
              case .string(let value) = layer.style["maskShape"],
              let shape = LayerMaskShape(rawValue: value) else {
            selectedShape = .none
            return
        }
        selectedShape = shape
    }

    private func applyShape(_ shape: LayerMaskShape) {
        guard let layerId,
              let index = draft.layers.firstIndex(where: { $0.id == layerId }) else { return }
        if shape == .none {
            draft.layers[index].style.removeValue(forKey: "maskShape")
        } else {
            draft.layers[index].style["maskShape"] = .string(shape.rawValue)
        }
        onDraftChanged()
    }

    private var selectedLayer: Layer? {
        guard let layerId else { return nil }
        return draft.layers.first { $0.id == layerId }
    }
}

private extension View {
    func fillStylePreview(selected: Bool) -> some View {
        foregroundStyle(selected ? JournalColors.ink : JournalColors.border)
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous)
                    .stroke(selected ? JournalColors.ink : JournalColors.border)
            )
    }
}

private struct CropPresetSheet: View {
    @Environment(\.dismiss) private var dismiss

    @Binding var draft: Draft
    let layerId: String?
    let imageStore: ImageStore?
    let onDraftChanged: () -> Void

    @State private var selectedPreset: CropPreset = .original
    @State private var draftCrop: CropBox?
    @State private var moveStartCrop: CropBox?
    @State private var resizeStartCrop: CropBox?

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            HStack {
                Button("取消") {
                    dismiss()
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.textSecondary)

                Spacer()

                Text("裁切")
                    .font(JournalTypography.sectionTitle)
                    .foregroundStyle(JournalColors.ink)

                Spacer()

                Button("完成") {
                    confirmCrop()
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)
            }

            GeometryReader { proxy in
                ZStack {
                    RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                        .fill(JournalColors.weak)

                    if let previewImage {
                        Image(uiImage: previewImage)
                            .resizable()
                            .scaledToFit()
                    } else {
                        Image(systemName: "photo")
                            .font(.system(size: 30, weight: .medium))
                            .foregroundStyle(JournalColors.textTertiary)
                    }

                    CropBoxOverlay(
                        cropBox: editingCrop,
                        sourceSize: sourceSize,
                        previewSize: proxy.size,
                        onMoveChanged: moveCrop,
                        onMoveEnded: { moveStartCrop = nil },
                        onResizeChanged: resizeCrop,
                        onResizeEnded: { resizeStartCrop = nil }
                    )
                }
            }
            .aspectRatio(sourceAspectRatio, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .stroke(JournalColors.border)
            )

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: JournalSpacing.sm) {
                ForEach(CropPreset.allCases) { preset in
                    Button {
                        selectedPreset = preset
                        applyPreset(preset)
                    } label: {
                        Text(preset.label)
                            .font(JournalTypography.bodyStrong)
                            .foregroundStyle(selectedPreset == preset ? Color.white : JournalColors.ink)
                            .frame(maxWidth: .infinity)
                            .frame(height: 42)
                            .background(selectedPreset == preset ? JournalColors.ink : JournalColors.weak)
                            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }

            Button {
                resetCrop()
            } label: {
                Label("还原原图", systemImage: "arrow.counterclockwise")
                    .font(JournalTypography.bodyStrong)
                    .foregroundStyle(JournalColors.ink)
                    .frame(maxWidth: .infinity)
                    .frame(height: 42)
                    .background(JournalColors.weak)
                    .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
            }
            .buttonStyle(.plain)

            Text("拖动裁切框移动范围，拖拽四角调整大小。点完成后才会写入草稿。")
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
        .onAppear(perform: loadInitialCrop)
    }

    private func loadInitialCrop() {
        guard let layer = selectedLayer,
              let crop = layer.crop else {
            selectedPreset = .original
            draftCrop = nil
            return
        }
        draftCrop = ImageCropper.constrainedCrop(crop, sourceWidth: sourceSize.width, sourceHeight: sourceSize.height)
        let ratio = crop.width / crop.height
        selectedPreset = CropPreset.allCases
            .filter { $0.ratio != nil }
            .min { left, right in
                abs((left.ratio ?? 1) - ratio) < abs((right.ratio ?? 1) - ratio)
            } ?? .free
    }

    private func applyPreset(_ preset: CropPreset) {
        if preset == .original {
            draftCrop = nil
            return
        }

        guard let ratio = preset.ratio else {
            draftCrop = editingCrop
            return
        }

        draftCrop = ImageCropper.centeredCrop(
            sourceWidth: sourceSize.width,
            sourceHeight: sourceSize.height,
            ratio: ratio
        )
    }

    private func resetCrop() {
        selectedPreset = .original
        draftCrop = nil
    }

    private func confirmCrop() {
        guard let layerId,
              let index = draft.layers.firstIndex(where: { $0.id == layerId }) else {
            dismiss()
            return
        }
        draft.layers[index].crop = selectedPreset == .original
            ? nil
            : ImageCropper.constrainedCrop(editingCrop, sourceWidth: sourceSize.width, sourceHeight: sourceSize.height)
        onDraftChanged()
        dismiss()
    }

    private func moveCrop(_ translation: CGSize, previewSize: CGSize) {
        if moveStartCrop == nil {
            moveStartCrop = editingCrop
        }
        guard let moveStartCrop else { return }
        selectedPreset = .free
        let deltaX = Double(translation.width / max(1, previewSize.width)) * sourceSize.width
        let deltaY = Double(translation.height / max(1, previewSize.height)) * sourceSize.height
        draftCrop = ImageCropper.constrainedCrop(
            CropBox(
                x: moveStartCrop.x + deltaX,
                y: moveStartCrop.y + deltaY,
                width: moveStartCrop.width,
                height: moveStartCrop.height
            ),
            sourceWidth: sourceSize.width,
            sourceHeight: sourceSize.height
        )
    }

    private func resizeCrop(_ handle: CropResizeHandle, translation: CGSize, previewSize: CGSize) {
        if resizeStartCrop == nil {
            resizeStartCrop = editingCrop
        }
        guard let resizeStartCrop else { return }
        selectedPreset = .free
        let deltaX = Double(translation.width / max(1, previewSize.width)) * sourceSize.width
        let deltaY = Double(translation.height / max(1, previewSize.height)) * sourceSize.height
        draftCrop = ImageCropper.constrainedCrop(
            resizedCrop(resizeStartCrop, handle: handle, deltaX: deltaX, deltaY: deltaY),
            sourceWidth: sourceSize.width,
            sourceHeight: sourceSize.height
        )
    }

    private func resizedCrop(_ crop: CropBox, handle: CropResizeHandle, deltaX: Double, deltaY: Double) -> CropBox {
        var left = crop.x
        var right = crop.x + crop.width
        var top = crop.y
        var bottom = crop.y + crop.height

        if handle.movesLeft {
            left += deltaX
        } else {
            right += deltaX
        }

        if handle.movesTop {
            top += deltaY
        } else {
            bottom += deltaY
        }

        let minimum = 24.0
        if right - left < minimum {
            if handle.movesLeft {
                left = right - minimum
            } else {
                right = left + minimum
            }
        }
        if bottom - top < minimum {
            if handle.movesTop {
                top = bottom - minimum
            } else {
                bottom = top + minimum
            }
        }

        return CropBox(x: left, y: top, width: right - left, height: bottom - top)
    }

    private var selectedLayer: Layer? {
        guard let layerId else { return nil }
        return draft.layers.first { $0.id == layerId }
    }

    private var sourceSize: CanvasSize {
        guard let selectedLayer else {
            return CanvasSize(width: 1, height: 1)
        }
        return CanvasSize(
            width: max(1, selectedLayer.sourceWidth ?? selectedLayer.width),
            height: max(1, selectedLayer.sourceHeight ?? selectedLayer.height)
        )
    }

    private var sourceAspectRatio: Double {
        sourceSize.width / sourceSize.height
    }

    private var editingCrop: CropBox {
        draftCrop ?? ImageCropper.fullCrop(sourceWidth: sourceSize.width, sourceHeight: sourceSize.height)
    }

    private var previewImage: UIImage? {
        guard let selectedLayer,
              let url = ImageSourceResolver.url(for: selectedLayer.source, imageStore: imageStore) else {
            return nil
        }
        return UIImage(contentsOfFile: url.path)
    }
}

private enum CropResizeHandle: CaseIterable {
    case topLeft
    case topRight
    case bottomRight
    case bottomLeft

    var movesLeft: Bool {
        self == .topLeft || self == .bottomLeft
    }

    var movesTop: Bool {
        self == .topLeft || self == .topRight
    }
}

private struct CropBoxOverlay: View {
    let cropBox: CropBox
    let sourceSize: CanvasSize
    let previewSize: CGSize
    let onMoveChanged: (CGSize, CGSize) -> Void
    let onMoveEnded: () -> Void
    let onResizeChanged: (CropResizeHandle, CGSize, CGSize) -> Void
    let onResizeEnded: () -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            cropBorder
                .position(x: cropRect.midX, y: cropRect.midY)

            ForEach(CropResizeHandle.allCases, id: \.self) { handle in
                Circle()
                    .fill(Color.white)
                    .frame(width: 22, height: 22)
                    .overlay(Circle().stroke(JournalColors.ink, lineWidth: 2))
                    .position(position(for: handle))
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                onResizeChanged(handle, value.translation, previewSize)
                            }
                            .onEnded { _ in
                                onResizeEnded()
                            }
                    )
            }
        }
        .frame(width: previewSize.width, height: previewSize.height)
    }

    private var cropBorder: some View {
        Rectangle()
            .fill(Color.clear)
            .frame(width: cropRect.width, height: cropRect.height)
            .overlay(
                Rectangle()
                    .stroke(JournalColors.ink, lineWidth: 2)
            )
            .overlay(gridLines)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        onMoveChanged(value.translation, previewSize)
                    }
                    .onEnded { _ in
                        onMoveEnded()
                    }
            )
    }

    private var gridLines: some View {
        Path { path in
            let width = cropRect.width
            let height = cropRect.height
            for index in 1...2 {
                let x = width * CGFloat(index) / 3
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: height))
                let y = height * CGFloat(index) / 3
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: width, y: y))
            }
        }
        .stroke(Color.white.opacity(0.82), lineWidth: 1)
    }

    private var cropRect: CGRect {
        let scaleX = previewSize.width / max(1, CGFloat(sourceSize.width))
        let scaleY = previewSize.height / max(1, CGFloat(sourceSize.height))
        return CGRect(
            x: CGFloat(cropBox.x) * scaleX,
            y: CGFloat(cropBox.y) * scaleY,
            width: CGFloat(cropBox.width) * scaleX,
            height: CGFloat(cropBox.height) * scaleY
        )
    }

    private func position(for handle: CropResizeHandle) -> CGPoint {
        switch handle {
        case .topLeft:
            return CGPoint(x: cropRect.minX, y: cropRect.minY)
        case .topRight:
            return CGPoint(x: cropRect.maxX, y: cropRect.minY)
        case .bottomRight:
            return CGPoint(x: cropRect.maxX, y: cropRect.maxY)
        case .bottomLeft:
            return CGPoint(x: cropRect.minX, y: cropRect.maxY)
        }
    }
}

private struct LayerEffectsSheet: View {
    @Binding var draft: Draft
    let layerId: String?
    let onDraftChanged: () -> Void

    @State private var opacity = 1.0
    @State private var radius = 0.0
    @State private var shadow = false
    @State private var tear = false

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            Text("图层效果")
                .font(JournalTypography.sectionTitle)
                .foregroundStyle(JournalColors.ink)

            effectSlider(
                title: "透明度",
                valueText: "\(Int(opacity * 100))%",
                value: $opacity,
                range: 0.1...1,
                step: 0.05
            )
            .onChange(of: opacity) { _, _ in applyChanges() }

            if supportsRadius {
                effectSlider(
                    title: "圆角",
                    valueText: "\(Int(radius))",
                    value: $radius,
                    range: 0...80,
                    step: 1
                )
                .onChange(of: radius) { _, _ in applyChanges() }
            }

            Toggle("阴影", isOn: $shadow)
                .font(JournalTypography.bodyStrong)
                .tint(JournalColors.ink)
                .onChange(of: shadow) { _, _ in applyChanges() }

            Toggle("撕边", isOn: $tear)
                .font(JournalTypography.bodyStrong)
                .tint(JournalColors.ink)
                .onChange(of: tear) { _, _ in applyChanges() }

            Text("撕边当前为渲染占位，后续会替换为真实不规则边缘。")
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
        .onAppear(perform: loadSelectedLayer)
    }

    private func effectSlider(
        title: String,
        valueText: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        step: Double
    ) -> some View {
        VStack(alignment: .leading, spacing: JournalSpacing.xs) {
            HStack {
                Text(title)
                    .font(JournalTypography.bodyStrong)
                    .foregroundStyle(JournalColors.ink)
                Spacer()
                Text(valueText)
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)
            }
            Slider(value: value, in: range, step: step)
                .tint(JournalColors.ink)
        }
    }

    private func loadSelectedLayer() {
        guard let layer = selectedLayer else { return }
        opacity = layer.opacity
        radius = layer.radius ?? defaultRadius(for: layer)
        shadow = layer.shadow ?? false
        tear = layer.tear ?? false
    }

    private func applyChanges() {
        guard let layerId,
              let index = draft.layers.firstIndex(where: { $0.id == layerId }) else { return }
        draft.layers[index].opacity = opacity
        if supportsRadius {
            draft.layers[index].radius = radius
        }
        draft.layers[index].shadow = shadow
        draft.layers[index].tear = tear
        onDraftChanged()
    }

    private var selectedLayer: Layer? {
        guard let layerId else { return nil }
        return draft.layers.first { $0.id == layerId }
    }

    private var supportsRadius: Bool {
        guard let selectedLayer else { return false }
        switch selectedLayer.type {
        case .image, .sticker, .paper, .cut:
            return true
        case .text, .tape:
            return false
        }
    }

    private func defaultRadius(for layer: Layer) -> Double {
        switch layer.type {
        case .paper:
            return 4
        case .image, .sticker, .cut:
            return 6
        case .text, .tape:
            return 0
        }
    }
}

private struct AssetDrawerSheet: View {
    let catalog: AssetPackCatalog
    let onBrowseAll: () -> Void
    let onSelect: (AssetPackItem) -> Void

    @State private var selectedPackId: String?

    private var selectedPack: AssetPack? {
        if let selectedPackId {
            return catalog.packs.first { $0.id == selectedPackId }
        }
        return catalog.packs.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            HStack {
                Text("素材")
                    .font(JournalTypography.sectionTitle)
                    .foregroundStyle(JournalColors.ink)

                Spacer()

                Button("查看全部素材") {
                    onBrowseAll()
                }
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.ink)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: JournalSpacing.xs) {
                    ForEach(catalog.packs) { pack in
                        Button(pack.name) {
                            selectedPackId = pack.id
                        }
                        .font(JournalTypography.caption)
                        .foregroundStyle((selectedPack?.id == pack.id) ? Color.white : JournalColors.ink)
                        .padding(.horizontal, JournalSpacing.md)
                        .frame(height: 34)
                        .background((selectedPack?.id == pack.id) ? JournalColors.ink : JournalColors.weak)
                        .clipShape(Capsule())
                    }
                }
            }

            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 82), spacing: JournalSpacing.md)], spacing: JournalSpacing.md) {
                    ForEach(selectedPack?.items ?? []) { item in
                        Button {
                            onSelect(item)
                        } label: {
                            AssetItemTile(item: item)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, JournalSpacing.sm)
            }
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
        .onAppear {
            if selectedPackId == nil {
                selectedPackId = catalog.packs.first?.id
            }
        }
    }
}

private struct BackgroundOption: Identifiable, Equatable {
    let id: String
    let name: String
    let colorHex: String
    let pattern: String?
}

private struct BackgroundPickerSheet: View {
    let background: String
    let pattern: String?
    let onSelect: (BackgroundOption) -> Void

    private let options = [
        BackgroundOption(id: "paper", name: "暖白", colorHex: "#fdfdfb", pattern: nil),
        BackgroundOption(id: "cream", name: "米纸", colorHex: "#f4efe5", pattern: nil),
        BackgroundOption(id: "line", name: "横线", colorHex: "#fdfdfb", pattern: "line"),
        BackgroundOption(id: "square", name: "方格", colorHex: "#fdfdfb", pattern: "square")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            Text("背景")
                .font(JournalTypography.sectionTitle)
                .foregroundStyle(JournalColors.ink)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: JournalSpacing.md) {
                ForEach(options) { option in
                    Button {
                        onSelect(option)
                    } label: {
                        VStack(alignment: .leading, spacing: JournalSpacing.sm) {
                            RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous)
                                .fill(Color(hexString: option.colorHex) ?? JournalColors.paper)
                                .frame(height: 72)
                                .overlay(patternPreview(option.pattern))
                                .overlay(
                                    RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous)
                                        .stroke(isSelected(option) ? JournalColors.ink : JournalColors.border, lineWidth: isSelected(option) ? 1.5 : 1)
                                )

                            Text(option.name)
                                .font(JournalTypography.caption)
                                .foregroundStyle(JournalColors.textSecondary)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
    }

    private func isSelected(_ option: BackgroundOption) -> Bool {
        background.lowercased() == option.colorHex.lowercased() && pattern == option.pattern
    }

    private func patternPreview(_ pattern: String?) -> some View {
        Canvas { context, size in
            guard let pattern else { return }
            var path = Path()
            if pattern == "line" {
                stride(from: CGFloat(18), through: size.height, by: 18).forEach { y in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                }
            } else if pattern == "square" {
                stride(from: CGFloat(18), through: size.width, by: 18).forEach { x in
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: size.height))
                }
                stride(from: CGFloat(18), through: size.height, by: 18).forEach { y in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                }
            }
            context.stroke(path, with: .color(JournalColors.ink.opacity(0.10)), lineWidth: 0.6)
        }
    }
}

private struct TextStyleSheet: View {
    @Binding var draft: Draft
    let layerId: String?
    let onDraftChanged: () -> Void

    @State private var text = ""
    @State private var fontId = "system"
    @State private var colorHex = "#111111"
    @State private var backgroundHex = "transparent"
    @State private var fontSize = 54.0

    private let fonts = [
        ("system", "系统"),
        ("rounded", "圆体"),
        ("serif", "衬线")
    ]

    private let colors = ["#111111", "#6f6f6f", "#d94a38", "#8c9a8d", "#e9d28a"]
    private let backgrounds = [
        ("transparent", "无"),
        ("#efe7d8", "纸底"),
        ("#ffffff", "白底"),
        ("#111111", "黑底"),
        ("#ead48a", "胶带")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            Text("文字")
                .font(JournalTypography.sectionTitle)
                .foregroundStyle(JournalColors.ink)

            TextField("输入文字", text: $text, axis: .vertical)
                .font(JournalTypography.bodyStrong)
                .padding(JournalSpacing.md)
                .background(JournalColors.weak)
                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                .onChange(of: text) { _, _ in applyChanges() }

            Picker("字体", selection: $fontId) {
                ForEach(fonts, id: \.0) { font in
                    Text(font.1).tag(font.0)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: fontId) { _, _ in applyChanges() }

            HStack(spacing: JournalSpacing.sm) {
                ForEach(colors, id: \.self) { hex in
                    Button {
                        colorHex = hex
                        applyChanges()
                    } label: {
                        Circle()
                            .fill(Color(hexString: hex) ?? JournalColors.ink)
                            .frame(width: 30, height: 30)
                            .overlay(Circle().stroke(colorHex == hex ? JournalColors.ink : JournalColors.border, lineWidth: colorHex == hex ? 2 : 1))
                    }
                    .buttonStyle(.plain)
                }
            }

            VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                Text("底色")
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)

                HStack(spacing: JournalSpacing.xs) {
                    ForEach(backgrounds, id: \.0) { background in
                        Button {
                            backgroundHex = background.0
                            applyChanges()
                        } label: {
                            Text(background.1)
                                .font(JournalTypography.caption)
                                .foregroundStyle(backgroundHex == background.0 ? Color.white : JournalColors.ink)
                                .frame(maxWidth: .infinity)
                                .frame(height: 34)
                                .background(backgroundHex == background.0 ? JournalColors.ink : JournalColors.weak)
                                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            HStack {
                Text("字号")
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)
                Slider(value: $fontSize, in: 28...96, step: 2)
                    .tint(JournalColors.ink)
                    .onChange(of: fontSize) { _, _ in applyChanges() }
                Text("\(Int(fontSize))")
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)
                    .frame(width: 30, alignment: .trailing)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
        .onAppear(perform: loadSelectedLayer)
    }

    private func loadSelectedLayer() {
        guard let layer = selectedLayer else { return }
        text = layer.text ?? ""
        fontId = styleString(layer, key: "fontId") ?? "system"
        colorHex = styleString(layer, key: "color") ?? "#111111"
        backgroundHex = styleString(layer, key: "background") ?? "transparent"
        fontSize = styleNumber(layer, key: "fontSize") ?? 54
    }

    private func applyChanges() {
        guard let layerId,
              let index = draft.layers.firstIndex(where: { $0.id == layerId }) else { return }
        draft.layers[index].text = text
        draft.layers[index].style["fontId"] = .string(fontId)
        draft.layers[index].style["fontLabel"] = .string(fonts.first { $0.0 == fontId }?.1 ?? "系统")
        draft.layers[index].style["color"] = .string(colorHex)
        draft.layers[index].style["background"] = .string(backgroundHex)
        draft.layers[index].style["fontSize"] = .number(fontSize)
        onDraftChanged()
    }

    private var selectedLayer: Layer? {
        guard let layerId else { return nil }
        return draft.layers.first { $0.id == layerId }
    }

    private func styleString(_ layer: Layer, key: String) -> String? {
        if case .string(let value) = layer.style[key] {
            return value
        }
        return nil
    }

    private func styleNumber(_ layer: Layer, key: String) -> Double? {
        if case .number(let value) = layer.style[key] {
            return value
        }
        return nil
    }
}

#Preview {
    EditorView(draft: SampleDrafts.starter)
}
