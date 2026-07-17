const { saveDraft, saveAutoDraft, loadDraft, loadDraftById, loadLatestDraft, loadRecentDrafts } = require("../../utils/draft-store");
const { showToast, showSuccess, showError, showModal } = require("../../utils/feedback");
const { removeImageBackground } = require("../../utils/rembg-api");
const {
  ASSET_TRANSFER_STORAGE_KEY,
  ASSET_TRANSFER_MODE_STORAGE_KEY,
  ASSET_ENTRY_CONTEXT_STORAGE_KEY,
  getAssetPacks,
  getAssetItem,
  getAssetPack,
  getResolvedAssetPacks,
  getResolvedAssetPack,
  getResolvedAssetItem
} = require("../../config/assets");
const {
  getTextFonts,
  getTextFontOptions,
  resolveTextFont,
  getFontSource,
  getFontCloudFileId,
  createTextFontStyle
} = require("../../config/fonts");
const {
  ratioSizeMap,
  createDraft,
  createImageLayer,
  createAssetLayer,
  createTextLayer,
  createTapeLayer,
  normalizeLayerOrder
} = require("../../models/draft");
const {
  drawDraft,
  hitTest
} = require("../../utils/renderer");

const LAYER_ACTIONS_PAGE_OFFSET = 560;
const LAYER_ACTIONS_TOUCH_SLOP = 6;
const LAYER_ACTIONS_SWIPE_THRESHOLD = 36;
const LAYER_ACTIONS_EDGE_RESISTANCE = 0.28;
const ALIGNMENT_GUIDE_SCREEN_THRESHOLD = 2;
const ALIGNMENT_GUIDE_STABLE_MOVES = 4;
const ROTATION_GUIDE_ANGLE_THRESHOLD = 1.5;
const ROTATION_GUIDE_STABLE_MOVES = 4;
const ROTATION_GUIDE_LAYER_TYPES = ["image", "sticker", "paper"];
const CROP_HANDLE_SCREEN_SIZE = 26;
const CROP_MIN_SIZE = 48;
const EMBOSS_MIN_SIZE = 48;
const SCISSOR_BRUSH_SIZE = 56;
const SCISSOR_MIN_CUT_SIZE = 8;
const SCISSOR_MAX_OUTPUT_SIZE = 1600;
const PENDING_DRAFT_OPEN_KEY = "journal.pendingDraftOpen.v1";
const TEXT_FONTS = getTextFonts();
const TEXT_FONT_OPTIONS = getTextFontOptions();
const BACKGROUND_OPTIONS = createBackgroundOptions();
const BACKGROUND_CATEGORIES = createBackgroundCategories(BACKGROUND_OPTIONS);
const LEGACY_ASSET_SOURCE_MIGRATIONS = [
  {
    from: "cloud://cloudbase-d6g4f30s2b2a1c042.636c-cloudbase-d6g4f30s2b2a1c042-1453943164/hudiejie/",
    to: "https://packs-1327435159.cos.ap-guangzhou.myqcloud.com/packs/hudiejie/"
  },
  {
    from: "https://packs-1327435159.cos.ap-guangzhou.myqcloud.com/hudiejie/",
    to: "https://packs-1327435159.cos.ap-guangzhou.myqcloud.com/packs/hudiejie/"
  }
];

Page({
  data: {
    ratios: ["3:4", "1:1", "9:16"],
    ratio: "3:4",
    canvasCssWidth: 300,
    canvasCssHeight: 400,
    selectedLayerId: "",
    selectedLayerType: "",
    saveStatus: "未保存",
    exporting: false,
    backgroundRemoving: false,
    textInputVisible: false,
    textDraft: "",
    textToolMode: "font",
    textFonts: TEXT_FONT_OPTIONS,
    textColors: [
      { value: "#111111", label: "墨黑" },
      { value: "#4a4a4a", label: "深灰" },
      { value: "#9a9a9a", label: "浅灰" },
      { value: "#ffffff", label: "白色" },
      { value: "#d94a38", label: "印章红" },
      { value: "#e9d28a", label: "胶带黄" },
      { value: "#8c9a8d", label: "鼠尾草" }
    ],
    textBackgrounds: ["无", "纸底", "白底", "黑底", "胶带"],
    textFont: "system",
    textColor: "#111111",
    textSize: 54,
    textBackground: "无",
    textOpacity: 100,
    cropEditing: false,
    cropRatio: "free",
    cropImageSrc: "",
    cropImageStyle: "",
    cropBoxStyle: "",
    embossEditing: false,
    embossShape: "circle",
    embossImageSrc: "",
    embossImageStyle: "",
    embossMaskStyle: "",
    embossMaskShapeClass: "circle",
    embossShapes: [
      { value: "circle", label: "圆形" },
      { value: "heart", label: "心形" },
      { value: "star", label: "星形" },
      { value: "tag", label: "标签" },
      { value: "stamp", label: "邮票" }
    ],
    cropRatios: [
      { value: "free", label: "自由" },
      { value: "original", label: "原图" },
      { value: "1:1", label: "1:1" },
      { value: "3:4", label: "3:4" },
      { value: "4:3", label: "4:3" },
      { value: "9:16", label: "9:16" },
      { value: "16:9", label: "16:9" }
    ],
    isEmptyMode: true,
    isEditMode: false,
    hasRecentDraft: false,
    recentDraftThumb: "",
    recentDrafts: [],
    activeTool: "",
    activeDrawer: "",
    activePalette: "",
    assetCategories: createAssetPanelCategories(),
    activeAssetCategory: "推荐",
    assetPacks: decorateAssetPanelPacks(getAssetPacks()),
    visibleAssetPacks: filterAssetPanelPacks(decorateAssetPanelPacks(getAssetPacks()), "推荐"),
    activeAssetPack: null,
    activeAssetPackItems: [],
    backgroundCategories: BACKGROUND_CATEGORIES,
    activeBackgroundCategory: "纸感",
    visibleBackgrounds: filterBackgroundOptions(BACKGROUND_OPTIONS, "纸感"),
    canUndo: false,
    canRedo: false,
    layerActionsOffset: 0,
    layerActionsPage: 0,
    layerActionsDragging: false,
    ratioPanelVisible: false,
    keyboardHeight: 0,
    textPanelBottom: 0,
    chromeTop: 0,
    statusTop: 0,
    toolbarGap: 0,
    ratioPopoverTop: 0,
    cropDoneRight: 16,
    scissorEditing: false,
    scissorBrushSize: SCISSOR_BRUSH_SIZE,
    scissorHasMask: false,
    scissorBusy: false,
    scissorImageStyle: "",
    scissorCanvasWidth: 1,
    scissorCanvasHeight: 1,
    straightCutEditing: false,
    straightCutLineStyle: "",
    straightCutStartHandleStyle: "",
    straightCutEndHandleStyle: ""
  },

  onLoad() {
    const system = wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    this.dpr = system.pixelRatio || 1;
    this.screenWidth = system.windowWidth;
    this.screenHeight = system.windowHeight;
    this.canvasNode = null;
    this.ctx = null;
    this.canvasRect = null;
    this.canvasImageCache = {};
    this.scissorCanvasNode = null;
    this.scissorCtx = null;
    this.scissorCanvasReadyPromise = null;
    this.scissorSession = null;
    this.scissorStroke = null;
    this.straightCutSession = null;
    this.straightCutGesture = null;
    this.straightCutCanvasNode = null;
    this.straightCutCtx = null;
    this.straightCutCanvasReadyPromise = null;
    this.straightCutOverlayFrame = null;
    this.canvasReadyPromise = null;
    this.gesture = null;
    this.pendingLayerTap = null;
    this.alignmentGuides = [];
    this.alignmentGuideState = null;
    this.rotationGuideState = null;
    this.loadedFontFamilies = {};
    this.fontTempUrlCache = {};
    this.assetPanelRequestId = 0;
    this.preloadPackagedFonts();
    this.keyboardHandler = (res) => {
      this.updateKeyboardHeight(res);
    };
    if (wx.onKeyboardHeightChange) {
      wx.onKeyboardHeightChange(this.keyboardHandler);
    }
    const latestDraft = loadLatestDraft();
    const recentDrafts = this.getRecentDrafts();
    this.draft = normalizeDraftTextFonts(latestDraft || createDraft("3:4"));
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.resetHistory();
    this.updateCanvasSize(this.draft.ratio);
    this.refreshAssetPanel();
    this.setEditorMode(!!latestDraft);
    const statusTop = Math.ceil((system.statusBarHeight || 0) + 2);
    const chromeTop = menu ? Math.ceil(menu.bottom + 4) : Math.ceil((system.statusBarHeight || 0) + 44);
    this.setData({
      chromeTop,
      statusTop,
      toolbarGap: Math.max(0, chromeTop - statusTop),
      ratioPopoverTop: Math.ceil(chromeTop + 112 * system.windowWidth / 750),
      cropDoneRight: 16,
      scissorBrushSize: SCISSOR_BRUSH_SIZE,
      hasRecentDraft: !!latestDraft,
      recentDraftThumb: latestDraft && latestDraft.thumbnailPath ? latestDraft.thumbnailPath : "",
      recentDrafts
    });
  },

  onReady() {
    this.ensureCanvasContext().then(() => {
      this.preloadPackagedFonts({ force: true, scopes: ["native"] });
      this.render();
    });
  },

  preloadPackagedFonts(options = {}) {
    TEXT_FONTS.filter((font) => font.packaged).forEach((font) => {
      this.ensureTextFontLoaded(font.id, options);
    });
  },

  ensureTextFontLoaded(fontId, options = {}) {
    const font = resolveTextFont(fontId);
    const scopes = options.scopes || ["webview", "native"];
    const cacheKey = `${font.family}:${scopes.join(",")}`;
    if (!options.force && (this.loadedFontFamilies[cacheKey] === "loaded" || this.loadedFontFamilies[cacheKey] === "loading")) return;
    this.loadedFontFamilies[cacheKey] = "loading";
    this.resolveFontSource(font)
      .then((source) => {
        if (!font || !font.packaged || !source || !wx.loadFontFace) {
          this.loadedFontFamilies[cacheKey] = "failed";
          return;
        }
        wx.loadFontFace({
          family: font.family,
          source: `url("${source}")`,
          desc: {
            style: "normal",
            weight: "normal",
            variant: "normal"
          },
          global: true,
          scopes,
          success: () => {
            this.loadedFontFamilies[cacheKey] = "loaded";
            console.info("[fonts] loadFontFace success", font.id, font.family, scopes.join(","), source);
            this.render();
          },
          fail: () => {
            this.loadedFontFamilies[cacheKey] = "failed";
            console.warn("[fonts] loadFontFace failed", font.id, font.family, scopes.join(","), source);
          }
        });
      })
      .catch((error) => {
        this.loadedFontFamilies[cacheKey] = "failed";
        console.warn("[fonts] resolve source failed", font.id, font.family, error);
      });
  },

  resolveFontSource(font) {
    const directSource = getFontSource(font);
    if (directSource) return Promise.resolve(directSource);
    const fileID = getFontCloudFileId(font);
    if (!fileID) return Promise.resolve("");
    if (this.fontTempUrlCache[fileID]) return Promise.resolve(this.fontTempUrlCache[fileID]);
    if (!wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve("");
    return wx.cloud.getTempFileURL({
      fileList: [fileID]
    }).then((res) => {
      const file = res.fileList && res.fileList[0];
      const url = file && (file.tempFileURL || file.download_url || file.fileID);
      if (url && (!file.status || file.status === 0)) {
        this.fontTempUrlCache[fileID] = url;
        return url;
      }
      throw new Error(file && file.errMsg ? file.errMsg : "empty_temp_file_url");
    });
  },

  onShow() {
    this.consumePendingAssets();
    if (this.consumePendingDraftOpen()) {
      return;
    }
    if (this.data.isEmptyMode) {
      this.refreshRecentDraftState();
    }
  },

  consumePendingDraftOpen() {
    const app = getApp && getApp();
    const storedDraftId = wx.getStorageSync(PENDING_DRAFT_OPEN_KEY);
    if (storedDraftId) {
      wx.removeStorageSync(PENDING_DRAFT_OPEN_KEY);
    }
    const draftId = storedDraftId || (app && app.globalData && app.globalData.currentDraftId);
    if (!draftId) return false;
    if (app && app.globalData) {
      app.globalData.currentDraftId = "";
    }
    this.openRecentDraft({ currentTarget: { dataset: { id: draftId } } });
    return true;
  },

  onUnload() {
    if (wx.offKeyboardHeightChange && this.keyboardHandler) {
      wx.offKeyboardHeightChange(this.keyboardHandler);
    }
  },

  resetCanvasContext() {
    this.canvasNode = null;
    this.ctx = null;
    this.canvasReadyPromise = null;
    this.canvasRect = null;
  },

  ensureCanvasContext() {
    if (this.canvasNode && this.ctx) {
      this.configureCanvasBitmap();
      return Promise.resolve(this.ctx);
    }
    if (this.canvasReadyPromise) return this.canvasReadyPromise;
    this.canvasReadyPromise = new Promise((resolve) => {
      wx.createSelectorQuery()
        .in(this)
        .select("#spikeCanvas")
        .fields({ node: true, size: true, rect: true })
        .exec((res) => {
          const result = res && res[0];
          const canvas = result && result.node;
          if (!canvas) {
            this.canvasReadyPromise = null;
            resolve(null);
            return;
          }
          this.canvasRect = {
            left: result.left || 0,
            top: result.top || 0
          };
          this.canvasNode = canvas;
          this.ctx = canvas.getContext("2d");
          this.configureCanvasBitmap();
          resolve(this.ctx);
        });
    });
    return this.canvasReadyPromise;
  },

  configureCanvasBitmap() {
    if (!this.canvasNode || !this.ctx) return;
    const width = Math.max(1, Math.round((this.data.canvasCssWidth || 1) * (this.dpr || 1)));
    const height = Math.max(1, Math.round((this.data.canvasCssHeight || 1) * (this.dpr || 1)));
    this.configureCanvasBitmapSize(width, height);
  },

  configureCanvasBitmapSize(width, height) {
    if (!this.canvasNode || !this.ctx) return;
    if (this.canvasNode.width !== width) this.canvasNode.width = width;
    if (this.canvasNode.height !== height) this.canvasNode.height = height;
    if (this.ctx.setTransform) this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  loadCanvasImage(src) {
    if (!src || !this.canvasNode) return Promise.resolve(null);
    const cached = this.canvasImageCache[src];
    if (cached && cached.image) return Promise.resolve(cached.image);
    if (cached && cached.promise) return cached.promise;
    const image = this.canvasNode.createImage();
    const promise = new Promise((resolve) => {
      image.onload = () => {
        this.canvasImageCache[src] = { image };
        resolve(image);
      };
      image.onerror = () => {
        delete this.canvasImageCache[src];
        console.warn("[canvas] image load failed", src);
        resolve(null);
      };
    });
    this.canvasImageCache[src] = { promise };
    image.src = src;
    return promise;
  },

  preloadCanvasImages() {
    if (!this.draft) return Promise.resolve();
    const layerSources = Array.isArray(this.draft.layers)
      ? this.draft.layers.map((layer) => layer && layer.source).filter(Boolean)
      : [];
    const backgroundSource = this.draft.backgroundImage && this.draft.backgroundImage.source;
    const sources = Array.from(new Set([backgroundSource].concat(layerSources).filter(Boolean)));
    return Promise.all(sources.map((src) => this.loadCanvasImage(src))).then(() => undefined);
  },

  setEditorMode(isEditing) {
    const modeChanged = this.data.isEditMode !== isEditing;
    if (modeChanged) {
      this.resetCanvasContext();
    }
    this.setData({
      isEmptyMode: !isEditing,
      isEditMode: isEditing
    });
    if (isEditing) {
      wx.hideTabBar({ animation: false });
      return;
    }
    wx.showTabBar({ animation: false });
  },

  startNewDraft() {
    this.textEditSession = null;
    this.clearCropEditing();
    this.clearScissorEditing();
    this.clearEmbossEditing();
    this.clearStraightCutRuntime();
    this.draft = normalizeDraftTextFonts(createDraft(this.data.ratio || "3:4"));
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.resetHistory();
    this.updateCanvasSize(this.draft.ratio);
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      saveStatus: "未保存",
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      cropEditing: false,
      cropRatio: "free",
      embossEditing: false,
      scissorEditing: false,
      scissorHasMask: false,
      scissorBusy: false,
      scissorImageStyle: "",
      straightCutEditing: false,
      straightCutLineStyle: "",
      straightCutStartHandleStyle: "",
      straightCutEndHandleStyle: "",
      keyboardHeight: 0,
      textPanelBottom: 0
    });
    this.setEditorMode(true);
    setTimeout(() => this.render(), 0);
  },

  resetToBlankDraftForEmptyEntry() {
    clearTimeout(this.saveTimer);
    this.textEditSession = null;
    this.clearCropEditing();
    this.clearScissorEditing();
    this.clearEmbossEditing();
    this.clearStraightCutRuntime();
    this.draft = normalizeDraftTextFonts(createDraft(this.data.ratio || "3:4"));
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.resetHistory();
    this.updateCanvasSize(this.draft.ratio);
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      saveStatus: "未保存",
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      ratioPanelVisible: false,
      cropEditing: false,
      cropRatio: "free",
      embossEditing: false,
      scissorEditing: false,
      scissorHasMask: false,
      scissorBusy: false,
      scissorImageStyle: "",
      straightCutEditing: false,
      straightCutLineStyle: "",
      straightCutStartHandleStyle: "",
      straightCutEndHandleStyle: "",
      keyboardHeight: 0,
      textPanelBottom: 0
    });
  },

  refreshRecentDraftState() {
    const recentDrafts = this.getRecentDrafts();
    const latestDraft = recentDrafts[0] || loadLatestDraft();
    this.setData({
      hasRecentDraft: !!latestDraft,
      recentDraftThumb: latestDraft && latestDraft.thumbnailPath ? latestDraft.thumbnailPath : "",
      recentDrafts
    });
  },

  hasStoredDraft() {
    return !!loadLatestDraft();
  },

  getLatestDraftThumbnail() {
    const latestDraft = loadLatestDraft();
    return latestDraft && latestDraft.thumbnailPath ? latestDraft.thumbnailPath : "";
  },

  getRecentDrafts() {
    const recentDrafts = loadRecentDrafts();
    if (recentDrafts.length) return recentDrafts;
    const latestDraft = loadLatestDraft();
    return latestDraft ? [latestDraft] : [];
  },

  enterEditMode() {
    if (!this.data.isEditMode) {
      this.setEditorMode(true);
    }
  },

  openAssetsTab() {
    if (this.data.isEditMode && this.data.activeDrawer === "asset") {
      wx.setStorageSync(ASSET_ENTRY_CONTEXT_STORAGE_KEY, {
        source: "createAssetDrawer",
        preserveDraft: true,
        createdAt: Date.now()
      });
    } else {
      wx.removeStorageSync(ASSET_ENTRY_CONTEXT_STORAGE_KEY);
    }
    wx.switchTab({ url: "/pages/assets/index" });
  },

  openRecentDraft(event) {
    clearTimeout(this.saveTimer);
    this.textEditSession = null;
    this.clearCropEditing();
    this.clearScissorEditing();
    this.clearEmbossEditing();
    this.clearStraightCutRuntime();
    const draftId = event && event.currentTarget && event.currentTarget.dataset.id;
    const draft = draftId ? loadDraftById(draftId) : loadLatestDraft();
    if (!draft) {
      showError("暂无草稿");
      return;
    }
    this.draft = normalizeDraftTextFonts(draft);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.resetHistory();
    this.updateCanvasSize(draft.ratio);
    this.setEditorMode(true);
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      saveStatus: "已打开最近草稿",
      hasRecentDraft: true,
      textInputVisible: false,
      textDraft: "",
      cropEditing: false,
      cropRatio: "free",
      embossEditing: false,
      scissorEditing: false,
      scissorHasMask: false,
      scissorBusy: false,
      scissorImageStyle: "",
      straightCutEditing: false,
      straightCutLineStyle: "",
      straightCutStartHandleStyle: "",
      straightCutEndHandleStyle: "",
      keyboardHeight: 0,
      textPanelBottom: 0,
      recentDrafts: this.getRecentDrafts()
    });
    setTimeout(() => this.render(), 0);
  },

  async backToEmpty() {
    if (this.backingToEmpty) return;
    this.backingToEmpty = true;
    const shouldLeave = await this.confirmDraftBeforeBack();
    this.backingToEmpty = false;
    if (!shouldLeave) return;
    this.exitEditorToEmpty();
  },

  async confirmDraftBeforeBack() {
    if (!this.hasDraftContent()) {
      return true;
    }
    return new Promise((resolve) => {
      const willPruneOldDraft = this.getRecentDrafts().filter((draft) => draft.id !== this.draft.id).length >= 3;
      const actionSheetOptions = {
        itemList: ["保存为草稿", "不保存"],
        success: async (res) => {
          if (res.tapIndex === 0) {
            try {
              clearTimeout(this.saveTimer);
              this.draft = await this.saveDraftWithThumbnail();
              this.setData({
                saveStatus: "草稿已保存",
                hasRecentDraft: true,
                recentDraftThumb: this.draft.thumbnailPath || "",
                recentDrafts: this.getRecentDrafts()
              });
              showSuccess("草稿已保存");
              resolve(true);
            } catch (error) {
              showError("草稿保存失败");
              resolve(false);
            }
            return;
          }
          if (res.tapIndex === 1) {
            clearTimeout(this.saveTimer);
            resolve(true);
            return;
          }
          resolve(false);
        },
        fail: () => resolve(false)
      };
      if (willPruneOldDraft) {
        actionSheetOptions.alertText = "最多3个草稿，保存将删除最早草稿";
      }
      wx.showActionSheet(actionSheetOptions);
    });
  },

  hasDraftContent() {
    return !!(this.draft && Array.isArray(this.draft.layers) && this.draft.layers.length);
  },

  exitEditorToEmpty() {
    clearTimeout(this.saveTimer);
    this.textEditSession = null;
    this.clearCropEditing();
    this.clearScissorEditing();
    this.clearEmbossEditing();
    this.clearStraightCutRuntime();
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      ratioPanelVisible: false,
      cropEditing: false,
      cropRatio: "free",
      embossEditing: false,
      scissorEditing: false,
      scissorHasMask: false,
      scissorBusy: false,
      scissorImageStyle: "",
      straightCutEditing: false,
      straightCutLineStyle: "",
      straightCutStartHandleStyle: "",
      straightCutEndHandleStyle: "",
      keyboardHeight: 0,
      textPanelBottom: 0,
      hasRecentDraft: this.hasStoredDraft(),
      recentDraftThumb: this.getLatestDraftThumbnail(),
      recentDrafts: this.getRecentDrafts()
    });
    this.setEditorMode(false);
  },

  toggleRatioPanel() {
    this.setData({
      ratioPanelVisible: !this.data.ratioPanelVisible
    });
  },

  updateCanvasSize(ratio) {
    const size = ratioSizeMap[ratio] || ratioSizeMap["3:4"];
    const maxWidth = this.screenWidth - 56;
    const maxHeight = this.screenWidth > 380 ? 520 : 460;
    const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
    this.renderScale = scale;
    this.setData({
      ratio,
      canvasCssWidth: Math.round(size.width * scale),
      canvasCssHeight: Math.round(size.height * scale)
    });
  },

  async render(retryCount = 0) {
    if (this.data.isEmptyMode || this.data.cropEditing || this.data.scissorEditing || this.data.embossEditing) return;
    const renderToken = (this.renderToken || 0) + 1;
    this.renderToken = renderToken;
    await this.ensureCanvasContext();
    if ((!this.ctx || !this.canvasNode) && renderToken === this.renderToken && retryCount < 4) {
      setTimeout(() => this.render(retryCount + 1), 50);
      return;
    }
    if (!this.ctx || !this.draft || !this.canvasNode || renderToken !== this.renderToken) return;
    await this.preloadCanvasImages();
    if (renderToken !== this.renderToken) return;
    this.configureCanvasBitmap();
    drawDraft(this.ctx, this.draft, this.data.selectedLayerId, {
      dpr: (this.renderScale || 1) * (this.dpr || 1),
      imageCache: getResolvedCanvasImageCache(this.canvasImageCache),
      guides: this.alignmentGuides || [],
      scissor: this.getScissorRenderState()
    });
  },

  drawCanvasSnapshot(callback) {
    this.ensureCanvasContext().then(() => this.preloadCanvasImages()).then(() => {
      if (!this.ctx || !this.draft || !this.canvasNode) {
        if (callback) callback();
        return;
      }
      this.configureCanvasBitmap();
      drawDraft(this.ctx, this.draft, "", {
        dpr: (this.renderScale || 1) * (this.dpr || 1),
        imageCache: getResolvedCanvasImageCache(this.canvasImageCache)
      });
      if (callback) callback();
    }).catch(() => {
      if (callback) callback();
    });
  },

  drawCanvasAtPixelSize(pixelWidth, pixelHeight, selectedLayerId = "") {
    return this.ensureCanvasContext()
      .then(() => this.preloadCanvasImages())
      .then(() => {
        if (!this.ctx || !this.draft || !this.canvasNode) return false;
        const width = Math.max(1, Math.round(pixelWidth));
        const height = Math.max(1, Math.round(pixelHeight));
        const scale = width / Math.max(1, this.draft.width || width);
        this.configureCanvasBitmapSize(width, height);
        drawDraft(this.ctx, this.draft, selectedLayerId, {
          dpr: scale,
          imageCache: getResolvedCanvasImageCache(this.canvasImageCache)
        });
        return true;
      });
  },

  ensureScissorCanvasContext() {
    if (this.scissorCanvasNode && this.scissorCtx) return Promise.resolve(this.scissorCtx);
    if (this.scissorCanvasReadyPromise) return this.scissorCanvasReadyPromise;
    this.scissorCanvasReadyPromise = new Promise((resolve) => {
      wx.createSelectorQuery()
        .in(this)
        .select("#scissorCanvas")
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node;
          if (!canvas) {
            this.scissorCanvasReadyPromise = null;
            resolve(null);
            return;
          }
          this.scissorCanvasNode = canvas;
          this.scissorCtx = canvas.getContext("2d");
          resolve(this.scissorCtx);
        });
    });
    return this.scissorCanvasReadyPromise;
  },

  loadScissorCanvasImage(src) {
    if (!src || !this.scissorCanvasNode) return Promise.resolve(null);
    if (this.scissorLoadedImageSrc === src && this.scissorLoadedImage) {
      return Promise.resolve(this.scissorLoadedImage);
    }
    const image = this.scissorCanvasNode.createImage();
    return new Promise((resolve) => {
      image.onload = () => {
        this.scissorLoadedImageSrc = src;
        this.scissorLoadedImage = image;
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = src;
    });
  },

  getScissorRenderState() {
    if (!this.scissorSession || !this.data.scissorEditing) return null;
    const layer = this.getLayerById(this.scissorSession.layerId);
    if (!layer) return null;
    return {
      layer,
      strokes: this.scissorSession.strokes || [],
      brushSize: this.data.scissorBrushSize,
      color: "rgba(217, 74, 56, 0.58)"
    };
  },

  beginScissorCut(targetLayer) {
    const layer = targetLayer || this.getSelectedLayer();
    if (!layer || layer.type !== "image" || !layer.source) {
      showToast("请先选中一张图片", { icon: "none" });
      return;
    }
    const originalLayer = JSON.parse(JSON.stringify(layer));
    const startScissor = () => {
      this.resetScissorCanvasContext();
      const sourceSize = {
        width: layer.sourceWidth || layer.width,
        height: layer.sourceHeight || layer.height
      };
      const sourceCrop = getLayerSourceCrop(layer);
      const preview = getCropPreviewLayout(sourceCrop, {
        screenWidth: this.screenWidth,
        screenHeight: this.screenHeight,
        chromeTop: this.data.chromeTop
      });
      this.clearAlignmentGuides();
      this.scissorSession = {
        layerId: layer.id,
        originalLayer,
        sourceSize,
        sourceCrop,
        preview,
        strokes: []
      };
      this.scissorStroke = null;
      this.scissorLoadedImageSrc = "";
      this.scissorLoadedImage = null;
      this.setData({
        scissorEditing: true,
        scissorHasMask: false,
        scissorBusy: false,
        scissorBrushSize: SCISSOR_BRUSH_SIZE,
        scissorImageStyle: `left:${preview.left}px;top:${preview.top}px;width:${preview.width}px;height:${preview.height}px;`,
        scissorCanvasWidth: Math.max(1, Math.round(preview.width)),
        scissorCanvasHeight: Math.max(1, Math.round(preview.height)),
        activeTool: "cut",
        activePalette: "",
        activeDrawer: "",
        textInputVisible: false,
        ratioPanelVisible: false,
        layerActionsPage: 0,
        layerActionsOffset: 0
      });
      setTimeout(() => this.drawScissorEditor(), 0);
    };
    const prepareAndStart = () => {
      this.prepareLayerForVisualSourceEdit(layer)
        .then(startScissor)
        .catch((error) => {
          console.warn("[scissor] prepare source failed", error);
          showError("图片准备失败，请重试");
        });
    };
    if (layer.sourceWidth && layer.sourceHeight) {
      prepareAndStart();
      return;
    }
    wx.getImageInfo({
      src: layer.source,
      success: (info) => {
        layer.sourceWidth = info.width;
        layer.sourceHeight = info.height;
        prepareAndStart();
      },
      fail: () => {
        layer.sourceWidth = layer.width;
        layer.sourceHeight = layer.height;
        prepareAndStart();
      }
    });
  },

  cancelScissorCut() {
    if (this.scissorSession && this.scissorSession.originalLayer && this.draft) {
      const index = this.draft.layers.findIndex((layer) => layer.id === this.scissorSession.layerId);
      if (index >= 0) {
        this.draft.layers[index] = this.scissorSession.originalLayer;
      }
    }
    this.scissorSession = null;
    this.scissorStroke = null;
    this.resetScissorCanvasContext();
    this.resetCanvasContext();
    this.setData({
      scissorEditing: false,
      scissorHasMask: false,
      scissorBusy: false,
      scissorImageStyle: "",
      activeTool: "",
      activePalette: ""
    });
    setTimeout(() => this.render(), 0);
  },

  clearScissorMask() {
    if (!this.scissorSession) return;
    this.scissorSession.strokes = [];
    this.scissorStroke = null;
    this.setData({ scissorHasMask: false });
    this.drawScissorEditor();
  },

  onScissorTouchStart(event) {
    if (!this.scissorSession || this.data.scissorBusy) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const point = this.getScissorLayerPoint(getClientPoint(touch));
    if (!point) return;
    const stroke = {
      size: this.data.scissorBrushSize || SCISSOR_BRUSH_SIZE,
      points: [point]
    };
    this.scissorSession.strokes.push(stroke);
    this.scissorStroke = stroke;
    this.setData({ scissorHasMask: true });
    this.drawScissorEditor();
  },

  onScissorTouchMove(event) {
    if (!this.scissorStroke || this.data.scissorBusy) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const point = this.getScissorLayerPoint(getClientPoint(touch));
    if (!point) return;
    const points = this.scissorStroke.points;
    const last = points[points.length - 1];
    if (last && distance(last, point) < 2) return;
    points.push(point);
    this.drawScissorEditor();
  },

  onScissorTouchEnd() {
    this.scissorStroke = null;
  },

  getScissorLayerPoint(point) {
    const session = this.scissorSession;
    const layer = session ? this.getLayerById(session.layerId) : null;
    if (!session || !layer || !point) return null;
    const preview = session.preview;
    const sourceCrop = session.sourceCrop;
    const sourceX = (point.x - preview.left) / preview.scale;
    const sourceY = (point.y - preview.top) / preview.scale;
    if (sourceX < 0 || sourceX > sourceCrop.width || sourceY < 0 || sourceY > sourceCrop.height) return null;
    return {
      x: clamp(sourceX / sourceCrop.width * layer.width, 0, layer.width),
      y: clamp(sourceY / sourceCrop.height * layer.height, 0, layer.height)
    };
  },

  async drawScissorEditor() {
    if (!this.scissorSession || !this.data.scissorEditing) return;
    await this.ensureScissorCanvasContext();
    if (!this.scissorCanvasNode || !this.scissorCtx || !this.scissorSession) return;
    const layer = this.getLayerById(this.scissorSession.layerId);
    const image = await this.loadScissorCanvasImage(layer && layer.source);
    if (!image || !this.scissorSession) return;
    const preview = this.scissorSession.preview;
    const sourceCrop = this.scissorSession.sourceCrop;
    const cssWidth = Math.max(1, Math.round(preview.width));
    const cssHeight = Math.max(1, Math.round(preview.height));
    const pixelRatio = this.dpr || 1;
    const width = Math.max(1, Math.round(cssWidth * pixelRatio));
    const height = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (this.scissorCanvasNode.width !== width) this.scissorCanvasNode.width = width;
    if (this.scissorCanvasNode.height !== height) this.scissorCanvasNode.height = height;
    const ctx = this.scissorCtx;
    if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, sourceCrop.x, sourceCrop.y, sourceCrop.width, sourceCrop.height, 0, 0, width, height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(217, 74, 56, 0.72)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    (this.scissorSession.strokes || []).forEach((stroke) => {
      const points = stroke.points || [];
      if (!points.length) return;
      ctx.lineWidth = (stroke.size || SCISSOR_BRUSH_SIZE) * cssWidth / layer.width * pixelRatio;
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = point.x / layer.width * width;
        const y = point.y / layer.height * height;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      if (points.length === 1) {
        const point = points[0];
        ctx.lineTo(point.x / layer.width * width + 0.01, point.y / layer.height * height + 0.01);
      }
      ctx.stroke();
    });
  },

  async confirmScissorCut() {
    if (!this.scissorSession || this.data.scissorBusy) return;
    const layer = this.getLayerById(this.scissorSession.layerId);
    const strokes = this.scissorSession.strokes || [];
    if (!layer || layer.type !== "image" || !strokes.length) {
      showToast("先涂抹要剪出的区域", { icon: "none" });
      return;
    }
    const bounds = getScissorStrokeBounds(strokes, layer);
    if (!bounds || bounds.width < SCISSOR_MIN_CUT_SIZE || bounds.height < SCISSOR_MIN_CUT_SIZE) {
      showToast("涂抹区域太小", { icon: "none" });
      return;
    }
    this.setData({
      scissorBusy: true,
      saveStatus: "分割中..."
    });
    try {
      const tempFilePath = await this.createScissorCutImage(layer, strokes, bounds);
      const cutInfo = await getImageInfoAsync(tempFilePath).catch(() => null);
      const center = layerLocalPointToDraft({
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
      }, layer);
      const cutLayer = {
        ...JSON.parse(JSON.stringify(layer)),
        id: `image-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        source: tempFilePath,
        x: center.x - bounds.width / 2,
        y: center.y - bounds.height / 2,
        width: bounds.width,
        height: bounds.height,
        sourceWidth: cutInfo && cutInfo.width ? cutInfo.width : Math.round(bounds.width),
        sourceHeight: cutInfo && cutInfo.height ? cutInfo.height : Math.round(bounds.height),
        crop: null,
        clipShape: "",
        maskShape: "",
        excludeShape: "",
        excludeFrame: null,
        clipPolygon: null,
        radius: 0,
        shadow: false,
        tear: false,
        style: {
          ...(layer.style || {}),
          clipShape: "",
          maskShape: "",
          embossEdge: false,
          excludeShape: "",
          excludeFrame: null,
          shape: ""
        },
        zIndex: (this.draft.layers || []).reduce((max, item, index) => Math.max(max, item.zIndex == null ? index : item.zIndex), 0) + 1
      };
      const index = this.getSelectedLayerIndex();
      this.draft.layers.splice(index + 1, 0, cutLayer);
      this.draft.layers = normalizeLayerOrder(this.draft.layers);
      this.scissorSession = null;
      this.scissorStroke = null;
      this.resetScissorCanvasContext();
      this.setData({
        scissorEditing: false,
        scissorHasMask: false,
        scissorBusy: false,
        scissorImageStyle: "",
        selectedLayerId: cutLayer.id,
        selectedLayerType: cutLayer.type,
        activeTool: "",
        activePalette: ""
      });
      this.markDirty();
      this.resetCanvasContext();
      setTimeout(() => this.render(), 0);
      showSuccess("已分割出新图片");
    } catch (error) {
      console.warn("[scissor] cut failed", error);
      this.setData({
        scissorBusy: false,
        saveStatus: "分割失败"
      });
      showError("分割失败，请重试");
    }
  },

  async createScissorCutImage(layer, strokes, bounds) {
    await this.ensureScissorCanvasContext();
    if (!this.scissorCanvasNode || !this.scissorCtx) throw new Error("missing_scissor_canvas");
    const sourceImage = await this.loadScissorCanvasImage(layer.source);
    if (!sourceImage) throw new Error("missing_source_image");
    const sourceCrop = getLayerSourceCrop(layer);
    const naturalScale = Math.max(sourceCrop.width / layer.width, sourceCrop.height / layer.height);
    let outputScale = Math.min(2.5, Math.max(1, naturalScale));
    const maxSide = Math.max(bounds.width, bounds.height) * outputScale;
    if (maxSide > SCISSOR_MAX_OUTPUT_SIZE) {
      outputScale *= SCISSOR_MAX_OUTPUT_SIZE / maxSide;
    }
    const outputWidth = Math.max(1, Math.round(bounds.width * outputScale));
    const outputHeight = Math.max(1, Math.round(bounds.height * outputScale));
    this.scissorCanvasNode.width = outputWidth;
    this.scissorCanvasNode.height = outputHeight;
    this.setData({
      scissorCanvasWidth: outputWidth,
      scissorCanvasHeight: outputHeight
    });
    const ctx = this.scissorCtx;
    if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, outputWidth, outputHeight);
    const sx = sourceCrop.x + bounds.x / layer.width * sourceCrop.width;
    const sy = sourceCrop.y + bounds.y / layer.height * sourceCrop.height;
    const sw = bounds.width / layer.width * sourceCrop.width;
    const sh = bounds.height / layer.height * sourceCrop.height;
    ctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    applyScissorAlphaMask(ctx, outputWidth, outputHeight, strokes, bounds, outputScale);
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.scissorCanvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      }, this);
    });
  },

  async createEmbossRemainderImage(layer, mask, shape) {
    await this.ensureScissorCanvasContext();
    if (!this.scissorCanvasNode || !this.scissorCtx) throw new Error("missing_scratch_canvas");
    const sourceImage = await this.loadScissorCanvasImage(layer.source);
    if (!sourceImage) throw new Error("missing_source_image");
    const sourceCrop = getLayerSourceCrop(layer);
    const naturalScale = Math.max(sourceCrop.width / layer.width, sourceCrop.height / layer.height);
    let outputScale = Math.min(2.5, Math.max(1, naturalScale));
    const maxSide = Math.max(layer.width, layer.height) * outputScale;
    if (maxSide > SCISSOR_MAX_OUTPUT_SIZE) {
      outputScale *= SCISSOR_MAX_OUTPUT_SIZE / maxSide;
    }
    const outputWidth = Math.max(1, Math.round(layer.width * outputScale));
    const outputHeight = Math.max(1, Math.round(layer.height * outputScale));
    this.scissorCanvasNode.width = outputWidth;
    this.scissorCanvasNode.height = outputHeight;
    const ctx = this.scissorCtx;
    if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, outputWidth, outputHeight);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(sourceImage, sourceCrop.x, sourceCrop.y, sourceCrop.width, sourceCrop.height, 0, 0, outputWidth, outputHeight);
    ctx.globalCompositeOperation = "destination-out";
    drawEmbossMaskPath(ctx, shape, mask.x * outputScale, mask.y * outputScale, mask.width * outputScale, mask.height * outputScale);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    const path = await new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.scissorCanvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      }, this);
    });
    return { path, width: outputWidth, height: outputHeight };
  },

  layerNeedsVisualSourceBake(layer) {
    if (!layer || layer.type !== "image") return false;
    const style = layer.style || {};
    const clipShape = normalizeOptionalEmbossShape(layer.clipShape || layer.maskShape || style.clipShape || style.maskShape || style.shape || "");
    const excludeShape = normalizeOptionalEmbossShape(layer.excludeShape || style.excludeShape || "");
    const hasPolygon = Array.isArray(layer.clipPolygon) && layer.clipPolygon.length >= 3;
    const hasExcludeFrame = !!(excludeShape && (layer.excludeFrame || style.excludeFrame));
    return !!(clipShape || hasPolygon || hasExcludeFrame || layer.tear || layer.radius);
  },

  async prepareLayerForVisualSourceEdit(layer) {
    if (!this.layerNeedsVisualSourceBake(layer)) return layer;
    const baked = await this.createVisibleLayerSourceImage(layer);
    layer.source = baked.path;
    layer.sourceWidth = baked.width;
    layer.sourceHeight = baked.height;
    layer.crop = null;
    layer.clipShape = "";
    layer.maskShape = "";
    layer.excludeShape = "";
    layer.excludeFrame = null;
    layer.clipPolygon = null;
    layer.tear = false;
    layer.radius = 0;
    layer.style = {
      ...(layer.style || {}),
      clipShape: "",
      maskShape: "",
      embossEdge: false,
      excludeShape: "",
      excludeFrame: null,
      shape: ""
    };
    this.canvasImageCache = {};
    return layer;
  },

  async createVisibleLayerSourceImage(layer) {
    await this.ensureScissorCanvasContext();
    if (!this.scissorCanvasNode || !this.scissorCtx) throw new Error("missing_scratch_canvas");
    const sourceImage = await this.loadScissorCanvasImage(layer.source);
    if (!sourceImage) throw new Error("missing_source_image");
    const sourceCrop = getLayerSourceCrop(layer);
    const naturalScale = Math.max(sourceCrop.width / layer.width, sourceCrop.height / layer.height);
    let outputScale = Math.min(2.5, Math.max(1, naturalScale));
    const maxSide = Math.max(layer.width, layer.height) * outputScale;
    if (maxSide > SCISSOR_MAX_OUTPUT_SIZE) {
      outputScale *= SCISSOR_MAX_OUTPUT_SIZE / maxSide;
    }
    const outputWidth = Math.max(1, Math.round(layer.width * outputScale));
    const outputHeight = Math.max(1, Math.round(layer.height * outputScale));
    this.scissorCanvasNode.width = outputWidth;
    this.scissorCanvasNode.height = outputHeight;
    const ctx = this.scissorCtx;
    if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, outputWidth, outputHeight);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(sourceImage, sourceCrop.x, sourceCrop.y, sourceCrop.width, sourceCrop.height, 0, 0, outputWidth, outputHeight);
    this.applyLayerVisualAlphaToSource(ctx, layer, outputScale, outputWidth, outputHeight);
    ctx.globalCompositeOperation = "source-over";
    const path = await new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.scissorCanvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      }, this);
    });
    return { path, width: outputWidth, height: outputHeight };
  },

  applyLayerVisualAlphaToSource(ctx, layer, outputScale, outputWidth, outputHeight) {
    const style = layer.style || {};
    const clipShape = normalizeOptionalEmbossShape(layer.clipShape || layer.maskShape || style.clipShape || style.maskShape || style.shape || "");
    const excludeShape = normalizeOptionalEmbossShape(layer.excludeShape || style.excludeShape || "");
    const polygon = Array.isArray(layer.clipPolygon) ? layer.clipPolygon : null;
    if (polygon && polygon.length >= 3) {
      ctx.globalCompositeOperation = "destination-in";
      drawClipPolygonMaskPath(ctx, polygon, outputScale);
      ctx.fill();
    } else if (clipShape) {
      ctx.globalCompositeOperation = "destination-in";
      drawEmbossMaskPath(ctx, clipShape, 0, 0, outputWidth, outputHeight);
      ctx.fill();
    } else if (layer.tear) {
      ctx.globalCompositeOperation = "destination-in";
      drawTearMaskPath(ctx, outputWidth, outputHeight);
      ctx.fill();
    } else if (layer.radius) {
      ctx.globalCompositeOperation = "destination-in";
      drawRoundedMaskPath(ctx, 0, 0, outputWidth, outputHeight, layer.radius * outputScale);
      ctx.fill();
    }
    const frame = layer.excludeFrame || style.excludeFrame || null;
    if (excludeShape && frame && frame.width > 0 && frame.height > 0) {
      ctx.globalCompositeOperation = "destination-out";
      drawEmbossMaskPath(ctx, excludeShape, frame.x * outputScale, frame.y * outputScale, frame.width * outputScale, frame.height * outputScale);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  },

  resetHistory() {
    const snapshot = serializeDraft(this.draft);
    this.historyStack = snapshot ? [snapshot] : [];
    this.redoStack = [];
    this.updateHistoryState();
  },

  recordHistory() {
    const snapshot = serializeDraft(this.draft);
    if (!snapshot) return;
    const lastSnapshot = this.historyStack && this.historyStack[this.historyStack.length - 1];
    if (snapshot === lastSnapshot) {
      this.updateHistoryState();
      return;
    }
    this.historyStack = [...(this.historyStack || []), snapshot].slice(-40);
    this.redoStack = [];
    this.updateHistoryState();
  },

  updateHistoryState() {
    this.setData({
      canUndo: !!(this.historyStack && this.historyStack.length > 1),
      canRedo: !!(this.redoStack && this.redoStack.length)
    });
  },

  restoreHistorySnapshot(snapshot, status) {
    const draft = parseDraftSnapshot(snapshot);
    if (!draft) return;
    this.textEditSession = null;
    this.clearCropEditing();
    this.clearScissorEditing();
    this.clearEmbossEditing();
    this.clearStraightCutRuntime();
    this.draft = normalizeDraftTextFonts(draft);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.updateCanvasSize(this.draft.ratio);
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      cropEditing: false,
      cropRatio: "free",
      embossEditing: false,
      scissorEditing: false,
      straightCutEditing: false,
      straightCutLineStyle: "",
      straightCutStartHandleStyle: "",
      straightCutEndHandleStyle: "",
      keyboardHeight: 0,
      textPanelBottom: 0,
      saveStatus: status
    });
    this.updateHistoryState();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.draft = saveAutoDraft(this.draft);
      this.setData({ saveStatus: "已自动保存", hasRecentDraft: true });
    }, 900);
    setTimeout(() => this.render(), 0);
  },

  undo() {
    if (!this.historyStack || this.historyStack.length <= 1) return;
    const current = this.historyStack.pop();
    this.redoStack = [...(this.redoStack || []), current];
    this.restoreHistorySnapshot(this.historyStack[this.historyStack.length - 1], "已撤销");
  },

  redo() {
    if (!this.redoStack || !this.redoStack.length) return;
    const snapshot = this.redoStack.pop();
    this.historyStack = [...(this.historyStack || []), snapshot].slice(-40);
    this.restoreHistorySnapshot(snapshot, "已恢复");
  },

  changeRatio(event) {
    const ratio = event.currentTarget.dataset.ratio;
    const size = ratioSizeMap[ratio];
    if (this.data.isEmptyMode) {
      this.draft = normalizeDraftTextFonts(createDraft(ratio));
      this.draft.layers = normalizeLayerOrder(this.draft.layers);
      this.updateCanvasSize(ratio);
      return;
    }
    this.draft = {
      ...this.draft,
      ratio,
      width: size.width,
      height: size.height,
      updatedAt: Date.now()
    };
    this.updateCanvasSize(ratio);
    this.setData({ ratioPanelVisible: false });
    this.markDirty();
    setTimeout(() => this.render(), 0);
  },

  choosePhoto() {
    const source = eventSourceType(arguments[0]) || "album";
    this.choosePhotoBySource(source);
  },

  choosePhotoBySource(source = "album") {
    const shouldStartBlank = this.data.isEmptyMode;
    const pendingAfterPhoto = this.pendingAfterPhoto;
    if (shouldStartBlank) {
      this.resetToBlankDraftForEmptyEntry();
    }
    this.enterEditMode();
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: [source],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) {
          if (pendingAfterPhoto) this.pendingAfterPhoto = "";
          return;
        }
        wx.getImageInfo({
          src: file.tempFilePath,
          success: (info) => {
            const layer = createImageLayer(file.tempFilePath, info, this.draft);
            this.draft.layers.push(layer);
            this.draft.layers = normalizeLayerOrder(this.draft.layers);
            this.markDirty();
            if (pendingAfterPhoto === "scissorFree") {
              this.pendingAfterPhoto = "";
              setTimeout(() => this.beginScissorCut(layer), 0);
              return;
            }
            this.closeAfterAddingLayer();
            this.render();
          },
          fail: () => {
            if (pendingAfterPhoto) this.pendingAfterPhoto = "";
            showError("图片添加失败");
          }
        });
      },
      fail: () => {
        if (pendingAfterPhoto) this.pendingAfterPhoto = "";
      }
    });
  },

  openImageSourceSheet() {
    this.setData({
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      selectedLayerId: "",
      selectedLayerType: "",
      textInputVisible: false,
      ratioPanelVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0
    });
    wx.showActionSheet({
      itemList: ["从相册选择图片", "拍照"],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.choosePhotoBySource("album");
          return;
        }
        if (res.tapIndex === 1) {
          this.choosePhotoBySource("camera");
        }
      }
    });
  },

  openToolPanel(event) {
    const tool = event.currentTarget.dataset.tool || "";
    this.scissorPickPending = false;
    this.straightCutPickPending = false;
    this.embossPickPending = false;
    this.enterEditMode();
    if (tool === "image") {
      this.openImageSourceSheet();
      return;
    }
    if (tool === "text") {
      this.addText();
      return;
    }
    if (tool === "shape" && !this.getSelectedLayer()) {
      this.embossPickPending = true;
      this.setData({
        activeTool: "shape",
        activeDrawer: "",
        activePalette: "",
        selectedLayerId: "",
        selectedLayerType: "",
        textInputVisible: false,
        ratioPanelVisible: false
      });
      showToast("请先选择一个图层", { icon: "none" });
      return;
    }
    if (tool === "shape") {
      this.beginEmbossEdit();
      return;
    }
    const isDrawer = ["asset", "background"].includes(tool);
    const isPalette = ["cut", "shape"].includes(tool);
    const nextData = {
      activeTool: tool,
      activeDrawer: isDrawer ? tool : "",
      activePalette: isPalette ? tool : "",
      textInputVisible: false,
      ratioPanelVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0
    };
    if (tool !== "shape") {
      nextData.selectedLayerId = "";
      nextData.selectedLayerType = "";
    }
    if (tool === "asset") {
      Object.assign(nextData, this.getAssetPanelState(this.data.activeAssetCategory || "推荐", ""));
    }
    if (tool === "background") {
      nextData.activeBackgroundCategory = this.data.activeBackgroundCategory || "纸感";
      nextData.visibleBackgrounds = filterBackgroundOptions(BACKGROUND_OPTIONS, nextData.activeBackgroundCategory);
    }
    this.setData(nextData);
    setTimeout(() => this.render(), 0);
  },

  closeToolPanel() {
    this.scissorPickPending = false;
    this.straightCutPickPending = false;
    this.embossPickPending = false;
    this.setData({
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      textInputVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0
    });
  },

  updateKeyboardHeight(res) {
    const height = res && res.height ? Math.max(0, Math.round(res.height)) : 0;
    this.setData({
      keyboardHeight: height,
      textPanelBottom: this.data.textInputVisible ? height : 0
    });
  },

  onTextKeyboardHeightChange(event) {
    this.updateKeyboardHeight(event.detail || {});
  },

  onTextFocus() {
    if (this.data.keyboardHeight > 0) {
      this.setData({ textPanelBottom: this.data.keyboardHeight });
    }
  },

  onLayerActionsTouchStart(event) {
    const touch = event.touches && event.touches[0];
    this.layerActionsTouchX = touch ? touch.clientX : 0;
    this.layerActionsTouchY = touch ? touch.clientY : 0;
    this.layerActionsStartOffset = this.data.layerActionsOffset || 0;
    this.layerActionsDirection = "";
    this.layerActionsPendingOffset = this.layerActionsStartOffset;
    this.layerActionsMoved = false;
    this.setData({ layerActionsDragging: true });
  },

  onLayerActionsTouchMove(event) {
    const touch = event.touches && event.touches[0];
    if (!touch || this.layerActionsTouchX == null) return;
    const deltaX = touch.clientX - this.layerActionsTouchX;
    const deltaY = touch.clientY - this.layerActionsTouchY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (!this.layerActionsDirection) {
      if (absX < LAYER_ACTIONS_TOUCH_SLOP && absY < LAYER_ACTIONS_TOUCH_SLOP) return;
      this.layerActionsDirection = absX > absY * 1.15 ? "horizontal" : "vertical";
    }
    if (this.layerActionsDirection !== "horizontal") return;
    if (absX > LAYER_ACTIONS_TOUCH_SLOP) {
      this.layerActionsMoved = true;
    }
    const deltaRpx = deltaX * 750 / this.screenWidth;
    const offset = this.applyLayerActionsResistance(this.layerActionsStartOffset + deltaRpx);
    this.layerActionsPendingOffset = offset;
    this.layerActionsPendingPage = offset < -LAYER_ACTIONS_PAGE_OFFSET / 2 ? 1 : 0;
    this.scheduleLayerActionsOffsetUpdate();
  },

  scheduleLayerActionsOffsetUpdate() {
    if (this.layerActionsOffsetFrame) return;
    const flush = () => {
      this.layerActionsOffsetFrame = null;
      this.setData({
        layerActionsOffset: this.layerActionsPendingOffset,
        layerActionsPage: this.layerActionsPendingPage || 0
      });
    };
    if (typeof requestAnimationFrame === "function") {
      this.layerActionsOffsetFrame = requestAnimationFrame(flush);
      return;
    }
    this.layerActionsOffsetFrame = setTimeout(flush, 16);
  },

  flushLayerActionsOffset() {
    if (!this.layerActionsOffsetFrame) return;
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.layerActionsOffsetFrame);
    } else {
      clearTimeout(this.layerActionsOffsetFrame);
    }
    this.layerActionsOffsetFrame = null;
    this.setData({
      layerActionsOffset: this.layerActionsPendingOffset,
      layerActionsPage: this.layerActionsPendingPage || 0
    });
  },

  onLayerActionsTouchEnd(event) {
    const touch = event.changedTouches && event.changedTouches[0];
    const deltaX = touch && this.layerActionsTouchX != null ? touch.clientX - this.layerActionsTouchX : 0;
    const moved = this.layerActionsDirection === "horizontal" && (!!this.layerActionsMoved || Math.abs(deltaX) > 8);
    this.flushLayerActionsOffset();
    this.layerActionsTouchX = null;
    this.layerActionsTouchY = null;
    this.layerActionsStartOffset = 0;
    this.layerActionsDirection = "";
    this.layerActionsMoved = false;
    if (moved) {
      this.ignoreLayerActionTap = true;
      clearTimeout(this.layerActionTapTimer);
      this.layerActionTapTimer = setTimeout(() => {
        this.ignoreLayerActionTap = false;
      }, 180);
    }
    const currentOffset = this.data.layerActionsOffset || 0;
    let nextPage = currentOffset < -LAYER_ACTIONS_PAGE_OFFSET / 2 ? 1 : 0;
    if (moved && Math.abs(deltaX) > LAYER_ACTIONS_SWIPE_THRESHOLD) {
      nextPage = deltaX < 0 ? 1 : 0;
    }
    this.setLayerActionsPage(nextPage);
  },

  setLayerActionsPage(page) {
    const nextPage = page ? 1 : 0;
    this.setData({
      layerActionsPage: nextPage,
      layerActionsOffset: nextPage ? -LAYER_ACTIONS_PAGE_OFFSET : 0,
      layerActionsDragging: false
    });
  },

  clampLayerActionsOffset(offset) {
    return Math.max(-LAYER_ACTIONS_PAGE_OFFSET, Math.min(0, Math.round(offset)));
  },

  applyLayerActionsResistance(offset) {
    if (offset > 0) return Math.round(offset * LAYER_ACTIONS_EDGE_RESISTANCE);
    if (offset < -LAYER_ACTIONS_PAGE_OFFSET) {
      return Math.round(-LAYER_ACTIONS_PAGE_OFFSET + (offset + LAYER_ACTIONS_PAGE_OFFSET) * LAYER_ACTIONS_EDGE_RESISTANCE);
    }
    return Math.round(offset);
  },

  closeDrawer() {
    this.setData({
      activeTool: "",
      activeDrawer: "",
      activeAssetPack: null,
      activeAssetPackItems: []
    });
  },

  getAssetPanelState(category, packId, packs, pack) {
    const assetPacks = decorateAssetPanelPacks(packs || getAssetPacks());
    const activeCategory = category || "推荐";
    const activeAssetPack = packId ? decorateAssetPanelPack(pack || getAssetPack(packId)) : null;
    return {
      assetPacks,
      activeAssetCategory: activeCategory,
      visibleAssetPacks: filterAssetPanelPacks(assetPacks, activeCategory),
      activeAssetPack,
      activeAssetPackItems: activeAssetPack ? activeAssetPack.items : []
    };
  },

  refreshAssetPanel(category = this.data.activeAssetCategory || "推荐", packId = this.data.activeAssetPack && this.data.activeAssetPack.id || "") {
    const requestId = Date.now();
    this.assetPanelRequestId = requestId;
    return Promise.all([
      getResolvedAssetPacks(),
      packId ? getResolvedAssetPack(packId) : Promise.resolve(null)
    ]).then(([packs, pack]) => {
      if (this.assetPanelRequestId !== requestId) return;
      this.setData(this.getAssetPanelState(category, packId, packs, pack));
    });
  },

  selectAssetCategory(event) {
    const category = event.currentTarget.dataset.category || "推荐";
    if (category === this.data.activeAssetCategory && !this.data.activeAssetPack) return;
    this.setData(this.getAssetPanelState(category, ""));
    this.refreshAssetPanel(category, "");
  },

  openAssetPack(event) {
    const packId = event.currentTarget.dataset.pack;
    if (!packId) return;
    this.setData(this.getAssetPanelState(this.data.activeAssetCategory || "推荐", packId));
    this.refreshAssetPanel(this.data.activeAssetCategory || "推荐", packId);
  },

  backToAssetPacks() {
    this.setData(this.getAssetPanelState(this.data.activeAssetCategory || "推荐", ""));
    this.refreshAssetPanel(this.data.activeAssetCategory || "推荐", "");
  },

  selectBackgroundCategory(event) {
    const category = event.currentTarget.dataset.category || "纸感";
    this.setData({
      activeBackgroundCategory: category,
      visibleBackgrounds: filterBackgroundOptions(BACKGROUND_OPTIONS, category)
    });
  },

  applyBackground(event) {
    const backgroundId = event.currentTarget.dataset.backgroundId;
    const option = BACKGROUND_OPTIONS.find((item) => item.id === backgroundId);
    if (!option) return;
    this.enterEditMode();
    this.draft.background = option.color || "#fdfdfb";
    this.draft.backgroundImage = option.source
      ? {
        id: option.id,
        name: option.name,
        source: option.source,
        width: option.width,
        height: option.height,
        fillMode: "cover"
      }
      : null;
    this.draft.backgroundPattern = option.pattern || "";
    this.setData({
      activeBackgroundCategory: option.category,
      visibleBackgrounds: filterBackgroundOptions(BACKGROUND_OPTIONS, option.category)
    });
    this.markDirty();
    this.render();
  },

  closePalette() {
    this.setData({
      activeTool: "",
      activePalette: ""
    });
  },

  addTape(event) {
    this.enterEditMode();
    const color = event && event.currentTarget && event.currentTarget.dataset.color ? event.currentTarget.dataset.color : "#8c9a8d";
    const layer = createTapeLayer("", color, this.draft.width * 0.58, this.draft.height * 0.22, 12, this.draft);
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.closeAfterAddingLayer();
    this.markDirty();
    this.render();
  },

  addPaper() {
    this.enterEditMode();
    const layer = createTapeLayer("", "#efe7d8", this.draft.width * 0.2, this.draft.height * 0.55, -5, this.draft);
    layer.type = "paper";
    layer.width = 260;
    layer.height = 330;
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.closeAfterAddingLayer();
    this.markDirty();
    this.render();
  },

  addReceipt() {
    this.enterEditMode();
    const layer = createTapeLayer("", "#ffffff", this.draft.width * 0.18, this.draft.height * 0.74, 1, this.draft);
    layer.type = "paper";
    layer.width = 220;
    layer.height = 150;
    layer.style = { color: "#ffffff" };
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.closeAfterAddingLayer();
    this.markDirty();
    this.render();
  },

  addStamp() {
    this.enterEditMode();
    const layer = createTextLayer("07\n26", this.draft);
    layer.width = 96;
    layer.height = 96;
    layer.x = this.draft.width * 0.67;
    layer.y = this.draft.height * 0.74;
    layer.rotation = 0;
    layer.style = { fontSize: 28, color: "#111111", shape: "stamp" };
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.closeAfterAddingLayer();
    this.markDirty();
    this.render();
  },

  addConfiguredAsset(event) {
    this.enterEditMode();
    const assetId = event.currentTarget.dataset.assetId;
    const asset = getAssetItem(assetId);
    if (!asset || (!asset.source && !asset.cloudFileId)) {
      if (asset && asset.layer) {
        this.addAssetItemToDraft(asset);
        this.keepAssetDrawerAfterAddingLayer();
        this.markDirty();
        this.render();
        return;
      }
      showError("素材添加失败");
      return;
    }
    getResolvedAssetItem(assetId).then((resolvedAsset) => {
      if (!resolvedAsset || !resolvedAsset.source) {
        showError("素材加载失败");
        return;
      }
      this.addAssetItemToDraft(resolvedAsset);
      this.keepAssetDrawerAfterAddingLayer();
      this.markDirty();
      this.render();
    });
  },

  consumePendingAssets() {
    const assetIds = wx.getStorageSync(ASSET_TRANSFER_STORAGE_KEY);
    if (!Array.isArray(assetIds) || !assetIds.length) return;
    const transferMode = wx.getStorageSync(ASSET_TRANSFER_MODE_STORAGE_KEY) || {};
    wx.removeStorageSync(ASSET_TRANSFER_STORAGE_KEY);
    wx.removeStorageSync(ASSET_TRANSFER_MODE_STORAGE_KEY);
    if (!transferMode.preserveDraft) {
      this.resetToBlankDraftForEmptyEntry();
    }
    this.enterEditMode();
    let added = 0;
    Promise.all(assetIds.map(getResolvedAssetItem)).then((assets) => {
      assets.forEach((asset) => {
        if (!asset) return;
        if (this.addAssetItemToDraft(asset)) {
          added += 1;
        }
      });
      if (!added) {
        showError("素材添加失败");
        return;
      }
      this.closeAfterAddingLayer();
      this.markDirty();
      setTimeout(() => this.render(), 0);
      setTimeout(() => this.render(), 80);
    });
  },

  addAssetItemToDraft(asset) {
    if (!asset || !this.draft) return null;
    const layer = asset.source
      ? createAssetLayer(asset, this.draft)
      : createLayerFromAsset(asset, this.draft);
    if (!layer) return null;
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    return layer;
  },

  addText() {
    this.enterEditMode();
    this.preloadPackagedFonts({ force: true });
    let layer = this.getSelectedLayer();
    const isNewLayer = !layer || layer.type !== "text";
    if (!layer || layer.type !== "text") {
      layer = createTextLayer("", this.draft);
      layer.text = "";
      layer.style = {
        ...(layer.style || {}),
        fontSize: this.data.textSize || 54,
        color: this.data.textColor || "#111111",
        ...createTextFontStyle(this.data.textFont || "system"),
        backgroundLabel: this.data.textBackground || "无",
        background: backgroundColorForLabel(this.data.textBackground || "无")
      };
      layer.opacity = (this.data.textOpacity || 100) / 100;
      this.draft.layers.push(layer);
      this.draft.layers = normalizeLayerOrder(this.draft.layers);
      layer = this.getLayerById(layer.id) || layer;
    }
    this.beginTextLayerEditing(layer, { isNew: isNewLayer });
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      textInputVisible: true,
      activeTool: "text",
      activeDrawer: "",
      activePalette: "",
      textDraft: layer.text || "",
      textToolMode: "font",
      textFont: normalizeTextFontId(layer.style),
      textColor: layer.style.color || "#111111",
      textSize: layer.style.fontSize || 54,
      textBackground: layer.style.backgroundLabel || "无",
      textOpacity: Math.round((layer.opacity == null ? 1 : layer.opacity) * 100),
      textPanelBottom: this.data.keyboardHeight || 0
    });
    this.render();
  },

  beginTextLayerEditing(layer, options = {}) {
    if (!layer || layer.type !== "text") return;
    this.textEditSession = {
      layerId: layer.id,
      isNew: !!options.isNew,
      original: {
        x: layer.x,
        y: layer.y
      }
    };
    this.moveTextLayerToEditingPreview(layer);
  },

  moveTextLayerToEditingPreview(layer) {
    if (!layer || !this.draft) return;
    const previewX = Math.max(40, Math.round((this.draft.width - layer.width) / 2));
    const previewY = Math.max(40, Math.round(this.draft.height * 0.18));
    layer.x = previewX;
    layer.y = previewY;
  },

  finishTextLayerEditing(options = {}) {
    const session = this.textEditSession;
    if (!session) return null;
    const layer = this.getLayerById(session.layerId);
    if (layer && !session.isNew && session.original) {
      layer.x = session.original.x;
      layer.y = session.original.y;
    }
    if (layer && session.isNew && options.removeNew) {
      this.draft.layers = this.draft.layers.filter((item) => item.id !== layer.id);
      this.draft.layers = normalizeLayerOrder(this.draft.layers);
    }
    this.textEditSession = null;
    return layer;
  },

  selectCutStyle(event) {
    const style = event.currentTarget.dataset.style || "straight";
    if (style === "subject") {
      return this.removeSelectedImageBackground();
    }
    if (style === "straight") {
      const layer = this.getSelectedLayer();
      if (!layer || layer.type !== "image" || !layer.source) {
        this.straightCutPickPending = true;
        this.setData({
          activeTool: "cut",
          activePalette: "",
          activeDrawer: "",
          selectedLayerId: "",
          selectedLayerType: ""
        });
        showToast("请在画布上选择图片", { icon: "none" });
        return;
      }
      this.beginStraightCut(layer);
      return;
    }
    if (style !== "free") {
      showToast("剪法待接入", { icon: "none" });
      return;
    }
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "image" || !layer.source) {
      this.scissorPickPending = true;
      this.setData({
        activeTool: "cut",
        activePalette: "",
        activeDrawer: "",
        selectedLayerId: "",
        selectedLayerType: ""
      });
      showToast("请在画布上选择图片", { icon: "none" });
      return;
    }
    this.beginScissorCut(layer);
  },

  beginStraightCut(targetLayer) {
    const layer = targetLayer || this.getSelectedLayer();
    if (!layer || layer.type !== "image" || !layer.source) {
      showToast("请选择图片图层", { icon: "none" });
      return;
    }
    const start = layerLocalPointToDraft({ x: layer.width * 0.16, y: layer.height * 0.5 }, layer);
    const end = layerLocalPointToDraft({ x: layer.width * 0.84, y: layer.height * 0.5 }, layer);
    this.straightCutSession = {
      layerId: layer.id,
      start,
      end
    };
    this.straightCutGesture = null;
    this.setData({
      straightCutEditing: true,
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      activeTool: "cut",
      activePalette: "",
      activeDrawer: "",
      textInputVisible: false,
      ratioPanelVisible: false,
      layerActionsPage: 0,
      layerActionsOffset: 0
    });
    setTimeout(() => this.drawStraightCutOverlay(), 0);
    this.render();
  },

  cancelStraightCut() {
    this.clearStraightCutEditing();
    this.render();
  },

  confirmStraightCut() {
    const session = this.straightCutSession;
    if (!session || !this.draft) return;
    this.cancelStraightCutOverlayFrame();
    const index = this.draft.layers.findIndex((layer) => layer.id === session.layerId);
    const layer = this.draft.layers[index];
    if (!layer) {
      this.clearStraightCutEditing();
      return;
    }
    const start = draftPointToLayerLocal(session.start, layer);
    const end = draftPointToLayerLocal(session.end, layer);
    const polygons = splitRectByLine(layer.width, layer.height, start, end);
    if (!polygons) {
      showToast("剪切线需要穿过图片", { icon: "none" });
      return;
    }
    const normal = lineNormal(start, end);
    const angle = ((layer.rotation || 0) * Math.PI) / 180;
    const nudge = {
      x: (-normal.x * Math.cos(angle) + normal.y * Math.sin(angle)) * 8,
      y: (-normal.x * Math.sin(angle) - normal.y * Math.cos(angle)) * 8
    };
    const first = {
      ...JSON.parse(JSON.stringify(layer)),
      id: `${layer.type}-cut-${Date.now()}-a`,
      clipPolygon: polygons[0],
      cutPiece: true,
      cutStyle: "straight",
      x: layer.x + nudge.x,
      y: layer.y + nudge.y
    };
    const second = {
      ...JSON.parse(JSON.stringify(layer)),
      id: `${layer.type}-cut-${Date.now()}-b`,
      clipPolygon: polygons[1],
      cutPiece: true,
      cutStyle: "straight",
      x: layer.x - nudge.x,
      y: layer.y - nudge.y
    };
    this.draft.layers.splice(index, 1, first, second);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.clearStraightCutEditing({
      selectedLayerId: polygonArea(polygons[0]) <= polygonArea(polygons[1]) ? first.id : second.id,
      selectedLayerType: layer.type,
      saveStatus: "已剪成两片"
    });
    this.markDirty();
    this.render();
    showSuccess("已剪成两片");
  },

  clearStraightCutEditing(extraData = {}) {
    this.clearStraightCutRuntime();
    this.setData({
      straightCutEditing: false,
      straightCutLineStyle: "",
      straightCutStartHandleStyle: "",
      straightCutEndHandleStyle: "",
      activeTool: "",
      activePalette: "",
      activeDrawer: "",
      ...extraData
    });
  },

  clearStraightCutRuntime() {
    this.cancelStraightCutOverlayFrame();
    this.clearStraightCutOverlayCanvas();
    this.straightCutSession = null;
    this.straightCutGesture = null;
    this.straightCutPickPending = false;
    this.straightCutCanvasNode = null;
    this.straightCutCtx = null;
    this.straightCutCanvasReadyPromise = null;
  },

  onStraightCutTouchStart(event) {
    const session = this.straightCutSession;
    const layer = session && this.getLayerById(session.layerId);
    const touch = event.touches && event.touches[0];
    if (!session || !layer || !touch) return;
    const point = this.clampStraightCutPoint(layer, this.toDraftPoint(touch));
    const threshold = 34 / (this.renderScale || 1);
    const startDistance = distance(point, session.start);
    const endDistance = distance(point, session.end);
    const lineDistance = distanceToSegment(point, session.start, session.end);
    if (startDistance <= threshold) {
      this.straightCutGesture = { mode: "start" };
      return;
    }
    if (endDistance <= threshold) {
      this.straightCutGesture = { mode: "end" };
      return;
    }
    if (lineDistance > threshold * 1.2) return;
    this.straightCutGesture = {
      mode: "line",
      startPoint: point,
      start: { ...session.start },
      end: { ...session.end }
    };
  },

  onStraightCutTouchMove(event) {
    const session = this.straightCutSession;
    const layer = session && this.getLayerById(session.layerId);
    const touch = event.touches && event.touches[0];
    if (!session || !layer || !this.straightCutGesture || !touch) return;
    const point = this.clampStraightCutPoint(layer, this.toDraftPoint(touch));
    if (this.straightCutGesture.mode === "start") {
      session.start = point;
    } else if (this.straightCutGesture.mode === "end") {
      session.end = point;
    } else if (this.straightCutGesture.mode === "line") {
      const delta = {
        x: point.x - this.straightCutGesture.startPoint.x,
        y: point.y - this.straightCutGesture.startPoint.y
      };
      session.start = this.clampStraightCutPoint(layer, {
        x: this.straightCutGesture.start.x + delta.x,
        y: this.straightCutGesture.start.y + delta.y
      });
      session.end = this.clampStraightCutPoint(layer, {
        x: this.straightCutGesture.end.x + delta.x,
        y: this.straightCutGesture.end.y + delta.y
      });
    }
    this.scheduleStraightCutOverlayDraw();
  },

  onStraightCutTouchEnd() {
    this.drawStraightCutOverlay();
    this.straightCutGesture = null;
  },

  clampStraightCutPoint(layer, point) {
    const local = draftPointToLayerLocal(point, layer);
    return layerLocalPointToDraft({
      x: Math.max(0, Math.min(layer.width, local.x)),
      y: Math.max(0, Math.min(layer.height, local.y))
    }, layer);
  },

  scheduleStraightCutOverlayDraw() {
    if (this.straightCutOverlayFrame) return;
    const flush = () => {
      this.straightCutOverlayFrame = null;
      this.drawStraightCutOverlay();
    };
    if (typeof requestAnimationFrame === "function") {
      this.straightCutOverlayFrame = requestAnimationFrame(flush);
      return;
    }
    this.straightCutOverlayFrame = setTimeout(flush, 16);
  },

  cancelStraightCutOverlayFrame() {
    if (!this.straightCutOverlayFrame) return;
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.straightCutOverlayFrame);
    } else {
      clearTimeout(this.straightCutOverlayFrame);
    }
    this.straightCutOverlayFrame = null;
  },

  ensureStraightCutCanvasContext() {
    if (this.straightCutCanvasNode && this.straightCutCtx) return Promise.resolve(this.straightCutCtx);
    if (this.straightCutCanvasReadyPromise) return this.straightCutCanvasReadyPromise;
    this.straightCutCanvasReadyPromise = new Promise((resolve) => {
      wx.createSelectorQuery()
        .in(this)
        .select("#straightCutCanvas")
        .fields({ node: true, size: true })
        .exec((res) => {
          const result = res && res[0];
          const canvas = result && result.node;
          if (!canvas) {
            this.straightCutCanvasReadyPromise = null;
            resolve(null);
            return;
          }
          this.straightCutCanvasNode = canvas;
          this.straightCutCtx = canvas.getContext("2d");
          this.configureStraightCutCanvasBitmap();
          resolve(this.straightCutCtx);
        });
    });
    return this.straightCutCanvasReadyPromise;
  },

  configureStraightCutCanvasBitmap() {
    if (!this.straightCutCanvasNode || !this.straightCutCtx) return;
    const dpr = this.dpr || 1;
    const width = Math.max(1, Math.round((this.data.canvasCssWidth || 1) * dpr));
    const height = Math.max(1, Math.round((this.data.canvasCssHeight || 1) * dpr));
    if (this.straightCutCanvasNode.width !== width) this.straightCutCanvasNode.width = width;
    if (this.straightCutCanvasNode.height !== height) this.straightCutCanvasNode.height = height;
    if (this.straightCutCtx.setTransform) this.straightCutCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  clearStraightCutOverlayCanvas() {
    if (!this.straightCutCanvasNode || !this.straightCutCtx) return;
    this.configureStraightCutCanvasBitmap();
    this.straightCutCtx.clearRect(0, 0, this.data.canvasCssWidth || 1, this.data.canvasCssHeight || 1);
  },

  drawStraightCutOverlay() {
    if (!this.straightCutSession || !this.data.straightCutEditing) return;
    if (this.straightCutCtx) {
      this.paintStraightCutOverlay(this.straightCutCtx);
      return;
    }
    this.ensureStraightCutCanvasContext().then((ctx) => {
      if (ctx) this.paintStraightCutOverlay(ctx);
    });
  },

  paintStraightCutOverlay(ctx) {
    if (!ctx || !this.straightCutSession || !this.data.straightCutEditing) return;
    this.configureStraightCutCanvasBitmap();
    const metrics = this.getStraightCutOverlayMetrics();
    if (!metrics) return;
    const width = this.data.canvasCssWidth || 1;
    const height = this.data.canvasCssHeight || 1;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.strokeStyle = "rgba(17, 17, 17, 0.78)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    if (ctx.setLineDash) ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(metrics.start.x, metrics.start.y);
    ctx.lineTo(metrics.end.x, metrics.end.y);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
    this.drawStraightCutHandle(ctx, metrics.start);
    this.drawStraightCutHandle(ctx, metrics.end);
    ctx.restore();
  },

  drawStraightCutHandle(ctx, point) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },

  getStraightCutOverlayMetrics() {
    const session = this.straightCutSession;
    if (!session) return null;
    const scale = this.renderScale || 1;
    return {
      start: { x: session.start.x * scale, y: session.start.y * scale },
      end: { x: session.end.x * scale, y: session.end.y * scale }
    };
  },

  addShape(event) {
    if (this.data.embossEditing) {
      this.selectEmbossShape(event);
      return;
    }
    this.enterEditMode();
    const shape = event.currentTarget.dataset.shape || "circle";
    const layer = this.getSelectedLayer();
    if (!layer) {
      showToast("请先选择一个图层", { icon: "none" });
      this.setData({ activeTool: "", activePalette: "" });
      return;
    }
    if (layer.type === "text") {
      showToast("文字图层暂不支持压花", { icon: "none" });
      return;
    }
    layer.style = {
      ...(layer.style || {}),
      clipShape: normalizeEmbossShape(shape),
      embossEdge: true
    };
    if (layer.radius) layer.radius = 0;
    this.setData({
      activeTool: "",
      activePalette: "",
      activeDrawer: "",
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      layerActionsPage: 0,
      layerActionsOffset: 0
    });
    this.markDirty();
    this.render();
  },

  onTextInput(event) {
    const value = event.detail.value;
    const layer = this.getSelectedLayer();
    if (layer && layer.type === "text") {
      layer.text = value;
      this.render();
      if (!this.data.textInputVisible) {
        this.markDirty();
      }
    }
    this.setData({ textDraft: value });
  },

  confirmText() {
    const text = (this.data.textDraft || "").trim() || "weekend";
    this.enterEditMode();
    const selectedLayer = this.getSelectedLayer();
    if (selectedLayer && selectedLayer.type === "text" && this.data.textInputVisible) {
      selectedLayer.text = text;
      this.finishTextLayerEditing();
      this.setData({
        selectedLayerId: "",
        selectedLayerType: "",
        textInputVisible: false,
        textDraft: "",
        activeTool: "",
        keyboardHeight: 0,
        textPanelBottom: 0
      });
      this.markDirty();
      this.render();
      return;
    }
    const layer = createTextLayer(text, this.draft);
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      keyboardHeight: 0,
      textPanelBottom: 0
    });
    this.markDirty();
    this.render();
  },

  cancelText() {
    const layer = this.getSelectedLayer();
    const removeNew = !!(this.textEditSession && this.textEditSession.isNew);
    if (layer && layer.type === "text") {
      this.finishTextLayerEditing({ removeNew });
      this.render();
    }
    this.setData({
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      selectedLayerId: "",
      selectedLayerType: "",
      keyboardHeight: 0,
      textPanelBottom: 0
    });
  },

  dismissTextEditorFromCanvas() {
    const layer = this.getSelectedLayer();
    const text = (this.data.textDraft || "").trim();
    const removeNew = !!(this.textEditSession && this.textEditSession.isNew && !text);
    if (layer && layer.type === "text") {
      if (text) {
        layer.text = text;
      }
      this.finishTextLayerEditing({ removeNew });
    }
    this.setData({
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      selectedLayerId: "",
      selectedLayerType: "",
      keyboardHeight: 0,
      textPanelBottom: 0
    });
    this.markDirty();
    this.render();
  },

  dismissFloatingPanels() {
    if (this.data.straightCutEditing) return;
    if (this.data.textInputVisible) {
      this.dismissTextEditorFromCanvas();
      return;
    }
    const patch = {};
    let shouldRender = false;
    if (this.data.ratioPanelVisible) {
      patch.ratioPanelVisible = false;
    }
    if (this.data.selectedLayerId) {
      patch.selectedLayerId = "";
      patch.selectedLayerType = "";
      patch.layerActionsPage = 0;
      patch.layerActionsOffset = 0;
      shouldRender = true;
    }
    if (this.data.activePalette) {
      patch.activeTool = "";
      patch.activePalette = "";
      this.scissorPickPending = false;
      this.straightCutPickPending = false;
      this.embossPickPending = false;
    }
    if (!Object.keys(patch).length) return;
    this.setData(patch);
    if (shouldRender) {
      this.render();
    }
  },

  noopCanvasTap() {},

  onTouchStart(event) {
    if (this.data.straightCutEditing) {
      this.onStraightCutTouchStart(event);
      return;
    }
    if (this.data.scissorEditing) {
      this.onScissorTouchStart(event);
      return;
    }
    if (this.data.embossEditing) {
      this.onEmbossTouchStart(event);
      return;
    }
    if (this.data.cropEditing) {
      this.onCropTouchStart(event);
      return;
    }
    if (this.data.textInputVisible) {
      this.dismissTextEditorFromCanvas();
      return;
    }
    const touches = event.touches || [];
    if (!touches.length) return;
    const points = touches.map((touch) => this.toDraftPoint(touch));
    this.pendingLayerTap = null;

    if (touches.length === 1) {
      const target = hitTest(points[0].x, points[0].y, this.draft.layers);
      if (this.straightCutPickPending) {
        if (target && target.type === "image" && target.source) {
          this.straightCutPickPending = false;
          this.setData({
            selectedLayerId: target.id,
            selectedLayerType: target.type,
            activeTool: "",
            activePalette: "",
            layerActionsPage: 0,
            layerActionsOffset: 0
          });
          this.beginStraightCut(target);
          return;
        }
        showToast("请选择图片图层", { icon: "none" });
        return;
      }
      if (this.scissorPickPending) {
        if (target && target.type === "image" && target.source) {
          this.scissorPickPending = false;
          this.setData({
            selectedLayerId: target.id,
            selectedLayerType: target.type,
            activeTool: "",
            activePalette: "",
            layerActionsPage: 0,
            layerActionsOffset: 0
          });
          this.beginScissorCut(target);
          return;
        }
        showToast("请选择图片图层", { icon: "none" });
        return;
      }
      if (this.embossPickPending) {
        if (target && target.type === "image" && target.source) {
          this.embossPickPending = false;
          this.setData({
            selectedLayerId: target.id,
            selectedLayerType: target.type,
            activeTool: "",
            activePalette: "",
            layerActionsPage: 0,
            layerActionsOffset: 0
          });
          this.beginEmbossEdit();
          return;
        }
        showToast("请选择图片图层", { icon: "none" });
        return;
      }
      this.pendingLayerTap = {
        layerId: target ? target.id : "",
        start: points[0],
        moved: false
      };
      if (!target) {
        this.setData({
          selectedLayerId: "",
          selectedLayerType: "",
          layerActionsPage: 0,
          layerActionsOffset: 0
        });
      } else if (this.data.selectedLayerId && this.data.selectedLayerId !== target.id) {
        this.setData({
          selectedLayerId: "",
          selectedLayerType: "",
          layerActionsPage: 0,
          layerActionsOffset: 0
        });
      }
      this.gesture = target
        ? { mode: "drag", layerId: target.id, start: points[0], origin: { x: target.x, y: target.y } }
        : null;
      this.render();
      return;
    }

    const layer = this.getGestureLayer(points);
    if (touches.length >= 2 && layer) {
      if (this.data.selectedLayerId && this.data.selectedLayerId !== layer.id) {
        this.setData({
          selectedLayerId: "",
          selectedLayerType: "",
          layerActionsPage: 0,
          layerActionsOffset: 0
        });
      }
      this.gesture = {
        mode: "pinch",
        layerId: layer.id,
        distance: distance(points[0], points[1]),
        angle: angle(points[0], points[1]),
        origin: { width: layer.width, height: layer.height, rotation: layer.rotation }
      };
    }
  },

  onTouchMove(event) {
    if (this.data.straightCutEditing) {
      this.onStraightCutTouchMove(event);
      return;
    }
    if (this.data.scissorEditing) {
      this.onScissorTouchMove(event);
      return;
    }
    if (this.data.embossEditing) {
      this.onEmbossTouchMove(event);
      return;
    }
    if (this.data.cropEditing) {
      this.onCropTouchMove(event);
      return;
    }
    if (!this.gesture) return;
    const layer = this.getLayerById(this.gesture.layerId);
    if (!layer) return;
    const touches = event.touches || [];
    const points = touches.map((touch) => this.toDraftPoint(touch));

    if (this.gesture.mode === "drag" && points.length === 1) {
      if (this.pendingLayerTap) {
        const moveDistance = distance(this.pendingLayerTap.start, points[0]);
        this.pendingLayerTap.moved = moveDistance > 6;
      }
      this.rotationGuideState = null;
      layer.x = this.gesture.origin.x + points[0].x - this.gesture.start.x;
      layer.y = this.gesture.origin.y + points[0].y - this.gesture.start.y;
      this.alignmentGuides = this.getStableAlignmentGuides(this.getAlignmentGuides(layer));
    }

    if (this.gesture.mode === "pinch" && points.length >= 2) {
      if (this.pendingLayerTap) {
        this.pendingLayerTap.moved = true;
      }
      this.alignmentGuideState = null;
      const nextDistance = distance(points[0], points[1]);
      const nextAngle = angle(points[0], points[1]);
      const scale = Math.max(0.25, Math.min(3, nextDistance / this.gesture.distance));
      layer.width = this.gesture.origin.width * scale;
      layer.height = this.gesture.origin.height * scale;
      layer.rotation = this.gesture.origin.rotation + nextAngle - this.gesture.angle;
      this.alignmentGuides = this.getStableRotationGuides(this.getRotationAlignmentGuides(layer));
    }

    this.render();
  },

  onTouchEnd() {
    if (this.data.straightCutEditing) {
      this.onStraightCutTouchEnd();
      return;
    }
    if (this.data.scissorEditing) {
      this.onScissorTouchEnd();
      return;
    }
    if (this.data.embossEditing) {
      this.embossGesture = null;
      return;
    }
    if (this.data.cropEditing) {
      this.cropGesture = null;
      return;
    }
    const pendingTap = this.pendingLayerTap;
    const gesture = this.gesture;
    const hadGuides = !!(this.alignmentGuides && this.alignmentGuides.length);
    this.clearAlignmentGuides();
    if (this.gesture) {
      this.gesture = null;
      if (gesture.mode === "pinch" || (pendingTap && pendingTap.moved)) {
        this.markDirty();
      }
    }
    this.pendingLayerTap = null;
    if (pendingTap && !pendingTap.moved && (!gesture || gesture.mode === "drag")) {
      if (!pendingTap.layerId) {
        this.clearSelection();
        return;
      }
      const layer = this.getLayerById(pendingTap.layerId);
      if (layer) {
        this.selectLayer(layer);
        this.render();
      }
    } else if (hadGuides) {
      this.render();
    }
  },

  getAlignmentGuides(layer) {
    if (!layer || !this.draft) return [];
    const threshold = ALIGNMENT_GUIDE_SCREEN_THRESHOLD / (this.renderScale || 1);
    const movingAnchors = getLayerAlignmentAnchors(layer);
    const referenceAnchors = getCanvasAlignmentAnchors(this.draft);
    (this.draft.layers || []).forEach((item) => {
      if (item && item.id !== layer.id) {
        referenceAnchors.push(...getLayerAlignmentAnchors(item));
      }
    });
    const nearestX = findNearestAlignment(movingAnchors.filter((anchor) => anchor.axis === "x"), referenceAnchors, threshold);
    const nearestY = findNearestAlignment(movingAnchors.filter((anchor) => anchor.axis === "y"), referenceAnchors, threshold);
    return [nearestX, nearestY]
      .filter(Boolean)
      .map((match) => ({
        axis: match.axis,
        value: match.value
      }));
  },

  getStableAlignmentGuides(guides) {
    const key = getAlignmentGuideKey(guides);
    if (!key) {
      this.alignmentGuideState = null;
      return [];
    }
    if (!this.alignmentGuideState || this.alignmentGuideState.key !== key) {
      this.alignmentGuideState = {
        key,
        moves: 1
      };
      return [];
    }
    this.alignmentGuideState.moves += 1;
    return this.alignmentGuideState.moves >= ALIGNMENT_GUIDE_STABLE_MOVES ? guides : [];
  },

  getRotationAlignmentGuides(layer) {
    if (!layer || !ROTATION_GUIDE_LAYER_TYPES.includes(layer.type) || !this.draft) {
      return { key: "", guides: [] };
    }
    const nearestAngle = getNearestRightAngle(layer.rotation || 0);
    if (nearestAngle.distance > ROTATION_GUIDE_ANGLE_THRESHOLD) {
      return { key: "", guides: [] };
    }
    return {
      key: `rotation:${nearestAngle.value}`,
      guides: [
        { axis: "x", value: layer.x + layer.width / 2 },
        { axis: "y", value: layer.y + layer.height / 2 }
      ]
    };
  },

  getStableRotationGuides(result) {
    const key = result && result.key;
    if (!key) {
      this.rotationGuideState = null;
      return [];
    }
    if (!this.rotationGuideState || this.rotationGuideState.key !== key) {
      this.rotationGuideState = {
        key,
        moves: 1
      };
      return [];
    }
    this.rotationGuideState.moves += 1;
    return this.rotationGuideState.moves >= ROTATION_GUIDE_STABLE_MOVES ? result.guides : [];
  },

  clearAlignmentGuides() {
    this.alignmentGuides = [];
    this.alignmentGuideState = null;
    this.rotationGuideState = null;
  },

  clearCropEditing() {
    this.cropSession = null;
    this.cropGesture = null;
  },

  clearScissorEditing() {
    this.scissorSession = null;
    this.scissorStroke = null;
    this.resetScissorCanvasContext();
  },

  clearEmbossEditing() {
    this.embossSession = null;
    this.embossGesture = null;
  },

  beginEmbossEdit() {
    this.embossPickPending = false;
    const layer = this.getSelectedLayer();
    if (!layer) {
      showToast("请先选择一个图层", { icon: "none" });
      return;
    }
    if (layer.type !== "image" || !layer.source) {
      showToast("请先选择图片图层", { icon: "none" });
      return;
    }
    const startEmboss = () => {
      const currentShape = normalizeEmbossShape((layer.style || {}).clipShape || layer.clipShape || "circle") || "circle";
      const sourceSize = {
        width: layer.sourceWidth || layer.width,
        height: layer.sourceHeight || layer.height
      };
      const preview = getCropPreviewLayout({ width: layer.width, height: layer.height }, {
        screenWidth: this.screenWidth,
        screenHeight: this.screenHeight,
        chromeTop: this.data.chromeTop
      });
      const size = Math.max(EMBOSS_MIN_SIZE, Math.min(layer.width, layer.height) * 0.72);
      this.embossSession = {
        layerId: layer.id,
        originalLayer: JSON.parse(JSON.stringify(layer)),
        sourceSize,
        preview,
        mask: {
          x: (layer.width - size) / 2,
          y: (layer.height - size) / 2,
          width: size,
          height: size
        }
      };
      this.embossGesture = null;
      this.updateEmbossPreviewData(currentShape);
      this.resetCanvasContext();
      this.setData({
        embossEditing: true,
        embossShape: currentShape,
        embossImageSrc: layer.source,
        activeTool: "shape",
        activeDrawer: "",
        activePalette: "",
        ratioPanelVisible: false,
        textInputVisible: false,
        layerActionsPage: 0,
        layerActionsOffset: 0
      });
    };
    if (layer.sourceWidth && layer.sourceHeight) {
      startEmboss();
      return;
    }
    wx.getImageInfo({
      src: layer.source,
      success: (info) => {
        layer.sourceWidth = info.width;
        layer.sourceHeight = info.height;
        startEmboss();
      },
      fail: () => {
        layer.sourceWidth = layer.width;
        layer.sourceHeight = layer.height;
        startEmboss();
      }
    });
  },

  cancelEmbossEdit() {
    if (!this.embossSession) return;
    const index = this.draft.layers.findIndex((layer) => layer.id === this.embossSession.layerId);
    if (index >= 0) {
      this.draft.layers[index] = this.embossSession.originalLayer;
    }
    this.clearEmbossEditing();
    this.embossPickPending = false;
    this.resetCanvasContext();
    this.setData({
      embossEditing: false,
      embossImageSrc: "",
      embossImageStyle: "",
      embossMaskStyle: "",
      activeTool: "",
      activePalette: ""
    });
    setTimeout(() => this.render(), 0);
  },

  async confirmEmbossEdit() {
    if (!this.embossSession) return;
    const layer = this.getLayerById(this.embossSession.layerId);
    if (!layer || layer.type !== "image") {
      this.cancelEmbossEdit();
      return;
    }
    const mask = clampEmbossMask(this.embossSession.mask, layer);
    if (mask.width < EMBOSS_MIN_SIZE || mask.height < EMBOSS_MIN_SIZE) {
      showToast("压花区域太小", { icon: "none" });
      return;
    }
    const sourceCrop = getLayerSourceCrop(layer);
    const shape = normalizeEmbossShape(this.data.embossShape || "circle");
    this.setData({ saveStatus: "压花处理中..." });
    let remainder;
    try {
      remainder = await this.createEmbossRemainderImage(layer, mask, shape);
    } catch (error) {
      console.warn("[emboss] remainder failed", error);
      this.setData({ saveStatus: "压花失败" });
      showError("压花失败，请重试");
      return;
    }
    const nextCrop = {
      x: sourceCrop.x + mask.x / layer.width * sourceCrop.width,
      y: sourceCrop.y + mask.y / layer.height * sourceCrop.height,
      width: mask.width / layer.width * sourceCrop.width,
      height: mask.height / layer.height * sourceCrop.height
    };
    const center = layerLocalPointToDraft({
      x: mask.x + mask.width / 2,
      y: mask.y + mask.height / 2
    }, layer);
    const cutLayer = {
      ...JSON.parse(JSON.stringify(layer)),
      id: `image-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      x: center.x - mask.width / 2,
      y: center.y - mask.height / 2,
      width: mask.width,
      height: mask.height,
      crop: roundCrop(nextCrop),
      radius: 0,
      style: {
        ...(layer.style || {}),
        clipShape: shape,
        embossEdge: true,
        excludeShape: "",
        excludeFrame: null
      }
    };
    layer.source = remainder.path;
    layer.sourceWidth = remainder.width;
    layer.sourceHeight = remainder.height;
    layer.crop = null;
    layer.clipShape = "";
    layer.maskShape = "";
    layer.excludeShape = "";
    layer.excludeFrame = null;
    layer.style = {
      ...(layer.style || {}),
      clipShape: "",
      maskShape: "",
      embossEdge: false,
      excludeShape: "",
      excludeFrame: null,
      shape: ""
    };
    const index = this.getSelectedLayerIndex();
    this.draft.layers.splice(index + 1, 0, cutLayer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.clearEmbossEditing();
    this.embossPickPending = false;
    this.resetCanvasContext();
    this.setData({
      embossEditing: false,
      embossImageSrc: "",
      embossImageStyle: "",
      embossMaskStyle: "",
      selectedLayerId: cutLayer.id,
      selectedLayerType: cutLayer.type,
      activeTool: "",
      activePalette: ""
    });
    this.markDirty();
    setTimeout(() => this.render(), 0);
  },

  selectEmbossShape(event) {
    const shape = normalizeEmbossShape(event.currentTarget.dataset.shape || "circle") || "circle";
    this.updateEmbossPreviewData(shape);
    this.setData({ embossShape: shape });
  },

  onEmbossTouchStart(event) {
    const touches = event.touches || [];
    const touch = touches[0];
    if (!this.embossSession || !touch) return;
    if (touches.length >= 2) {
      const points = touches.slice(0, 2).map((item) => this.toEmbossLayerPoint(item));
      const mask = this.embossSession.mask;
      this.embossGesture = {
        mode: "pinch",
        distance: distance(points[0], points[1]),
        center: {
          x: mask.x + mask.width / 2,
          y: mask.y + mask.height / 2
        },
        origin: { ...mask }
      };
      return;
    }
    const point = this.toEmbossLayerPoint(touch);
    const mask = this.embossSession.mask;
    const handle = getEmbossMaskHandle(point, mask, CROP_HANDLE_SCREEN_SIZE / this.embossSession.preview.scale);
    const isInside = isPointInsideBox(point, mask);
    if (!handle && !isInside) {
      this.embossGesture = null;
      return;
    }
    this.embossGesture = {
      mode: handle ? "resize" : "move",
      handle,
      start: point,
      origin: { ...mask }
    };
  },

  onEmbossTouchMove(event) {
    const touches = event.touches || [];
    const touch = touches[0];
    if (!this.embossSession || !this.embossGesture || !touch) return;
    const layer = this.getLayerById(this.embossSession.layerId);
    if (!layer) return;
    if (this.embossGesture.mode === "pinch" && touches.length >= 2) {
      const points = touches.slice(0, 2).map((item) => this.toEmbossLayerPoint(item));
      const startDistance = Math.max(1, this.embossGesture.distance || 1);
      const scale = Math.max(0.25, Math.min(4, distance(points[0], points[1]) / startDistance));
      const size = this.embossGesture.origin.width * scale;
      const center = this.embossGesture.center;
      this.embossSession.mask = clampEmbossMask({
        x: center.x - size / 2,
        y: center.y - size / 2,
        width: size,
        height: size
      }, layer);
      this.updateEmbossPreviewData();
      return;
    }
    const point = this.toEmbossLayerPoint(touch);
    const dx = point.x - this.embossGesture.start.x;
    const dy = point.y - this.embossGesture.start.y;
    const nextMask = this.embossGesture.mode === "move"
      ? moveCropBox(this.embossGesture.origin, dx, dy, { width: layer.width, height: layer.height })
      : resizeEmbossMask(this.embossGesture.origin, dx, dy, this.embossGesture.handle, layer);
    this.embossSession.mask = nextMask;
    this.updateEmbossPreviewData();
  },

  toEmbossLayerPoint(touch) {
    const preview = this.embossSession.preview;
    const point = getClientPoint(touch);
    return {
      x: (point.x - preview.left) / preview.scale,
      y: (point.y - preview.top) / preview.scale
    };
  },

  updateEmbossPreviewData(shape) {
    if (!this.embossSession) return;
    const layer = this.getLayerById(this.embossSession.layerId);
    if (!layer) return;
    const preview = this.embossSession.preview;
    const mask = clampEmbossMask(this.embossSession.mask, layer);
    this.embossSession.mask = mask;
    const nextShape = normalizeEmbossShape(shape || this.data.embossShape || "circle") || "circle";
    this.setData({
      embossImageStyle: `left:${preview.left}px;top:${preview.top}px;width:${preview.width}px;height:${preview.height}px;`,
      embossMaskStyle: `left:${preview.left + mask.x * preview.scale}px;top:${preview.top + mask.y * preview.scale}px;width:${mask.width * preview.scale}px;height:${mask.height * preview.scale}px;`,
      embossMaskShapeClass: nextShape
    });
  },

  resetScissorCanvasContext() {
    this.scissorCanvasNode = null;
    this.scissorCtx = null;
    this.scissorCanvasReadyPromise = null;
    this.scissorLoadedImageSrc = "";
    this.scissorLoadedImage = null;
  },

  beginImageCrop() {
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "image") return;
    const originalLayer = JSON.parse(JSON.stringify(layer));
    const startCrop = () => {
      const sourceSize = {
        width: layer.sourceWidth || layer.width,
        height: layer.sourceHeight || layer.height
      };
      const box = hasLayerCrop(layer)
        ? clampCropBox(getLayerSourceCrop(layer), sourceSize)
        : getFullCropBox(sourceSize);
      const preview = getCropPreviewLayout(sourceSize, {
        screenWidth: this.screenWidth,
        screenHeight: this.screenHeight,
        chromeTop: this.data.chromeTop
      });
      this.cropSession = {
        layerId: layer.id,
        originalLayer,
        sourceSize,
        preview,
        box
      };
      this.cropGesture = null;
      this.clearAlignmentGuides();
      this.updateCropPreviewData();
      this.resetCanvasContext();
      this.setData({
        cropEditing: true,
        cropRatio: "free",
        cropImageSrc: layer.source,
        activeTool: "",
        activeDrawer: "",
        activePalette: "",
        ratioPanelVisible: false,
        layerActionsPage: 0,
        layerActionsOffset: 0
      });
    };
    const prepareAndStart = () => {
      this.setData({ saveStatus: "准备裁切..." });
      this.prepareLayerForVisualSourceEdit(layer)
        .then(startCrop)
        .catch((error) => {
          console.warn("[crop] prepare source failed", error);
          showError("图片准备失败，请重试");
        });
    };
    if (layer.sourceWidth && layer.sourceHeight) {
      prepareAndStart();
      return;
    }
    wx.getImageInfo({
      src: layer.source,
      success: (info) => {
        layer.sourceWidth = info.width;
        layer.sourceHeight = info.height;
        prepareAndStart();
      },
      fail: () => {
        layer.sourceWidth = layer.width;
        layer.sourceHeight = layer.height;
        prepareAndStart();
      }
    });
  },

  cancelCrop() {
    if (!this.cropSession) return;
    const index = this.draft.layers.findIndex((layer) => layer.id === this.cropSession.layerId);
    if (index >= 0) {
      this.draft.layers[index] = this.cropSession.originalLayer;
    }
    this.cropSession = null;
    this.cropGesture = null;
    this.resetCanvasContext();
    this.setData({
      cropEditing: false,
      cropRatio: "free",
      cropImageSrc: "",
      cropImageStyle: "",
      cropBoxStyle: ""
    });
    setTimeout(() => this.render(), 0);
  },

  confirmCrop() {
    if (!this.cropSession) return;
    const layer = this.getLayerById(this.cropSession.layerId);
    if (!layer) {
      this.cancelCrop();
      return;
    }
    const box = clampCropBox(this.cropSession.box, this.cropSession.sourceSize);
    const previousCrop = getLayerSourceCrop(layer);
    const currentCenter = {
      x: layer.x + layer.width / 2,
      y: layer.y + layer.height / 2
    };
    const displayScale = Math.min(layer.width / previousCrop.width, layer.height / previousCrop.height);
    layer.width = box.width * displayScale;
    layer.height = box.height * displayScale;
    layer.x = currentCenter.x - layer.width / 2;
    layer.y = currentCenter.y - layer.height / 2;
    layer.crop = roundCrop(box);
    this.cropSession = null;
    this.cropGesture = null;
    this.resetCanvasContext();
    this.setData({
      cropEditing: false,
      cropRatio: "free",
      cropImageSrc: "",
      cropImageStyle: "",
      cropBoxStyle: ""
    });
    this.markDirty();
    setTimeout(() => this.render(), 0);
  },

  resetCrop() {
    if (!this.cropSession) return;
    this.cropSession.box = {
      x: 0,
      y: 0,
      width: this.cropSession.sourceSize.width,
      height: this.cropSession.sourceSize.height
    };
    this.updateCropPreviewData();
    this.setData({ cropRatio: "free" });
  },

  setCropRatio(event) {
    const ratio = event.currentTarget.dataset.ratio || "free";
    if (!this.cropSession) return;
    const nextBox = getCropBoxForRatio(this.cropSession.box, this.cropSession.sourceSize, ratio, this.cropSession.sourceSize);
    this.cropSession.box = nextBox;
    this.updateCropPreviewData();
    this.setData({ cropRatio: ratio });
  },

  onCropTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!this.cropSession || !touch) return;
    const point = this.toCropSourcePoint(touch);
    const handle = getCropHandle(point, this.cropSession.box, CROP_HANDLE_SCREEN_SIZE / this.cropSession.preview.scale);
    const isInside = isPointInsideBox(point, this.cropSession.box);
    if (!handle && !isInside) {
      this.cropGesture = null;
      return;
    }
    this.cropGesture = {
      mode: handle ? "resize" : "move",
      handle,
      start: point,
      origin: { ...this.cropSession.box }
    };
  },

  onCropTouchMove(event) {
    const touch = event.touches && event.touches[0];
    if (!this.cropSession || !touch || !this.cropGesture) return;
    const point = this.toCropSourcePoint(touch);
    const dx = point.x - this.cropGesture.start.x;
    const dy = point.y - this.cropGesture.start.y;
    const ratio = getRatioValue(this.data.cropRatio, this.cropSession.sourceSize);
    const nextBox = this.cropGesture.mode === "move"
      ? moveCropBox(this.cropGesture.origin, dx, dy, this.cropSession.sourceSize)
      : resizeCropBox(this.cropGesture.origin, dx, dy, this.cropGesture.handle, this.cropSession.sourceSize, ratio);
    this.cropSession.box = nextBox;
    this.updateCropPreviewData();
  },

  toCropSourcePoint(touch) {
    const preview = this.cropSession.preview;
    return {
      x: (touch.clientX - preview.left) / preview.scale,
      y: (touch.clientY - preview.top) / preview.scale
    };
  },

  updateCropPreviewData() {
    if (!this.cropSession) return;
    const preview = this.cropSession.preview;
    const box = this.cropSession.box;
    this.setData({
      cropImageStyle: `left:${preview.left}px;top:${preview.top}px;width:${preview.width}px;height:${preview.height}px;`,
      cropBoxStyle: `left:${preview.left + box.x * preview.scale}px;top:${preview.top + box.y * preview.scale}px;width:${box.width * preview.scale}px;height:${box.height * preview.scale}px;`
    });
  },

  toDraftPoint(touch) {
    const rect = this.canvasRect || { left: 0, top: 0 };
    const x = touch.x == null ? (touch.clientX == null ? 0 : touch.clientX - rect.left) : touch.x;
    const y = touch.y == null ? (touch.clientY == null ? 0 : touch.clientY - rect.top) : touch.y;
    return {
      x: x / this.renderScale,
      y: y / this.renderScale
    };
  },

  getSelectedLayer() {
    return this.getLayerById(this.data.selectedLayerId);
  },

  getLayerById(id) {
    return this.draft.layers.find((layer) => layer.id === id);
  },

  getSelectedLayerIndex() {
    return this.draft.layers.findIndex((layer) => layer.id === this.data.selectedLayerId);
  },

  getGestureLayer(points) {
    if (!points || points.length < 2) return this.getSelectedLayer();
    const midpoint = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    return hitTest(midpoint.x, midpoint.y, this.draft.layers)
      || hitTest(points[0].x, points[0].y, this.draft.layers)
      || this.getSelectedLayer();
  },

  selectLayer(layer) {
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      textInputVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0,
      layerActionsPage: 0,
      layerActionsOffset: 0
    });
  },

  closeAfterAddingLayer() {
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      textInputVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0
    });
  },

  keepAssetDrawerAfterAddingLayer() {
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      activeTool: "asset",
      activeDrawer: "asset",
      activePalette: "",
      textInputVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0
    });
  },

  editSelectedText() {
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "text") return;
    this.preloadPackagedFonts({ force: true });
    this.beginTextLayerEditing(layer, { isNew: false });
    this.setData({
      activeTool: "text",
      activeDrawer: "",
      activePalette: "",
      textInputVisible: true,
      textDraft: layer.text || "",
      textToolMode: "font",
      textFont: normalizeTextFontId(layer.style),
      textColor: layer.style.color || "#111111",
      textSize: layer.style.fontSize || 54,
      textBackground: layer.style.backgroundLabel || "无",
      textOpacity: Math.round((layer.opacity == null ? 1 : layer.opacity) * 100),
      textPanelBottom: this.data.keyboardHeight || 0
    });
  },

  setTextToolMode(event) {
    const mode = event.currentTarget.dataset.mode || "font";
    if (mode === "font") {
      this.preloadPackagedFonts({ force: true });
    }
    this.setData({ textToolMode: mode });
  },

  setTextFont(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const fontId = event.currentTarget.dataset.fontId || (this.data.textFonts[index] && this.data.textFonts[index].id) || "system";
    const fontStyle = createTextFontStyle(fontId);
    this.ensureTextFontLoaded(fontStyle.fontId);
    this.updateEditingTextStyle(fontStyle);
    this.setData({ textFont: fontStyle.fontId });
  },

  setTextColor(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const color = event.currentTarget.dataset.color || (this.data.textColors[index] && this.data.textColors[index].value) || "#111111";
    this.updateEditingTextStyle({ color });
    this.setData({ textColor: color });
  },

  setTextSize(event) {
    const size = Number(event.currentTarget.dataset.size || 54);
    this.updateEditingTextStyle({ fontSize: size });
    this.setData({ textSize: size });
  },

  setTextBackground(event) {
    const background = event.currentTarget.dataset.background || "无";
    this.updateEditingTextStyle({
      backgroundLabel: background,
      background: backgroundColorForLabel(background)
    });
    this.setData({ textBackground: background });
  },

  setTextOpacity(event) {
    const opacity = Number(event.currentTarget.dataset.opacity || 100);
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "text") return;
    layer.opacity = opacity / 100;
    this.setData({ textOpacity: opacity });
    if (!this.data.textInputVisible) {
      this.markDirty();
    }
    this.render();
  },

  updateEditingTextStyle(nextStyle) {
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "text") return;
    layer.style = {
      ...(layer.style || {}),
      ...nextStyle
    };
    if (!this.data.textInputVisible) {
      this.markDirty();
    }
    this.render();
  },

  applyLayerAction(event) {
    if (this.ignoreLayerActionTap) return;
    const action = event.currentTarget.dataset.action;
    if (action === "shape") {
      return this.beginEmbossEdit();
    }
    if (action === "cut") {
      const isOpen = this.data.activePalette === "cut";
      this.setData({
        activeTool: isOpen ? "" : "cut",
        activePalette: isOpen ? "" : "cut",
        activeDrawer: "",
        textInputVisible: false,
        ratioPanelVisible: false
      });
      return;
    }
    if (action === "crop") return this.beginImageCrop();
    if (action === "copy") return this.duplicateLayer();
    if (action === "delete") return this.deleteLayer();
    if (action === "up") return this.moveLayerUp();
    if (action === "down") return this.moveLayerDown();

    const layer = this.getSelectedLayer();
    if (!layer) return;
    if (action === "shadow") layer.shadow = !layer.shadow;
    if (action === "opacity") layer.opacity = layer.opacity === 0.58 ? 1 : 0.58;
    if (action === "corner") layer.radius = layer.radius ? 0 : 36;
    if (action === "tear") {
      layer.tear = !layer.tear;
      if (layer.tear) {
        layer.tearSeed = layer.tearSeed || Date.now() % 1000000;
      } else {
        delete layer.tearSeed;
      }
    }
    this.markDirty();
    this.render();
  },

  async removeSelectedImageBackground() {
    if (this.data.backgroundRemoving) return;
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "image" || !layer.source) return;
    this.setData({
      backgroundRemoving: true,
      saveStatus: "主体剪中..."
    });
    try {
      const resultPath = await removeImageBackground({ filePath: layer.source });
      const info = await getImageInfoAsync(resultPath);
      layer.source = resultPath;
      layer.sourceWidth = info.width || layer.sourceWidth || layer.width;
      layer.sourceHeight = info.height || layer.sourceHeight || layer.height;
      this.markDirty();
      this.render();
      showSuccess("主体剪完成");
    } catch (error) {
      const message = error && error.message === "missing_rembg_endpoint"
        ? "请先配置 Rembg API 地址"
        : "主体剪失败，请稍后重试";
      this.setData({ saveStatus: "主体剪失败" });
      showError(message);
    } finally {
      this.setData({ backgroundRemoving: false });
    }
  },

  duplicateLayer() {
    const layer = this.getSelectedLayer();
    if (!layer) return;
    const index = this.getSelectedLayerIndex();
    const copy = {
      ...JSON.parse(JSON.stringify(layer)),
      id: `${layer.type}-${Date.now()}`,
      x: layer.x + 36,
      y: layer.y + 36
    };
    this.draft.layers.splice(index + 1, 0, copy);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.setData({ selectedLayerId: copy.id, selectedLayerType: copy.type });
    this.markDirty();
    this.render();
  },

  moveLayerUp() {
    const index = this.getSelectedLayerIndex();
    if (index < 0 || index >= this.draft.layers.length - 1) return;
    this.swapLayers(index, index + 1);
    this.markDirty();
    this.render();
  },

  moveLayerDown() {
    const index = this.getSelectedLayerIndex();
    if (index <= 0) return;
    this.swapLayers(index, index - 1);
    this.markDirty();
    this.render();
  },

  swapLayers(fromIndex, toIndex) {
    const layers = this.draft.layers;
    const temp = layers[fromIndex];
    layers[fromIndex] = layers[toIndex];
    layers[toIndex] = temp;
    this.draft.layers = normalizeLayerOrder(layers);
  },

  deleteLayer() {
    const id = this.data.selectedLayerId;
    if (!id) return;
    this.draft.layers = this.draft.layers.filter((layer) => layer.id !== id);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.setData({ selectedLayerId: "", selectedLayerType: "" });
    this.markDirty();
    this.render();
  },

  clearSelection() {
    this.setData({ selectedLayerId: "", selectedLayerType: "" });
    this.render();
  },

  saveDraftWithThumbnail() {
    return this.createDraftThumbnail()
      .then((thumbnailPath) => {
        const nextDraft = {
          ...this.draft,
          thumbnailPath: thumbnailPath || this.draft.thumbnailPath || ""
        };
        return saveDraft(nextDraft);
      });
  },

  createDraftThumbnail() {
    return new Promise((resolve) => {
      this.drawCanvasSnapshot(() => {
        wx.canvasToTempFilePath({
          canvas: this.canvasNode,
          width: this.canvasNode ? this.canvasNode.width : this.data.canvasCssWidth,
          height: this.canvasNode ? this.canvasNode.height : this.data.canvasCssHeight,
          destWidth: 360,
          destHeight: Math.round(360 * this.draft.height / this.draft.width),
          success: (res) => this.persistThumbnailFile(res.tempFilePath).then(resolve).catch(() => resolve("")),
          fail: () => resolve("")
        }, this);
      });
    });
  },

  persistThumbnailFile(tempFilePath) {
    return new Promise((resolve, reject) => {
      if (!tempFilePath || !wx.getFileSystemManager) {
        resolve(tempFilePath || "");
        return;
      }
      wx.getFileSystemManager().saveFile({
        tempFilePath,
        success: (res) => resolve(res.savedFilePath || tempFilePath),
        fail: reject
      });
    });
  },

  saveCurrentDraft() {
    clearTimeout(this.saveTimer);
    this.saveDraftWithThumbnail()
      .then((draft) => {
        this.draft = draft;
        this.setData({
          saveStatus: "手动草稿已保存",
          hasRecentDraft: true,
          recentDraftThumb: draft.thumbnailPath || "",
          recentDrafts: this.getRecentDrafts()
        });
        showSuccess("草稿已保存");
        this.render();
      })
      .catch(() => showError("草稿保存失败"));
  },

  restoreDraft() {
    clearTimeout(this.saveTimer);
    this.textEditSession = null;
    this.clearCropEditing();
    this.clearScissorEditing();
    this.clearEmbossEditing();
    this.clearStraightCutRuntime();
    const draft = loadDraft();
    if (!draft) {
      showError("暂无手动草稿");
      return;
    }
    this.draft = normalizeDraftTextFonts(draft);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.resetHistory();
    this.updateCanvasSize(draft.ratio);
    this.setEditorMode(true);
    this.setData({
      selectedLayerId: "",
      saveStatus: "已恢复手动草稿",
      hasRecentDraft: true,
      cropEditing: false,
      cropRatio: "free",
      embossEditing: false,
      scissorEditing: false,
      scissorHasMask: false,
      scissorBusy: false,

      scissorImageStyle: "",
      straightCutEditing: false,
      straightCutLineStyle: "",
      straightCutStartHandleStyle: "",
      straightCutEndHandleStyle: ""
    });
    setTimeout(() => this.render(), 0);
  },

  markDirty() {
    if (this.data.textInputVisible) {
      clearTimeout(this.saveTimer);
      this.setData({ saveStatus: "编辑中..." });
      return;
    }
    this.recordHistory();
    this.setData({ saveStatus: "保存中..." });
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.draft = saveAutoDraft(this.draft);
      this.setData({ saveStatus: "已自动保存", hasRecentDraft: true });
    }, 900);
  },

  exportImage() {
    if (this.data.exporting) return;
    this.setData({ exporting: true, selectedLayerId: "" });
    this.drawCanvasAtPixelSize(this.draft.width, this.draft.height)
      .then((ready) => {
        if (!ready || !this.canvasNode) {
          this.setData({ exporting: false });
          showError("导出失败");
          return;
        }
        wx.canvasToTempFilePath({
          canvas: this.canvasNode,
          width: this.draft.width,
          height: this.draft.height,
          destWidth: this.draft.width,
          destHeight: this.draft.height,
          fileType: "png",
          success: (res) => {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => showSuccess("已保存到相册"),
              fail: () => showModal("保存失败", "请确认已允许保存到相册后重试。", { showCancel: false })
            });
          },
          fail: () => showError("导出失败"),
          complete: () => {
            this.setData({ exporting: false });
            this.render();
          }
        }, this);
      })
      .catch(() => {
        this.setData({ exporting: false });
        this.render();
        showError("导出失败");
      });
  }
});

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function angle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

function getClientPoint(touch) {
  return {
    x: touch.clientX == null ? touch.x : touch.clientX,
    y: touch.clientY == null ? touch.y : touch.clientY
  };
}

function getImageInfoAsync(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject
    });
  });
}

function getLayerSourceCrop(layer) {
  if (layer.crop && layer.crop.width > 0 && layer.crop.height > 0) {
    return { ...layer.crop };
  }
  return getFullCropBox({
    width: layer.sourceWidth || layer.width,
    height: layer.sourceHeight || layer.height
  });
}

function draftPointToLayerLocal(point, layer) {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rotation = -(layer.rotation || 0) * Math.PI / 180;
  const dx = point.x - cx;
  const dy = point.y - cy;
  return {
    x: dx * Math.cos(rotation) - dy * Math.sin(rotation) + layer.width / 2,
    y: dx * Math.sin(rotation) + dy * Math.cos(rotation) + layer.height / 2
  };
}

function layerLocalPointToDraft(point, layer) {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rotation = (layer.rotation || 0) * Math.PI / 180;
  const dx = point.x - layer.width / 2;
  const dy = point.y - layer.height / 2;
  return {
    x: cx + dx * Math.cos(rotation) - dy * Math.sin(rotation),
    y: cy + dx * Math.sin(rotation) + dy * Math.cos(rotation)
  };
}

function splitRectByLine(width, height, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) < 8) return null;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];
  const first = [];
  const second = [];
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    const currentSide = lineSide(start, end, current);
    const nextSide = lineSide(start, end, next);
    if (currentSide >= 0) first.push(current);
    if (currentSide <= 0) second.push(current);
    if ((currentSide > 0 && nextSide < 0) || (currentSide < 0 && nextSide > 0)) {
      const intersection = segmentLineIntersection(current, next, start, end);
      if (intersection) {
        first.push(intersection);
        second.push(intersection);
      }
    }
  }
  if (first.length < 3 || second.length < 3) return null;
  return [first, second];
}

function lineSide(start, end, point) {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function segmentLineIntersection(segStart, segEnd, lineStart, lineEnd) {
  const sx = segEnd.x - segStart.x;
  const sy = segEnd.y - segStart.y;
  const lx = lineEnd.x - lineStart.x;
  const ly = lineEnd.y - lineStart.y;
  const denominator = sx * ly - sy * lx;
  if (Math.abs(denominator) < 0.001) return null;
  const t = ((lineStart.x - segStart.x) * ly - (lineStart.y - segStart.y) * lx) / denominator;
  return {
    x: segStart.x + sx * t,
    y: segStart.y + sy * t
  };
}

function lineNormal(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: -dy / length, y: dx / length };
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, {
    x: start.x + dx * t,
    y: start.y + dy * t
  });
}

function getScissorStrokeBounds(strokes, layer) {
  const bounds = strokes.reduce((result, stroke) => {
    const halfSize = (stroke.size || SCISSOR_BRUSH_SIZE) / 2;
    (stroke.points || []).forEach((point) => {
      result.minX = Math.min(result.minX, point.x - halfSize);
      result.minY = Math.min(result.minY, point.y - halfSize);
      result.maxX = Math.max(result.maxX, point.x + halfSize);
      result.maxY = Math.max(result.maxY, point.y + halfSize);
    });
    return result;
  }, {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  });
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) return null;
  const x = clamp(bounds.minX, 0, layer.width);
  const y = clamp(bounds.minY, 0, layer.height);
  const maxX = clamp(bounds.maxX, 0, layer.width);
  const maxY = clamp(bounds.maxY, 0, layer.height);
  return {
    x,
    y,
    width: Math.max(0, maxX - x),
    height: Math.max(0, maxY - y)
  };
}

function applyScissorAlphaMask(ctx, width, height, strokes, bounds, outputScale) {
  if (!ctx || !ctx.getImageData || !ctx.putImageData) {
    throw new Error("missing_image_data_api");
  }
  const imageData = ctx.getImageData(0, 0, width, height);
  const mask = new Uint8ClampedArray(width * height);
  strokes.forEach((stroke) => {
    const points = (stroke.points || []).map((point) => ({
      x: (point.x - bounds.x) * outputScale,
      y: (point.y - bounds.y) * outputScale
    }));
    const radius = Math.max(1, (stroke.size || SCISSOR_BRUSH_SIZE) * outputScale / 2);
    rasterizeStroke(mask, width, height, points, radius);
  });
  const data = imageData.data;
  for (let i = 0; i < mask.length; i += 1) {
    const alphaIndex = i * 4 + 3;
    data[alphaIndex] = Math.min(data[alphaIndex], mask[i]);
  }
  ctx.putImageData(imageData, 0, 0);
}

function rasterizeStroke(mask, width, height, points, radius) {
  if (!points.length) return;
  if (points.length === 1) {
    fillMaskCircle(mask, width, height, points[0].x, points[0].y, radius);
    return;
  }
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const length = distance(from, to);
    const steps = Math.max(1, Math.ceil(length / Math.max(1, radius / 2)));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      fillMaskCircle(
        mask,
        width,
        height,
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
        radius
      );
    }
  }
}

function fillMaskCircle(mask, width, height, cx, cy, radius) {
  const minX = Math.max(0, Math.floor(cx - radius - 1));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius + 1));
  const minY = Math.max(0, Math.floor(cy - radius - 1));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius + 1));
  const softEdge = Math.max(1, Math.min(3, radius * 0.12));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius + softEdge) continue;
      const alpha = dist <= radius - softEdge
        ? 255
        : Math.max(0, Math.round((1 - (dist - radius + softEdge) / (softEdge * 2)) * 255));
      const index = y * width + x;
      if (alpha > mask[index]) {
        mask[index] = alpha;
      }
    }
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hasLayerCrop(layer) {
  return !!(layer && layer.crop && layer.crop.width > 0 && layer.crop.height > 0);
}

function getFullCropBox(sourceSize) {
  return {
    x: 0,
    y: 0,
    width: sourceSize.width,
    height: sourceSize.height
  };
}

function getCropPreviewLayout(sourceSize, viewport) {
  const screenWidth = viewport.screenWidth || 375;
  const screenHeight = viewport.screenHeight || 667;
  const topInset = Math.max(96, (viewport.chromeTop || 0) + 54);
  const bottomInset = 132;
  const maxWidth = Math.max(1, screenWidth - 48);
  const maxHeight = Math.max(1, screenHeight - topInset - bottomInset - 24);
  const scale = Math.min(maxWidth / sourceSize.width, maxHeight / sourceSize.height);
  const width = sourceSize.width * scale;
  const height = sourceSize.height * scale;
  return {
    left: (screenWidth - width) / 2,
    top: topInset + (maxHeight - height) / 2,
    width,
    height,
    scale
  };
}

function roundCrop(crop) {
  return {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height)
  };
}

function getRatioValue(ratio, baseCrop) {
  if (ratio === "original" && baseCrop && baseCrop.height) {
    return baseCrop.width / baseCrop.height;
  }
  if (!ratio || ratio === "free") return null;
  const parts = ratio.split(":").map(Number);
  return parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : null;
}

function getCropBoxForRatio(box, layer, ratio, baseCrop) {
  const ratioValue = getRatioValue(ratio, baseCrop);
  if (!ratioValue) return clampCropBox(box, layer);
  let width = layer.width;
  let height = width / ratioValue;
  if (width > layer.width) {
    width = layer.width;
    height = width / ratioValue;
  }
  if (height > layer.height) {
    height = layer.height;
    width = height * ratioValue;
  }
  width = Math.max(CROP_MIN_SIZE, width);
  height = Math.max(CROP_MIN_SIZE, height);
  const center = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
  return clampCropBox({
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  }, layer);
}

function getCropHandle(point, box, threshold) {
  const handles = [
    { name: "tl", x: box.x, y: box.y },
    { name: "tr", x: box.x + box.width, y: box.y },
    { name: "br", x: box.x + box.width, y: box.y + box.height },
    { name: "bl", x: box.x, y: box.y + box.height }
  ];
  const match = handles.find((handle) => Math.abs(point.x - handle.x) <= threshold && Math.abs(point.y - handle.y) <= threshold);
  return match ? match.name : "";
}

function isPointInsideBox(point, box) {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

function moveCropBox(origin, dx, dy, layer) {
  return clampCropBox({
    ...origin,
    x: origin.x + dx,
    y: origin.y + dy
  }, layer);
}

function resizeCropBox(origin, dx, dy, handle, layer, ratio) {
  if (ratio) {
    return resizeCropBoxWithRatio(origin, dx, dy, handle, layer, ratio);
  }
  const left = handle.indexOf("l") >= 0 ? origin.x + dx : origin.x;
  const right = handle.indexOf("r") >= 0 ? origin.x + origin.width + dx : origin.x + origin.width;
  const top = handle.indexOf("t") >= 0 ? origin.y + dy : origin.y;
  const bottom = handle.indexOf("b") >= 0 ? origin.y + origin.height + dy : origin.y + origin.height;
  return clampCropBox({
    x: Math.min(left, right - CROP_MIN_SIZE),
    y: Math.min(top, bottom - CROP_MIN_SIZE),
    width: Math.max(CROP_MIN_SIZE, Math.abs(right - left)),
    height: Math.max(CROP_MIN_SIZE, Math.abs(bottom - top))
  }, layer);
}

function resizeCropBoxWithRatio(origin, dx, dy, handle, layer, ratio) {
  const anchor = {
    x: handle.indexOf("l") >= 0 ? origin.x + origin.width : origin.x,
    y: handle.indexOf("t") >= 0 ? origin.y + origin.height : origin.y
  };
  const moving = {
    x: handle.indexOf("l") >= 0 ? origin.x + dx : origin.x + origin.width + dx,
    y: handle.indexOf("t") >= 0 ? origin.y + dy : origin.y + origin.height + dy
  };
  let width = Math.max(CROP_MIN_SIZE, Math.abs(moving.x - anchor.x));
  let height = Math.max(CROP_MIN_SIZE, Math.abs(moving.y - anchor.y));
  if (width / height > ratio) {
    height = width / ratio;
  } else {
    width = height * ratio;
  }
  const x = handle.indexOf("l") >= 0 ? anchor.x - width : anchor.x;
  const y = handle.indexOf("t") >= 0 ? anchor.y - height : anchor.y;
  return clampCropBox({ x, y, width, height }, layer);
}

function clampCropBox(box, layer) {
  const width = Math.min(layer.width, Math.max(CROP_MIN_SIZE, box.width));
  const height = Math.min(layer.height, Math.max(CROP_MIN_SIZE, box.height));
  return {
    x: Math.min(layer.width - width, Math.max(0, box.x)),
    y: Math.min(layer.height - height, Math.max(0, box.y)),
    width,
    height
  };
}

function getEmbossMaskHandle(point, box, threshold) {
  return getCropHandle(point, box, threshold);
}

function resizeEmbossMask(origin, dx, dy, handle, layer) {
  const next = resizeCropBoxWithRatio(origin, dx, dy, handle, layer, 1);
  return clampEmbossMask(next, layer);
}

function clampEmbossMask(mask, layer) {
  const maxSize = Math.max(EMBOSS_MIN_SIZE, Math.min(layer.width, layer.height));
  const size = Math.min(maxSize, Math.max(EMBOSS_MIN_SIZE, Math.min(mask.width, mask.height)));
  return {
    x: Math.min(layer.width - size, Math.max(0, mask.x)),
    y: Math.min(layer.height - size, Math.max(0, mask.y)),
    width: size,
    height: size
  };
}

function getCanvasAlignmentAnchors(draft) {
  return [
    { axis: "x", value: 0 },
    { axis: "x", value: draft.width / 2 },
    { axis: "x", value: draft.width },
    { axis: "y", value: 0 },
    { axis: "y", value: draft.height / 2 },
    { axis: "y", value: draft.height }
  ];
}

function getLayerAlignmentAnchors(layer) {
  return [
    { axis: "x", value: layer.x },
    { axis: "x", value: layer.x + layer.width / 2 },
    { axis: "x", value: layer.x + layer.width },
    { axis: "y", value: layer.y },
    { axis: "y", value: layer.y + layer.height / 2 },
    { axis: "y", value: layer.y + layer.height }
  ];
}

function findNearestAlignment(movingAnchors, referenceAnchors, threshold) {
  return movingAnchors.reduce((nearest, movingAnchor) => {
    referenceAnchors.forEach((referenceAnchor) => {
      if (referenceAnchor.axis !== movingAnchor.axis) return;
      const distanceToReference = Math.abs(movingAnchor.value - referenceAnchor.value);
      if (distanceToReference > threshold) return;
      if (!nearest || distanceToReference < nearest.distance) {
        nearest = {
          axis: movingAnchor.axis,
          value: referenceAnchor.value,
          distance: distanceToReference
        };
      }
    });
    return nearest;
  }, null);
}

function getAlignmentGuideKey(guides) {
  if (!guides || !guides.length) return "";
  return guides
    .map((guide) => `${guide.axis}:${Math.round(guide.value)}`)
    .sort()
    .join("|");
}

function getNearestRightAngle(rotation) {
  const normalized = ((rotation % 360) + 360) % 360;
  const candidates = [0, 90, 180, 270, 360];
  return candidates.reduce((nearest, value) => {
    const distanceToAngle = Math.abs(normalized - value);
    if (!nearest || distanceToAngle < nearest.distance) {
      return {
        value: value === 360 ? 0 : value,
        distance: distanceToAngle
      };
    }
    return nearest;
  }, null);
}

function serializeDraft(draft) {
  if (!draft) return "";
  try {
    return JSON.stringify(draft);
  } catch (error) {
    return "";
  }
}

function parseDraftSnapshot(snapshot) {
  try {
    return JSON.parse(snapshot);
  } catch (error) {
    return null;
  }
}

function createLayerFromAsset(asset, draft) {
  if (!asset || !asset.layer || !draft) return null;
  const spec = JSON.parse(JSON.stringify(asset.layer));
  const width = spec.width || 240;
  const height = spec.height || 160;
  return {
    id: `${spec.type || asset.type || "asset"}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type: spec.type || asset.type || "paper",
    x: (draft.width - width) / 2,
    y: (draft.height - height) / 2,
    width,
    height,
    rotation: spec.rotation || 0,
    scale: 1,
    opacity: spec.opacity == null ? 1 : spec.opacity,
    zIndex: (draft.layers || []).reduce((max, layer, index) => Math.max(max, layer.zIndex == null ? index : layer.zIndex), 0) + 1,
    source: spec.source || "",
    text: spec.text || "",
    radius: spec.radius || 0,
    shadow: !!spec.shadow,
    tear: !!spec.tear,
    style: {
      ...(spec.style || {}),
      packId: asset.packId || "",
      name: asset.name || ""
    }
  };
}

function createAssetPanelCategories() {
  const categories = getAssetPacks().reduce((items, pack) => {
    if (pack.category && !items.includes(pack.category)) {
      items.push(pack.category);
    }
    return items;
  }, []);
  return ["推荐"].concat(categories);
}

function decorateAssetPanelPacks(packs) {
  return packs.map(decorateAssetPanelPack);
}

function decorateAssetPanelPack(pack) {
  if (!pack) return null;
  return {
    ...pack,
    itemCount: Array.isArray(pack.items) ? pack.items.length : 0,
    items: Array.isArray(pack.items)
      ? pack.items.map((item) => ({
        ...item,
        packId: pack.id,
        packName: pack.name,
        panelPreviewStyle: getAssetPanelPreviewStyle(item)
      }))
      : []
  };
}

function filterAssetPanelPacks(packs, category) {
  if (!category || category === "推荐") return packs;
  return packs.filter((pack) => pack.category === category);
}

function getAssetPanelPreviewStyle(item) {
  const maxSize = 168;
  const sourceWidth = Math.max(1, Number(item.width) || maxSize);
  const sourceHeight = Math.max(1, Number(item.height) || maxSize);
  const ratio = sourceWidth / sourceHeight;
  let width = maxSize;
  let height = maxSize;
  if (ratio > 1) {
    height = Math.round(maxSize / ratio);
  } else {
    width = Math.round(maxSize * ratio);
  }
  const marginLeft = Math.max(0, Math.round((211 - width) / 2));
  const marginTop = Math.max(0, Math.round((211 - height) / 2));
  return `width:${width}rpx;height:${height}rpx;margin-left:${marginLeft}rpx;margin-top:${marginTop}rpx;`;
}

function eventSourceType(event) {
  const source = event && event.currentTarget && event.currentTarget.dataset.source;
  return source === "camera" ? "camera" : source === "album" ? "album" : "";
}

function normalizeTextFontId(style = {}) {
  return resolveTextFont(style.fontId || style.fontLabel || "system").id;
}

function createBackgroundCategories(options) {
  return options.reduce((categories, option) => {
    if (option.category && !categories.includes(option.category)) {
      categories.push(option.category);
    }
    return categories;
  }, []);
}

function filterBackgroundOptions(options, category) {
  return options.filter((option) => option.category === category);
}

function createBackgroundOptions() {
  const colors = [
    ["plain-warm", "暖白", "#fdfdfb"],
    ["plain-white", "白色", "#ffffff"],
    ["plain-mist", "浅灰", "#f7f7f5"],
    ["plain-cream", "奶油", "#f4efe5"],
    ["plain-pink", "浅粉", "#f5dfd8"],
    ["plain-sage", "鼠尾草", "#d7dbc9"]
  ].map(([id, name, color]) => ({
    id,
    name,
    category: "纯色",
    color
  }));
  const papers = [
    ["paper-1", "旧书页", "1.png", 342, 352],
    ["paper-2", "棉纸", "2.png", 291, 299],
    ["paper-3", "做旧纸", "3.png", 285, 326],
    ["paper-4", "牛皮纸", "4.png", 289, 264],
    ["paper-5", "米色纸", "5.png", 256, 348],
    ["paper-6", "粗纹纸", "6.png", 356, 322]
  ].map(([id, name, fileName, width, height]) => ({
    id,
    name,
    category: "纸感",
    color: "#fdfdfb",
    source: `/assets/packs/papers/items/${fileName}`,
    thumb: `/assets/packs/papers/items/${fileName}`,
    width,
    height
  }));
  const grids = [
    ["grid-dot", "点阵", "#fdfdfb", "dot"],
    ["grid-line", "横线", "#ffffff", "line"],
    ["grid-square", "方格", "#f7f7f5", "square"]
  ].map(([id, name, color, pattern]) => ({
    id,
    name,
    category: "格纹",
    color,
    pattern,
    patternClass: `pattern-${pattern}`
  }));
  const patterns = [
    ["pattern-flower", "碎花", "7.png", 291, 275],
    ["pattern-stripe", "浅纹", "8.png", 255, 235],
    ["pattern-vintage", "复古", "9.png", 322, 231],
    ["pattern-collage", "拼贴", "10.png", 303, 233]
  ].map(([id, name, fileName, width, height]) => ({
    id,
    name,
    category: "图案",
    color: "#fdfdfb",
    source: `/assets/packs/papers/items/${fileName}`,
    thumb: `/assets/packs/papers/items/${fileName}`,
    width,
    height
  }));
  return colors.concat(papers, grids, patterns);
}

function normalizeEmbossShape(shape) {
  if (shape === "note") return "tag";
  if (shape === "rect") return "";
  return ["circle", "heart", "star", "tag", "stamp"].includes(shape) ? shape : "circle";
}

function normalizeOptionalEmbossShape(shape) {
  if (!shape || shape === "rect") return "";
  if (shape === "note") return "tag";
  return ["circle", "heart", "star", "tag", "stamp"].includes(shape) ? shape : "";
}

function drawEmbossMaskPath(ctx, shape, x, y, width, height) {
  if (shape === "circle") {
    const radius = Math.min(width, height) / 2;
    ctx.beginPath();
    ctx.arc(x + width / 2, y + height / 2, radius, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (shape === "heart") {
    ctx.beginPath();
    ctx.moveTo(x + width * 0.5, y + height * 0.88);
    ctx.bezierCurveTo(x + width * 0.08, y + height * 0.62, x + width * 0.02, y + height * 0.28, x + width * 0.28, y + height * 0.18);
    ctx.bezierCurveTo(x + width * 0.4, y + height * 0.13, x + width * 0.49, y + height * 0.2, x + width * 0.5, y + height * 0.33);
    ctx.bezierCurveTo(x + width * 0.51, y + height * 0.2, x + width * 0.6, y + height * 0.13, x + width * 0.72, y + height * 0.18);
    ctx.bezierCurveTo(x + width * 0.98, y + height * 0.28, x + width * 0.92, y + height * 0.62, x + width * 0.5, y + height * 0.88);
    ctx.closePath();
    return;
  }
  if (shape === "star") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const outer = Math.min(width, height) * 0.48;
    const inner = outer * 0.46;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    return;
  }
  if (shape === "tag") {
    const cut = Math.min(width, height) * 0.18;
    const radius = Math.min(width, height) * 0.08;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - cut, y);
    ctx.lineTo(x + width, y + cut);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    return;
  }
  if (shape === "stamp") {
    const notch = Math.max(5, Math.min(width, height) * 0.045);
    const step = notch * 2.2;
    ctx.beginPath();
    ctx.moveTo(x + notch, y);
    for (let px = x + notch; px < x + width - notch; px += step) {
      ctx.quadraticCurveTo(px + step / 2, y + notch, Math.min(px + step, x + width - notch), y);
    }
    ctx.lineTo(x + width, y + notch);
    for (let py = y + notch; py < y + height - notch; py += step) {
      ctx.quadraticCurveTo(x + width - notch, py + step / 2, x + width, Math.min(py + step, y + height - notch));
    }
    ctx.lineTo(x + width - notch, y + height);
    for (let px = x + width - notch; px > x + notch; px -= step) {
      ctx.quadraticCurveTo(px - step / 2, y + height - notch, Math.max(px - step, x + notch), y + height);
    }
    ctx.lineTo(x, y + height - notch);
    for (let py = y + height - notch; py > y + notch; py -= step) {
      ctx.quadraticCurveTo(x + notch, py - step / 2, x, Math.max(py - step, y + notch));
    }
    ctx.closePath();
    return;
  }
  ctx.beginPath();
  ctx.rect(x, y, width, height);
}

function drawClipPolygonMaskPath(ctx, polygon, scale) {
  ctx.beginPath();
  polygon.forEach((point, index) => {
    const x = point.x * scale;
    const y = point.y * scale;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function drawTearMaskPath(ctx, width, height) {
  const amplitude = Math.max(6, Math.min(20, Math.min(width, height) * 0.035));
  const stepX = Math.max(20, width / 12);
  const stepY = Math.max(20, height / 12);
  ctx.beginPath();
  ctx.moveTo(0, amplitude * 0.8);
  for (let x = stepX; x < width; x += stepX) {
    ctx.lineTo(x, amplitude * (0.45 + ((Math.round(x / stepX) % 3) * 0.28)));
  }
  ctx.lineTo(width, amplitude * 0.65);
  for (let y = stepY; y < height; y += stepY) {
    ctx.lineTo(width - amplitude * (0.5 + ((Math.round(y / stepY) % 3) * 0.24)), y);
  }
  ctx.lineTo(width - amplitude * 0.65, height);
  for (let x = width - stepX; x > 0; x -= stepX) {
    ctx.lineTo(x, height - amplitude * (0.45 + ((Math.round(x / stepX) % 3) * 0.28)));
  }
  ctx.lineTo(amplitude * 0.7, height);
  for (let y = height - stepY; y > 0; y -= stepY) {
    ctx.lineTo(amplitude * (0.5 + ((Math.round(y / stepY) % 3) * 0.24)), y);
  }
  ctx.closePath();
}

function drawRoundedMaskPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius || 0, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function normalizeDraftTextFonts(draft) {
  if (!draft || !Array.isArray(draft.layers)) return draft;
  draft.layers = draft.layers.map((layer) => {
    if (!layer) return layer;
    if (layer.type !== "text") {
      return {
        ...layer,
        source: normalizeLegacyAssetSource(layer.source)
      };
    }
    const style = layer.style || {};
    return {
      ...layer,
      source: normalizeLegacyAssetSource(layer.source),
      style: {
        ...style,
        ...createTextFontStyle(style.fontId || style.fontLabel || "system")
      }
    };
  });
  return draft;
}

function normalizeLegacyAssetSource(source) {
  if (!source || typeof source !== "string") return source || "";
  const migration = LEGACY_ASSET_SOURCE_MIGRATIONS.find((item) => source.startsWith(item.from));
  return migration ? `${migration.to}${source.slice(migration.from.length)}` : source;
}

function getResolvedCanvasImageCache(cache = {}) {
  return Object.keys(cache).reduce((result, key) => {
    if (cache[key] && cache[key].image) {
      result[key] = cache[key].image;
    }
    return result;
  }, {});
}

function backgroundColorForLabel(label) {
  const map = {
    "无": "transparent",
    "纸底": "#efe7d8",
    "白底": "#ffffff",
    "黑底": "#111111",
    "胶带": "#ead48a"
  };
  return map[label] || "transparent";
}
