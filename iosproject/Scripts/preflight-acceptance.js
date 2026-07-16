const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertContains(file, pattern, label) {
  const content = read(file);
  assert(pattern.test(content), `${label} missing in ${file}`);
}

function validateProjectShape() {
  assert(exists("project.yml"), "project.yml is missing");
  const project = read("project.yml");
  assert(/type:\s*application/.test(project), "application target missing from project.yml");
  assert(/JournalCollageTests/.test(project), "unit test target missing from project.yml");
  assert(/JournalCollage\/Resources/.test(project), "resources path missing from project.yml");
  assertContains("JournalCollage/App/JournalCollageApp.swift", /@main/, "SwiftUI @main app entry");
  assertContains("JournalCollage/App/RootTabView.swift", /TabView\s*\{/, "root TabView");
}

function validateAssetCatalog() {
  const catalogPath = path.join(root, "JournalCollage", "Resources", "AssetPacks", "asset-packs.json");
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const items = catalog.packs.flatMap((pack) => pack.items);

  assert(catalog.schemaVersion === 1, "asset catalog schemaVersion should be 1");
  assert(catalog.packs.length === 10, `expected 10 asset packs, got ${catalog.packs.length}`);
  assert(items.length === 100, `expected 100 asset items, got ${items.length}`);
  assert(catalog.packs.some((pack) => pack.id === "papers"), "papers pack is missing");
  assert(catalog.packs.some((pack) => pack.id === "jiaodai"), "jiaodai pack is missing");
  assert(items.every((item) => item.id && item.source && item.width > 0 && item.height > 0), "asset items have invalid required fields");
}

function validateEmptyDraftContract() {
  assertContains("JournalCollage/Domain/Draft/Draft.swift", /static let schemaVersion = 1/, "Draft schema version");
  assertContains("JournalCollage/Domain/Draft/Draft.swift", /init\(ratio: CanvasRatio = \.portrait\)/, "default Draft initializer");
  assertContains("JournalCollage/Domain/Draft/Draft.swift", /self\.width = size\.width/, "Draft width from ratio");
  assertContains("JournalCollage/Domain/Draft/Draft.swift", /self\.height = size\.height/, "Draft height from ratio");
  assertContains("JournalCollage/Domain/Draft/Draft.swift", /self\.background = "#fdfdfb"/, "Draft default background");
  assertContains("JournalCollage/Domain/Draft/Draft.swift", /self\.layers = \[\]/, "Draft starts with no layers");
  assertContains("JournalCollage/Domain/Draft/CanvasRatio.swift", /case portrait = "3:4"/, "3:4 canvas ratio");
  assertContains("JournalCollage/Domain/Draft/CanvasRatio.swift", /CanvasSize\(width: 900, height: 1200\)/, "3:4 logical size");
}

function validateUnitTestCoverage() {
  assertContains("JournalCollageTests/Draft/DraftModelTests.swift", /testDefaultDraftMatchesMiniProgramSchemaDefaults/, "default Draft unit test");
  assertContains("JournalCollageTests/Draft/DraftModelTests.swift", /testDraftJSONRoundTrip/, "Draft JSON round-trip unit test");
  assertContains("JournalCollageTests/AssetPack/AssetPackCatalogTests.swift", /testBundledCatalogLoadsRealMiniProgramMetadata/, "asset catalog load unit test");
  assertContains("JournalCollageTests/AssetPack/AssetPackCatalogTests.swift", /testAssetItemsHaveRequiredFields/, "asset item required fields unit test");
}

function validateEditorSpikeCore() {
  assertContains("JournalCollage/Rendering/CanvasViewport.swift", /struct CanvasViewport/, "CanvasViewport");
  assertContains("JournalCollage/Rendering/CanvasViewport.swift", /canvasPoint\(fromScreen/, "screen to canvas conversion");
  assertContains("JournalCollage/Rendering/HitTesting.swift", /enum HitTesting/, "HitTesting");
  assertContains("JournalCollage/Rendering/LayerTransform.swift", /enum LayerTransform/, "LayerTransform");
  assertContains("JournalCollage/Rendering/DraftRenderer.swift", /struct DraftRenderer: View/, "DraftRenderer");
  assertContains("JournalCollage/Rendering/InteractiveDraftCanvas.swift", /struct InteractiveDraftCanvas: View/, "InteractiveDraftCanvas");
  assertContains("JournalCollage/Storage/DraftStore.swift", /final class DraftStore/, "DraftStore");
  assertContains("JournalCollage/Storage/DraftStore.swift", /static let maxRecentDrafts = 3/, "DraftStore recent draft limit");
  assertContains("JournalCollage/Storage/DraftStore.swift", /pruneRecentDrafts\(\)/, "DraftStore recent draft pruning");
  assertContains("JournalCollage/Storage/ImageStore.swift", /final class ImageStore/, "ImageStore");
  assertContains("JournalCollage/Storage/AssetEntryContextStore.swift", /final class AssetEntryContextStore/, "asset entry context store");
  assertContains("JournalCollage/Domain/Samples/SampleDrafts.swift", /static var starter: Draft/, "sample starter Draft");
  assertContains("JournalCollageTests/Rendering/CanvasViewportTests.swift", /CanvasViewportTests/, "CanvasViewport tests");
  assertContains("JournalCollageTests/Rendering/HitTestingTests.swift", /HitTestingTests/, "HitTesting tests");
  assertContains("JournalCollageTests/Rendering/LayerTransformTests.swift", /LayerTransformTests/, "LayerTransform tests");
  assertContains("JournalCollageTests/Storage/DraftStoreTests.swift", /DraftStoreTests/, "DraftStore tests");
  assertContains("JournalCollageTests/Storage/AssetEntryContextStoreTests.swift", /AssetEntryContextStoreTests/, "asset entry context tests");
  assertContains("JournalCollageTests/Storage/ImageStoreTests.swift", /ImageStoreTests/, "ImageStore tests");
}

function validateEditorFeatureEntrypoints() {
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /PhotosPicker\(selection: \$selectedPhotoItem/, "photo import picker");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /DraftFactory\.makeImageLayer/, "image layer creation");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /DraftFactory\.makeAssetLayer/, "asset layer creation");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /DraftFactory\.makeTextLayer/, "text layer creation");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /duplicateSelectedLayer/, "duplicate layer command");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /deleteSelectedLayer/, "delete layer command");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /moveSelectedLayerUp/, "move layer up command");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /moveSelectedLayerDown/, "move layer down command");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /try draftStore\?\.save/, "draft save call");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /try store\.load/, "draft restore call");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /confirmationDialog\(\s*"离开前保存草稿？"/, "leave confirmation dialog");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /Button\("保存为草稿"\)/, "leave save draft action");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /Button\("不保存", role: \.destructive\)/, "leave discard draft action");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private func discardAndLeave\(\)/, "discard and leave function");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /assetEntryContextStore\.save\(draftId: draft\.id\)/, "editor saves asset entry context");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /Button\("查看全部素材"\)/, "editor asset drawer browse all entry");
  assertContains("JournalCollage/Features/Create/CreateHomeView.swift", /recentDrafts: \[DraftSummary\]/, "recent drafts state");
  assertContains("JournalCollage/Features/Create/CreateHomeView.swift", /loadDraft\(id:/, "recent draft restore entrypoint");
}

function validateStageThreeEntrypoints() {
  assertContains("JournalCollage/Features/Assets/AssetsView.swift", /selectedCategory == "收藏"/, "favorite category filter");
  assertContains("JournalCollage/Features/Assets/AssetsView.swift", /favoritePackIds\.contains\(\$0\.id\)/, "favorite pack visibility");
  assertContains("JournalCollage/Storage/AssetFavoriteStore.swift", /final class AssetFavoriteStore/, "asset favorite store");
  assertContains("JournalCollage/Features/Assets/AssetPackDetailView.swift", /selectedAssetIds: Set<String>/, "asset detail multi-select state");
  assertContains("JournalCollage/Features/Assets/AssetPackDetailView.swift", /FloatingAssetButton/, "asset detail paper layout");
  assertContains("JournalCollage/Features/Assets/AssetPackDetailView.swift", /addSelectedAssetsToCanvas/, "asset detail add selected action");
  assertContains("JournalCollage/Features/Assets/AssetPackDetailView.swift", /contextualDraft\(\) \?\? latestDraft\(\) \?\? Draft\(\)/, "asset detail starts from context draft, latest draft, or default draft");
  assertContains("JournalCollage/Features/Assets/AssetPackDetailView.swift", /entryContextStore\.activeDraftId\(\)/, "asset detail reads entry context");
  assertContains("JournalCollage/Features/Assets/AssetPackDetailView.swift", /entryContextStore\.clear\(\)/, "asset detail clears entry context after add");
  assertContains("JournalCollage/Features/Assets/AssetPackDetailView.swift", /try\? store\.load\(id: summary\.id\)/, "asset detail loads latest draft");
  assertContains("JournalCollage/Features/Assets/AssetPackDetailView.swift", /draft\.assets\.append\(DraftAsset/, "draft asset tracking from asset detail");
  assertContains("JournalCollage/Features/Assets/AssetPackDetailView.swift", /editorDraft = draft/, "asset detail navigates to editor after adding");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private struct AssetDrawerSheet: View/, "editor asset drawer sheet");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private struct BackgroundPickerSheet: View/, "background picker sheet");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private struct TextStyleSheet: View/, "text style sheet");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.backgroundPattern = option\.pattern/, "background pattern update");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.style\["fontId"\]/, "text font style update");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.style\["color"\]/, "text color style update");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.style\["fontSize"\]/, "text size style update");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.style\["background"\]/, "text background style update");
  assertContains("JournalCollage/Rendering/DraftRenderer.swift", /private func textFont\(for layer: Layer\) -> Font/, "text font renderer");
  assertContains("JournalCollage/Rendering/DraftRenderer.swift", /private func textBackground\(for layer: Layer\) -> Color\?/, "text background renderer");
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /private func textBackground\(for layer: Layer\) -> Color\?/, "export text background renderer");
}

function validateStageFourExportEntrypoints() {
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /enum ExportRenderer/, "ExportRenderer");
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /recommendedPixelSize\(for draft: Draft\)/, "recommended export pixel size");
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /ImageRenderer\(content:/, "SwiftUI image renderer");
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /ExportCanvasView/, "export canvas view");
  assertContains("JournalCollage/Features/Export/PhotoLibrarySaver.swift", /enum PhotoLibrarySaver/, "photo library saver");
  assertContains("JournalCollage/Features/Export/PhotoLibrarySaver.swift", /requestAuthorization\(for: \.addOnly\)/, "photo library add-only permission request");
  assertContains("JournalCollage/Features/Export/PhotoLibrarySaver.swift", /PHAssetChangeRequest\.creationRequestForAsset/, "photo library asset creation");
  assertContains("JournalCollage/Features/Export/ExportPreviewView.swift", /struct ExportPreviewView: View/, "export preview view");
  assertContains("JournalCollage/Features/Export/ExportPreviewView.swift", /ExportRenderer\.render\(draft: draft, imageStore: imageStore\)/, "export preview render call");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private func exportToPhotoLibrary\(\)/, "editor direct export function");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /PhotoLibrarySaver\.save\(exported\.image\)/, "editor direct photo library save");
}

function validateStageFiveLayerEffectsEntrypoints() {
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private struct LayerEffectsSheet: View/, "layer effects sheet");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.opacity = opacity/, "layer opacity update");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.radius = radius/, "layer radius update");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.shadow = shadow/, "layer shadow update");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.tear = tear/, "layer tear update");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /case \.image, \.sticker, \.paper, \.cut:/, "radius-supported layer types");
  assertContains("JournalCollage/Rendering/DraftRenderer.swift", /tearPlaceholder\(for: layer/, "draft renderer tear placeholder");
  assertContains("JournalCollage/Rendering/DraftRenderer.swift", /layer\.shadow == true/, "draft renderer shadow effect");
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /tearPlaceholder\(for: layer/, "export renderer tear placeholder");
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /layer\.shadow == true/, "export renderer shadow effect");
}

function validateStageFiveAlignmentGuidesEntrypoints() {
  assertContains("JournalCollage/Rendering/AlignmentSnapping.swift", /enum AlignmentSnapping/, "alignment snapping module");
  assertContains("JournalCollage/Rendering/AlignmentSnapping.swift", /static let translationThreshold = 10\.0/, "translation snapping threshold");
  assertContains("JournalCollage/Rendering/AlignmentSnapping.swift", /static let rotationThreshold = 4\.0/, "rotation snapping threshold");
  assertContains("JournalCollage/Rendering/AlignmentSnapping.swift", /snappedLayer\(_ layer: Layer, in draft: Draft\)/, "layer snapping function");
  assertContains("JournalCollage/Rendering/AlignmentSnapping.swift", /snappedRotation\(_ degrees: Double\)/, "rotation snapping function");
  assertContains("JournalCollage/Rendering/InteractiveDraftCanvas.swift", /alignmentGuides: \[AlignmentGuideLine\]/, "alignment guide state");
  assertContains("JournalCollage/Rendering/InteractiveDraftCanvas.swift", /AlignmentGuidesOverlay\(guides: alignmentGuides, viewport: viewport\)/, "alignment guide overlay");
  assertContains("JournalCollage/Rendering/InteractiveDraftCanvas.swift", /AlignmentSnapping\.snappedLayer\(proposedLayer, in: draft\)/, "drag snapping call");
  assertContains("JournalCollage/Rendering/InteractiveDraftCanvas.swift", /AlignmentSnapping\.snappedRotation\(proposedLayer\.rotation\)/, "rotation snapping call");
  assertContains("JournalCollageTests/Rendering/AlignmentSnappingTests.swift", /testSnapsLayerCenterToCanvasCenter/, "center snapping test");
  assertContains("JournalCollageTests/Rendering/AlignmentSnappingTests.swift", /testSnapsLayerVisualEdgesToCanvasEdges/, "edge snapping test");
  assertContains("JournalCollageTests/Rendering/AlignmentSnappingTests.swift", /testSnapsRotationToNearestTarget/, "rotation snapping test");
}

function validateStageFiveCropEntrypoints() {
  assertContains("JournalCollage/Rendering/ImageCropper.swift", /enum CropPreset: String, CaseIterable, Identifiable, Sendable/, "crop preset enum");
  assertContains("JournalCollage/Rendering/ImageCropper.swift", /case original/, "original crop preset");
  assertContains("JournalCollage/Rendering/ImageCropper.swift", /case square/, "square crop preset");
  assertContains("JournalCollage/Rendering/ImageCropper.swift", /case portrait/, "3:4 crop preset");
  assertContains("JournalCollage/Rendering/ImageCropper.swift", /case landscape/, "4:3 crop preset");
  assertContains("JournalCollage/Rendering/ImageCropper.swift", /case story/, "9:16 crop preset");
  assertContains("JournalCollage/Rendering/ImageCropper.swift", /centeredCrop\(sourceWidth: Double, sourceHeight: Double, ratio: Double\)/, "centered crop calculation");
  assertContains("JournalCollage/Rendering/ImageCropper.swift", /crop\(_ image: UIImage, cropBox: CropBox\?\)/, "UIImage crop helper");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private struct CropPresetSheet: View/, "crop preset sheet");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /@State private var draftCrop: CropBox\?/, "local crop editing state");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /Button\("取消"\)/, "crop cancel action");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /Button\("完成"\)/, "crop confirm action");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private func confirmCrop\(\)/, "crop confirm function");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.crop = selectedPreset == \.original/, "confirmed crop write");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private struct CropBoxOverlay: View/, "free crop box overlay");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /onMoveChanged/, "free crop move handler");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /onResizeChanged/, "free crop resize handler");
  assertContains("JournalCollage/Rendering/DraftRenderer.swift", /ImageCropper\.crop\(image, cropBox: layer\.crop\)/, "draft renderer crop read");
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /ImageCropper\.crop\(image, cropBox: layer\.crop\)/, "export renderer crop read");
  assertContains("JournalCollageTests/Rendering/ImageCropperTests.swift", /testCenteredCropUsesFullHeightForWideSource/, "wide image crop test");
  assertContains("JournalCollageTests/Rendering/ImageCropperTests.swift", /testCenteredCropUsesFullWidthForTallSource/, "tall image crop test");
}

function validateStageFiveMaskShapeEntrypoints() {
  assertContains("JournalCollage/Rendering/LayerMaskShape.swift", /enum LayerMaskShape: String, CaseIterable, Identifiable, Sendable/, "layer mask shape enum");
  assertContains("JournalCollage/Rendering/LayerMaskShape.swift", /case circle/, "circle mask shape");
  assertContains("JournalCollage/Rendering/LayerMaskShape.swift", /case heart/, "heart mask shape");
  assertContains("JournalCollage/Rendering/LayerMaskShape.swift", /case star/, "star mask shape");
  assertContains("JournalCollage/Rendering/LayerMaskShape.swift", /case tag/, "tag mask shape");
  assertContains("JournalCollage/Rendering/LayerMaskShape.swift", /case stamp/, "stamp mask shape");
  assertContains("JournalCollage/Rendering/LayerMaskShape.swift", /struct LayerMaskView: View/, "layer mask view");
  assertContains("JournalCollage/Rendering/LayerMaskShape.swift", /func layerMask\(_ shape: LayerMaskShape\?/, "layer mask view modifier");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private struct LayerMaskSheet: View/, "layer mask sheet");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.style\["maskShape"\] = \.string\(shape\.rawValue\)/, "write layer mask shape");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.style\.removeValue\(forKey: "maskShape"\)/, "clear layer mask shape");
  assertContains("JournalCollage/Rendering/DraftRenderer.swift", /\.layerMask\(maskShape\(for: layer\)/, "draft renderer mask read");
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /\.layerMask\(maskShape\(for: layer\)/, "export renderer mask read");
  assertContains("JournalCollageTests/Rendering/LayerMaskShapeTests.swift", /testMaskShapeRawValuesAreStable/, "mask raw value test");
  assertContains("JournalCollageTests/Rendering/LayerMaskShapeTests.swift", /testMaskShapeCanRoundTripThroughLayerStyle/, "mask style round-trip test");
}

function validateStageFiveBrushCutEntrypoints() {
  assertContains("JournalCollage/Rendering/BrushMaskRenderer.swift", /struct BrushPoint: Codable, Equatable, Sendable/, "brush point model");
  assertContains("JournalCollage/Rendering/BrushMaskRenderer.swift", /normalizedStrokes\(from strokes: \[\[CGPoint\]\], drawingSize: CGSize\)/, "brush path normalization");
  assertContains("JournalCollage/Rendering/BrushMaskRenderer.swift", /renderMask\(strokes: \[\[BrushPoint\]\]/, "alpha mask rendering");
  assertContains("JournalCollage/Rendering/BrushMaskRenderer.swift", /jsonValue\(from strokes: \[\[BrushPoint\]\]\)/, "brush path JSON storage");
  assertContains("JournalCollage/Storage/ImageStore.swift", /func saveMaskImage\(_ image: UIImage\) throws -> String/, "mask resource saving");
  assertContains("JournalCollage/Storage/ImageStore.swift", /source\.hasPrefix\("masks\/"\)/, "mask resource resolving");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private struct BrushCutSheet: View/, "brush cut sheet");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /currentStroke\.append\(value\.location\)/, "brush path recording");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /BrushMaskRenderer\.renderMask\(strokes: normalized/, "brush alpha mask generation");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /imageStore\.saveMaskImage\(image\)/, "brush mask resource save");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.style\["maskSource"\] = \.string\(source\)/, "mask source style storage");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.style\["brushPath"\] = BrushMaskRenderer\.jsonValue/, "brush path style storage");
  assertContains("JournalCollage/Rendering/DraftRenderer.swift", /alphaMask\(alphaMaskImage\(for: layer\)\)/, "draft renderer alpha mask");
  assertContains("JournalCollage/Rendering/ExportRenderer.swift", /alphaMask\(alphaMaskImage\(for: layer\)\)/, "export renderer alpha mask");
  assertContains("JournalCollageTests/Rendering/BrushMaskRendererTests.swift", /testNormalizesBrushPathPoints/, "brush path normalization test");
  assertContains("JournalCollageTests/Rendering/BrushMaskRendererTests.swift", /testRendersMaskImage/, "brush mask render test");
  assertContains("JournalCollageTests/Storage/ImageStoreTests.swift", /testSavesMaskImageAndReturnsStableSource/, "mask resource storage test");
}

function validateStageFiveSubjectCutEntrypoints() {
  assertContains("JournalCollage/Services/RembgService.swift", /struct RembgConfiguration: Equatable, Sendable/, "rembg configuration");
  assertContains("JournalCollage/Services/RembgService.swift", /endpoint: \(info\["REMBG_ENDPOINT"\] as\? String\) \?\? ""/, "rembg endpoint info key");
  assertContains("JournalCollage/Services/RembgService.swift", /fileFieldName: \(info\["REMBG_FILE_FIELD_NAME"\] as\? String\) \?\? "file"/, "rembg file field info key");
  assertContains("JournalCollage/Services/RembgService.swift", /removeImageBackground\(fileURL: URL\) async throws -> Data/, "rembg remove background function");
  assertContains("JournalCollage/Services/RembgService.swift", /multipart\/form-data; boundary=/, "rembg multipart upload");
  assertContains("JournalCollage/Services/RembgService.swift", /url", "imageUrl", "outputUrl", "resultUrl", "downloadUrl"/, "rembg url response keys");
  assertContains("JournalCollage/Services/RembgService.swift", /base64", "imageBase64", "resultBase64", "data"/, "rembg base64 response keys");
  assertContains("JournalCollage/Storage/ImageStore.swift", /func savePNGImageData\(_ data: Data\) throws -> StoredImage/, "transparent PNG result storage");
  assertContains("JournalCollage/Support/Info.plist", /<key>REMBG_ENDPOINT<\/key>/, "rembg endpoint plist key");
  assertContains("JournalCollage/Support/Info.plist", /<key>REMBG_FILE_FIELD_NAME<\/key>/, "rembg file field plist key");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /removeSelectedImageBackground/, "subject cut editor function");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /RembgService\(\)\.removeImageBackground\(fileURL: fileURL\)/, "subject cut service call");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /imageStore\.savePNGImageData\(data\)/, "subject cut PNG save");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /draft\.layers\[index\]\.style\["subjectCut"\] = \.bool\(true\)/, "subject cut style marker");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /ToolItem\(systemName: "person\.crop\.rectangle", label: "主体"\)/, "subject cut toolbar entry");
  assertContains("JournalCollageTests/Services/RembgServiceTests.swift", /testMissingEndpointFailsBeforeUpload/, "rembg missing endpoint test");
  assertContains("JournalCollageTests/Storage/ImageStoreTests.swift", /testSavesPNGImageDataAndReturnsStableSource/, "subject cut PNG storage test");
}

function validateEditorUndoRedoEntrypoints() {
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /undoStack: \[Draft\]/, "undo stack state");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /redoStack: \[Draft\]/, "redo stack state");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /lastCommittedDraft: Draft/, "last committed draft snapshot");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private let historyLimit = 50/, "undo history limit");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private func commitDraftChange\(\)/, "draft history commit function");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /undoStack\.append\(lastCommittedDraft\)/, "undo stack push");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /redoStack\.removeAll\(\)/, "redo clear on new edit");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private func undoDraftChange\(\)/, "undo function");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /private func redoDraftChange\(\)/, "redo function");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /saveDraft\(status: "已撤销"\)/, "undo save status");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /saveDraft\(status: "已重做"\)/, "redo save status");
  assertContains("JournalCollage/Features/Editor/EditorView.swift", /onDraftChanged: commitDraftChange/, "interactive changes commit to history");
  assertContains("JournalCollage/DesignSystem/JournalButtons.swift", /var isEnabled = true/, "icon button disabled support");
  assertContains("JournalCollage/DesignSystem/JournalButtons.swift", /\.disabled\(!isEnabled\)/, "icon button disabled state");
}

const checks = [
  ["iOS app project shape", validateProjectShape],
  ["asset pack catalog", validateAssetCatalog],
  ["empty Draft contract", validateEmptyDraftContract],
  ["unit test coverage hooks", validateUnitTestCoverage],
  ["editor spike core", validateEditorSpikeCore],
  ["editor feature entrypoints", validateEditorFeatureEntrypoints],
  ["stage 3 feature entrypoints", validateStageThreeEntrypoints],
  ["stage 4 export entrypoints", validateStageFourExportEntrypoints],
  ["stage 5 layer effects entrypoints", validateStageFiveLayerEffectsEntrypoints],
  ["stage 5 alignment guides entrypoints", validateStageFiveAlignmentGuidesEntrypoints],
  ["stage 5 crop entrypoints", validateStageFiveCropEntrypoints],
  ["stage 5 mask shape entrypoints", validateStageFiveMaskShapeEntrypoints],
  ["stage 5 brush cut entrypoints", validateStageFiveBrushCutEntrypoints],
  ["stage 5 subject cut entrypoints", validateStageFiveSubjectCutEntrypoints],
  ["editor undo redo entrypoints", validateEditorUndoRedoEntrypoints]
];

for (const [label, check] of checks) {
  check();
  console.log(`ok - ${label}`);
}

console.log("Preflight acceptance passed. Xcode compile/run still requires macOS + Xcode.");
