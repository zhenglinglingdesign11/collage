import PhotosUI
import SwiftUI

struct EditorView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var draft: Draft
    @State private var selectedLayerId: String?
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var saveStatus = L10n.t("editor.status.unsaved")
    @State private var draftStore: DraftStore?
    @State private var imageStore: ImageStore?
    @State private var assetCatalog = AssetPackCatalog(schemaVersion: 1, generatedFrom: "", packs: [])
    @State private var activeSheet: EditorSheet?
    @State private var lineCutStyle: CutStyle = .straight
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
                    onScissors: openScissorsPanel,
                    onEmboss: openEmbossPanel,
                    canEditText: selectedLayer?.type == .text,
                    canCrop: selectedLayer?.type == .image,
                    canScissors: supportsScissors(selectedLayer),
                    canEmboss: supportsEmboss(selectedLayer)
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
                onScissors: openScissorsPanel,
                onEmboss: openEmbossPanel,
                onDecorativeBrush: { activeSheet = .decorativeBrush },
                onImageEffect: { activeSheet = .imageEffect },
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
            L10n.t("editor.leave.title"),
            isPresented: $leaveConfirmationVisible,
            titleVisibility: .visible
        ) {
            Button(L10n.t("editor.leave.save")) {
                saveAndLeave()
            }
            Button(L10n.t("editor.leave.discard"), role: .destructive) {
                discardAndLeave()
            }
            Button(L10n.t("editor.leave.cancel"), role: .cancel) {
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
                .presentationDetents([.large])
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
                EmbossSheet(
                    draft: $draft,
                    layerId: selectedLayerId,
                    onDraftChanged: commitDraftChange,
                    onSelectLayer: { selectedLayerId = $0 },
                    onStatusChanged: { saveStatus = $0 }
                )
                .presentationDetents([.height(420), .medium])
            case .scissors:
                ScissorsSheet(
                    selectedLayer: selectedLayer,
                    onStraightCut: {
                        openLineCutEditor(style: .straight)
                    },
                    onWaveCut: {
                        openLineCutEditor(style: .wave)
                    },
                    onBrushCut: { activeSheet = .brushCut },
                    onSubjectCut: {
                        activeSheet = nil
                        removeSelectedImageBackground()
                    }
                )
                .presentationDetents([.height(330)])
            case .lineCut:
                LineCutEditorSheet(
                    layer: selectedLayer,
                    style: lineCutStyle,
                    onCancel: { activeSheet = nil },
                    onConfirm: { line in
                        confirmLineCut(line: line, style: lineCutStyle)
                        activeSheet = nil
                    }
                )
                .presentationDetents([.large])
            case .brushCut:
                BrushCutSheet(
                    draft: $draft,
                    layerId: selectedLayerId,
                    imageStore: imageStore,
                    onDraftChanged: commitDraftChange,
                    onStatusChanged: { saveStatus = $0 }
                )
                .presentationDetents([.large])
            case .decorativeBrush:
                DecorativeBrushSheet(
                    draft: $draft,
                    onDraftChanged: commitDraftChange,
                    onSelectLayer: { selectedLayerId = $0 },
                    onStatusChanged: { saveStatus = $0 }
                )
                .presentationDetents([.large])
            case .imageEffect:
                ImageEffectSheet(
                    draft: $draft,
                    layerId: selectedLayerId,
                    imageStore: imageStore,
                    onDraftChanged: commitDraftChange,
                    onStatusChanged: { saveStatus = $0 }
                )
                .presentationDetents([.height(430), .medium])
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

            Button(L10n.t("editor.save.button")) {
                saveDraft()
            }
            .font(JournalTypography.bodyStrong)
            .foregroundStyle(JournalColors.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, JournalSpacing.xs)

            Button(L10n.t("editor.export.button")) {
                exportToPhotoLibrary()
            }
            .font(JournalTypography.bodyStrong)
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, JournalSpacing.md)
            .frame(minWidth: 64)
            .frame(height: 36)
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
                    saveStatus = L10n.t("editor.status.restore_success")
                }
            } catch {
                saveStatus = L10n.t("editor.status.restore_failed")
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
                saveStatus = L10n.t("editor.status.photo_store_unready")
                return
            }
            if LivePhotoImporter.isLivePhoto(item) {
                await importLivePhoto(item, imageStore: imageStore)
                return
            }
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let stored = try? imageStore.saveImageData(data) else {
                saveStatus = L10n.t("editor.status.photo_import_failed")
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

    @MainActor
    private func importLivePhoto(_ item: PhotosPickerItem, imageStore: ImageStore) async {
        do {
            let imported = try await LivePhotoImporter.importLivePhoto(from: item, imageStore: imageStore)
            var nextLayer = DraftFactory.makeImageLayer(
                source: imported.stillSource,
                imageSize: imported.size,
                draft: draft
            )
            nextLayer.shadow = true
            nextLayer.style["mediaType"] = .string("livePhoto")
            nextLayer.style["livePhotoStillSource"] = .string(imported.stillSource)
            if let videoSource = imported.videoSource {
                nextLayer.style["livePhotoVideoSource"] = .string(videoSource)
            }
            if let assetIdentifier = imported.assetIdentifier {
                nextLayer.style["livePhotoAssetIdentifier"] = .string(assetIdentifier)
            }
            draft.layers.append(nextLayer)
            selectedLayerId = nextLayer.id
            commitDraftChange()
            saveStatus = imported.videoSource == nil
                ? L10n.t("editor.status.live_photo_video_missing")
                : L10n.t("editor.status.live_photo_imported")
        } catch {
            saveStatus = (error as? LocalizedError)?.errorDescription ?? L10n.t("editor.status.live_photo_failed")
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

    private func openScissorsPanel() {
        guard supportsScissors(selectedLayer) else {
            saveStatus = L10n.t("editor.status.select_cut_layer")
            return
        }
        activeSheet = .scissors
    }

    private func openEmbossPanel() {
        activeSheet = .mask
    }

    private func openLineCutEditor(style: CutStyle) {
        guard supportsScissors(selectedLayer) else {
            saveStatus = L10n.t("editor.status.select_cut_layer")
            return
        }
        lineCutStyle = style
        activeSheet = .lineCut
    }

    private func prepareStraightCut() {
        applyCutStyle(.straight) { layer in
            layer.style[LayerStyleKey.cutLine] = .object([
                "startX": .number(0),
                "startY": .number(layer.height / 2),
                "endX": .number(layer.width),
                "endY": .number(layer.height / 2)
            ])
        }
        saveStatus = L10n.t("editor.status.straight_cut_ready")
    }

    private func prepareWaveCut() {
        applyCutStyle(.wave) { layer in
            layer.style[LayerStyleKey.cutLine] = .object([
                "startX": .number(0),
                "startY": .number(layer.height / 2),
                "endX": .number(layer.width),
                "endY": .number(layer.height / 2)
            ])
            layer.style[LayerStyleKey.waveAmplitude] = .number(18)
            layer.style[LayerStyleKey.waveFrequency] = .number(6)
        }
        saveStatus = L10n.t("editor.status.wave_cut_ready")
    }

    private func applyCutStyle(_ cutStyle: CutStyle, configure: (inout Layer) -> Void) {
        guard let selectedLayerId,
              let index = draft.layers.firstIndex(where: { $0.id == selectedLayerId }) else {
            saveStatus = L10n.t("editor.status.select_cut_layer")
            return
        }
        draft.layers[index].style[LayerStyleKey.cutStyle] = .string(cutStyle.rawValue)
        configure(&draft.layers[index])
        commitDraftChange()
    }

    private func confirmLineCut(line: LayerCutLine, style: CutStyle) {
        guard let selectedLayerId,
              let index = draft.layers.firstIndex(where: { $0.id == selectedLayerId }) else {
            saveStatus = L10n.t("editor.status.select_cut_layer")
            return
        }
        let baseLayer = draft.layers[index]
        guard let pieces = LayerClipPolygon.splitVisiblePolygon(layer: baseLayer, line: line, style: style) else {
            saveStatus = L10n.t("editor.status.line_cut_failed")
            return
        }

        let normal = lineNormal(for: line)
        let radians = CGFloat(baseLayer.rotation) * .pi / 180
        let nudge = CGPoint(
            x: (-normal.dx * cos(radians) + normal.dy * sin(radians)) * 8,
            y: (-normal.dx * sin(radians) - normal.dy * cos(radians)) * 8
        )

        var first = baseLayer
        first.id = "\(baseLayer.type.rawValue)-cut-\(UUID().uuidString)-a"
        first.clipPolygon = pieces[0]
        first.clipPolygons = nil
        first.x += Double(nudge.x)
        first.y += Double(nudge.y)
        first.style[LayerStyleKey.cutStyle] = .string(style.rawValue)
        first.style[LayerStyleKey.cutLine] = line.jsonValue
        if style == .wave {
            first.style[LayerStyleKey.waveAmplitude] = .number(22)
            first.style[LayerStyleKey.waveFrequency] = .number(6)
        }

        var second = baseLayer
        second.id = "\(baseLayer.type.rawValue)-cut-\(UUID().uuidString)-b"
        second.clipPolygon = pieces[1]
        second.clipPolygons = nil
        second.x -= Double(nudge.x)
        second.y -= Double(nudge.y)
        second.style[LayerStyleKey.cutStyle] = .string(style.rawValue)
        second.style[LayerStyleKey.cutLine] = line.jsonValue
        if style == .wave {
            second.style[LayerStyleKey.waveAmplitude] = .number(22)
            second.style[LayerStyleKey.waveFrequency] = .number(6)
        }

        draft.layers.replaceSubrange(index...index, with: [first, second])
        normalizeLayerOrder()
        self.selectedLayerId = second.id
        commitDraftChange()
        saveStatus = style == .wave
            ? L10n.t("editor.status.wave_cut_ready")
            : L10n.t("editor.status.straight_cut_ready")
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
        saveDraft(status: L10n.t("editor.status.undo"))
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
        saveDraft(status: L10n.t("editor.status.redo"))
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
            return L10n.t("editor.leave.prune_message")
        }
        return L10n.t("editor.leave.message")
    }

    private func saveAndLeave() {
        saveDraft(status: L10n.t("editor.status.draft_saved"))
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
            saveStatus = L10n.t("editor.status.draft_failed")
            return
        }
        dismiss()
    }

    private var hasDraftContent: Bool {
        !draft.layers.isEmpty || draft.background != "#fdfdfb" || draft.backgroundPattern != nil || draft.backgroundImage != nil
    }

    private func saveDraft(status: String = L10n.t("editor.status.saved")) {
        do {
            let willPruneOldestDraft = (try draftStore?.willPruneOldestDraft(onSaving: draft)) ?? false
            draft = DraftThumbnailGenerator.draftWithUpdatedThumbnail(draft, imageStore: imageStore)
            try draftStore?.save(draft)
            lastCommittedDraft = draft
            saveStatus = willPruneOldestDraft
                ? L10n.t("editor.status.prune_warning")
                : status
        } catch {
            saveStatus = L10n.t("editor.status.save_failed")
        }
    }

    private func exportToPhotoLibrary() {
        saveDraft()
        saveStatus = L10n.t("editor.status.exporting")
        Task { @MainActor in
            do {
                let outcome = try await LivePhotoExporter.export(draft: draft, imageStore: imageStore)
                switch outcome {
                case .staticImage:
                    saveStatus = L10n.t("editor.status.export_success")
                case .livePhoto:
                    saveStatus = L10n.t("editor.status.live_photo_export_success")
                case .video:
                    saveStatus = L10n.t("editor.status.video_export_success")
                case .staticFallback:
                    saveStatus = L10n.t("editor.status.live_photo_static_fallback")
                }
            } catch {
                saveStatus = (error as? LocalizedError)?.errorDescription ?? L10n.t("editor.status.export_failed")
            }
        }
    }

    private func removeSelectedImageBackground() {
        guard let layer = selectedLayer,
              layer.type == .image,
              let source = layer.source,
              let imageStore,
              let fileURL = ImageSourceResolver.url(for: source, imageStore: imageStore) else {
            saveStatus = L10n.t("editor.status.no_image")
            return
        }
        let layerId = layer.id
        saveStatus = L10n.t("editor.status.subject_cutting")
        Task { @MainActor in
            do {
                let data = try await RembgService().removeImageBackground(fileURL: fileURL)
                let stored = try imageStore.savePNGImageData(data)
                guard let index = draft.layers.firstIndex(where: { $0.id == layerId }) else {
                    saveStatus = L10n.t("editor.status.no_image")
                    return
                }
                draft.layers[index].source = stored.source
                draft.layers[index].sourceWidth = stored.size.width
                draft.layers[index].sourceHeight = stored.size.height
                draft.layers[index].style[LayerStyleKey.cutStyle] = .string(CutStyle.subject.rawValue)
                draft.layers[index].style[LayerStyleKey.subjectCut] = .bool(true)
                commitDraftChange()
                saveStatus = L10n.t("editor.status.subject_done")
            } catch {
                saveStatus = (error as? LocalizedError)?.errorDescription ?? L10n.t("editor.status.subject_failed")
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

    private func supportsEmboss(_ layer: Layer?) -> Bool {
        guard let layer else { return false }
        switch layer.type {
        case .image, .sticker, .paper, .cut:
            return true
        case .text, .tape, .brush:
            return false
        }
    }

    private func supportsScissors(_ layer: Layer?) -> Bool {
        guard let layer else { return false }
        switch layer.type {
        case .image, .sticker, .paper:
            return true
        case .text, .tape, .cut, .brush:
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
    case scissors
    case lineCut
    case brushCut
    case decorativeBrush
    case imageEffect
    case exportPreview

    var id: String { rawValue }
}

private struct EditorToolbar: View {
    @Binding var selectedPhotoItem: PhotosPickerItem?
    let onAddAsset: () -> Void
    let onAddTape: () -> Void
    let onAddBackground: () -> Void
    let onAddText: () -> Void
    let onScissors: () -> Void
    let onEmboss: () -> Void
    let onDecorativeBrush: () -> Void
    let onImageEffect: () -> Void
    let onChangeRatio: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
            PhotosPicker(selection: $selectedPhotoItem, matching: .any(of: [.images, .livePhotos])) {
                ToolItem(systemName: "photo", label: L10n.t("editor.toolbar.photo"))
            }
            .buttonStyle(.plain)

            Button(action: onAddAsset) {
                ToolItem(systemName: "square.grid.2x2", label: L10n.t("editor.toolbar.asset"))
            }
            .buttonStyle(.plain)

            Button(action: onAddTape) {
                ToolItem(systemName: "rectangle.fill.on.rectangle.fill", label: L10n.t("editor.toolbar.tape"))
            }
            .buttonStyle(.plain)

            Button(action: onAddBackground) {
                ToolItem(systemName: "square.dotted", label: L10n.t("editor.toolbar.background"))
            }
            .buttonStyle(.plain)

            Button(action: onAddText) {
                ToolItem(systemName: "textformat", label: L10n.t("editor.toolbar.text"))
            }
            .buttonStyle(.plain)

            Button(action: onScissors) {
                ToolItem(systemName: "scissors", label: L10n.t("editor.toolbar.scissors"))
            }
            .buttonStyle(.plain)

            Button(action: onEmboss) {
                ToolItem(systemName: "seal", label: L10n.t("editor.toolbar.emboss"))
            }
            .buttonStyle(.plain)

            Button(action: onDecorativeBrush) {
                ToolItem(systemName: "paintbrush.pointed", label: L10n.t("editor.toolbar.brush"))
            }
            .buttonStyle(.plain)

            Button(action: onImageEffect) {
                ToolItem(systemName: "camera.filters", label: L10n.t("editor.toolbar.image_effect"))
            }
            .buttonStyle(.plain)

            Button(action: onChangeRatio) {
                ToolItem(systemName: "rectangle.3.group", label: L10n.t("editor.toolbar.ratio"))
            }
            .buttonStyle(.plain)
            }
            .frame(minWidth: 660)
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
    let onScissors: () -> Void
    let onEmboss: () -> Void
    let canEditText: Bool
    let canCrop: Bool
    let canScissors: Bool
    let canEmboss: Bool

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
            Button(action: onMoveDown) {
                ToolItem(systemName: "square.2.layers.3d.bottom.filled", label: L10n.t("layer.action.down"))
            }
            Button(action: onMoveUp) {
                ToolItem(systemName: "square.2.layers.3d.top.filled", label: L10n.t("layer.action.up"))
            }
            Button(action: onCopy) {
                ToolItem(systemName: "doc.on.doc", label: L10n.t("layer.action.copy"))
            }
            Button(action: onDelete) {
                ToolItem(systemName: "trash", label: L10n.t("layer.action.delete"))
            }
            Button(action: onEffects) {
                ToolItem(systemName: "slider.horizontal.3", label: L10n.t("layer.action.effects"))
            }
            if canCrop {
                Button(action: onCrop) {
                    ToolItem(systemName: "crop", label: L10n.t("layer.action.crop"))
                }
            }
            if canScissors {
                Button(action: onScissors) {
                    ToolItem(systemName: "scissors", label: L10n.t("layer.action.scissors"))
                }
            }
            if canEmboss {
                Button(action: onEmboss) {
                    ToolItem(systemName: "seal", label: L10n.t("layer.action.emboss"))
                }
            }
            if canEditText {
                Button(action: onEditText) {
                    ToolItem(systemName: "text.cursor", label: L10n.t("layer.action.edit"))
                }
            }
            }
            .frame(minWidth: 560)
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
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundStyle(JournalColors.ink)
        .frame(maxWidth: .infinity)
    }
}

private struct ScissorsSheet: View {
    let selectedLayer: Layer?
    let onStraightCut: () -> Void
    let onWaveCut: () -> Void
    let onBrushCut: () -> Void
    let onSubjectCut: () -> Void

    private var canUseImageOnlyTools: Bool {
        selectedLayer?.type == .image
    }

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            Text(L10n.t("editor.sheet.scissors.title"))
                .font(JournalTypography.sectionTitle)
                .foregroundStyle(JournalColors.ink)

            VStack(spacing: JournalSpacing.sm) {
                ScissorsOptionButton(
                    systemName: "line.diagonal",
                    title: L10n.t("editor.scissors.straight"),
                    detail: L10n.t("editor.scissors.straight.detail"),
                    action: onStraightCut
                )
                ScissorsOptionButton(
                    systemName: "waveform.path",
                    title: L10n.t("editor.scissors.wave"),
                    detail: L10n.t("editor.scissors.wave.detail"),
                    action: onWaveCut
                )
                ScissorsOptionButton(
                    systemName: "scribble",
                    title: L10n.t("editor.scissors.brush"),
                    detail: L10n.t("editor.scissors.brush.detail"),
                    action: onBrushCut,
                    isEnabled: canUseImageOnlyTools
                )
                ScissorsOptionButton(
                    systemName: "person.crop.rectangle",
                    title: L10n.t("editor.scissors.subject"),
                    detail: L10n.t("editor.scissors.subject.detail"),
                    action: onSubjectCut,
                    isEnabled: canUseImageOnlyTools
                )
            }

            Text(L10n.t("editor.scissors.note"))
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
    }
}

private struct ScissorsOptionButton: View {
    let systemName: String
    let title: String
    let detail: String
    let action: () -> Void
    var isEnabled = true

    var body: some View {
        Button(action: action) {
            HStack(spacing: JournalSpacing.md) {
                Image(systemName: systemName)
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(JournalTypography.bodyStrong)
                    Text(detail)
                        .font(JournalTypography.caption)
                        .foregroundStyle(JournalColors.textSecondary)
                }
                Spacer()
            }
            .foregroundStyle(isEnabled ? JournalColors.ink : JournalColors.textTertiary)
            .padding(JournalSpacing.sm)
            .background(JournalColors.weak)
            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }
}

private struct LineCutEditorSheet: View {
    let layer: Layer?
    let style: CutStyle
    let onCancel: () -> Void
    let onConfirm: (LayerCutLine) -> Void

    @State private var line: LayerCutLine?
    @State private var activeHandle: LineCutHandle?

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            HStack {
                Button(L10n.t("editor.sheet.line_cut.cancel")) {
                    onCancel()
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)

                Spacer()

                Text(style == .wave ? L10n.t("editor.scissors.wave") : L10n.t("editor.scissors.straight"))
                    .font(JournalTypography.sectionTitle)
                    .foregroundStyle(JournalColors.ink)

                Spacer()

                Button(L10n.t("editor.sheet.line_cut.done")) {
                    if let line {
                        onConfirm(line)
                    }
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(line == nil ? JournalColors.textTertiary : JournalColors.ink)
                .disabled(line == nil)
            }

            GeometryReader { proxy in
                let preview = previewSize(container: proxy.size)
                ZStack {
                    RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                        .fill(JournalColors.weak)
                        .overlay(
                            LayerClipPolygonShape(layer: previewLayer)
                                .fill(JournalColors.paperBeige)
                        )
                        .overlay(lineOverlay(size: preview))
                        .overlay(
                            RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                                .stroke(JournalColors.border)
                        )
                        .frame(width: preview.width, height: preview.height)
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    updateLine(location: value.location, preview: preview)
                                }
                                .onEnded { _ in
                                    activeHandle = nil
                                }
                        )
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(height: 360)

            Text(L10n.t("editor.sheet.line_cut.help"))
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
        .onAppear {
            if line == nil, let layer {
                line = defaultLine(for: layer)
            }
        }
    }

    private var previewLayer: Layer {
        guard let layer else {
            return Layer(type: .image, x: 0, y: 0, width: 1, height: 1)
        }
        return layer
    }

    private func lineOverlay(size: CGSize) -> some View {
        Canvas { context, canvasSize in
            guard let layer, let line else { return }
            let start = map(line.startPoint, layer: layer, size: canvasSize)
            let end = map(line.endPoint, layer: layer, size: canvasSize)
            var path = Path()
            if style == .wave {
                let points = wavePreviewPoints(start: start, end: end, size: canvasSize)
                if let first = points.first {
                    path.move(to: first)
                    points.dropFirst().forEach { path.addLine(to: $0) }
                }
            } else {
                path.move(to: start)
                path.addLine(to: end)
            }
            context.stroke(path, with: .color(JournalColors.stampRed), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            drawHandle(at: start, context: &context)
            drawHandle(at: end, context: &context)
        }
        .frame(width: size.width, height: size.height)
    }

    private func drawHandle(at point: CGPoint, context: inout GraphicsContext) {
        let rect = CGRect(x: point.x - 11, y: point.y - 11, width: 22, height: 22)
        context.fill(Path(ellipseIn: rect), with: .color(Color.white))
        context.stroke(Path(ellipseIn: rect), with: .color(JournalColors.ink), lineWidth: 2)
    }

    private func updateLine(location: CGPoint, preview: CGSize) {
        guard let layer else { return }
        var next = line ?? defaultLine(for: layer)
        let local = unmap(location, layer: layer, size: preview)
        let handle = activeHandle ?? nearestHandle(to: local, line: next)
        activeHandle = handle
        switch handle {
        case .start:
            next.startX = clamp(local.x, min: 0, max: layer.width)
            next.startY = clamp(local.y, min: 0, max: layer.height)
        case .end:
            next.endX = clamp(local.x, min: 0, max: layer.width)
            next.endY = clamp(local.y, min: 0, max: layer.height)
        }
        line = next
    }

    private func nearestHandle(to point: BrushPoint, line: LayerCutLine) -> LineCutHandle {
        let startDistance = hypot(point.x - line.startX, point.y - line.startY)
        let endDistance = hypot(point.x - line.endX, point.y - line.endY)
        return startDistance <= endDistance ? .start : .end
    }

    private func previewSize(container: CGSize) -> CGSize {
        guard let layer else { return CGSize(width: 1, height: 1) }
        let scale = min(container.width / max(1, CGFloat(layer.width)), container.height / max(1, CGFloat(layer.height)))
        return CGSize(width: CGFloat(layer.width) * scale, height: CGFloat(layer.height) * scale)
    }

    private func map(_ point: BrushPoint, layer: Layer, size: CGSize) -> CGPoint {
        CGPoint(
            x: CGFloat(point.x / max(1, layer.width)) * size.width,
            y: CGFloat(point.y / max(1, layer.height)) * size.height
        )
    }

    private func unmap(_ point: CGPoint, layer: Layer, size: CGSize) -> BrushPoint {
        BrushPoint(
            x: Double(point.x / max(1, size.width)) * layer.width,
            y: Double(point.y / max(1, size.height)) * layer.height
        )
    }

    private func defaultLine(for layer: Layer) -> LayerCutLine {
        let bounds = visibleBounds(for: layer)
        return LayerCutLine(
            startX: bounds.minX + bounds.width * 0.16,
            startY: bounds.midY,
            endX: bounds.minX + bounds.width * 0.84,
            endY: bounds.midY
        )
    }

    private func visibleBounds(for layer: Layer) -> CGRect {
        guard let polygon = LayerClipPolygon.visiblePolygon(for: layer) else {
            return CGRect(x: 0, y: 0, width: CGFloat(layer.width), height: CGFloat(layer.height))
        }
        let xs = polygon.map(\.x)
        let ys = polygon.map(\.y)
        let minX = xs.min() ?? 0
        let maxX = xs.max() ?? layer.width
        let minY = ys.min() ?? 0
        let maxY = ys.max() ?? layer.height
        return CGRect(
            x: CGFloat(minX),
            y: CGFloat(minY),
            width: CGFloat(max(1, maxX - minX)),
            height: CGFloat(max(1, maxY - minY))
        )
    }

    private func wavePreviewPoints(start: CGPoint, end: CGPoint, size: CGSize) -> [CGPoint] {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let length = max(1, hypot(dx, dy))
        let unit = CGVector(dx: dx / length, dy: dy / length)
        let normal = CGVector(dx: -unit.dy, dy: unit.dx)
        let amplitude = min(22, max(10, min(size.width, size.height) * 0.08))
        let wavelength = max(36, min(76, max(36, length * 0.55)))
        let samples = max(18, Int(length / 8))
        return (0...samples).map { index in
            let t = CGFloat(index) / CGFloat(samples)
            let base = CGPoint(x: start.x + dx * t, y: start.y + dy * t)
            let wave = sin(t * length / wavelength * .pi * 2) * amplitude
            return CGPoint(x: base.x + normal.dx * wave, y: base.y + normal.dy * wave)
        }
    }

    private func clamp(_ value: Double, min: Double, max: Double) -> Double {
        Swift.max(min, Swift.min(max, value))
    }
}

private enum LineCutHandle {
    case start
    case end
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
                Text(L10n.t("editor.sheet.brush.title"))
                    .font(JournalTypography.sectionTitle)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .foregroundStyle(JournalColors.ink)
                Spacer()
                Button(L10n.t("editor.sheet.brush.redraw")) {
                    strokes = []
                    currentStroke = []
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
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

            Text(L10n.t("editor.sheet.brush.help"))
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            JournalPrimaryButton(title: L10n.t("editor.sheet.brush.save"), systemName: "checkmark") {
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
            onStatusChanged(L10n.t("editor.status.photo_store_unready"))
            return
        }
        guard let layerId,
              let index = draft.layers.firstIndex(where: { $0.id == layerId }) else {
            onStatusChanged(L10n.t("editor.status.no_image"))
            return
        }
        let normalized = BrushMaskRenderer.normalizedStrokes(from: strokes, drawingSize: drawingSize)
        guard !normalized.isEmpty else {
            onStatusChanged(L10n.t("editor.status.brush_empty"))
            return
        }

        do {
            let image = BrushMaskRenderer.renderMask(strokes: normalized, size: maskPixelSize)
            let source = try imageStore.saveMaskImage(image)
            draft.layers[index].style[LayerStyleKey.cutStyle] = .string(CutStyle.brush.rawValue)
            draft.layers[index].style[LayerStyleKey.maskSource] = .string(source)
            draft.layers[index].style[LayerStyleKey.brushPath] = BrushMaskRenderer.jsonValue(from: normalized)
            onDraftChanged()
            onStatusChanged(L10n.t("editor.status.brush_saved"))
        } catch {
            onStatusChanged(L10n.t("editor.status.brush_failed"))
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

private struct EmbossSheet: View {
    @Environment(\.dismiss) private var dismiss

    @Binding var draft: Draft
    let layerId: String?
    let onDraftChanged: () -> Void
    let onSelectLayer: (String?) -> Void
    let onStatusChanged: (String) -> Void

    @State private var selectedShape: LayerMaskShape = .circle
    @State private var selectedMode: EmbossMode = .mask
    @State private var draftSnapshot: Draft?
    @State private var editingLayerId: String?

    private var availableShapes: [LayerMaskShape] {
        LayerMaskShape.allCases.filter { $0 != .none }
    }

    private var availableModes: [EmbossMode] {
        layerId == nil ? [.fill] : EmbossMode.allCases
    }

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            HStack {
                Button(L10n.t("editor.sheet.emboss.cancel")) {
                    cancel()
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.textSecondary)

                Spacer()

                Text(L10n.t("editor.sheet.emboss.title"))
                    .font(JournalTypography.sectionTitle)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .foregroundStyle(JournalColors.ink)

                Spacer()

                Button(L10n.t("editor.sheet.emboss.done")) {
                    confirm()
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)
            }

            Picker(L10n.t("editor.emboss.mode"), selection: $selectedMode) {
                ForEach(availableModes) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: selectedMode) { _, _ in
                previewEmboss()
            }

            EmbossPreviewCard(shape: selectedShape, mode: selectedMode, hasLayerTarget: layerId != nil)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: JournalSpacing.sm) {
                ForEach(availableShapes) { shape in
                    Button {
                        selectedShape = shape
                        previewEmboss()
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

            Text(L10n.t(layerId == nil ? "editor.emboss.add_note" : "editor.emboss.layer_note"))
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
        .onAppear(perform: startEditing)
    }

    private func startEditing() {
        guard draftSnapshot == nil else { return }
        draftSnapshot = draft
        editingLayerId = layerId

        guard let layer = selectedLayer else {
            selectedShape = .circle
            selectedMode = .fill
            previewEmboss()
            return
        }
        if let mode = layer.embossMode {
            selectedMode = mode == .fill ? .mask : mode
        } else {
            selectedMode = .mask
        }
        if case .string(let value)? = layer.style[LayerStyleKey.embossShape],
           let shape = LayerMaskShape(rawValue: value) {
            selectedShape = shape
        } else if case .string(let value)? = layer.style[LayerStyleKey.maskShape],
                  let shape = LayerMaskShape(rawValue: value) {
            selectedShape = shape
        } else if case .string(let value)? = layer.style[LayerStyleKey.excludeShape],
                  let shape = LayerMaskShape(rawValue: value) {
            selectedShape = shape
        }
        previewEmboss()
    }

    private func previewEmboss() {
        if let editingLayerId,
           let index = draft.layers.firstIndex(where: { $0.id == editingLayerId }) {
            applyEmboss(shape: selectedShape, mode: selectedMode, to: &draft.layers[index])
        } else if layerId == nil {
            var layer = DraftFactory.makeEmbossShapeLayer(shape: selectedShape, draft: draft)
            applyEmboss(shape: selectedShape, mode: .fill, to: &layer)
            draft.layers.append(layer)
            editingLayerId = layer.id
        }
    }

    private func confirm() {
        previewEmboss()
        onDraftChanged()
        onSelectLayer(editingLayerId)
        onStatusChanged(L10n.t("editor.status.emboss_done"))
        dismiss()
    }

    private func cancel() {
        if let draftSnapshot {
            draft = draftSnapshot
        }
        onStatusChanged(L10n.t("editor.status.emboss_cancelled"))
        dismiss()
    }

    private func applyEmboss(shape: LayerMaskShape, mode: EmbossMode, to layer: inout Layer) {
        layer.style[LayerStyleKey.embossMode] = .string(mode.rawValue)
        layer.style[LayerStyleKey.embossShape] = .string(shape.rawValue)
        switch mode {
        case .fill:
            layer.style[LayerStyleKey.maskShape] = .string(shape.rawValue)
            layer.style.removeValue(forKey: LayerStyleKey.excludeShape)
            layer.shadow = true
            if layer.type == .cut {
                layer.style["color"] = layer.style["color"] ?? .string("#efe7d8")
            }
        case .mask:
            layer.style[LayerStyleKey.maskShape] = .string(shape.rawValue)
            layer.style.removeValue(forKey: LayerStyleKey.excludeShape)
        case .exclude:
            layer.style[LayerStyleKey.excludeShape] = .string(shape.rawValue)
            layer.style.removeValue(forKey: LayerStyleKey.maskShape)
        }
    }

    private var selectedLayer: Layer? {
        guard let layerId else { return nil }
        return draft.layers.first { $0.id == layerId }
    }
}

private struct EmbossPreviewCard: View {
    let shape: LayerMaskShape
    let mode: EmbossMode
    let hasLayerTarget: Bool

    var body: some View {
        HStack(spacing: JournalSpacing.md) {
            ZStack {
                RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous)
                    .fill(JournalColors.paper)
                LayerMaskView(shape: shape, cornerRadius: 10)
                    .foregroundStyle(mode == .exclude ? JournalColors.stampRed.opacity(0.18) : JournalColors.paperBeige)
                    .shadow(color: .black.opacity(0.10), radius: 5, x: 0, y: 3)
                    .frame(width: 58, height: 58)
            }
            .frame(width: 76, height: 76)

            VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                Text(mode.label)
                    .font(JournalTypography.bodyStrong)
                    .foregroundStyle(JournalColors.ink)
                Text(L10n.t(hasLayerTarget ? "editor.emboss.preview.layer" : "editor.emboss.preview.shape"))
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(JournalSpacing.sm)
        .background(JournalColors.weak)
        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
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
                Button(L10n.t("editor.sheet.crop.cancel")) {
                    dismiss()
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.textSecondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

                Spacer()

                Text(L10n.t("editor.sheet.crop.title"))
                    .font(JournalTypography.sectionTitle)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .foregroundStyle(JournalColors.ink)

                Spacer()

                Button(L10n.t("editor.sheet.crop.done")) {
                    confirmCrop()
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
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
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
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
                Label(L10n.t("editor.sheet.crop.restore"), systemImage: "arrow.counterclockwise")
                    .font(JournalTypography.bodyStrong)
                    .foregroundStyle(JournalColors.ink)
                    .frame(maxWidth: .infinity)
                    .frame(height: 42)
                    .background(JournalColors.weak)
                    .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
            }
            .buttonStyle(.plain)

            Text(L10n.t("editor.sheet.crop.help"))
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

private struct DecorativeBrushSheet: View {
    @Binding var draft: Draft
    let onDraftChanged: () -> Void
    let onSelectLayer: (String) -> Void
    let onStatusChanged: (String) -> Void

    @State private var brushType: BrushType = .line
    @State private var brushColor = "#111111"
    @State private var brushSize = 10.0
    @State private var strokes: [BrushStroke] = []
    @State private var currentPoints: [BrushPoint] = []

    private let brushTypes: [(BrushType, String, String)] = [
        (.line, "editor.brush.type.line", "pencil.line"),
        (.stitch, "editor.brush.type.stitch", "scribble.variable"),
        (.knit, "editor.brush.type.knit", "point.3.connected.trianglepath.dotted"),
        (.bead, "editor.brush.type.bead", "circle.grid.cross"),
        (.lace, "editor.brush.type.lace", "sparkles"),
        (.bow, "editor.brush.type.bow", "gift")
    ]
    private let colors = ["#111111", "#ffffff", "#d94a38", "#f4d77a", "#9ec7df", "#8c9a8d"]
    private let sizes = [5.0, 10.0, 18.0]

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            HStack {
                Text(L10n.t("editor.sheet.decorative_brush.title"))
                    .font(JournalTypography.sectionTitle)
                    .foregroundStyle(JournalColors.ink)
                Spacer()
                Button(L10n.t("editor.sheet.decorative_brush.undo")) {
                    if !strokes.isEmpty {
                        strokes.removeLast()
                    }
                }
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.ink)
                Button(L10n.t("editor.sheet.decorative_brush.done")) {
                    confirm()
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(strokes.isEmpty ? JournalColors.textTertiary : JournalColors.ink)
                .disabled(strokes.isEmpty)
            }

            GeometryReader { proxy in
                let preview = previewRect(container: proxy.size)
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                        .fill(color(from: draft.background) ?? JournalColors.paper)
                        .frame(width: preview.width, height: preview.height)
                        .overlay(
                            LayerBrushView(layer: previewLayer)
                                .frame(width: preview.width, height: preview.height)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                                .stroke(JournalColors.border)
                        )
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    appendPoint(value.location, previewSize: preview)
                                }
                                .onEnded { _ in
                                    finishStroke()
                                }
                        )
                        .position(x: proxy.size.width / 2, y: preview.height / 2)
                }
            }
            .frame(height: 270)

            brushTypePicker
            brushColorPicker
            brushSizePicker

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
    }

    private var brushTypePicker: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 82), spacing: JournalSpacing.xs)], spacing: JournalSpacing.xs) {
            ForEach(brushTypes, id: \.0) { item in
                Button {
                    brushType = item.0
                } label: {
                    HStack(spacing: JournalSpacing.xs) {
                        Image(systemName: item.2)
                        Text(L10n.t(item.1))
                    }
                    .font(JournalTypography.tiny)
                    .foregroundStyle(brushType == item.0 ? Color.white : JournalColors.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity)
                    .frame(height: 34)
                    .background(brushType == item.0 ? JournalColors.ink : JournalColors.weak)
                    .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var brushColorPicker: some View {
        HStack(spacing: JournalSpacing.sm) {
            ForEach(colors, id: \.self) { hex in
                Button {
                    brushColor = hex
                } label: {
                    Circle()
                        .fill(Color(hexString: hex) ?? JournalColors.ink)
                        .frame(width: 30, height: 30)
                        .overlay(Circle().stroke(brushColor == hex ? JournalColors.ink : JournalColors.border, lineWidth: brushColor == hex ? 2 : 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var brushSizePicker: some View {
        HStack(spacing: JournalSpacing.sm) {
            ForEach(sizes, id: \.self) { size in
                Button {
                    brushSize = size
                } label: {
                    Text(sizeLabel(size))
                        .font(JournalTypography.caption)
                        .foregroundStyle(brushSize == size ? Color.white : JournalColors.ink)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .background(brushSize == size ? JournalColors.ink : JournalColors.weak)
                        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var previewLayer: Layer {
        Layer(
            type: .brush,
            x: 0,
            y: 0,
            width: draft.width,
            height: draft.height,
            brushWidth: draft.width,
            brushHeight: draft.height,
            strokes: strokes + currentStrokePreview
        )
    }

    private var currentStrokePreview: [BrushStroke] {
        guard !currentPoints.isEmpty else { return [] }
        return [BrushStroke(type: brushType, stampSource: stampSource, color: brushColor, size: brushSize, points: currentPoints)]
    }

    private var stampSource: String? {
        brushType == .bow ? "/assets/brushes/bow-brush.png" : nil
    }

    private func appendPoint(_ location: CGPoint, previewSize: CGSize) {
        let clampedX = min(max(0, location.x), previewSize.width)
        let clampedY = min(max(0, location.y), previewSize.height)
        let point = BrushPoint(
            x: Double(clampedX / previewSize.width) * draft.width,
            y: Double(clampedY / previewSize.height) * draft.height
        )
        if let last = currentPoints.last {
            let dx = point.x - last.x
            let dy = point.y - last.y
            guard hypot(dx, dy) >= 1.6 else { return }
        }
        currentPoints.append(point)
    }

    private func finishStroke() {
        guard let first = currentPoints.first else { return }
        if currentPoints.count == 1 {
            currentPoints.append(BrushPoint(x: first.x + 0.5, y: first.y + 0.5))
        }
        strokes.append(BrushStroke(type: brushType, stampSource: stampSource, color: brushColor, size: brushSize, points: currentPoints))
        currentPoints = []
    }

    private func confirm() {
        guard !strokes.isEmpty else {
            onStatusChanged(L10n.t("editor.status.decorative_brush_empty"))
            return
        }
        let layer = DraftFactory.makeBrushLayer(strokes: strokes, draft: draft)
        draft.layers.append(layer)
        onSelectLayer(layer.id)
        onDraftChanged()
        onStatusChanged(L10n.t("editor.status.decorative_brush_done"))
    }

    private func previewRect(container: CGSize) -> CGSize {
        let maxWidth = container.width
        let maxHeight = container.height
        let scale = min(maxWidth / CGFloat(draft.width), maxHeight / CGFloat(draft.height))
        return CGSize(width: CGFloat(draft.width) * scale, height: CGFloat(draft.height) * scale)
    }

    private func color(from hex: String) -> Color? {
        Color(hexString: hex)
    }

    private func sizeLabel(_ size: Double) -> String {
        switch size {
        case 5:
            return L10n.t("editor.brush.size.thin")
        case 18:
            return L10n.t("editor.brush.size.thick")
        default:
            return L10n.t("editor.brush.size.medium")
        }
    }
}

private struct ImageEffectSheet: View {
    @Binding var draft: Draft
    let layerId: String?
    let imageStore: ImageStore?
    let onDraftChanged: () -> Void
    let onStatusChanged: (String) -> Void

    @State private var effectType: ImageEffectType = .crossStitch
    @State private var crossStitchGrid = 72.0
    @State private var crossStitchColors = 8.0
    @State private var crossStitchStyle = "stitch"
    @State private var matisseDetail = 64.0
    @State private var matissePalette = "vivid"
    @State private var botanicalTone = "blueprint"
    @State private var botanicalDetail = "medium"
    @State private var isGenerating = false

    private let effectTypes: [(ImageEffectType, String, String)] = [
        (.crossStitch, "editor.image_effect.cross_stitch", "grid"),
        (.matisse, "editor.image_effect.matisse", "scissors"),
        (.botanical, "editor.image_effect.botanical", "leaf")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            HStack {
                Text(L10n.t("editor.sheet.image_effect.title"))
                    .font(JournalTypography.sectionTitle)
                    .foregroundStyle(JournalColors.ink)
                Spacer()
                Button(L10n.t("editor.sheet.image_effect.apply")) {
                    applyEffect()
                }
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(canApply && !isGenerating ? JournalColors.ink : JournalColors.textTertiary)
                .disabled(!canApply || isGenerating)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: JournalSpacing.xs)], spacing: JournalSpacing.xs) {
                ForEach(effectTypes, id: \.0) { item in
                    Button {
                        effectType = item.0
                    } label: {
                        HStack(spacing: JournalSpacing.xs) {
                            Image(systemName: item.2)
                            Text(L10n.t(item.1))
                        }
                        .font(JournalTypography.caption)
                        .foregroundStyle(effectType == item.0 ? Color.white : JournalColors.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background(effectType == item.0 ? JournalColors.ink : JournalColors.weak)
                        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }

            switch effectType {
            case .crossStitch:
                segmentedOptions(
                    title: L10n.t("editor.image_effect.grid"),
                    selection: $crossStitchGrid,
                    options: [(48, "editor.image_effect.coarse"), (72, "editor.image_effect.medium"), (104, "editor.image_effect.fine")]
                )
                segmentedOptions(
                    title: L10n.t("editor.image_effect.colors"),
                    selection: $crossStitchColors,
                    options: [(4, "editor.image_effect.four_colors"), (8, "editor.image_effect.eight_colors"), (12, "editor.image_effect.twelve_colors")]
                )
                segmentedOptions(
                    title: L10n.t("editor.image_effect.style"),
                    selection: $crossStitchStyle,
                    options: [("stitch", "editor.image_effect.stitch"), ("pixel", "editor.image_effect.pixel"), ("mixed", "editor.image_effect.mixed")]
                )
            case .matisse:
                segmentedOptions(
                    title: L10n.t("editor.image_effect.detail"),
                    selection: $matisseDetail,
                    options: [(44, "editor.image_effect.simple"), (64, "editor.image_effect.medium"), (86, "editor.image_effect.fine")]
                )
                segmentedOptions(
                    title: L10n.t("editor.image_effect.palette"),
                    selection: $matissePalette,
                    options: [("vivid", "editor.image_effect.vivid"), ("earth", "editor.image_effect.earth"), ("soft", "editor.image_effect.soft")]
                )
            case .botanical:
                segmentedOptions(
                    title: L10n.t("editor.image_effect.tone"),
                    selection: $botanicalTone,
                    options: [("blueprint", "editor.image_effect.blueprint"), ("sage", "editor.image_effect.sage"), ("sepia", "editor.image_effect.sepia")]
                )
                segmentedOptions(
                    title: L10n.t("editor.image_effect.detail"),
                    selection: $botanicalDetail,
                    options: [("soft", "editor.image_effect.soft"), ("medium", "editor.image_effect.medium"), ("etched", "editor.image_effect.etched")]
                )
            }

            Text(L10n.t("editor.sheet.image_effect.note"))
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            if isGenerating {
                ProgressView(L10n.t("editor.status.image_effect_generating"))
                    .font(JournalTypography.caption)
                    .tint(JournalColors.ink)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
        .onAppear(perform: loadSelectedEffect)
    }

    private var canApply: Bool {
        guard let layerId,
              let layer = draft.layers.first(where: { $0.id == layerId }) else { return false }
        return layer.type == .image
    }

    private func segmentedOptions<Value: Hashable>(
        title: String,
        selection: Binding<Value>,
        options: [(Value, String)]
    ) -> some View {
        VStack(alignment: .leading, spacing: JournalSpacing.xs) {
            Text(title)
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)
            HStack(spacing: JournalSpacing.xs) {
                ForEach(options, id: \.0) { option in
                    Button {
                        selection.wrappedValue = option.0
                    } label: {
                        Text(L10n.t(option.1))
                            .font(JournalTypography.caption)
                            .foregroundStyle(selection.wrappedValue == option.0 ? Color.white : JournalColors.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                            .frame(maxWidth: .infinity)
                            .frame(height: 34)
                            .background(selection.wrappedValue == option.0 ? JournalColors.ink : JournalColors.weak)
                            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func loadSelectedEffect() {
        guard let layerId,
              let layer = draft.layers.first(where: { $0.id == layerId }),
              let effect = layer.effect else { return }
        effectType = effect.type
        if case .number(let value)? = effect.options["grid"] {
            crossStitchGrid = value
        }
        if case .number(let value)? = effect.options["colors"] {
            crossStitchColors = value
        }
        if case .number(let value)? = effect.options["detail"] {
            matisseDetail = value
        }
        if case .string(let value)? = effect.options["style"] {
            crossStitchStyle = value
        }
        if case .string(let value)? = effect.options["palette"] {
            matissePalette = value
        }
        if case .string(let value)? = effect.options["tone"] {
            botanicalTone = value
        }
        if case .string(let value)? = effect.options["detail"] {
            botanicalDetail = value
        }
    }

    private func applyEffect() {
        guard let layerId,
              let index = draft.layers.firstIndex(where: { $0.id == layerId }),
              draft.layers[index].type == .image else {
            onStatusChanged(L10n.t("editor.status.image_effect_select_image"))
            return
        }
        guard let imageStore else {
            onStatusChanged(L10n.t("editor.status.photo_store_unready"))
            return
        }

        var effectLayer = draft.layers[index]
        let effect = LayerImageEffect(type: effectType, options: options, createdAt: String(Int(Date().timeIntervalSince1970 * 1000)))
        effectLayer.effect = effect
        isGenerating = true
        onStatusChanged(L10n.t("editor.status.image_effect_generating"))

        Task { @MainActor in
            do {
                let result = try ImageEffectGenerator.render(layer: effectLayer, imageStore: imageStore)
                guard let data = result.image.pngData() else {
                    throw ImageEffectGeneratorError.renderFailed
                }
                let stored = try imageStore.savePNGImageData(data)
                guard let currentIndex = draft.layers.firstIndex(where: { $0.id == layerId }) else {
                    onStatusChanged(L10n.t("editor.status.image_effect_select_image"))
                    isGenerating = false
                    return
                }
                draft.layers[currentIndex].source = stored.source
                draft.layers[currentIndex].sourceWidth = result.size.width
                draft.layers[currentIndex].sourceHeight = result.size.height
                draft.layers[currentIndex].crop = nil
                draft.layers[currentIndex].effect = effect
                draft.layers[currentIndex].style[LayerStyleKey.imageEffectType] = .string(effectType.rawValue)
                onDraftChanged()
                onStatusChanged(L10n.t("editor.status.image_effect_done"))
            } catch {
                onStatusChanged((error as? LocalizedError)?.errorDescription ?? L10n.t("editor.status.image_effect_failed"))
            }
            isGenerating = false
        }
    }

    private var options: [String: JSONValue] {
        switch effectType {
        case .crossStitch:
            return [
                "grid": .number(crossStitchGrid),
                "colors": .number(crossStitchColors),
                "style": .string(crossStitchStyle)
            ]
        case .matisse:
            return [
                "detail": .number(matisseDetail),
                "palette": .string(matissePalette)
            ]
        case .botanical:
            return [
                "detail": .string(botanicalDetail),
                "tone": .string(botanicalTone)
            ]
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
    @State private var outlineStyle: LayerOutlineStyle = .none

    private let outlineOptions: [(LayerOutlineStyle, String)] = [
        (.none, "editor.outline.none"),
        (.white, "editor.outline.white"),
        (.cream, "editor.outline.cream"),
        (.dark, "editor.outline.dark"),
        (.red, "editor.outline.red"),
        (.double, "editor.outline.double")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            Text(L10n.t("editor.sheet.effects.title"))
                .font(JournalTypography.sectionTitle)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .foregroundStyle(JournalColors.ink)

            effectSlider(
                title: L10n.t("editor.effect.opacity"),
                valueText: "\(Int(opacity * 100))%",
                value: $opacity,
                range: 0.1...1,
                step: 0.05
            )
            .onChange(of: opacity) { _, _ in applyChanges() }

            if supportsRadius {
                effectSlider(
                    title: L10n.t("editor.effect.radius"),
                    valueText: "\(Int(radius))",
                    value: $radius,
                    range: 0...80,
                    step: 1
                )
                .onChange(of: radius) { _, _ in applyChanges() }
            }

            Toggle(L10n.t("editor.effect.shadow"), isOn: $shadow)
                .font(JournalTypography.bodyStrong)
                .tint(JournalColors.ink)
                .onChange(of: shadow) { _, _ in applyChanges() }

            Toggle(L10n.t("editor.effect.tear"), isOn: $tear)
                .font(JournalTypography.bodyStrong)
                .tint(JournalColors.ink)
                .onChange(of: tear) { _, _ in applyChanges() }

            Text(L10n.t("editor.effect.tear_note"))
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)

            VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                Text(L10n.t("editor.effect.outline"))
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 74), spacing: JournalSpacing.xs)], spacing: JournalSpacing.xs) {
                    ForEach(outlineOptions, id: \.0) { option in
                        Button {
                            outlineStyle = option.0
                            applyChanges()
                        } label: {
                            Text(L10n.t(option.1))
                                .font(JournalTypography.tiny)
                                .foregroundStyle(outlineStyle == option.0 ? Color.white : JournalColors.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                                .frame(maxWidth: .infinity)
                                .frame(height: 30)
                                .background(outlineStyle == option.0 ? JournalColors.ink : JournalColors.weak)
                                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

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
        outlineStyle = layer.outline?.style ?? .none
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
        if tear {
            draft.layers[index].tearSeed = draft.layers[index].tearSeed ?? Double(Int(Date().timeIntervalSince1970 * 1000).quotientAndRemainder(dividingBy: 1_000_000).remainder)
        } else {
            draft.layers[index].tearSeed = nil
        }
        draft.layers[index].outline = outline(for: outlineStyle)
        draft.layers[index].style[LayerStyleKey.outlineStyle] = .string(outlineStyle.rawValue)
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
        case .text, .tape, .brush:
            return false
        }
    }

    private func defaultRadius(for layer: Layer) -> Double {
        switch layer.type {
        case .paper:
            return 4
        case .image, .sticker, .cut:
            return 6
        case .text, .tape, .brush:
            return 0
        }
    }

    private func outline(for style: LayerOutlineStyle) -> LayerOutline? {
        switch style {
        case .none:
            return nil
        case .white:
            return LayerOutline(style: .white, color: "#ffffff", width: 12, opacity: 0.96)
        case .cream:
            return LayerOutline(style: .cream, color: "#efe7d8", width: 12, opacity: 0.96)
        case .dark:
            return LayerOutline(style: .dark, color: "#111111", width: 8, opacity: 0.80)
        case .red:
            return LayerOutline(style: .red, color: "#d94a38", width: 8, opacity: 0.88)
        case .double:
            return LayerOutline(style: .double, color: "#ffffff", width: 14, opacity: 0.96, secondaryColor: "#111111", secondaryWidth: 3)
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
                Text(L10n.t("editor.sheet.assets.title"))
                    .font(JournalTypography.sectionTitle)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .foregroundStyle(JournalColors.ink)

                Spacer()

                Button(L10n.t("assets.browse_all")) {
                    onBrowseAll()
                }
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: JournalSpacing.xs) {
                    ForEach(catalog.packs) { pack in
                        Button(pack.name) {
                            selectedPackId = pack.id
                        }
                        .font(JournalTypography.caption)
                        .foregroundStyle((selectedPack?.id == pack.id) ? Color.white : JournalColors.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
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
        BackgroundOption(id: "paper", name: L10n.t("editor.background.paper"), colorHex: "#fdfdfb", pattern: nil),
        BackgroundOption(id: "cream", name: L10n.t("editor.background.cream"), colorHex: "#f4efe5", pattern: nil),
        BackgroundOption(id: "line", name: L10n.t("editor.background.line"), colorHex: "#fdfdfb", pattern: "line"),
        BackgroundOption(id: "square", name: L10n.t("editor.background.square"), colorHex: "#fdfdfb", pattern: "square")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.md) {
            Capsule()
                .fill(JournalColors.border)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, JournalSpacing.sm)

            Text(L10n.t("editor.sheet.background.title"))
                .font(JournalTypography.sectionTitle)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
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
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
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
    @State private var backgroundLabel = LayerTextStyle.backgrounds[0].label
    @State private var fontSize = 54.0
    @State private var opacity = 1.0

    private let sizeOptions = [42.0, 54.0, 68.0, 88.0]
    private let opacityOptions = [0.45, 0.70, 1.0]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: JournalSpacing.md) {
                Capsule()
                    .fill(JournalColors.border)
                    .frame(width: 38, height: 4)
                    .frame(maxWidth: .infinity)
                    .padding(.top, JournalSpacing.sm)

                Text(L10n.t("editor.sheet.text.title"))
                    .font(JournalTypography.sectionTitle)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .foregroundStyle(JournalColors.ink)

                TextField(L10n.t("editor.sheet.text.placeholder"), text: $text, axis: .vertical)
                    .font(JournalTypography.bodyStrong)
                    .padding(JournalSpacing.md)
                    .background(JournalColors.weak)
                    .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                    .onChange(of: text) { _, _ in applyChanges() }

                VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                    Text(L10n.t("editor.sheet.text.font"))
                        .font(JournalTypography.caption)
                        .foregroundStyle(JournalColors.textSecondary)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: JournalSpacing.xs) {
                            ForEach(LayerTextStyle.fonts) { font in
                                Button {
                                    fontId = font.id
                                    applyChanges()
                                } label: {
                                    Text(font.preview)
                                        .font(textFontPreview(font.id))
                                        .foregroundStyle(fontId == font.id ? Color.white : JournalColors.ink)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.75)
                                        .frame(width: 96, height: 38)
                                        .background(fontId == font.id ? JournalColors.ink : JournalColors.weak)
                                        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                    Text(L10n.t("editor.sheet.text.color"))
                        .font(JournalTypography.caption)
                        .foregroundStyle(JournalColors.textSecondary)

                HStack(spacing: JournalSpacing.sm) {
                    ForEach(LayerTextStyle.colors, id: \.self) { hex in
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
            }

            VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                Text(L10n.t("editor.sheet.text.background"))
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)

                HStack(spacing: JournalSpacing.xs) {
                    ForEach(LayerTextStyle.backgrounds) { background in
                        Button {
                            backgroundLabel = background.label
                            backgroundHex = background.value
                            applyChanges()
                        } label: {
                            Text(L10n.t(background.key))
                                .font(JournalTypography.caption)
                                .foregroundStyle(backgroundHex == background.value ? Color.white : JournalColors.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                                .frame(maxWidth: .infinity)
                                .frame(height: 34)
                                .background(backgroundHex == background.value ? JournalColors.ink : JournalColors.weak)
                                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                Text(L10n.t("editor.sheet.text.size"))
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)

                HStack(spacing: JournalSpacing.xs) {
                    ForEach(sizeOptions, id: \.self) { size in
                        Button {
                            fontSize = size
                            applyChanges()
                        } label: {
                            Text(textSizeLabel(size))
                                .font(JournalTypography.caption)
                                .foregroundStyle(fontSize == size ? Color.white : JournalColors.ink)
                                .frame(maxWidth: .infinity)
                                .frame(height: 34)
                                .background(fontSize == size ? JournalColors.ink : JournalColors.weak)
                                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            VStack(alignment: .leading, spacing: JournalSpacing.xs) {
                Text(L10n.t("editor.sheet.text.opacity"))
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)

                HStack(spacing: JournalSpacing.xs) {
                    ForEach(opacityOptions, id: \.self) { value in
                        Button {
                            opacity = value
                            applyChanges()
                        } label: {
                            Text("\(Int(value * 100))%")
                                .font(JournalTypography.caption)
                                .foregroundStyle(opacity == value ? Color.white : JournalColors.ink)
                                .frame(maxWidth: .infinity)
                                .frame(height: 34)
                                .background(opacity == value ? JournalColors.ink : JournalColors.weak)
                                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, JournalSpacing.lg)
        .background(JournalColors.panel)
        .onAppear(perform: loadSelectedLayer)
    }

    private func loadSelectedLayer() {
        guard let layer = selectedLayer else { return }
        text = layer.text ?? ""
        fontId = styleString(layer, key: LayerStyleKey.textFontId) ?? "system"
        colorHex = styleString(layer, key: LayerStyleKey.textColor) ?? "#111111"
        backgroundHex = styleString(layer, key: LayerStyleKey.textBackground) ?? "transparent"
        backgroundLabel = styleString(layer, key: LayerStyleKey.textBackgroundLabel) ?? LayerTextStyle.backgroundLabel(for: backgroundHex)
        fontSize = styleNumber(layer, key: LayerStyleKey.textFontSize) ?? 54
        opacity = layer.opacity
    }

    private func applyChanges() {
        guard let layerId,
              let index = draft.layers.firstIndex(where: { $0.id == layerId }) else { return }
        let font = LayerTextStyle.fontOption(for: fontId)
        draft.layers[index].text = text
        draft.layers[index].opacity = opacity
        draft.layers[index].style[LayerStyleKey.textFontId] = .string(font.id)
        draft.layers[index].style[LayerStyleKey.textFontLabel] = .string(font.label)
        draft.layers[index].style[LayerStyleKey.textFontFamily] = .string(font.family)
        draft.layers[index].style[LayerStyleKey.textCanvasFontFamily] = .string(font.canvasFamily)
        draft.layers[index].style[LayerStyleKey.textColor] = .string(colorHex)
        draft.layers[index].style[LayerStyleKey.textBackgroundLabel] = .string(backgroundLabel)
        draft.layers[index].style[LayerStyleKey.textBackground] = .string(backgroundHex)
        draft.layers[index].style[LayerStyleKey.textFontSize] = .number(fontSize)
        onDraftChanged()
    }

    private func textFontPreview(_ fontId: String) -> Font {
        switch fontId {
        case "little_kids", "kelsi", "rounded":
            return .system(size: 14, weight: .semibold, design: .rounded)
        case "gemini", "serif":
            return .system(size: 14, weight: .semibold, design: .serif)
        default:
            return .system(size: 14, weight: .semibold)
        }
    }

    private func textSizeLabel(_ size: Double) -> String {
        switch size {
        case 42:
            return L10n.t("editor.text.size.small")
        case 68:
            return L10n.t("editor.text.size.large")
        case 88:
            return L10n.t("editor.text.size.xlarge")
        default:
            return L10n.t("editor.text.size.medium")
        }
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

private extension LayerCutLine {
    var jsonValue: JSONValue {
        .object([
            "startX": .number(startX),
            "startY": .number(startY),
            "endX": .number(endX),
            "endY": .number(endY)
        ])
    }

    var startPoint: BrushPoint {
        BrushPoint(x: startX, y: startY)
    }

    var endPoint: BrushPoint {
        BrushPoint(x: endX, y: endY)
    }
}

private func lineNormal(for line: LayerCutLine) -> CGVector {
    let dx = CGFloat(line.endX - line.startX)
    let dy = CGFloat(line.endY - line.startY)
    let length = max(0.001, hypot(dx, dy))
    return CGVector(dx: -dy / length, dy: dx / length)
}

#Preview {
    EditorView(draft: SampleDrafts.starter)
}
