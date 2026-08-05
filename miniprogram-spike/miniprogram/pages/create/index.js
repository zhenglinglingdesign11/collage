const { saveDraft, saveAutoDraft, loadDraft, loadDraftById, loadLatestDraft, loadRecentDrafts } = require("../../utils/draft-store");
const { showToast, showSuccess, showError, showModal } = require("../../utils/feedback");
const { checkImageContent, checkTextContent } = require("../../utils/content-security");
const { shareCreate } = require("../../utils/share");
const { persistTempFile } = require("../../utils/local-file");
const { removeImageBackground } = require("../../utils/rembg-api");
const { track, trackPageShow, trackPageHide, trackShare } = require("../../utils/analytics");
const {
  ASSET_TRANSFER_STORAGE_KEY,
  ASSET_TRANSFER_MODE_STORAGE_KEY,
  ASSET_ENTRY_CONTEXT_STORAGE_KEY,
  recommendedAssetPackIds,
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
  createTextFontStyle,
  getTextFontVariantOptions
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
const {
  isRemoteImageSource,
  resolveCachedRemoteImage
} = require("../../utils/remote-image-cache");
const paper01Pack = require("../../config/assets/packs/paper-01");
const paper02Pack = require("../../config/assets/packs/paper-02");
const paper03Pack = require("../../config/assets/packs/paper-03");
const paper04Pack = require("../../config/assets/packs/paper-04");
const paper05Pack = require("../../config/assets/packs/paper-05");

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
const REMBG_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const REMBG_UPLOAD_MAX_SIDE = 1600;
const REMBG_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const REMBG_UPLOAD_QUALITIES = [0.88, 0.76, 0.66];
const WAVE_CUT_AMPLITUDE = 22;
const WAVE_CUT_WAVELENGTH = 76;
const WAVE_CUT_POINT_STEP = 10;
const EDITOR_TOPBAR_RPX = 112;
const BRUSH_PANEL_FALLBACK_RPX = 386;
const BRUSH_PANEL_GAP = 0;
const EFFECT_PANEL_FALLBACK_RPX = 414;
const EFFECT_PANEL_GAP = 12;
const TEXT_EDITOR_SAFE_GAP = 16;
const TEXT_EDITOR_MAX_EXTRA_SHIFT = 120;
const EXPORT_HIGH_PIXEL_RATIO = 3;
const EXPORT_FALLBACK_PIXEL_RATIO = 2;
const BOW_BRUSH_SOURCE = "/assets/brushes/bow-brush.png";
const CROSS_STITCH_OUTPUT_CELL = 14;
const CROSS_STITCH_MAX_OUTPUT_SIZE = 1800;
const PENDING_DRAFT_OPEN_KEY = "journal.pendingDraftOpen.v1";
const FONT_FILE_CACHE_PREFIX = "journal.fontFileCache.v1.";
const TEXT_FONTS = getTextFonts();
const CUTTABLE_SOURCE_LAYER_TYPES = ["image", "sticker", "paper"];
const KPOP_HOLO_FOIL_TEXTURE = "/assets/textures/holo-foil-768.webp";
const TEXT_FONT_OPTIONS = getTextFontOptions();
const DEFAULT_TEXT_FONT_STYLE = createTextFontStyle("system");
const PAPER_BACKGROUND_PACKS = [
  { pack: paper01Pack, category: "图案" },
  { pack: paper02Pack, category: "格纹" },
  { pack: paper03Pack, category: "图案" },
  { pack: paper04Pack, category: "格纹" },
  { pack: paper05Pack, category: "纸感" }
];
const BACKGROUND_CATEGORY_ORDER = ["纯色", "格纹", "纸感", "图案"];
const BACKGROUND_OPTIONS = createBackgroundOptions();
const BACKGROUND_CATEGORIES = createBackgroundCategories(BACKGROUND_OPTIONS);
const ASSET_PANEL_CATEGORY_ORDER = ["推荐", "贴纸", "胶带", "便签", "主题混装", "相框", "内芯纸"];
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
    canvasStageStyle: "",
    selectedLayerId: "",
    selectedLayerType: "",
    selectedHandmadeEffect: "none",
    selectedTextureEffect: "none",
    textureEffectBusy: false,
    textureEffectBusyType: "",
    textureEffectBusySetting: "",
    effectAdjusting: "",
    selectedTapePlacement: "double-corners",
    saveStatus: "未保存",
    exporting: false,
    backgroundRemoving: false,
    textInputVisible: false,
    textDraft: "",
    textToolMode: "font",
    textFonts: TEXT_FONT_OPTIONS,
    textFontVariants: getTextFontVariantOptions("system"),
    textColors: [
      { value: "#111111", label: "墨黑" },
      { value: "#4a4a4a", label: "深灰" },
      { value: "#9a9a9a", label: "浅灰" },
      { value: "#ffffff", label: "白色" },
      { value: "#d94a38", label: "印章红" },
      { value: "#e9d28a", label: "胶带黄" },
      { value: "#8c9a8d", label: "鼠尾草" },
      { value: "#304b9d", label: "靛蓝" },
      { value: "#6d9bc3", label: "雾蓝" },
      { value: "#b45d79", label: "玫瑰粉" },
      { value: "#7b5c75", label: "莓紫" },
      { value: "#c97945", label: "陶橙" },
      { value: "#5f806f", label: "松绿" },
      { value: "#6b4f3f", label: "可可棕" }
    ],
    textBackgrounds: ["无", "纸底", "白底", "黑底", "胶带"],
    textFont: DEFAULT_TEXT_FONT_STYLE.fontId,
    textFontGroup: DEFAULT_TEXT_FONT_STYLE.fontGroupId,
    textFontVariant: DEFAULT_TEXT_FONT_STYLE.fontId,
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
    selectedOutlineStyle: "none",
    brushDebugEnabled: false,
    brushEditing: false,
    brushColor: "#111111",
    brushSize: 8,
    brushType: "line",
    brushStrokeCount: 0,
    brushTypes: [
      { value: "line", label: "普通" },
      { value: "stitch", label: "缝线" },
      { value: "knit", label: "针织" },
      { value: "bead", label: "珠链" },
      { value: "lace", label: "蕾丝" },
      { value: "bow", label: "蝴蝶结" }
    ],
    brushColors: [
      { value: "#111111", label: "黑" },
      { value: "#ffffff", label: "白" },
      { value: "#d94a38", label: "红" },
      { value: "#f4d77a", label: "黄" },
      { value: "#9ec7df", label: "蓝" },
      { value: "#8c9a8d", label: "绿" }
    ],
    brushSizes: [
      { value: 5, label: "细" },
      { value: 10, label: "中" },
      { value: 18, label: "粗" }
    ],
    imageEffectDebugEnabled: false,
    imageEffectEditing: false,
    imageEffectBusy: false,
    imageEffectType: "cross-stitch",
    imageEffectTypes: [
      { value: "cross-stitch", label: "十字绣" },
      { value: "matisse", label: "马蒂斯" },
      { value: "botanical", label: "图鉴" }
    ],
    crossStitchGrid: 72,
    crossStitchColors: 8,
    crossStitchStyle: "stitch",
    crossStitchGrids: [
      { value: 48, label: "粗" },
      { value: 72, label: "中" },
      { value: 104, label: "细" }
    ],
    crossStitchColorOptions: [
      { value: 4, label: "4色" },
      { value: 8, label: "8色" },
      { value: 12, label: "12色" },
      { value: 16, label: "16色" },
      { value: 24, label: "24色" },
      { value: 32, label: "32色" }
    ],
    crossStitchStyles: [
      { value: "stitch", label: "X针" },
      { value: "pixel", label: "像素" },
      { value: "mixed", label: "混合" }
    ],
    matisseDetail: 64,
    matissePalette: "vivid",
    matisseDetails: [
      { value: 44, label: "简" },
      { value: 64, label: "中" },
      { value: 86, label: "细" }
    ],
    matissePalettes: [
      { value: "vivid", label: "明亮" },
      { value: "earth", label: "复古" },
      { value: "soft", label: "柔和" }
    ],
    kpopCardText: "subtle",
    kpopCardTextOptions: [
      { value: "off", label: "无" },
      { value: "subtle", label: "弱" },
      { value: "standard", label: "标准" }
    ],
    botanicalTone: "blueprint",
    botanicalDetail: "medium",
    botanicalFrame: "on",
    blueprintTone: "prussian",
    blueprintIntensity: "standard",
    blueprintPaper: "warm",
    blueprintGrain: "medium",
    blueprintTones: [
      { value: "prussian", label: "蓝晒" },
      { value: "teal", label: "青绿" },
      { value: "violet", label: "靛紫" },
      { value: "sepia", label: "棕晒" },
      { value: "rose", label: "粉晒" },
      { value: "mono", label: "黑白" }
    ],
    blueprintIntensities: [
      { value: "soft", label: "浅" },
      { value: "standard", label: "中" },
      { value: "deep", label: "深" }
    ],
    blueprintPapers: [
      { value: "cool", label: "冷白" },
      { value: "warm", label: "米白" },
      { value: "aged", label: "泛黄" },
      { value: "gray", label: "灰纸" }
    ],
    blueprintGrains: [
      { value: "low", label: "低" },
      { value: "medium", label: "中" },
      { value: "high", label: "高" }
    ],
    screenPrintPalette: "red-blue",
    screenPrintStrength: "standard",
    screenPrintHalftone: "medium",
    screenPrintOffset: "slight",
    screenPrintPalettes: [
      { value: "red-blue", label: "红蓝" },
      { value: "orange-blue", label: "橙蓝" },
      { value: "pink-green", label: "粉绿" },
      { value: "black-cream", label: "黑米" },
      { value: "purple-yellow", label: "紫黄" }
    ],
    screenPrintStrengths: [
      { value: "soft", label: "柔和" },
      { value: "standard", label: "标准" },
      { value: "bold", label: "强烈" }
    ],
    screenPrintHalftones: [
      { value: "none", label: "无" },
      { value: "fine", label: "细" },
      { value: "medium", label: "中" },
      { value: "coarse", label: "粗" }
    ],
    screenPrintOffsets: [
      { value: "none", label: "无" },
      { value: "slight", label: "轻微" },
      { value: "strong", label: "明显" }
    ],
    risoPalette: "pink-blue",
    risoMode: "three",
    risoInk: "standard",
    risoOffset: "slight",
    risoGrain: "medium",
    risoPalettes: [
      { value: "pink-blue", label: "粉蓝" },
      { value: "orange-teal", label: "橙青" },
      { value: "purple-yellow", label: "紫黄" },
      { value: "red-black", label: "红黑" },
      { value: "green-pink", label: "绿粉" }
    ],
    risoModes: [
      { value: "duo", label: "双色" },
      { value: "three", label: "三色" }
    ],
    risoInks: [
      { value: "light", label: "淡" },
      { value: "standard", label: "标准" },
      { value: "dense", label: "浓" }
    ],
    risoOffsets: [
      { value: "none", label: "无" },
      { value: "slight", label: "轻微" },
      { value: "strong", label: "明显" }
    ],
    risoGrains: [
      { value: "low", label: "低" },
      { value: "medium", label: "中" },
      { value: "high", label: "高" }
    ],
    botanicalTones: [
      { value: "blueprint", label: "蓝晒" },
      { value: "sage", label: "墨绿" },
      { value: "sepia", label: "褐黑" }
    ],
    botanicalDetails: [
      { value: "soft", label: "柔" },
      { value: "medium", label: "中" },
      { value: "etched", label: "蚀刻" }
    ],
    botanicalFrames: [
      { value: "on", label: "有" },
      { value: "off", label: "无" }
    ],
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

  onShareAppMessage() {
    trackShare("create", "app_message", getDraftAnalyticsParams(this.draft));
    return shareCreate();
  },

  onShareTimeline() {
    trackShare("create", "timeline", getDraftAnalyticsParams(this.draft));
    return shareCreate();
  },

  onLoad() {
    enableShareMenu();
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
    this.fontLoadPromises = {};
    this.fontTempUrlCache = {};
    this.fontLocalSourcePromises = {};
    this.fontSourceFallbacks = {};
    this.fontSourceCacheKeys = {};
    this.assetPanelRequestId = 0;
    this.brushPanelHeight = 0;
    this.brushStageHeight = 0;
    this.effectPanelHeight = 0;
    this.effectStageHeight = 0;
    this.textCanvasOffsetY = 0;
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
    track("create_page_view", {
      page: "create",
      hasRecentDraft: !!latestDraft,
      recentDraftCount: recentDrafts.length,
      ...getDraftAnalyticsParams(this.draft)
    });
  },

  onReady() {
    this.ensureCanvasContext().then(() => {
      this.render();
    });
  },

  preloadPackagedFonts(options = {}) {
    TEXT_FONTS.filter((font) => font.packaged && font.preload !== false).forEach((font) => {
      this.ensureTextFontLoaded(font.id, options);
    });
  },

  ensureTextFontLoaded(fontId, options = {}) {
    const font = resolveTextFont(fontId);
    if (!font || !font.packaged) return Promise.resolve(false);
    const scopes = options.scopes || ["webview", "native"];
    const cacheKey = `${font.family}:${scopes.join(",")}`;
    if (!options.force && this.loadedFontFamilies[cacheKey] === "loaded") return Promise.resolve(true);
    if (!options.force && this.fontLoadPromises[cacheKey]) return this.fontLoadPromises[cacheKey];
    this.loadedFontFamilies[cacheKey] = "loading";
    const promise = this.resolveFontSource(font)
      .then((source) => {
        if (!font || !font.packaged || !source || !wx.loadFontFace) {
          this.loadedFontFamilies[cacheKey] = "failed";
          return false;
        }
        return this.loadTextFontFace(font, source, scopes, cacheKey).then((loaded) => {
          if (loaded) return true;
          const fallbackSource = this.fontSourceFallbacks[source];
          if (!fallbackSource || fallbackSource === source) return false;
          const localCacheKey = this.fontSourceCacheKeys[source];
          if (localCacheKey) wx.removeStorageSync(localCacheKey);
          return this.loadTextFontFace(font, fallbackSource, scopes, cacheKey);
        });
      })
      .catch((error) => {
        this.loadedFontFamilies[cacheKey] = "failed";
        console.warn("[fonts] resolve source failed", font.id, font.family, error);
        return false;
      });
    this.fontLoadPromises[cacheKey] = promise.then((loaded) => {
      delete this.fontLoadPromises[cacheKey];
      return loaded;
    });
    return this.fontLoadPromises[cacheKey];
  },

  loadTextFontFace(font, source, scopes, cacheKey) {
    return new Promise((resolve) => {
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
          resolve(true);
        },
        fail: () => {
          this.loadedFontFamilies[cacheKey] = "failed";
          console.warn("[fonts] loadFontFace failed", font.id, font.family, scopes.join(","), source);
          resolve(false);
        }
      });
    });
  },

  resolveFontSource(font) {
    const directSource = getFontSource(font);
    if (directSource) return this.resolveCachedFontSource(font, directSource);
    const fileID = getFontCloudFileId(font);
    if (!fileID) return Promise.resolve("");
    if (this.fontTempUrlCache[fileID]) return this.resolveCachedFontSource(font, this.fontTempUrlCache[fileID]);
    if (!wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve("");
    return wx.cloud.getTempFileURL({
      fileList: [fileID]
    }).then((res) => {
      const file = res.fileList && res.fileList[0];
      const url = file && (file.tempFileURL || file.download_url || file.fileID);
      if (url && (!file.status || file.status === 0)) {
        this.fontTempUrlCache[fileID] = url;
        return this.resolveCachedFontSource(font, url);
      }
      throw new Error(file && file.errMsg ? file.errMsg : "empty_temp_file_url");
    });
  },

  resolveCachedFontSource(font, source) {
    if (!font || !source || !/^https?:\/\//i.test(source) || !wx.downloadFile || !wx.getFileSystemManager) {
      return Promise.resolve(source || "");
    }
    const cacheKey = getFontFileCacheKey(font, source);
    const cached = this.getValidCachedFontSource(cacheKey);
    if (cached) {
      this.fontSourceFallbacks[cached] = source;
      this.fontSourceCacheKeys[cached] = cacheKey;
      return Promise.resolve(cached);
    }
    if (!this.fontLocalSourcePromises[cacheKey]) {
      this.fontLocalSourcePromises[cacheKey] = this.downloadAndSaveFontSource(cacheKey, source)
        .catch((error) => {
          console.warn("[fonts] cache font failed", font.id, source, error);
          return "";
        })
        .then(() => {
          delete this.fontLocalSourcePromises[cacheKey];
        });
    }
    return Promise.resolve(source);
  },

  getValidCachedFontSource(cacheKey) {
    const cache = wx.getStorageSync(cacheKey);
    const savedFilePath = cache && cache.savedFilePath;
    if (!savedFilePath) return "";
    try {
      wx.getFileSystemManager().accessSync(savedFilePath);
      return savedFilePath;
    } catch (error) {
      wx.removeStorageSync(cacheKey);
      return "";
    }
  },

  downloadAndSaveFontSource(cacheKey, source) {
    return new Promise((resolve) => {
      wx.downloadFile({
        url: source,
        success: (downloadRes) => {
          const statusCode = downloadRes.statusCode || 0;
          if (statusCode < 200 || statusCode >= 300 || !downloadRes.tempFilePath) {
            resolve(source);
            return;
          }
          const fs = wx.getFileSystemManager();
          fs.saveFile({
            tempFilePath: downloadRes.tempFilePath,
            success: (saveRes) => {
              const savedFilePath = saveRes.savedFilePath || "";
              if (savedFilePath) {
                wx.setStorageSync(cacheKey, {
                  savedFilePath,
                  savedAt: Date.now()
                });
                this.fontSourceFallbacks[savedFilePath] = source;
                this.fontSourceCacheKeys[savedFilePath] = cacheKey;
                resolve(savedFilePath);
                return;
              }
              resolve(downloadRes.tempFilePath);
            },
            fail: () => {
              resolve(downloadRes.tempFilePath || source);
            }
          });
        },
        fail: () => {
          resolve(source);
        }
      });
    });
  },

  onShow() {
    trackPageShow(this, "create");
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

  onHide() {
    trackPageHide(this);
  },

  onUnload() {
    trackPageHide(this);
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
    const promise = resolveCanvasImageSource(src).then((imageSrc) => new Promise((resolve) => {
      if (!imageSrc) {
        resolve(null);
        return;
      }
      const image = this.canvasNode.createImage();
      image.onload = () => {
        this.canvasImageCache[src] = { image };
        resolve(image);
      };
      image.onerror = () => {
        delete this.canvasImageCache[src];
        console.warn("[canvas] image load failed", src, imageSrc);
        resolve(null);
      };
      image.src = imageSrc;
    })).catch((error) => {
      delete this.canvasImageCache[src];
      console.warn("[canvas] image resolve failed", src, error);
      return null;
    });
    this.canvasImageCache[src] = { promise };
    return promise;
  },

  preloadCanvasImages() {
    if (!this.draft) return Promise.resolve();
    const layerSources = Array.isArray(this.draft.layers)
      ? this.draft.layers.map((layer) => layer && layer.source).filter(Boolean)
      : [];
    const brushSources = getBrushStampSources(this.draft.layers || []);
    const brushDraftSources = this.brushSession
      ? getBrushStampSources([{ strokes: (this.brushSession.strokes || []).concat(this.brushStroke ? [this.brushStroke] : []) }])
      : [];
    const backgroundSource = this.draft.backgroundImage && this.draft.backgroundImage.source;
    const sources = Array.from(new Set([backgroundSource].concat(layerSources, brushSources, brushDraftSources).filter(Boolean)));
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
    selectedLayerLocked: false,
    selectedLayerLockStyle: "",
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
    track("assets_tab_open", {
      page: "create",
      source: this.data.isEditMode && this.data.activeDrawer === "asset" ? "createAssetDrawer" : "createTab",
      ...getDraftAnalyticsParams(this.draft)
    });
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
    track("recent_draft_open", {
      page: "create",
      draftId: draft.id || draftId || "",
      ratio: draft.ratio || "",
      layerCount: Array.isArray(draft.layers) ? draft.layers.length : 0
    });
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
    this.setData(this.getCanvasSizeData(ratio));
  },

  getCanvasSizeData(ratio) {
    const size = ratioSizeMap[ratio] || ratioSizeMap["3:4"];
    const maxWidth = this.screenWidth - 56;
    const maxHeight = this.getCanvasMaxHeight();
    const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
    this.renderScale = scale;
    return {
      ratio,
      canvasCssWidth: Math.round(size.width * scale),
      canvasCssHeight: Math.round(size.height * scale),
      canvasStageStyle: ""
    };
  },

  getCanvasMaxHeight() {
    return this.screenWidth > 380 ? 520 : 460;
  },

  getBrushCanvasStageStyle() {
    if (this.brushStageHeight) {
      return `height:${this.brushStageHeight}px;`;
    }
    const rpxToPx = (this.screenWidth || 375) / 750;
    const topbarHeight = EDITOR_TOPBAR_RPX * rpxToPx;
    const brushPanelHeight = this.getBrushPanelReservedHeight();
    const topChrome = this.data.chromeTop || 0;
    const height = Math.max(260, Math.floor((this.screenHeight || 667) - topChrome - topbarHeight - brushPanelHeight - BRUSH_PANEL_GAP));
    return `height:${height}px;`;
  },

  getBrushPanelReservedHeight() {
    if (this.brushPanelHeight) return this.brushPanelHeight;
    const rpxToPx = (this.screenWidth || 375) / 750;
    return BRUSH_PANEL_FALLBACK_RPX * rpxToPx;
  },

  getEffectCanvasStageStyle() {
    if (this.effectStageHeight) {
      return `height:${this.effectStageHeight}px;`;
    }
    const rpxToPx = (this.screenWidth || 375) / 750;
    const topbarHeight = EDITOR_TOPBAR_RPX * rpxToPx;
    const panelHeight = this.effectPanelHeight || EFFECT_PANEL_FALLBACK_RPX * rpxToPx;
    const topChrome = this.data.chromeTop || 0;
    const height = Math.max(260, Math.floor((this.screenHeight || 667) - topChrome - topbarHeight - panelHeight - EFFECT_PANEL_GAP));
    return `height:${height}px;`;
  },

  getEffectEditorLayoutResetPatch(includeCanvasSize = false) {
    if (this.data.activePalette !== "effect" && !this.effectStageHeight && !this.effectPanelHeight) {
      return {};
    }
    clearTimeout(this.effectAdjustmentTimer);
    this.effectStageHeight = 0;
    this.effectPanelHeight = 0;
    return {
      ...(includeCanvasSize && this.draft ? this.getCanvasSizeData(this.draft.ratio) : {}),
      canvasStageStyle: ""
    };
  },

  scheduleTextCanvasOffsetRefresh() {
    clearTimeout(this.textCanvasOffsetTimer);
    this.textCanvasOffsetTimer = setTimeout(() => this.refreshTextCanvasOffset(), 0);
  },

  refreshTextCanvasOffset() {
    if (!this.data.textInputVisible) {
      this.resetTextCanvasOffset();
      return;
    }
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "text") {
      this.resetTextCanvasOffset();
      return;
    }
    wx.createSelectorQuery()
      .in(this)
      .select(".canvas-shell")
      .boundingClientRect()
      .select(".text-editor-panel")
      .boundingClientRect()
      .exec((res) => {
        const canvasRect = res && res[0];
        const panelRect = res && res[1];
        if (!canvasRect || !panelRect || !this.data.textInputVisible) return;
        const currentLayer = this.getSelectedLayer();
        if (!currentLayer || currentLayer.type !== "text") return;
        const scale = this.renderScale || (this.draft ? this.data.canvasCssWidth / this.draft.width : 1);
        const currentOffset = Math.max(0, Math.round(this.textCanvasOffsetY || 0));
        const baseCanvasRect = {
          ...canvasRect,
          top: canvasRect.top + currentOffset,
          bottom: canvasRect.bottom + currentOffset
        };
        const bounds = getLayerScreenBounds(currentLayer, baseCanvasRect, scale);
        const requiredOffset = Math.max(0, Math.ceil(bounds.bottom - panelRect.top + TEXT_EDITOR_SAFE_GAP));
        const topLimit = Math.max(0, this.data.chromeTop || 0);
        const keepCanvasTopOffset = Math.max(0, Math.floor(baseCanvasRect.top - topLimit));
        const maxOffset = keepCanvasTopOffset + TEXT_EDITOR_MAX_EXTRA_SHIFT;
        const nextOffset = Math.min(requiredOffset, maxOffset);
        if (Math.abs(nextOffset - (this.textCanvasOffsetY || 0)) < 1) return;
        this.textCanvasOffsetY = nextOffset;
        this.setData({ canvasStageStyle: this.getTextCanvasStageStyle() });
      });
  },

  getTextCanvasStageStyle() {
    const offset = Math.max(0, Math.round(this.textCanvasOffsetY || 0));
    return offset ? `transform: translateY(-${offset}px);` : "";
  },

  resetTextCanvasOffset() {
    clearTimeout(this.textCanvasOffsetTimer);
    if (!this.textCanvasOffsetY && !this.data.canvasStageStyle) return;
    this.textCanvasOffsetY = 0;
    if (!this.data.brushEditing && this.data.activePalette !== "effect") {
      this.setData({ canvasStageStyle: "" });
    }
  },

  refreshBrushCanvasLayout() {
    if (!this.data.brushEditing) return;
    wx.createSelectorQuery()
      .in(this)
      .select(".canvas-stage")
      .boundingClientRect()
      .select(".brush-dev-panel")
      .boundingClientRect()
      .exec((res) => {
        const stageRect = res && res[0];
        const panelRect = res && res[1];
        if (!stageRect || !panelRect || !panelRect.height || !this.data.brushEditing) return;
        const measuredPanelHeight = Math.ceil(panelRect.height);
        const measuredStageHeight = Math.max(260, Math.floor(panelRect.top - stageRect.top - BRUSH_PANEL_GAP));
        const panelChanged = Math.abs(measuredPanelHeight - (this.brushPanelHeight || 0)) >= 2;
        const stageChanged = Math.abs(measuredStageHeight - (this.brushStageHeight || 0)) >= 2;
        if (!panelChanged && !stageChanged) return;
        this.brushPanelHeight = measuredPanelHeight;
        this.brushStageHeight = measuredStageHeight;
        this.setData({ canvasStageStyle: this.getBrushCanvasStageStyle() });
        this.render();
      });
  },

  refreshEffectCanvasLayout() {
    if (this.data.activePalette !== "effect") return;
    wx.createSelectorQuery()
      .in(this)
      .select(".canvas-stage")
      .boundingClientRect()
      .select(".effect-editor-panel")
      .boundingClientRect()
      .exec((res) => {
        const stageRect = res && res[0];
        const panelRect = res && res[1];
        if (!stageRect || !panelRect || !panelRect.height || this.data.activePalette !== "effect") return;
        const measuredPanelHeight = Math.ceil(panelRect.height);
        const measuredStageHeight = Math.max(260, Math.floor(panelRect.top - stageRect.top - EFFECT_PANEL_GAP));
        const panelChanged = Math.abs(measuredPanelHeight - (this.effectPanelHeight || 0)) >= 2;
        const stageChanged = Math.abs(measuredStageHeight - (this.effectStageHeight || 0)) >= 2;
        if (!panelChanged && !stageChanged) return;
        this.effectPanelHeight = measuredPanelHeight;
        this.effectStageHeight = measuredStageHeight;
        this.setData({ canvasStageStyle: this.getEffectCanvasStageStyle() });
        this.render();
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
      scissor: this.getScissorRenderState(),
      brushDraft: this.getBrushRenderState(),
      isolatedLayerId: this.getStraightCutIsolatedLayerId()
    });
    this.syncSelectedLayerLockControl();
  },

  syncSelectedLayerLockControl() {
    const layer = this.getSelectedLayer();
    const shouldHide = !layer
      || this.data.textInputVisible
      || this.data.cropEditing
      || this.data.scissorEditing
      || this.data.embossEditing
      || this.data.straightCutEditing
      || this.data.brushEditing
      || this.data.imageEffectEditing;
    if (shouldHide) {
      this.updateSelectedLayerLockControl("", false);
      return;
    }
    const style = getLayerLockControlStyle(layer, {
      canvasWidth: this.data.canvasCssWidth || 1,
      canvasHeight: this.data.canvasCssHeight || 1,
      scale: this.renderScale || 1
    });
    this.updateSelectedLayerLockControl(style, !!layer.locked);
  },

  updateSelectedLayerLockControl(style, locked) {
    if (this.data.selectedLayerLockStyle === style && this.data.selectedLayerLocked === locked) return;
    this.setData({
      selectedLayerLockStyle: style,
      selectedLayerLocked: locked
    });
  },

  getStraightCutIsolatedLayerId() {
    if (!this.data.straightCutEditing || !this.straightCutSession) return "";
    return this.straightCutSession.layerId || "";
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

  exportCanvasFile(pixelRatio) {
    const exportSize = getExportPixelSize(this.draft, pixelRatio);
    return this.drawCanvasAtPixelSize(exportSize.width, exportSize.height)
      .then((ready) => {
        if (!ready || !this.canvasNode) throw new Error("export_render_failed");
        return new Promise((resolve, reject) => {
          wx.canvasToTempFilePath({
            canvas: this.canvasNode,
            width: exportSize.width,
            height: exportSize.height,
            destWidth: exportSize.width,
            destHeight: exportSize.height,
            fileType: "png",
            success: (res) => resolve(res.tempFilePath),
            fail: reject
          }, this);
        });
      });
  },

  saveExportedImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: reject
      });
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
    if (!isCuttableSourceLayer(layer)) {
      showToast("请先选中图片或素材", { icon: "none" });
      return;
    }
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
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
    if (!isCuttableSourceLayer(layer) || !strokes.length) {
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
    if (!isCuttableSourceLayer(layer)) return false;
    const style = layer.style || {};
    const clipShape = normalizeOptionalEmbossShape(layer.clipShape || layer.maskShape || style.clipShape || style.maskShape || style.shape || "");
    const excludeShape = normalizeOptionalEmbossShape(layer.excludeShape || style.excludeShape || "");
    const hasPolygon = Array.isArray(layer.clipPolygon) && layer.clipPolygon.length >= 3;
    const hasPolygons = Array.isArray(layer.clipPolygons) && layer.clipPolygons.some((polygon) => Array.isArray(polygon) && polygon.length >= 3);
    const hasExcludeFrame = !!(excludeShape && (layer.excludeFrame || style.excludeFrame));
    return !!(clipShape || hasPolygon || hasPolygons || hasExcludeFrame || layer.tear || layer.radius);
  },

  layerNeedsNonPolygonVisualBake(layer) {
    if (!isCuttableSourceLayer(layer)) return false;
    const style = layer.style || {};
    const clipShape = normalizeOptionalEmbossShape(layer.clipShape || layer.maskShape || style.clipShape || style.maskShape || style.shape || "");
    const excludeShape = normalizeOptionalEmbossShape(layer.excludeShape || style.excludeShape || "");
    const hasExcludeFrame = !!(excludeShape && (layer.excludeFrame || style.excludeFrame));
    return !!(clipShape || hasExcludeFrame || layer.tear || layer.radius);
  },

  async prepareLayerForVisualSourceEdit(layer) {
    if (!this.layerNeedsVisualSourceBake(layer)) return layer;
    const baked = await this.createVisibleLayerSourceImage(layer);
    this.applyBakedVisibleSourceToLayer(layer, baked, { clearClipPolygon: true });
    this.canvasImageCache = {};
    this.scissorLoadedImageSrc = "";
    this.scissorLoadedImage = null;
    return layer;
  },

  applyBakedVisibleSourceToLayer(layer, baked, options = {}) {
    const localBounds = baked.localBounds || { x: 0, y: 0, width: layer.width, height: layer.height };
    if (localBounds.x || localBounds.y || localBounds.width !== layer.width || localBounds.height !== layer.height) {
      const center = layerLocalPointToDraft({
        x: localBounds.x + localBounds.width / 2,
        y: localBounds.y + localBounds.height / 2
      }, layer);
      layer.x = center.x - localBounds.width / 2;
      layer.y = center.y - localBounds.height / 2;
      layer.width = localBounds.width;
      layer.height = localBounds.height;
      if (Array.isArray(layer.clipPolygon) && layer.clipPolygon.length >= 3) {
        layer.clipPolygon = layer.clipPolygon.map((point) => ({
          x: point.x - localBounds.x,
          y: point.y - localBounds.y
        }));
      }
      if (Array.isArray(layer.clipPolygons)) {
        layer.clipPolygons = layer.clipPolygons.map((polygon) => Array.isArray(polygon)
          ? polygon.map((point) => ({
            x: point.x - localBounds.x,
            y: point.y - localBounds.y
          }))
          : polygon);
      }
      if (layer.excludeFrame) {
        layer.excludeFrame = {
          ...layer.excludeFrame,
          x: layer.excludeFrame.x - localBounds.x,
          y: layer.excludeFrame.y - localBounds.y
        };
      }
      if (layer.style && layer.style.excludeFrame) {
        layer.style = {
          ...layer.style,
          excludeFrame: {
            ...layer.style.excludeFrame,
            x: layer.style.excludeFrame.x - localBounds.x,
            y: layer.style.excludeFrame.y - localBounds.y
          }
        };
      }
    }
    layer.source = baked.path;
    layer.sourceWidth = baked.width;
    layer.sourceHeight = baked.height;
    layer.crop = null;
    layer.clipShape = "";
    layer.maskShape = "";
    layer.excludeShape = "";
    layer.excludeFrame = null;
    if (options.clearClipPolygon) {
      layer.clipPolygon = null;
      layer.clipPolygons = null;
    }
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
    return layer;
  },

  async createVisibleLayerSourceImage(layer) {
    await this.ensureScissorCanvasContext();
    if (!this.scissorCanvasNode || !this.scissorCtx) throw new Error("missing_scratch_canvas");
    const sourceImage = await this.loadScissorCanvasImage(layer.source);
    if (!sourceImage) throw new Error("missing_source_image");
    const sourceCrop = getLayerSourceCrop(layer);
    const localBounds = getLayerVisibleLocalBounds(layer);
    const naturalScale = Math.max(sourceCrop.width / layer.width, sourceCrop.height / layer.height);
    let outputScale = Math.min(2.5, Math.max(1, naturalScale));
    const maxSide = Math.max(localBounds.width, localBounds.height) * outputScale;
    if (maxSide > SCISSOR_MAX_OUTPUT_SIZE) {
      outputScale *= SCISSOR_MAX_OUTPUT_SIZE / maxSide;
    }
    const outputWidth = Math.max(1, Math.round(localBounds.width * outputScale));
    const outputHeight = Math.max(1, Math.round(localBounds.height * outputScale));
    this.scissorCanvasNode.width = outputWidth;
    this.scissorCanvasNode.height = outputHeight;
    const ctx = this.scissorCtx;
    if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, outputWidth, outputHeight);
    ctx.globalCompositeOperation = "source-over";
    const sx = sourceCrop.x + localBounds.x / layer.width * sourceCrop.width;
    const sy = sourceCrop.y + localBounds.y / layer.height * sourceCrop.height;
    const sw = localBounds.width / layer.width * sourceCrop.width;
    const sh = localBounds.height / layer.height * sourceCrop.height;
    const clipPolygons = getLayerClipPolygonsForNextCut(layer);
    ctx.save();
    if (clipPolygons.length) {
      clipPolygons.forEach((polygon) => {
        clipPolygonMaskPath(ctx, polygon, outputScale, localBounds);
        ctx.clip();
      });
    }
    ctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    ctx.restore();
    this.applyLayerVisualAlphaToSource(ctx, layer, outputScale, outputWidth, outputHeight, localBounds, { skipPolygons: !!clipPolygons.length });
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
    return { path, width: outputWidth, height: outputHeight, localBounds };
  },

  applyLayerVisualAlphaToSource(ctx, layer, outputScale, outputWidth, outputHeight, localBounds = { x: 0, y: 0 }, options = {}) {
    const style = layer.style || {};
    const clipShape = normalizeOptionalEmbossShape(layer.clipShape || layer.maskShape || style.clipShape || style.maskShape || style.shape || "");
    const excludeShape = normalizeOptionalEmbossShape(layer.excludeShape || style.excludeShape || "");
    const polygons = getLayerClipPolygonsForNextCut(layer);
    ctx.fillStyle = "#000000";
    if (polygons.length && !options.skipPolygons) {
      polygons.forEach((polygon) => {
        applyPolygonAlphaMask(ctx, outputWidth, outputHeight, polygon, outputScale, localBounds);
      });
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
      drawEmbossMaskPath(
        ctx,
        excludeShape,
        (frame.x - (localBounds.x || 0)) * outputScale,
        (frame.y - (localBounds.y || 0)) * outputScale,
        frame.width * outputScale,
        frame.height * outputScale
      );
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
    track("photo_choose_start", {
      page: "create",
      source,
      fromEmpty: shouldStartBlank
    });
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
            persistTempFile(file.tempFilePath).then((imageSource) => {
              const layer = createImageLayer(imageSource || file.tempFilePath, info, this.draft);
              this.draft.layers.push(layer);
              this.draft.layers = normalizeLayerOrder(this.draft.layers);
              this.markDirty();
              track("photo_choose_success", {
                page: "create",
                source,
                width: info.width || 0,
                height: info.height || 0,
                fileSize: file.size || 0,
                ...getDraftAnalyticsParams(this.draft)
              });
              if (pendingAfterPhoto === "scissorFree") {
                this.pendingAfterPhoto = "";
                checkImportedImageContent(this, file.tempFilePath, file.size, layer.id);
                setTimeout(() => this.beginScissorCut(layer), 0);
                return;
              }
              this.closeAfterAddingLayer();
              this.render();
              checkImportedImageContent(this, file.tempFilePath, file.size, layer.id);
            });
          },
          fail: () => {
            if (pendingAfterPhoto) this.pendingAfterPhoto = "";
            track("photo_choose_fail", {
              page: "create",
              source,
              errorCode: "get_image_info_failed"
            });
            showError("图片添加失败");
          }
        });
      },
      fail: () => {
        if (pendingAfterPhoto) this.pendingAfterPhoto = "";
        track("photo_choose_fail", {
          page: "create",
          source,
          errorCode: "choose_media_failed"
        });
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
    this.pendingStraightCutStyle = "";
    this.embossPickPending = false;
    this.enterEditMode();
    if (tool === "cut" && this.data.activeTool === "cut" && this.data.activePalette === "cut") {
      this.closeToolPanel();
      setTimeout(() => this.render(), 0);
      return;
    }
    if (tool === "image") {
      this.openImageSourceSheet();
      return;
    }
    if (tool === "text") {
      this.addText();
      return;
    }
    if (tool === "brush") {
      this.beginBrushDrawing();
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
    const closesEffectEditor = this.data.activePalette === "effect";
    this.scissorPickPending = false;
    this.straightCutPickPending = false;
    this.pendingStraightCutStyle = "";
    this.embossPickPending = false;
    this.setData({
      ...(closesEffectEditor ? this.getEffectEditorLayoutResetPatch(true) : {}),
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      effectAdjusting: "",
      effectAdjustingLabel: "",
      textInputVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0
    }, () => {
      if (closesEffectEditor) {
        this.restoreDefaultCanvasAfterEffectEditor();
      }
    });
  },

  collapsePanelsToMainToolbar() {
    const closesEffectEditor = this.data.activePalette === "effect";
    this.scissorPickPending = false;
    this.straightCutPickPending = false;
    this.pendingStraightCutStyle = "";
    this.embossPickPending = false;
    if (closesEffectEditor) {
      this.effectStageHeight = 0;
      this.effectPanelHeight = 0;
    }
    this.setData({
      ...(closesEffectEditor ? this.getCanvasSizeData(this.draft.ratio) : {}),
      selectedLayerId: "",
      selectedLayerType: "",
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      textInputVisible: false,
      ratioPanelVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0,
      layerActionsPage: 0,
      layerActionsOffset: 0
    }, () => {
      if (closesEffectEditor) {
        this.restoreDefaultCanvasAfterEffectEditor();
      } else {
        this.render();
      }
    });
  },

  updateKeyboardHeight(res) {
    const height = res && res.height ? Math.max(0, Math.round(res.height)) : 0;
    this.setData({
      keyboardHeight: height,
      textPanelBottom: this.data.textInputVisible ? height : 0
    }, () => {
      if (this.data.textInputVisible) {
        this.scheduleTextCanvasOffsetRefresh();
      }
    });
  },

  onTextKeyboardHeightChange(event) {
    this.updateKeyboardHeight(event.detail || {});
  },

  onTextFocus() {
    if (this.data.keyboardHeight > 0) {
      this.setData({ textPanelBottom: this.data.keyboardHeight }, () => this.scheduleTextCanvasOffsetRefresh());
      return;
    }
    this.scheduleTextCanvasOffsetRefresh();
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
    track("asset_category_select", { page: "create", category });
    this.setData(this.getAssetPanelState(category, ""));
    this.refreshAssetPanel(category, "");
  },

  openAssetPack(event) {
    const packId = event.currentTarget.dataset.pack;
    if (!packId) return;
    track("asset_pack_open", {
      page: "create",
      packId,
      category: this.data.activeAssetCategory || "推荐"
    });
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
    track("tape_add", {
      page: "create",
      color,
      ...getDraftAnalyticsParams(this.draft)
    });
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
    track("paper_add", {
      page: "create",
      ...getDraftAnalyticsParams(this.draft)
    });
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
        track("asset_add_to_canvas", {
          page: "create",
          source: "assetDrawer",
          assetId,
          packId: asset.packId || "",
          ...getDraftAnalyticsParams(this.draft)
        });
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
      track("asset_add_to_canvas", {
        page: "create",
        source: "assetDrawer",
        assetId,
        packId: resolvedAsset.packId || "",
        ...getDraftAnalyticsParams(this.draft)
      });
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
      track("asset_add_to_canvas", {
        page: "create",
        source: transferMode.source || "assetsTab",
        selectedCount: assetIds.length,
        addedCount: added,
        ...getDraftAnalyticsParams(this.draft)
      });
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
    track("text_add_start", {
      page: "create",
      isNewLayer,
      ...getDraftAnalyticsParams(this.draft)
    });
    this.beginTextLayerEditing(layer, { isNew: isNewLayer });
    const textFontStyle = createTextFontStyle(layer.style.fontId || layer.style.fontLabel || "system");
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      textInputVisible: true,
      activeTool: "text",
      activeDrawer: "",
      activePalette: "",
      textDraft: layer.text || "",
      textToolMode: "font",
      textFont: textFontStyle.fontId,
      textFontGroup: textFontStyle.fontGroupId,
      textFontVariant: textFontStyle.fontId,
      textFontVariants: getTextFontVariantOptions(textFontStyle.fontGroupId),
      textColor: layer.style.color || "#111111",
      textSize: layer.style.fontSize || 54,
      textBackground: layer.style.backgroundLabel || "无",
      textOpacity: Math.round((layer.opacity == null ? 1 : layer.opacity) * 100),
      textPanelBottom: this.data.keyboardHeight || 0
    }, () => {
      this.scheduleTextCanvasOffsetRefresh();
    });
    this.ensureTextFontLoaded(textFontStyle.fontId).then(() => this.render());
    this.render();
  },

  beginTextLayerEditing(layer, options = {}) {
    if (!layer || layer.type !== "text") return;
    const isNew = !!options.isNew;
    this.textEditSession = {
      layerId: layer.id,
      isNew,
      original: {
        x: layer.x,
        y: layer.y
      }
    };
    if (isNew) {
      this.moveTextLayerToEditingPreview(layer);
    }
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
      showToast("主体剪即将上线");
      return;
    }
    if (style === "straight" || style === "wave") {
      const layer = this.getSelectedLayer();
      if (!isCuttableSourceLayer(layer)) {
        this.straightCutPickPending = true;
        this.pendingStraightCutStyle = style;
        this.setData({
          activeTool: "cut",
          activePalette: "",
          activeDrawer: "",
          selectedLayerId: "",
          selectedLayerType: ""
        });
        showToast("请在画布上选择图片或素材", { icon: "none" });
        return;
      }
      this.beginStraightCut(layer, style);
      return;
    }
    if (style !== "free") {
      showToast("剪法待接入", { icon: "none" });
      return;
    }
    const layer = this.getSelectedLayer();
    if (!isCuttableSourceLayer(layer)) {
      this.scissorPickPending = true;
      this.setData({
        activeTool: "cut",
        activePalette: "",
        activeDrawer: "",
        selectedLayerId: "",
        selectedLayerType: ""
      });
      showToast("请在画布上选择图片或素材", { icon: "none" });
      return;
    }
    this.beginScissorCut(layer);
  },

  beginStraightCut(targetLayer, style = "straight") {
    const layer = targetLayer || this.getSelectedLayer();
    if (!isCuttableSourceLayer(layer)) {
      showToast("请选择图片或素材图层", { icon: "none" });
      return;
    }
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    const cutStyle = style === "wave" ? "wave" : "straight";
    const originalLayer = JSON.parse(JSON.stringify(layer));
    const visibleBounds = getLayerVisibleLocalBounds(layer);
    const start = layerLocalPointToDraft({
      x: visibleBounds.x + visibleBounds.width * 0.16,
      y: visibleBounds.y + visibleBounds.height * 0.5
    }, layer);
    const end = layerLocalPointToDraft({
      x: visibleBounds.x + visibleBounds.width * 0.84,
      y: visibleBounds.y + visibleBounds.height * 0.5
    }, layer);
    this.straightCutSession = {
      layerId: layer.id,
      style: cutStyle,
      originalLayer,
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
    if (this.straightCutSession && this.straightCutSession.originalLayer && this.draft) {
      const index = this.draft.layers.findIndex((layer) => layer.id === this.straightCutSession.layerId);
      if (index >= 0) {
        this.draft.layers[index] = this.straightCutSession.originalLayer;
      }
    }
    this.clearStraightCutEditing();
    this.render();
  },

  async confirmStraightCut() {
    if (this.straightCutBusy) return;
    const session = this.straightCutSession;
    if (!session || !this.draft) return;
    this.cancelStraightCutOverlayFrame();
    const index = this.draft.layers.findIndex((layer) => layer.id === session.layerId);
    const layer = this.draft.layers[index];
    if (!layer) {
      this.clearStraightCutEditing();
      return;
    }
    this.straightCutBusy = true;
    this.setData({ saveStatus: "剪切处理中..." });
    try {
      const baseLayer = await this.createStraightCutWorkingLayer(layer);
      const start = draftPointToLayerLocal(session.start, baseLayer);
      const end = draftPointToLayerLocal(session.end, baseLayer);
      const polygons = session.style === "wave"
        ? splitRectByWave(baseLayer.width, baseLayer.height, start, end)
        : splitRectByLine(baseLayer.width, baseLayer.height, start, end);
      if (!polygons) {
        showToast("剪切线需要穿过图片或素材", { icon: "none" });
        return;
      }
      const normal = lineNormal(start, end);
      const angle = ((baseLayer.rotation || 0) * Math.PI) / 180;
      const nudge = {
        x: (-normal.x * Math.cos(angle) + normal.y * Math.sin(angle)) * 8,
        y: (-normal.x * Math.sin(angle) - normal.y * Math.cos(angle)) * 8
      };
      const first = {
        ...JSON.parse(JSON.stringify(baseLayer)),
        id: `${baseLayer.type}-cut-${Date.now()}-a`,
        clipPolygons: getLayerClipPolygonsForNextCut(baseLayer),
        clipPolygon: polygons[0],
        cutPiece: true,
        cutStyle: session.style === "wave" ? "wave" : "straight",
        x: baseLayer.x + nudge.x,
        y: baseLayer.y + nudge.y
      };
      const second = {
        ...JSON.parse(JSON.stringify(baseLayer)),
        id: `${baseLayer.type}-cut-${Date.now()}-b`,
        clipPolygons: getLayerClipPolygonsForNextCut(baseLayer),
        clipPolygon: polygons[1],
        cutPiece: true,
        cutStyle: session.style === "wave" ? "wave" : "straight",
        x: baseLayer.x - nudge.x,
        y: baseLayer.y - nudge.y
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
    } catch (error) {
      console.warn("[straight-cut] normalize pieces failed", error);
      this.setData({ saveStatus: "剪切失败" });
      showError("剪切失败，请重试");
    } finally {
      this.straightCutBusy = false;
    }
  },

  async createStraightCutWorkingLayer(layer) {
    const workingLayer = JSON.parse(JSON.stringify(layer));
    if (!this.layerNeedsNonPolygonVisualBake(workingLayer)) return workingLayer;
    const baked = await this.createVisibleLayerSourceImage(workingLayer);
    this.applyBakedVisibleSourceToLayer(workingLayer, baked, { clearClipPolygon: true });
    return workingLayer;
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
    this.brushSession = null;
    this.brushStroke = null;
    this.straightCutGesture = null;
    this.straightCutPickPending = false;
    this.pendingStraightCutStyle = "";
    this.straightCutBusy = false;
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
    if (metrics.clipPath && metrics.clipPath.length) {
      ctx.beginPath();
      metrics.clipPath.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.clip();
    }
    ctx.strokeStyle = "rgba(17, 17, 17, 0.78)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    if (ctx.setLineDash) ctx.setLineDash([7, 6]);
    ctx.beginPath();
    metrics.path.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
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
    const layer = this.getLayerById(session.layerId);
    let path = [session.start, session.end];
    let clipPath = null;
    if (session.style === "wave" && layer) {
      const start = draftPointToLayerLocal(session.start, layer);
      const end = draftPointToLayerLocal(session.end, layer);
      path = createWavePathPoints(layer.width, layer.height, start, end)
        .map((point) => layerLocalPointToDraft(point, layer));
    }
    if (layer) {
      clipPath = [
        { x: 0, y: 0 },
        { x: layer.width, y: 0 },
        { x: layer.width, y: layer.height },
        { x: 0, y: layer.height }
      ].map((point) => {
        const draftPoint = layerLocalPointToDraft(point, layer);
        return { x: draftPoint.x * scale, y: draftPoint.y * scale };
      });
    }
    return {
      start: { x: session.start.x * scale, y: session.start.y * scale },
      end: { x: session.end.x * scale, y: session.end.y * scale },
      path: path.map((point) => ({ x: point.x * scale, y: point.y * scale })),
      clipPath
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
      if (this.data.textInputVisible) {
        this.scheduleTextCanvasOffsetRefresh();
      }
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
      const textSession = this.textEditSession;
      this.finishTextLayerEditing();
      this.textCanvasOffsetY = 0;
      clearTimeout(this.textCanvasOffsetTimer);
      this.setData({
        selectedLayerId: "",
        selectedLayerType: "",
        textInputVisible: false,
        textDraft: "",
        activeTool: "",
        keyboardHeight: 0,
        textPanelBottom: 0,
        canvasStageStyle: ""
      });
      this.markDirty();
      if (textSession && textSession.isNew) {
        track("text_add", {
          page: "create",
          textLength: text.length,
          ...getDraftAnalyticsParams(this.draft)
        });
      }
      this.render();
      return;
    }
    const layer = createTextLayer(text, this.draft);
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.textCanvasOffsetY = 0;
    clearTimeout(this.textCanvasOffsetTimer);
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      keyboardHeight: 0,
      textPanelBottom: 0,
      canvasStageStyle: ""
    });
    this.markDirty();
    track("text_add", {
      page: "create",
      textLength: text.length,
      ...getDraftAnalyticsParams(this.draft)
    });
    this.render();
  },

  cancelText() {
    const layer = this.getSelectedLayer();
    const removeNew = !!(this.textEditSession && this.textEditSession.isNew);
    if (layer && layer.type === "text") {
      this.finishTextLayerEditing({ removeNew });
      this.render();
    }
    this.textCanvasOffsetY = 0;
    clearTimeout(this.textCanvasOffsetTimer);
    this.setData({
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      selectedLayerId: "",
      selectedLayerType: "",
      keyboardHeight: 0,
      textPanelBottom: 0,
      canvasStageStyle: ""
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
    this.textCanvasOffsetY = 0;
    clearTimeout(this.textCanvasOffsetTimer);
    this.setData({
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      selectedLayerId: "",
      selectedLayerType: "",
      keyboardHeight: 0,
      textPanelBottom: 0,
      canvasStageStyle: ""
    });
    this.markDirty();
    this.render();
  },

  dismissFloatingPanels() {
    if (this.data.brushEditing) return;
    if (this.data.imageEffectEditing) return;
    if (this.data.straightCutEditing) return;
    if (this.data.textInputVisible) {
      this.dismissTextEditorFromCanvas();
      return;
    }
    if (this.data.selectedLayerId && this.data.activePalette) {
      this.collapsePanelsToMainToolbar();
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
      this.pendingStraightCutStyle = "";
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
    if (this.data.brushEditing) {
      this.onBrushTouchStart(event);
      return;
    }
    if (this.data.imageEffectEditing) return;
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
      if (!target && this.data.selectedLayerId && this.data.activePalette) {
        this.pendingLayerTap = null;
        this.gesture = null;
        this.collapsePanelsToMainToolbar();
        return;
      }
      if (this.straightCutPickPending) {
        if (isCuttableSourceLayer(target)) {
          const cutStyle = this.pendingStraightCutStyle === "wave" ? "wave" : "straight";
          this.straightCutPickPending = false;
          this.pendingStraightCutStyle = "";
          this.setData({
            selectedLayerId: target.id,
            selectedLayerType: target.type,
            activeTool: "",
            activePalette: "",
            layerActionsPage: 0,
            layerActionsOffset: 0
          });
          this.beginStraightCut(target, cutStyle);
          return;
        }
        showToast("请选择图片或素材图层", { icon: "none" });
        return;
      }
      if (this.scissorPickPending) {
        if (isCuttableSourceLayer(target)) {
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
        showToast("请选择图片或素材图层", { icon: "none" });
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
        const closesEffectEditor = this.data.activePalette === "effect";
        this.setData({
          ...(closesEffectEditor ? this.getEffectEditorLayoutResetPatch(true) : {}),
          selectedLayerId: "",
          selectedLayerType: "",
          ...(closesEffectEditor ? { activeTool: "", activePalette: "", activeDrawer: "", effectAdjusting: "", effectAdjustingLabel: "" } : {}),
          layerActionsPage: 0,
          layerActionsOffset: 0
        });
        if (closesEffectEditor) {
          this.restoreDefaultCanvasAfterEffectEditor();
        }
      }
      this.gesture = target && !this.isLayerLocked(target)
        ? { mode: "drag", layerId: target.id, start: points[0], origin: { x: target.x, y: target.y } }
        : null;
      this.render();
      return;
    }

    const layer = this.getGestureLayer(points);
    if (touches.length >= 2 && layer) {
      if (this.isLayerLocked(layer)) {
        this.pendingLayerTap = null;
        this.gesture = null;
        this.selectLayer(layer);
        this.render();
        return;
      }
      if (this.data.selectedLayerId && this.data.selectedLayerId !== layer.id) {
        const closesEffectEditor = this.data.activePalette === "effect";
        this.setData({
          ...(closesEffectEditor ? this.getEffectEditorLayoutResetPatch(true) : {}),
          selectedLayerId: "",
          selectedLayerType: "",
          ...(closesEffectEditor ? { activeTool: "", activePalette: "", activeDrawer: "", effectAdjusting: "", effectAdjustingLabel: "" } : {}),
          layerActionsPage: 0,
          layerActionsOffset: 0
        });
        if (closesEffectEditor) {
          this.restoreDefaultCanvasAfterEffectEditor();
        }
      }
      this.gesture = {
        mode: "pinch",
        layerId: layer.id,
        distance: distance(points[0], points[1]),
        angle: angle(points[0], points[1]),
        origin: {
          width: layer.width,
          height: layer.height,
          rotation: layer.rotation,
          clipPolygon: cloneClipPolygon(layer.clipPolygon),
          clipPolygons: cloneClipPolygons(layer.clipPolygons)
        }
      };
    }
  },

  onTouchMove(event) {
    if (this.data.brushEditing) {
      this.onBrushTouchMove(event);
      return;
    }
    if (this.data.imageEffectEditing) return;
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
      if (this.gesture.origin.clipPolygon) {
        layer.clipPolygon = scaleClipPolygon(this.gesture.origin.clipPolygon, scale, scale);
      }
      if (this.gesture.origin.clipPolygons) {
        layer.clipPolygons = scaleClipPolygons(this.gesture.origin.clipPolygons, scale, scale);
      }
      layer.rotation = this.gesture.origin.rotation + nextAngle - this.gesture.angle;
      this.alignmentGuides = this.getStableRotationGuides(this.getRotationAlignmentGuides(layer));
    }

    this.render();
  },

  onTouchEnd() {
    if (this.data.brushEditing) {
      this.onBrushTouchEnd();
      return;
    }
    if (this.data.imageEffectEditing) return;
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
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    const originalLayer = JSON.parse(JSON.stringify(layer));
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
      const defaultMask = getDefaultEmbossMask(layer, currentShape);
      this.embossSession = {
        layerId: layer.id,
        originalLayer,
        sourceSize,
        preview,
        mask: defaultMask
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
    const prepareAndStart = () => {
      this.setData({ saveStatus: "准备压花..." });
      this.prepareLayerForVisualSourceEdit(layer)
        .then(startEmboss)
        .catch((error) => {
          console.warn("[emboss] prepare source failed", error);
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
    const remainderShape = getLayerCurrentClipShape(this.embossSession.originalLayer || layer);
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
      clipShape: "",
      maskShape: "",
      excludeShape: "",
      excludeFrame: null,
      clipPolygon: null,
      clipPolygons: null,
      radius: 0,
      tear: false,
      style: {
        ...(layer.style || {}),
        clipShape: shape,
        maskShape: "",
        embossEdge: true,
        excludeShape: "",
        excludeFrame: null,
        shape: ""
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
      clipShape: remainderShape,
      maskShape: "",
      embossEdge: !!remainderShape,
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
        span: getPointSpan(points[0], points[1]),
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
      const origin = this.embossGesture.origin;
      const startSpan = this.embossGesture.span || { width: 1, height: 1 };
      const currentSpan = getPointSpan(points[0], points[1]);
      const scaleX = Math.max(0.25, Math.min(4, currentSpan.width / Math.max(1, startSpan.width)));
      const scaleY = Math.max(0.25, Math.min(4, currentSpan.height / Math.max(1, startSpan.height)));
      const width = origin.width * scaleX;
      const height = origin.height * scaleY;
      const center = this.embossGesture.center;
      this.embossSession.mask = clampEmbossMask({
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height
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
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
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

  isLayerLocked(layer) {
    return !!(layer && layer.locked);
  },

  showLockedLayerToast() {
    showToast("图层已锁定，先解锁", { icon: "none" });
  },

  toggleSelectedLayerLock() {
    const layer = this.getSelectedLayer();
    if (!layer) return;
    layer.locked = !layer.locked;
    this.setData({ selectedLayerLocked: !!layer.locked });
    this.markDirty();
    this.render();
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
    const closesEffectEditor = this.data.activePalette === "effect";
    this.setData({
      ...(closesEffectEditor ? this.getEffectEditorLayoutResetPatch(true) : {}),
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      selectedLayerLocked: !!layer.locked,
      selectedLayerLockStyle: "",
      selectedHandmadeEffect: getHandmadeEffectKey(layer),
      selectedTextureEffect: getTextureEffectKey(layer),
      selectedOutlineStyle: getLayerOutlineStyleKey(layer.outline),
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      effectAdjusting: "",
      effectAdjustingLabel: "",
      textInputVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0,
      layerActionsPage: 0,
      layerActionsOffset: 0
    }, () => {
      if (closesEffectEditor) {
        this.restoreDefaultCanvasAfterEffectEditor();
      }
    });
  },

  closeAfterAddingLayer() {
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      selectedLayerLocked: false,
      selectedLayerLockStyle: "",
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
      selectedLayerLocked: false,
      selectedLayerLockStyle: "",
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
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    this.beginTextLayerEditing(layer, { isNew: false });
    const textFontStyle = createTextFontStyle(layer.style.fontId || layer.style.fontLabel || "system");
    this.setData({
      activeTool: "text",
      activeDrawer: "",
      activePalette: "",
      textInputVisible: true,
      textDraft: layer.text || "",
      textToolMode: "font",
      textFont: textFontStyle.fontId,
      textFontGroup: textFontStyle.fontGroupId,
      textFontVariant: textFontStyle.fontId,
      textFontVariants: getTextFontVariantOptions(textFontStyle.fontGroupId),
      textColor: layer.style.color || "#111111",
      textSize: layer.style.fontSize || 54,
      textBackground: layer.style.backgroundLabel || "无",
      textOpacity: Math.round((layer.opacity == null ? 1 : layer.opacity) * 100),
      textPanelBottom: this.data.keyboardHeight || 0
    }, () => {
      this.scheduleTextCanvasOffsetRefresh();
    });
    this.ensureTextFontLoaded(textFontStyle.fontId).then(() => this.render());
  },

  setTextToolMode(event) {
    const mode = event.currentTarget.dataset.mode || "font";
    if (mode === "font" || mode === "fontVariant") {
      this.ensureTextFontLoaded(this.data.textFontVariant || this.data.textFont || "system");
    }
    this.setData({ textToolMode: mode });
  },

  setTextFont(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const option = this.data.textFonts[index] || {};
    const groupId = event.currentTarget.dataset.groupId || option.groupId || event.currentTarget.dataset.fontId || option.id || "system";
    const currentStyle = createTextFontStyle(this.data.textFontVariant || this.data.textFont || "system");
    const variants = getTextFontVariantOptions(groupId);
    const nextVariant = variants.find((item) => item.id === currentStyle.fontId) || variants[0] || { id: groupId };
    const fontStyle = createTextFontStyle(nextVariant.id);
    this.updateEditingTextStyle(fontStyle);
    this.ensureTextFontLoaded(fontStyle.fontId).then(() => this.render());
    this.setData({
      textFont: fontStyle.fontId,
      textFontGroup: fontStyle.fontGroupId,
      textFontVariant: fontStyle.fontId,
      textFontVariants: variants
    });
  },

  setTextFontVariant(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const fontId = event.currentTarget.dataset.fontId || (this.data.textFontVariants[index] && this.data.textFontVariants[index].id) || this.data.textFont || "system";
    const fontStyle = createTextFontStyle(fontId);
    this.updateEditingTextStyle(fontStyle);
    this.ensureTextFontLoaded(fontStyle.fontId).then(() => this.render());
    this.setData({
      textFont: fontStyle.fontId,
      textFontGroup: fontStyle.fontGroupId,
      textFontVariant: fontStyle.fontId,
      textFontVariants: getTextFontVariantOptions(fontStyle.fontGroupId)
    });
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
    if (this.data.textInputVisible) {
      this.scheduleTextCanvasOffsetRefresh();
    }
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
    if (this.data.textInputVisible) {
      this.scheduleTextCanvasOffsetRefresh();
    }
  },

  applyLayerAction(event) {
    if (this.ignoreLayerActionTap) return;
    const action = event.currentTarget.dataset.action;
    const layer = this.getSelectedLayer();
    if (action === "lock") return this.toggleSelectedLayerLock();
    const allowedWhenLocked = ["copy", "delete", "up", "down"];
    if (this.isLayerLocked(layer) && !allowedWhenLocked.includes(action)) {
      this.showLockedLayerToast();
      return;
    }
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
    if (action === "outline") {
      const isOpen = this.data.activePalette === "outline";
      this.setData({
        activeTool: isOpen ? "" : "outline",
        activePalette: isOpen ? "" : "outline",
        activeDrawer: "",
        selectedOutlineStyle: layer ? getLayerOutlineStyleKey(layer.outline) : "none",
        textInputVisible: false,
        ratioPanelVisible: false
      });
      return;
    }
    if (action === "effect") {
      const isOpen = this.data.activePalette === "effect";
      if (isOpen) {
        this.closeEffectEditor();
        return;
      }
      this.effectStageHeight = 0;
      this.setData({
        activeTool: "effect",
        activePalette: "effect",
        activeDrawer: "",
        selectedHandmadeEffect: layer ? getHandmadeEffectKey(layer) : "none",
        selectedTextureEffect: layer ? getTextureEffectKey(layer) : "none",
        effectAdjusting: "",
        effectAdjustingLabel: "",
        textInputVisible: false,
        ratioPanelVisible: false,
        canvasStageStyle: this.getEffectCanvasStageStyle()
      }, () => {
        this.refreshEffectCanvasLayout();
      });
      return;
    }
    if (action === "crop") return this.beginImageCrop();
    if (action === "copy") return this.duplicateLayer();
    if (action === "delete") return this.deleteLayer();
    if (action === "up") return this.moveLayerUp();
    if (action === "down") return this.moveLayerDown();

    if (!layer) return;
    if (action === "shadow") layer.shadow = !layer.shadow;
    if (action === "opacity") layer.opacity = layer.opacity === 0.58 ? 1 : 0.58;
    if (action === "corner") layer.radius = layer.radius ? 0 : 36;
    this.markDirty();
    this.render();
  },

  selectHandmadeEffect(event) {
    const effect = event.currentTarget.dataset.effect || "none";
    const layer = this.getSelectedLayer();
    if (!layer || layer.type === "text") return;
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }

    const style = { ...(layer.style || {}) };
    layer.tear = effect === "tear";
    if (layer.tear) {
      layer.tearSeed = layer.tearSeed || Date.now() % 1000000;
    } else {
      delete layer.tearSeed;
    }
    if (effect === "taped") {
      style.handmadeEffect = {
        type: "taped",
        placement: "double-corners",
        tapeColor: "#f5f1e8",
        tapeOpacity: 0.64
      };
    } else if (effect === "floating") {
      style.handmadeEffect = {
        type: "floating",
        elevation: 1
      };
    } else {
      delete style.handmadeEffect;
    }
    layer.style = style;
    this.setData({ selectedHandmadeEffect: effect });
    this.markDirty();
    this.render();
  },

  openEffectAdjustment(event) {
    const effect = event.currentTarget.dataset.effect;
    const layer = this.getSelectedLayer();
    if (!layer || !layer.style) return;
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }

    if (effect === "blueprint-print" || effect === "screen-print" || effect === "riso-print" || effect === "vintage-botanical" || effect === "pixel-cross-stitch" || effect === "matisse-cutout" || effect === "kpop-card") {
      const saved = layer.style.textureEffect && layer.style.textureEffect.settings || {};
      const label = getTextureEffectConfig(effect, this.data).label;
      const values = effect === "blueprint-print"
        ? {
          blueprintTone: saved.blueprintTone || "prussian",
          blueprintIntensity: saved.blueprintIntensity || "standard",
          blueprintPaper: saved.blueprintPaper || "warm",
          blueprintGrain: saved.blueprintGrain || "medium"
        }
        : effect === "screen-print"
          ? {
            screenPrintPalette: saved.screenPrintPalette || "red-blue",
            screenPrintStrength: saved.screenPrintStrength || "standard",
            screenPrintHalftone: saved.screenPrintHalftone || "medium",
            screenPrintOffset: saved.screenPrintOffset || "slight"
          }
          : effect === "riso-print"
            ? {
              risoPalette: saved.risoPalette || "pink-blue",
              risoMode: saved.risoMode || "three",
              risoInk: saved.risoInk || "standard",
              risoOffset: saved.risoOffset || "slight",
              risoGrain: saved.risoGrain || "medium"
            }
            : effect === "vintage-botanical"
              ? { botanicalTone: saved.botanicalTone || "blueprint", botanicalDetail: saved.botanicalDetail || "medium", botanicalFrame: saved.botanicalFrame || "on" }
              : effect === "pixel-cross-stitch"
                ? { crossStitchGrid: saved.crossStitchGrid || 72, crossStitchColors: saved.crossStitchColors || 8 }
                : effect === "matisse-cutout"
                  ? { matisseDetail: saved.matisseDetail || 64, matissePalette: saved.matissePalette || "vivid" }
                  : { kpopCardText: saved.kpopCardText || "subtle" };
      this.setData({ effectAdjusting: effect, effectAdjustingLabel: label, ...values });
      return;
    }

    if (effect !== "taped" || !layer.style.handmadeEffect) return;
    this.setData({
      effectAdjusting: "taped",
      effectAdjustingLabel: "贴住",
      selectedTapePlacement: layer.style.handmadeEffect.placement || "double-corners"
    });
  },

  setTapePlacement(event) {
    const placement = event.currentTarget.dataset.value || "double-corners";
    const layer = this.getSelectedLayer();
    if (!layer || !layer.style || !layer.style.handmadeEffect) return;
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    layer.style = {
      ...layer.style,
      handmadeEffect: { ...layer.style.handmadeEffect, type: "taped", placement }
    };
    this.setData({ selectedTapePlacement: placement });
    this.markDirty();
    this.render();
  },

  closeEffectAdjustment() {
    clearTimeout(this.effectAdjustmentTimer);
    this.effectAdjustmentToken = (this.effectAdjustmentToken || 0) + 1;
    this.setData({ effectAdjusting: "", effectAdjustingLabel: "" });
  },

  confirmEffectAdjustment() {
    const texture = this.data.effectAdjusting;
    if (!texture) return;
    clearTimeout(this.effectAdjustmentTimer);
    this.effectAdjustmentToken = (this.effectAdjustmentToken || 0) + 1;
    if (texture === "taped") {
      this.closeEffectAdjustment();
      return;
    }
    if (this.data.textureEffectBusy) {
      showToast("效果生成中，请稍候", { icon: "none" });
      return;
    }
    const layer = this.getSelectedLayer();
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    const current = layer && layer.style && layer.style.textureEffect;
    const nextSettings = getTextureEffectSettings(texture, this.data);
    if (current && current.type === texture && areTextureEffectSettingsEqual(current.settings, nextSettings)) {
      this.setData({
        effectAdjusting: "",
        effectAdjustingLabel: "",
        selectedTextureEffect: getTextureEffectKey(layer),
        textureEffectBusy: false,
        textureEffectBusyType: "",
        textureEffectBusySetting: ""
      });
      return;
    }
    this.setData({ effectAdjusting: "", effectAdjustingLabel: "" }, () => {
      this.selectTextureEffect({ currentTarget: { dataset: { texture, force: true } } });
    });
  },

  async selectTextureEffect(event) {
    const texture = event.currentTarget.dataset.texture || "none";
    const force = !!event.currentTarget.dataset.force;
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "image" || !layer.source || this.data.textureEffectBusy) return;
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }

    const style = { ...(layer.style || {}) };
    const current = style.textureEffect;
    if (!force && texture === getTextureEffectKey(layer)) return;

    if (texture === "none") {
      if (current && current.originalSource) {
        const generatedSource = layer.source;
        layer.source = current.originalSource;
        layer.sourceWidth = current.originalSourceWidth || layer.sourceWidth;
        layer.sourceHeight = current.originalSourceHeight || layer.sourceHeight;
        layer.crop = current.originalCrop || null;
        delete this.canvasImageCache[generatedSource];
      }
      delete style.textureEffect;
      layer.style = style;
      this.setData({ selectedTextureEffect: "none" });
      this.markDirty();
      this.render();
      return;
    }

    const textureConfig = getTextureEffectConfig(texture, this.data);
    if (!textureConfig) return;
    const layerId = layer.id;
    const busySetting = event.currentTarget.dataset.setting || "";
    this.setData({ textureEffectBusy: true, textureEffectBusyType: texture, textureEffectBusySetting: busySetting, saveStatus: `${textureConfig.label}生成中...` });
    try {
      const original = current && current.originalSource
        ? current
        : {
          originalSource: layer.source,
          originalSourceWidth: layer.sourceWidth,
          originalSourceHeight: layer.sourceHeight,
          originalCrop: layer.crop ? { ...layer.crop } : null
        };
      const sourceLayer = {
        ...layer,
        source: original.originalSource,
        sourceWidth: original.originalSourceWidth,
        sourceHeight: original.originalSourceHeight,
        crop: original.originalCrop
      };
      const result = await textureConfig.create(this, sourceLayer);
      const previousSource = layer.source;
      layer.source = result.path;
      layer.sourceWidth = result.width;
      layer.sourceHeight = result.height;
      applyGeneratedLayerGeometry(layer, result);
      layer.crop = null;
      style.textureEffect = {
        ...original,
        type: texture,
        settings: getTextureEffectSettings(texture, this.data),
        generatedSource: result.path,
        createdAt: Date.now()
      };
      layer.style = style;
      delete this.canvasImageCache[previousSource];
      this.setData({
        selectedTextureEffect: this.data.selectedLayerId === layerId ? getTextureEffectKey(layer) : this.data.selectedTextureEffect,
        textureEffectBusy: false,
        textureEffectBusyType: "",
        textureEffectBusySetting: ""
      });
      this.markDirty();
      this.render();
      if (!force) showSuccess(`${textureConfig.label}已应用`);
    } catch (error) {
      console.warn("[texture-effect] failed", texture, error);
      this.setData({
        selectedTextureEffect: this.data.selectedLayerId === layerId ? getTextureEffectKey(layer) : this.data.selectedTextureEffect,
        textureEffectBusy: false,
        textureEffectBusyType: "",
        textureEffectBusySetting: "",
        saveStatus: `${textureConfig.label}生成失败`
      });
      this.render();
      showError(`${textureConfig.label}生成失败`);
    }
  },

  closeEffectEditor() {
    clearTimeout(this.effectAdjustmentTimer);
    this.effectStageHeight = 0;
    this.effectPanelHeight = 0;
    this.setData({
      ...this.getCanvasSizeData(this.draft.ratio),
      activeTool: "",
      activePalette: "",
      effectAdjusting: "",
      effectAdjustingLabel: "",
      canvasStageStyle: ""
    }, () => this.restoreDefaultCanvasAfterEffectEditor());
  },

  restoreDefaultCanvasAfterEffectEditor() {
    const applyDefaultLayout = () => {
      if (this.data.activePalette === "effect") return;
      this.effectStageHeight = 0;
      this.effectPanelHeight = 0;
      this.setData({
        ...this.getCanvasSizeData(this.draft.ratio),
        canvasStageStyle: ""
      }, () => this.render());
    };
    if (wx.nextTick) {
      wx.nextTick(applyDefaultLayout);
    } else {
      setTimeout(applyDefaultLayout, 0);
    }
  },

  selectOutlineStyle(event) {
    const style = event.currentTarget.dataset.style || "white";
    const layer = this.getSelectedLayer();
    if (!layer) {
      showToast("请先选择一个图层", { icon: "none" });
      return;
    }
    layer.outline = createLayerOutlineByStyle(style);
    this.setData({
      selectedOutlineStyle: getLayerOutlineStyleKey(layer.outline)
    });
    this.markDirty();
    this.render();
  },

  beginBrushDrawing() {
    this.enterEditMode();
    this.brushSession = {
      strokes: []
    };
    this.brushStroke = null;
    this.setData({
      canvasStageStyle: this.getBrushCanvasStageStyle(),
      brushEditing: true,
      brushStrokeCount: 0,
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      selectedLayerId: "",
      selectedLayerType: "",
      textInputVisible: false,
      ratioPanelVisible: false
    });
    setTimeout(() => this.refreshBrushCanvasLayout(), 0);
    this.render();
  },


  cancelBrushDrawing() {
    this.brushSession = null;
    this.brushStroke = null;
    this.setData({
      ...this.getCanvasSizeData(this.draft.ratio),
      brushEditing: false,
      brushStrokeCount: 0
    });
    this.render();
  },

  undoBrushStroke() {
    if (!this.brushSession || !this.brushSession.strokes.length) return;
    this.brushSession.strokes.pop();
    this.setData({ brushStrokeCount: this.brushSession.strokes.length });
    this.render();
  },

  clearBrushDrawing() {
    if (!this.brushSession) return;
    this.brushSession.strokes = [];
    this.brushStroke = null;
    this.setData({ brushStrokeCount: 0 });
    this.render();
  },

  confirmBrushDrawing() {
    const strokes = this.brushSession && this.brushSession.strokes ? this.brushSession.strokes : [];
    if (!strokes.length) return;
    const layer = createBrushLayer(strokes, this.draft);
    if (!layer) return;
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.brushSession = null;
    this.brushStroke = null;
    this.setData({
      ...this.getCanvasSizeData(this.draft.ratio),
      brushEditing: false,
      brushStrokeCount: 0,
      selectedLayerId: layer.id,
      selectedLayerType: layer.type
    });
    this.markDirty();
    this.render();
  },

  setBrushColor(event) {
    const color = event.currentTarget.dataset.color || "#111111";
    this.setData({ brushColor: color });
  },

  setBrushSize(event) {
    const size = Number(event.currentTarget.dataset.size || 8);
    this.setData({ brushSize: Math.max(2, Math.min(32, size)) });
  },

  setBrushType(event) {
    const type = event.currentTarget.dataset.type || "line";
    this.setData({ brushType: type });
  },

  onBrushTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch || !this.brushSession) return;
    const point = clampDraftPoint(this.toDraftPoint(touch), this.draft);
    this.brushStroke = {
      type: this.data.brushType || "line",
      stampSource: this.data.brushType === "bow" ? BOW_BRUSH_SOURCE : "",
      color: this.data.brushColor || "#111111",
      size: this.data.brushSize || 8,
      points: [point]
    };
    this.render();
  },

  onBrushTouchMove(event) {
    const touch = event.touches && event.touches[0];
    if (!touch || !this.brushStroke) return;
    const point = clampDraftPoint(this.toDraftPoint(touch), this.draft);
    const points = this.brushStroke.points;
    const last = points[points.length - 1];
    if (distance(last, point) < 1.6) return;
    points.push(point);
    this.render();
  },

  onBrushTouchEnd() {
    if (!this.brushSession || !this.brushStroke) return;
    const stroke = this.brushStroke;
    this.brushStroke = null;
    if (stroke.points.length === 1) {
      stroke.points.push({ ...stroke.points[0], x: stroke.points[0].x + 0.1 });
    }
    this.brushSession.strokes.push(stroke);
    this.setData({ brushStrokeCount: this.brushSession.strokes.length });
    this.render();
  },

  getBrushRenderState() {
    if (!this.data.brushEditing || !this.brushSession) return null;
    const strokes = this.brushSession.strokes.slice();
    if (this.brushStroke) strokes.push(this.brushStroke);
    return {
      strokes
    };
  },

  beginImageEffectEditing() {
    this.enterEditMode();
    const layer = this.getImageEffectTargetLayer();
    if (!layer) {
      showToast("请先添加或选择一张图片", { icon: "none" });
      return;
    }
    this.setData({
      imageEffectEditing: true,
      imageEffectBusy: false,
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      textInputVisible: false,
      ratioPanelVisible: false
    });
    this.render();
  },

  cancelImageEffectEditing() {
    if (this.data.imageEffectBusy) return;
    this.setData({ imageEffectEditing: false });
    this.render();
  },

  setCrossStitchGrid(event) {
    const value = Number(event.currentTarget.dataset.value || 72);
    const nextValue = Math.max(24, Math.min(140, value));
    this.setData({ crossStitchGrid: nextValue }, () => this.scheduleTextureEffectPreview("pixel-cross-stitch", `crossStitchGrid:${nextValue}`));
  },

  setCrossStitchColors(event) {
    const value = Number(event.currentTarget.dataset.value || 8);
    const nextValue = Math.max(2, Math.min(32, value));
    this.setData({ crossStitchColors: nextValue }, () => this.scheduleTextureEffectPreview("pixel-cross-stitch", `crossStitchColors:${nextValue}`));
  },

  setCrossStitchStyle(event) {
    const value = event.currentTarget.dataset.value || "stitch";
    this.setData({ crossStitchStyle: value });
  },

  setImageEffectType(event) {
    const value = event.currentTarget.dataset.value || "cross-stitch";
    this.setData({ imageEffectType: value });
  },

  setMatisseDetail(event) {
    const value = Number(event.currentTarget.dataset.value || 64);
    const nextValue = Math.max(32, Math.min(100, value));
    this.setData({ matisseDetail: nextValue }, () => this.scheduleTextureEffectPreview("matisse-cutout", `matisseDetail:${nextValue}`));
  },

  setMatissePalette(event) {
    const value = event.currentTarget.dataset.value || "vivid";
    this.setData({ matissePalette: value }, () => this.scheduleTextureEffectPreview("matisse-cutout", `matissePalette:${value}`));
  },

  setKpopCardText(event) {
    const value = event.currentTarget.dataset.value || "subtle";
    this.setData({ kpopCardText: value }, () => this.scheduleTextureEffectPreview("kpop-card", `kpopCardText:${value}`));
  },

  setBlueprintTone(event) {
    const value = event.currentTarget.dataset.value || "prussian";
    this.setData({ blueprintTone: value }, () => this.scheduleTextureEffectPreview("blueprint-print", `blueprintTone:${value}`));
  },

  setBlueprintIntensity(event) {
    const value = event.currentTarget.dataset.value || "standard";
    this.setData({ blueprintIntensity: value }, () => this.scheduleTextureEffectPreview("blueprint-print", `blueprintIntensity:${value}`));
  },

  setBlueprintPaper(event) {
    const value = event.currentTarget.dataset.value || "warm";
    this.setData({ blueprintPaper: value }, () => this.scheduleTextureEffectPreview("blueprint-print", `blueprintPaper:${value}`));
  },

  setBlueprintGrain(event) {
    const value = event.currentTarget.dataset.value || "medium";
    this.setData({ blueprintGrain: value }, () => this.scheduleTextureEffectPreview("blueprint-print", `blueprintGrain:${value}`));
  },

  setScreenPrintPalette(event) {
    const value = event.currentTarget.dataset.value || "red-blue";
    this.setData({ screenPrintPalette: value }, () => this.scheduleTextureEffectPreview("screen-print", `screenPrintPalette:${value}`));
  },

  setScreenPrintStrength(event) {
    const value = event.currentTarget.dataset.value || "standard";
    this.setData({ screenPrintStrength: value }, () => this.scheduleTextureEffectPreview("screen-print", `screenPrintStrength:${value}`));
  },

  setScreenPrintHalftone(event) {
    const value = event.currentTarget.dataset.value || "medium";
    this.setData({ screenPrintHalftone: value }, () => this.scheduleTextureEffectPreview("screen-print", `screenPrintHalftone:${value}`));
  },

  setScreenPrintOffset(event) {
    const value = event.currentTarget.dataset.value || "slight";
    this.setData({ screenPrintOffset: value }, () => this.scheduleTextureEffectPreview("screen-print", `screenPrintOffset:${value}`));
  },

  setRisoPalette(event) {
    const value = event.currentTarget.dataset.value || "pink-blue";
    this.setData({ risoPalette: value }, () => this.scheduleTextureEffectPreview("riso-print", `risoPalette:${value}`));
  },

  setRisoMode(event) {
    const value = event.currentTarget.dataset.value || "three";
    this.setData({ risoMode: value }, () => this.scheduleTextureEffectPreview("riso-print", `risoMode:${value}`));
  },

  setRisoInk(event) {
    const value = event.currentTarget.dataset.value || "standard";
    this.setData({ risoInk: value }, () => this.scheduleTextureEffectPreview("riso-print", `risoInk:${value}`));
  },

  setRisoOffset(event) {
    const value = event.currentTarget.dataset.value || "slight";
    this.setData({ risoOffset: value }, () => this.scheduleTextureEffectPreview("riso-print", `risoOffset:${value}`));
  },

  setRisoGrain(event) {
    const value = event.currentTarget.dataset.value || "medium";
    this.setData({ risoGrain: value }, () => this.scheduleTextureEffectPreview("riso-print", `risoGrain:${value}`));
  },

  setBotanicalTone(event) {
    const value = event.currentTarget.dataset.value || "blueprint";
    this.setData({ botanicalTone: value }, () => this.scheduleTextureEffectPreview("vintage-botanical", `botanicalTone:${value}`));
  },

  setBotanicalDetail(event) {
    const value = event.currentTarget.dataset.value || "medium";
    this.setData({ botanicalDetail: value }, () => this.scheduleTextureEffectPreview("vintage-botanical", `botanicalDetail:${value}`));
  },

  setBotanicalFrame(event) {
    const value = event.currentTarget.dataset.value || "on";
    this.setData({ botanicalFrame: value }, () => this.scheduleTextureEffectPreview("vintage-botanical", `botanicalFrame:${value}`));
  },

  scheduleTextureEffectPreview(texture, setting = "") {
    if (this.data.effectAdjusting !== texture) return;
    clearTimeout(this.effectAdjustmentTimer);
    const token = (this.effectAdjustmentToken || 0) + 1;
    this.effectAdjustmentToken = token;
    this.effectAdjustmentTimer = setTimeout(() => {
      if (this.effectAdjustmentToken !== token) return;
      if (this.data.effectAdjusting !== texture) return;
      if (this.data.textureEffectBusy) {
        this.scheduleTextureEffectPreview(texture, setting);
        return;
      }
      this.selectTextureEffect({ currentTarget: { dataset: { texture, force: true, setting } } });
    }, 260);
  },

  getImageEffectTargetLayer() {
    const selected = this.getSelectedLayer();
    if (selected && selected.type === "image" && selected.source) return selected;
    const layers = (this.draft && this.draft.layers ? this.draft.layers : []).slice().reverse();
    return layers.find((layer) => layer && layer.type === "image" && layer.source) || null;
  },

  applyImageEffect() {
    if (this.data.imageEffectType === "botanical") {
      this.applyBotanicalPlateEffect();
      return;
    }
    if (this.data.imageEffectType === "matisse") {
      this.applyMatisseCutoutEffect();
      return;
    }
    this.applyCrossStitchEffect();
  },

  async applyGeneratedImageEffect(config) {
    if (this.data.imageEffectBusy) return;
    const layer = this.getImageEffectTargetLayer();
    if (!layer || !layer.source) {
      showToast("请先选择图片图层", { icon: "none" });
      return;
    }
    this.setData({ imageEffectBusy: true, saveStatus: config.busyText || "效果生成中..." });
    try {
      const previousSource = layer.source;
      const result = await config.create(layer);
      layer.source = result.path;
      layer.sourceWidth = result.width;
      layer.sourceHeight = result.height;
      applyGeneratedLayerGeometry(layer, result);
      layer.crop = null;
      layer.effect = config.effect;
      delete this.canvasImageCache[previousSource];
      this.setData({
        imageEffectEditing: false,
        imageEffectBusy: false,
        selectedLayerId: layer.id,
        selectedLayerType: layer.type
      });
      this.markDirty();
      this.render();
      showSuccess(config.successText || "效果已生成");
    } catch (error) {
      console.warn("[image-effect] failed", config.effect && config.effect.type, error);
      this.setData({ imageEffectBusy: false, saveStatus: config.failStatus || "效果生成失败" });
      this.render();
      showError(config.errorText || "效果生成失败");
    }
  },

  async applyCrossStitchEffect() {
    return this.applyGeneratedImageEffect({
      busyText: "十字绣生成中...",
      successText: "十字绣已生成",
      failStatus: "十字绣生成失败",
      errorText: "十字绣生成失败",
      effect: {
        type: "pixel-cross-stitch",
        grid: this.data.crossStitchGrid,
        colors: this.data.crossStitchColors,
        style: this.data.crossStitchStyle,
        createdAt: Date.now()
      },
      create: (layer) => this.createCrossStitchImage(layer, {
        grid: this.data.crossStitchGrid,
        colors: this.data.crossStitchColors,
        style: this.data.crossStitchStyle
      })
    });
  },

  async applyMatisseCutoutEffect() {
    return this.applyGeneratedImageEffect({
      busyText: "剪贴生成中...",
      successText: "剪贴已生成",
      failStatus: "剪贴生成失败",
      errorText: "剪贴生成失败",
      effect: {
        type: "matisse-cutout",
        detail: this.data.matisseDetail,
        palette: this.data.matissePalette,
        createdAt: Date.now()
      },
      create: (layer) => this.createMatisseCutoutImage(layer, {
        detail: this.data.matisseDetail,
        palette: this.data.matissePalette
      })
    });
  },

  async applyBotanicalPlateEffect() {
    return this.applyGeneratedImageEffect({
      busyText: "图鉴生成中...",
      successText: "图鉴已生成",
      failStatus: "图鉴生成失败",
      errorText: "图鉴生成失败",
      effect: {
        type: "vintage-botanical",
        tone: this.data.botanicalTone,
        detail: this.data.botanicalDetail,
        frame: this.data.botanicalFrame,
        createdAt: Date.now()
      },
      create: (layer) => this.createBotanicalPlateImage(layer, {
        tone: this.data.botanicalTone,
        detail: this.data.botanicalDetail,
        frame: this.data.botanicalFrame
      })
    });
  },

  async createCrossStitchImage(layer, options) {
    await this.ensureCanvasContext();
    if (!this.canvasNode || !this.ctx) throw new Error("canvas_not_ready");
    const image = await this.loadCanvasImage(layer.source);
    if (!image) throw new Error("image_not_ready");
    const sourceWidth = Math.max(1, layer.sourceWidth || image.width || Math.round(layer.width));
    const sourceHeight = Math.max(1, layer.sourceHeight || image.height || Math.round(layer.height));
    const crop = normalizeSourceCrop(layer.crop, sourceWidth, sourceHeight);
    const aspect = crop.width / Math.max(1, crop.height);
    const longGrid = Math.max(24, Math.min(140, Number(options.grid) || 72));
    const cols = aspect >= 1 ? longGrid : Math.max(1, Math.round(longGrid * aspect));
    const rows = aspect >= 1 ? Math.max(1, Math.round(longGrid / aspect)) : longGrid;

    this.configureCanvasBitmapSize(cols, rows);
    this.ctx.clearRect(0, 0, cols, rows);
    this.ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, cols, rows);
    const imageData = this.ctx.getImageData(0, 0, cols, rows);
    const cells = readCrossStitchCells(imageData.data);
    const palette = createQuantizedPalette(cells, Number(options.colors) || 8);
    const mappedCells = mapCellsToPalette(cells, palette);
    const cellSize = Math.max(8, Math.min(CROSS_STITCH_OUTPUT_CELL, Math.floor(CROSS_STITCH_MAX_OUTPUT_SIZE / Math.max(cols, rows))));
    const outputWidth = cols * cellSize;
    const outputHeight = rows * cellSize;

    this.configureCanvasBitmapSize(outputWidth, outputHeight);
    drawCrossStitchOutput(this.ctx, mappedCells, cols, rows, cellSize, options.style || "stitch");

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve({ path: res.tempFilePath, width: outputWidth, height: outputHeight }),
        fail: reject
      }, this);
    });
  },

  async createMatisseCutoutImage(layer, options) {
    await this.ensureCanvasContext();
    if (!this.canvasNode || !this.ctx) throw new Error("canvas_not_ready");
    const image = await this.loadCanvasImage(layer.source);
    if (!image) throw new Error("image_not_ready");
    const sourceWidth = Math.max(1, layer.sourceWidth || image.width || Math.round(layer.width));
    const sourceHeight = Math.max(1, layer.sourceHeight || image.height || Math.round(layer.height));
    const crop = normalizeSourceCrop(layer.crop, sourceWidth, sourceHeight);
    const detail = Math.max(36, Math.min(104, Number(options.detail) || 64));
    const maxOutputSize = detail >= 86 ? 1500 : detail <= 44 ? 980 : 1240;
    const aspect = crop.width / Math.max(1, crop.height);
    const workLongEdge = Math.round(detail * 2);
    const workWidth = aspect >= 1 ? workLongEdge : Math.max(1, Math.round(workLongEdge * aspect));
    const workHeight = aspect >= 1 ? Math.max(1, Math.round(workLongEdge / aspect)) : workLongEdge;
    const cellSize = Math.max(5, Math.floor(maxOutputSize / Math.max(workWidth, workHeight)));
    const outputWidth = workWidth * cellSize;
    const outputHeight = workHeight * cellSize;

    this.configureCanvasBitmapSize(workWidth, workHeight);
    this.ctx.clearRect(0, 0, workWidth, workHeight);
    this.ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, workWidth, workHeight);
    const imageData = this.ctx.getImageData(0, 0, workWidth, workHeight);
    const result = createContinuousMatisseImageData(imageData, getMatissePalette(options.palette), options.palette || "vivid", detail);

    this.configureCanvasBitmapSize(outputWidth, outputHeight);
    this.ctx.clearRect(0, 0, outputWidth, outputHeight);
    drawContinuousMatisseOutput(this.ctx, result.indexes, result.palette, workWidth, workHeight, cellSize, options.palette || "vivid");
    drawCutoutPaperTexture(this.ctx, outputWidth, outputHeight, 0.08);

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve({ path: res.tempFilePath, width: outputWidth, height: outputHeight }),
        fail: reject
      }, this);
    });
  },

  async createBotanicalPlateImage(layer, options) {
    await this.ensureCanvasContext();
    if (!this.canvasNode || !this.ctx) throw new Error("canvas_not_ready");
    const image = await this.loadCanvasImage(layer.source);
    if (!image) throw new Error("image_not_ready");
    const sourceWidth = Math.max(1, layer.sourceWidth || image.width || Math.round(layer.width));
    const sourceHeight = Math.max(1, layer.sourceHeight || image.height || Math.round(layer.height));
    const crop = normalizeSourceCrop(layer.crop, sourceWidth, sourceHeight);
    const maxOutputSize = options.detail === "etched" ? 1500 : options.detail === "soft" ? 1050 : 1240;
    const scale = maxOutputSize / Math.max(crop.width, crop.height);
    const outputWidth = Math.max(1, Math.round(crop.width * scale));
    const outputHeight = Math.max(1, Math.round(crop.height * scale));

    this.configureCanvasBitmapSize(outputWidth, outputHeight);
    this.ctx.clearRect(0, 0, outputWidth, outputHeight);
    this.ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);
    const imageData = this.ctx.getImageData(0, 0, outputWidth, outputHeight);
    const result = createBotanicalImageData(imageData, options.tone || "blueprint", options.detail || "medium");
    this.ctx.putImageData(result, 0, 0);
    if ((options.frame || "on") !== "off") {
      drawBotanicalPlateOverlay(this.ctx, outputWidth, outputHeight, options.tone || "blueprint");
    } else {
      drawBotanicalPaperMarks(this.ctx, outputWidth, outputHeight, getBotanicalTone(options.tone || "blueprint"));
    }

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve({ path: res.tempFilePath, width: outputWidth, height: outputHeight }),
        fail: reject
      }, this);
    });
  },

  async removeSelectedImageBackground() {
    if (this.data.backgroundRemoving) return;
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "image" || !layer.source) return;
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    this.setData({
      backgroundRemoving: true,
      saveStatus: "主体剪中..."
    });
    try {
      if (!isRemoteImageSource(layer.source)) {
        const sourceInfo = await getFileInfoAsync(layer.source);
        if (Number(sourceInfo.size || 0) > REMBG_SOURCE_MAX_BYTES) {
          throw new Error("rembg_source_too_large");
        }
      }
      const uploadPath = await this.createBackgroundRemovalUploadImage(layer);
      const resultPath = await removeImageBackground({ filePath: uploadPath });
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
        : error && error.message === "rembg_source_too_large"
          ? "主体剪支持 20MB 以内的原图"
        : error && error.message === "rembg_upload_too_large"
          ? "图片细节过多，请先裁剪后再试"
          : "主体剪失败，请稍后重试";
      this.setData({ saveStatus: "主体剪失败" });
      showError(message);
    } finally {
      this.setData({ backgroundRemoving: false });
    }
  },

  async createBlueprintPrintImage(layer, options = {}) {
    await this.ensureCanvasContext();
    if (!this.canvasNode || !this.ctx) throw new Error("canvas_not_ready");
    const image = await this.loadCanvasImage(layer.source);
    if (!image) throw new Error("image_not_ready");
    const sourceWidth = Math.max(1, layer.sourceWidth || image.width || Math.round(layer.width));
    const sourceHeight = Math.max(1, layer.sourceHeight || image.height || Math.round(layer.height));
    const crop = normalizeSourceCrop(layer.crop, sourceWidth, sourceHeight);
    const maxOutputSize = 1280;
    const scale = Math.min(1, maxOutputSize / Math.max(crop.width, crop.height));
    const outputWidth = Math.max(1, Math.round(crop.width * scale));
    const outputHeight = Math.max(1, Math.round(crop.height * scale));

    this.configureCanvasBitmapSize(outputWidth, outputHeight);
    this.ctx.clearRect(0, 0, outputWidth, outputHeight);
    this.ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);
    const imageData = this.ctx.getImageData(0, 0, outputWidth, outputHeight);
    this.ctx.putImageData(createBlueprintPrintImageData(imageData, options), 0, 0);
    drawBlueprintPrintOverlay(this.ctx, outputWidth, outputHeight, options);

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve({ path: res.tempFilePath, width: outputWidth, height: outputHeight }),
        fail: reject
      }, this);
    });
  },

  async createScreenPrintImage(layer, options = {}) {
    await this.ensureCanvasContext();
    if (!this.canvasNode || !this.ctx) throw new Error("canvas_not_ready");
    const image = await this.loadCanvasImage(layer.source);
    if (!image) throw new Error("image_not_ready");
    const sourceWidth = Math.max(1, layer.sourceWidth || image.width || Math.round(layer.width));
    const sourceHeight = Math.max(1, layer.sourceHeight || image.height || Math.round(layer.height));
    const crop = normalizeSourceCrop(layer.crop, sourceWidth, sourceHeight);
    const maxOutputSize = 1280;
    const scale = Math.min(1, maxOutputSize / Math.max(crop.width, crop.height));
    const outputWidth = Math.max(1, Math.round(crop.width * scale));
    const outputHeight = Math.max(1, Math.round(crop.height * scale));

    this.configureCanvasBitmapSize(outputWidth, outputHeight);
    this.ctx.clearRect(0, 0, outputWidth, outputHeight);
    this.ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);
    const imageData = this.ctx.getImageData(0, 0, outputWidth, outputHeight);
    this.ctx.putImageData(createScreenPrintImageData(imageData, options), 0, 0);
    drawScreenPrintOverlay(this.ctx, outputWidth, outputHeight, options);

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve({ path: res.tempFilePath, width: outputWidth, height: outputHeight }),
        fail: reject
      }, this);
    });
  },

  async createRisoPrintImage(layer, options = {}) {
    await this.ensureCanvasContext();
    if (!this.canvasNode || !this.ctx) throw new Error("canvas_not_ready");
    const image = await this.loadCanvasImage(layer.source);
    if (!image) throw new Error("image_not_ready");
    const sourceWidth = Math.max(1, layer.sourceWidth || image.width || Math.round(layer.width));
    const sourceHeight = Math.max(1, layer.sourceHeight || image.height || Math.round(layer.height));
    const crop = normalizeSourceCrop(layer.crop, sourceWidth, sourceHeight);
    const maxOutputSize = 1280;
    const scale = Math.min(1, maxOutputSize / Math.max(crop.width, crop.height));
    const outputWidth = Math.max(1, Math.round(crop.width * scale));
    const outputHeight = Math.max(1, Math.round(crop.height * scale));

    this.configureCanvasBitmapSize(outputWidth, outputHeight);
    this.ctx.clearRect(0, 0, outputWidth, outputHeight);
    this.ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);
    const imageData = this.ctx.getImageData(0, 0, outputWidth, outputHeight);
    this.ctx.putImageData(createRisoPrintImageData(imageData, options), 0, 0);
    drawRisoPrintOverlay(this.ctx, outputWidth, outputHeight, options);

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve({ path: res.tempFilePath, width: outputWidth, height: outputHeight }),
        fail: reject
      }, this);
    });
  },

  async createKpopCardImage(layer, options = {}) {
    await this.ensureCanvasContext();
    if (!this.canvasNode || !this.ctx) throw new Error("canvas_not_ready");
    const image = await this.loadCanvasImage(layer.source);
    if (!image) throw new Error("image_not_ready");
    const holoTexture = await this.loadCanvasImage(KPOP_HOLO_FOIL_TEXTURE);
    const sourceWidth = Math.max(1, layer.sourceWidth || image.width || Math.round(layer.width));
    const sourceHeight = Math.max(1, layer.sourceHeight || image.height || Math.round(layer.height));
    const crop = normalizeSourceCrop(layer.crop, sourceWidth, sourceHeight);
    const outputWidth = 900;
    const outputHeight = 1350;
    const margin = 86;
    const radius = 64;
    const photoRadius = 40;
    const photoX = margin;
    const photoY = margin;
    const photoWidth = outputWidth - margin * 2;
    const photoHeight = outputHeight - margin * 2;
    const coverScale = Math.max(photoWidth / crop.width, photoHeight / crop.height);
    const drawWidth = crop.width * coverScale;
    const drawHeight = crop.height * coverScale;
    const drawX = photoX + (photoWidth - drawWidth) / 2;
    const drawY = photoY + (photoHeight - drawHeight) / 2;

    this.configureCanvasBitmapSize(outputWidth, outputHeight);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, outputWidth, outputHeight);
    drawKpopCardPhysicalShadow(ctx, outputWidth, outputHeight, radius);
    const bg = ctx.createLinearGradient(0, 0, outputWidth, outputHeight);
    bg.addColorStop(0, "#fff4fb");
    bg.addColorStop(0.48, "#edf4ff");
    bg.addColorStop(1, "#fff8d8");
    ctx.fillStyle = bg;
    drawRoundedMaskPath(ctx, 0, 0, outputWidth, outputHeight, radius);
    ctx.fill();

    ctx.save();
    drawRoundedMaskPath(ctx, photoX, photoY, photoWidth, photoHeight, photoRadius);
    ctx.clip();
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, drawX, drawY, drawWidth, drawHeight);
    applyKpopCardTone(ctx, photoX, photoY, photoWidth, photoHeight);
    ctx.restore();

    drawKpopHolographicBorder(ctx, outputWidth, outputHeight, radius, holoTexture);
    drawKpopLaminateTexture(ctx, outputWidth, outputHeight, radius);
    drawKpopCardGloss(ctx, outputWidth, outputHeight, radius);
    drawKpopCardDecor(ctx, photoX, photoY, photoWidth, photoHeight, photoRadius, options.text || "subtle");
    drawKpopCardEdgeDepth(ctx, outputWidth, outputHeight, radius);

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvasNode,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        fileType: "png",
        success: (res) => resolve({ path: res.tempFilePath, width: outputWidth, height: outputHeight, resizeLayer: true }),
        fail: reject
      }, this);
    });
  },

  async createBackgroundRemovalUploadImage(layer) {
    await this.ensureCanvasContext();
    const image = await this.loadCanvasImage(layer.source);
    if (!image) throw new Error("image_not_ready");
    const sourceWidth = Math.max(1, Math.round(layer.sourceWidth || image.width || layer.width));
    const sourceHeight = Math.max(1, Math.round(layer.sourceHeight || image.height || layer.height));
    const scale = Math.min(1, REMBG_UPLOAD_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    this.configureCanvasBitmapSize(width, height);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);

    try {
      for (const quality of REMBG_UPLOAD_QUALITIES) {
        const tempFilePath = await canvasToTempFilePathAsync(this.canvasNode, width, height, quality, this);
        const fileInfo = await getFileInfoAsync(tempFilePath);
        if (Number(fileInfo.size || 0) <= REMBG_UPLOAD_MAX_BYTES) {
          return tempFilePath;
        }
      }
      throw new Error("rembg_upload_too_large");
    } finally {
      this.configureCanvasBitmap();
      this.render();
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
      y: layer.y + 36,
      locked: false
    };
    this.draft.layers.splice(index + 1, 0, copy);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.setData({ selectedLayerId: copy.id, selectedLayerType: copy.type, selectedLayerLocked: false, selectedLayerLockStyle: "" });
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
    this.setData({ selectedLayerId: "", selectedLayerType: "", selectedLayerLocked: false, selectedLayerLockStyle: "" });
    this.markDirty();
    this.render();
  },

  clearSelection() {
    const closesEffectEditor = this.data.activePalette === "effect";
    this.setData({
      ...(closesEffectEditor ? this.getEffectEditorLayoutResetPatch(true) : {}),
      selectedLayerId: "",
      selectedLayerType: "",
      selectedLayerLocked: false,
      selectedLayerLockStyle: "",
      ...(closesEffectEditor ? { activeTool: "", activePalette: "", activeDrawer: "", effectAdjusting: "", effectAdjustingLabel: "" } : {})
    }, () => {
      if (closesEffectEditor) {
        this.restoreDefaultCanvasAfterEffectEditor();
      } else {
        this.render();
      }
    });
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
        track("draft_manual_save", {
          page: "create",
          ...getDraftAnalyticsParams(this.draft)
        });
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
    track("export_start", {
      page: "create",
      pendingContentChecks: hasPendingContentChecks(this),
      ...getDraftAnalyticsParams(this.draft)
    });
    const pendingChecks = hasPendingContentChecks(this);
    if (pendingChecks) {
      showToast("作品导出中");
    }
    this.setData({ exporting: true, selectedLayerId: "" });
    const restoreEditorCanvas = () => {
      this.setData({ exporting: false });
      this.render();
    };
    waitForPendingContentChecks(this)
      .then((canExport) => {
        if (!canExport) throw new Error("content_removed");
        return checkDraftTextContent(this);
      })
      .then(() => {
        return this.exportCanvasFile(EXPORT_HIGH_PIXEL_RATIO);
      })
      .catch((error) => {
        if (error && error.message === "content_removed") throw error;
        console.warn("[export] high resolution export failed, retry fallback", error);
        return this.exportCanvasFile(EXPORT_FALLBACK_PIXEL_RATIO);
      })
      .then((filePath) => this.saveExportedImage(filePath).catch((error) => {
        const wrapped = new Error("save_album_failed");
        wrapped.cause = error;
        throw wrapped;
      }))
      .then(() => {
        showSuccess("已保存到相册");
        track("export_save_album_success", {
          page: "create",
          ...getDraftAnalyticsParams(this.draft)
        });
        restoreEditorCanvas();
      })
      .catch((error) => {
        if (error && ["content_removed", "text_removed"].includes(error.message)) {
          restoreEditorCanvas();
          return;
        }
        console.warn("[export] failed", error, error && error.detail || error && error.cause || "");
        track("export_fail", {
          page: "create",
          errorCode: error && error.message || "unknown",
          ...getDraftAnalyticsParams(this.draft)
        });
        showModal("保存失败", getExportErrorMessage(error), { showCancel: false });
        restoreEditorCanvas();
      });
  }
});

function getDraftAnalyticsParams(draft) {
  const layers = draft && Array.isArray(draft.layers) ? draft.layers : [];
  return {
    draftId: draft && draft.id || "",
    ratio: draft && draft.ratio || "",
    layerCount: layers.length,
    imageLayerCount: layers.filter((layer) => layer && layer.type === "image").length,
    assetLayerCount: layers.filter((layer) => layer && ["sticker", "paper", "tape"].includes(layer.type)).length,
    textLayerCount: layers.filter((layer) => layer && layer.type === "text").length
  };
}

function getExportErrorMessage(error) {
  if (!error) return "导出失败，请稍后重试。";
  if (error.message === "save_album_failed") return "请确认已允许保存到相册后重试。";
  if (["media_too_large", "media_risky", "media_upload_failed", "content_check_failed", "cloud_unavailable"].includes(error.message)) {
    return getContentSecurityErrorMessage(error);
  }
  if (["text_risky", "text_check_failed"].includes(error.message)) return getTextSecurityErrorMessage(error);
  return "导出失败，请稍后重试。";
}

function enableShareMenu() {
  if (!wx.showShareMenu) return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ["shareAppMessage", "shareTimeline"]
  });
}

function getContentSecurityErrorMessage(error) {
  if (error && error.message === "media_too_large") return "图片需小于 10MB";
  if (error && error.message === "media_risky") return "图片内容未通过安全检测";
  if (error && error.message === "media_upload_failed") return "图片上传检测失败，请稍后重试";
  if (error && error.message === "content_check_failed") return "作品检测失败，请稍后重试";
  if (error && error.message === "cloud_unavailable") return "检测服务暂时不可用，请稍后重试";
  return "图片安全检测失败";
}

function getTextSecurityErrorMessage(error) {
  if (error && error.message === "text_risky") return "这段文字暂时无法使用";
  if (error && error.message === "text_check_failed") return "文字处理失败，请稍后重试";
  if (error && error.message === "cloud_unavailable") return "检测服务暂时不可用，请稍后重试";
  return "文字处理失败，请稍后重试";
}

function isCuttableSourceLayer(layer) {
  return !!(layer && layer.source && CUTTABLE_SOURCE_LAYER_TYPES.includes(layer.type));
}

function applyGeneratedLayerGeometry(layer, result) {
  if (!layer || !result || !result.resizeLayer || !result.width || !result.height) return layer;
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const longSide = Math.max(layer.width || result.width, layer.height || result.height);
  const ratio = result.width / Math.max(1, result.height);
  const nextWidth = longSide * ratio;
  const nextHeight = longSide;
  layer.x = centerX - nextWidth / 2;
  layer.y = centerY - nextHeight / 2;
  layer.width = nextWidth;
  layer.height = nextHeight;
  return layer;
}

function checkDraftTextContent(page) {
  const textLayers = (page && page.draft && Array.isArray(page.draft.layers) ? page.draft.layers : [])
    .filter((layer) => layer && layer.type === "text" && String(layer.text || layer.content || "").trim());
  return textLayers.reduce((promise, layer) => promise.then(() => (
    checkTextContent(layer.text || layer.content || "").catch((error) => {
      console.warn("[content-security] export text check failed", error);
      if (error && error.message === "text_risky") {
        const removed = removeTextLayer(page, layer.id);
        if (removed) showError("作品中有违规文字已移除，请重试");
        throw new Error("text_removed");
      }
      throw error;
    })
  )), Promise.resolve());
}

function hasPendingContentChecks(page) {
  return !!(page && page.pendingContentCheckPromises && page.pendingContentCheckPromises.size);
}

function waitForPendingContentChecks(page) {
  if (!hasPendingContentChecks(page)) return Promise.resolve(true);
  return Promise.all(Array.from(page.pendingContentCheckPromises.values()))
    .then((results) => results.every(Boolean));
}

function checkImportedImageContent(page, filePath, size, layerId) {
  if (!page.pendingContentCheckPromises) {
    page.pendingContentCheckPromises = new Map();
  }
  const checkPromise = checkImageContent(filePath, { size })
    .then((checkResult) => {
      console.info("[content-security] mediaCheckAsync submitted", checkResult.traceId);
      return true;
    })
    .catch((error) => {
      console.warn("[content-security] imported image check failed", error);
      if (!error || error.message !== "media_risky") return true;
      const removed = removeImportedImageLayer(page, layerId);
      if (removed) showError("作品中有违规图片已移除，请重试");
      return false;
    })
    .finally(() => {
      if (page.pendingContentCheckPromises) {
        page.pendingContentCheckPromises.delete(layerId);
      }
    });
  page.pendingContentCheckPromises.set(layerId, checkPromise);
  return checkPromise;
}

function removeImportedImageLayer(page, layerId) {
  if (!page || !page.draft || !layerId) return false;
  const beforeCount = page.draft.layers.length;
  page.draft.layers = page.draft.layers.filter((layer) => layer.id !== layerId);
  if (page.draft.layers.length === beforeCount) return false;
  page.draft.layers = normalizeLayerOrder(page.draft.layers);
  if (page.data.selectedLayerId === layerId) {
    page.setData({ selectedLayerId: "", selectedLayerType: "" });
  }
  page.markDirty();
  page.render();
  return true;
}

function removeTextLayer(page, layerId) {
  if (!page || !page.draft || !layerId) return false;
  const beforeCount = page.draft.layers.length;
  page.draft.layers = page.draft.layers.filter((layer) => layer.id !== layerId);
  if (page.draft.layers.length === beforeCount) return false;
  page.draft.layers = normalizeLayerOrder(page.draft.layers);
  if (page.data.selectedLayerId === layerId) {
    page.setData({ selectedLayerId: "", selectedLayerType: "" });
  }
  page.markDirty();
  page.render();
  return true;
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function angle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

function getExportPixelSize(draft, pixelRatio) {
  const ratio = Math.max(1, Number(pixelRatio) || 1);
  return {
    width: Math.max(1, Math.round((draft && draft.width ? draft.width : 1) * ratio)),
    height: Math.max(1, Math.round((draft && draft.height ? draft.height : 1) * ratio)),
    pixelRatio: ratio
  };
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

function getFileInfoAsync(filePath) {
  return new Promise((resolve, reject) => {
    const fileSystemManager = wx.getFileSystemManager && wx.getFileSystemManager();
    const getFileInfo = fileSystemManager && fileSystemManager.getFileInfo
      ? fileSystemManager.getFileInfo.bind(fileSystemManager)
      : wx.getFileInfo;
    getFileInfo({
      filePath,
      success: resolve,
      fail: reject
    });
  });
}

function canvasToTempFilePathAsync(canvas, width, height, quality, component) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: "jpg",
      quality,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    }, component);
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

function getLayerVisibleLocalBounds(layer) {
  const fullBounds = { x: 0, y: 0, width: layer.width, height: layer.height };
  const polygons = getLayerClipPolygonsForNextCut(layer);
  if (!polygons.length) return fullBounds;
  const bounds = polygons.map(getPolygonBounds).reduce((result, item) => ({
    minX: Math.max(result.minX, item.minX),
    minY: Math.max(result.minY, item.minY),
    maxX: Math.min(result.maxX, item.maxX),
    maxY: Math.min(result.maxY, item.maxY)
  }), {
    minX: 0,
    minY: 0,
    maxX: layer.width,
    maxY: layer.height
  });
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    return fullBounds;
  }
  const x = clamp(Math.floor(bounds.minX), 0, layer.width);
  const y = clamp(Math.floor(bounds.minY), 0, layer.height);
  const maxX = clamp(Math.ceil(bounds.maxX), x + 1, layer.width);
  const maxY = clamp(Math.ceil(bounds.maxY), y + 1, layer.height);
  return {
    x,
    y,
    width: Math.max(1, maxX - x),
    height: Math.max(1, maxY - y)
  };
}

function getLayerClipPolygonsForNextCut(layer) {
  const polygons = [];
  if (Array.isArray(layer.clipPolygons)) {
    layer.clipPolygons.forEach((polygon) => {
      if (Array.isArray(polygon) && polygon.length >= 3) polygons.push(cloneClipPolygon(polygon));
    });
  }
  if (Array.isArray(layer.clipPolygon) && layer.clipPolygon.length >= 3) {
    polygons.push(cloneClipPolygon(layer.clipPolygon));
  }
  return polygons;
}

function getLayerCurrentClipShape(layer) {
  if (!layer) return "";
  const style = layer.style || {};
  return normalizeOptionalEmbossShape(layer.clipShape || layer.maskShape || style.clipShape || style.maskShape || style.shape || "");
}

function getLayerScreenBounds(layer, canvasRect, scale) {
  const width = Math.max(1, layer.width || 1);
  const height = Math.max(1, layer.height || 1);
  const rotation = (layer.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const centerX = canvasRect.left + (layer.x + width / 2) * scale;
  const centerY = canvasRect.top + (layer.y + height / 2) * scale;
  const halfWidth = width * scale / 2;
  const halfHeight = height * scale / 2;
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight }
  ].map((point) => ({
    x: centerX + point.x * cos - point.y * sin,
    y: centerY + point.x * sin + point.y * cos
  }));
  return corners.reduce((bounds, point) => ({
    left: Math.min(bounds.left, point.x),
    right: Math.max(bounds.right, point.x),
    top: Math.min(bounds.top, point.y),
    bottom: Math.max(bounds.bottom, point.y)
  }), {
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY
  });
}

function getLayerLockControlStyle(layer, options) {
  const scale = options.scale || 1;
  const canvasWidth = Math.max(1, options.canvasWidth || 1);
  const canvasHeight = Math.max(1, options.canvasHeight || 1);
  const bounds = getLayerScreenBounds(layer, { left: 0, top: 0 }, scale);
  const inset = 14;
  const offset = 10;
  const left = clamp(Math.round(bounds.right + offset), inset, canvasWidth - inset);
  const top = clamp(Math.round(bounds.top - offset), inset, canvasHeight - inset);
  return `left:${left}px;top:${top}px;`;
}

function getDefaultEmbossMask(layer, shape) {
  let width = Math.max(EMBOSS_MIN_SIZE, layer.width * 0.72);
  let height = Math.max(EMBOSS_MIN_SIZE, layer.height * 0.72);
  if (shape === "circle") {
    const size = Math.max(EMBOSS_MIN_SIZE, Math.min(layer.width, layer.height) * 0.72);
    width = size;
    height = size;
  }
  return {
    x: (layer.width - width) / 2,
    y: (layer.height - height) / 2,
    width,
    height
  };
}

function getPolygonBounds(polygon) {
  return polygon.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    minY: Math.min(result.minY, point.y),
    maxX: Math.max(result.maxX, point.x),
    maxY: Math.max(result.maxY, point.y)
  }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
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

function splitRectByWave(width, height, start, end) {
  const path = createWavePathPoints(width, height, start, end);
  if (path.length < 2) return null;
  const normal = lineNormal(start, end);
  const offset = Math.hypot(width, height) * 2;
  const firstSide = [
    ...path,
    ...path.slice().reverse().map((point) => ({
      x: point.x + normal.x * offset,
      y: point.y + normal.y * offset
    }))
  ];
  const secondSide = [
    ...path.slice().reverse(),
    ...path.map((point) => ({
      x: point.x - normal.x * offset,
      y: point.y - normal.y * offset
    }))
  ];
  const first = clipPolygonToRect(firstSide, width, height);
  const second = clipPolygonToRect(secondSide, width, height);
  if (first.length < 3 || second.length < 3) return null;
  if (polygonArea(first) < 1 || polygonArea(second) < 1) return null;
  return [dedupePolygonPoints(first), dedupePolygonPoints(second)];
}

function createWavePathPoints(width, height, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 8) return [];
  const unit = { x: dx / length, y: dy / length };
  const normal = { x: -unit.y, y: unit.x };
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];
  const projections = corners.map((point) => ({
    s: (point.x - start.x) * unit.x + (point.y - start.y) * unit.y
  }));
  const padding = Math.max(width, height, WAVE_CUT_WAVELENGTH);
  const minS = Math.min(...projections.map((item) => item.s)) - padding;
  const maxS = Math.max(...projections.map((item) => item.s)) + padding;
  const amplitude = Math.min(WAVE_CUT_AMPLITUDE, Math.max(10, Math.min(width, height) * 0.08));
  const wavelength = Math.max(36, Math.min(WAVE_CUT_WAVELENGTH, Math.max(36, length * 0.55)));
  const step = Math.max(4, Math.min(WAVE_CUT_POINT_STEP, wavelength / 6));
  const points = [];
  for (let s = minS; s <= maxS; s += step) {
    const wave = Math.sin(s / wavelength * Math.PI * 2) * amplitude;
    points.push({
      x: start.x + unit.x * s + normal.x * wave,
      y: start.y + unit.y * s + normal.y * wave
    });
  }
  const wave = Math.sin(maxS / wavelength * Math.PI * 2) * amplitude;
  points.push({
    x: start.x + unit.x * maxS + normal.x * wave,
    y: start.y + unit.y * maxS + normal.y * wave
  });
  return points;
}

function clipPolygonToRect(points, width, height) {
  return [
    { inside: (point) => point.x >= 0, intersect: (a, b) => intersectAtX(a, b, 0) },
    { inside: (point) => point.x <= width, intersect: (a, b) => intersectAtX(a, b, width) },
    { inside: (point) => point.y >= 0, intersect: (a, b) => intersectAtY(a, b, 0) },
    { inside: (point) => point.y <= height, intersect: (a, b) => intersectAtY(a, b, height) }
  ].reduce((polygon, edge) => clipPolygonByEdge(polygon, edge), points);
}

function clipPolygonByEdge(points, edge) {
  if (!points.length) return [];
  const output = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = edge.inside(current);
    const previousInside = edge.inside(previous);
    if (currentInside) {
      if (!previousInside) output.push(edge.intersect(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(edge.intersect(previous, current));
    }
  }
  return output.filter(Boolean);
}

function intersectAtX(a, b, x) {
  const dx = b.x - a.x;
  if (Math.abs(dx) < 0.001) return { x, y: a.y };
  const t = (x - a.x) / dx;
  return { x, y: a.y + (b.y - a.y) * t };
}

function intersectAtY(a, b, y) {
  const dy = b.y - a.y;
  if (Math.abs(dy) < 0.001) return { x: a.x, y };
  const t = (y - a.y) / dy;
  return { x: a.x + (b.x - a.x) * t, y };
}

function dedupePolygonPoints(points) {
  const result = [];
  points.forEach((point) => {
    const last = result[result.length - 1];
    if (!last || distance(last, point) > 0.5) {
      result.push({
        x: Math.round(point.x * 100) / 100,
        y: Math.round(point.y * 100) / 100
      });
    }
  });
  if (result.length > 1 && distance(result[0], result[result.length - 1]) <= 0.5) {
    result.pop();
  }
  return result;
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

function cloneClipPolygon(points) {
  return Array.isArray(points) && points.length >= 3
    ? points.map((point) => ({ x: point.x, y: point.y }))
    : null;
}

function cloneClipPolygons(polygons) {
  if (!Array.isArray(polygons)) return null;
  const cloned = polygons
    .map((polygon) => cloneClipPolygon(polygon))
    .filter(Boolean);
  return cloned.length ? cloned : null;
}

function scaleClipPolygon(points, scaleX, scaleY) {
  return points.map((point) => ({
    x: point.x * scaleX,
    y: point.y * scaleY
  }));
}

function scaleClipPolygons(polygons, scaleX, scaleY) {
  return polygons.map((polygon) => scaleClipPolygon(polygon, scaleX, scaleY));
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

function applyPolygonAlphaMask(ctx, width, height, polygon, outputScale, localBounds = { x: 0, y: 0 }) {
  if (!ctx || !width || !height || !Array.isArray(polygon) || polygon.length < 3) return;
  clipPolygonMaskPath(ctx, polygon, outputScale, localBounds);
  ctx.globalCompositeOperation = "destination-in";
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function clipPolygonMaskPath(ctx, polygon, outputScale, localBounds = { x: 0, y: 0 }) {
  const offsetX = localBounds.x || 0;
  const offsetY = localBounds.y || 0;
  const shiftedPolygon = offsetX || offsetY
    ? polygon.map((point) => ({ x: point.x - offsetX, y: point.y - offsetY }))
    : polygon;
  drawClipPolygonMaskPath(ctx, shiftedPolygon, outputScale);
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
  const left = handle.indexOf("l") >= 0 ? origin.x + dx : origin.x;
  const right = handle.indexOf("r") >= 0 ? origin.x + origin.width + dx : origin.x + origin.width;
  const top = handle.indexOf("t") >= 0 ? origin.y + dy : origin.y;
  const bottom = handle.indexOf("b") >= 0 ? origin.y + origin.height + dy : origin.y + origin.height;
  const next = {
    x: Math.min(left, right - EMBOSS_MIN_SIZE),
    y: Math.min(top, bottom - EMBOSS_MIN_SIZE),
    width: Math.max(EMBOSS_MIN_SIZE, Math.abs(right - left)),
    height: Math.max(EMBOSS_MIN_SIZE, Math.abs(bottom - top))
  };
  return clampEmbossMask(next, layer);
}

function clampEmbossMask(mask, layer) {
  const width = Math.min(layer.width, Math.max(EMBOSS_MIN_SIZE, mask.width));
  const height = Math.min(layer.height, Math.max(EMBOSS_MIN_SIZE, mask.height));
  return {
    x: Math.min(layer.width - width, Math.max(0, mask.x)),
    y: Math.min(layer.height - height, Math.max(0, mask.y)),
    width,
    height
  };
}

function getPointSpan(first, second) {
  return {
    width: Math.abs((second && second.x || 0) - (first && first.x || 0)),
    height: Math.abs((second && second.y || 0) - (first && first.y || 0))
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

function normalizeSourceCrop(crop, sourceWidth, sourceHeight) {
  if (!crop || crop.width <= 0 || crop.height <= 0) {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }
  const x = Math.max(0, Math.min(sourceWidth - 1, crop.x || 0));
  const y = Math.max(0, Math.min(sourceHeight - 1, crop.y || 0));
  return {
    x,
    y,
    width: Math.max(1, Math.min(sourceWidth - x, crop.width)),
    height: Math.max(1, Math.min(sourceHeight - y, crop.height))
  };
}

function readCrossStitchCells(data) {
  const cells = [];
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    const background = 250;
    cells.push({
      r: Math.round(data[i] * alpha + background * (1 - alpha)),
      g: Math.round(data[i + 1] * alpha + background * (1 - alpha)),
      b: Math.round(data[i + 2] * alpha + background * (1 - alpha))
    });
  }
  return cells;
}

function createQuantizedPalette(cells, maxColors) {
  const buckets = {};
  cells.forEach((cell) => {
    const key = `${cell.r >> 4},${cell.g >> 4},${cell.b >> 4}`;
    if (!buckets[key]) {
      buckets[key] = { count: 0, r: 0, g: 0, b: 0 };
    }
    buckets[key].count += 1;
    buckets[key].r += cell.r;
    buckets[key].g += cell.g;
    buckets[key].b += cell.b;
  });
  const palette = Object.keys(buckets)
    .map((key) => {
      const bucket = buckets[key];
      return {
        count: bucket.count,
        r: Math.round(bucket.r / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        b: Math.round(bucket.b / bucket.count)
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(2, Math.min(16, maxColors)));
  return palette.length ? palette : [{ r: 250, g: 248, b: 244 }];
}

function mapCellsToPalette(cells, palette) {
  return cells.map((cell) => {
    let nearest = palette[0];
    let nearestDistance = Infinity;
    palette.forEach((color) => {
      const dr = cell.r - color.r;
      const dg = cell.g - color.g;
      const db = cell.b - color.b;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = color;
      }
    });
    return nearest;
  });
}

function mapCellsToPaletteEntries(cells, palette) {
  return cells.map((cell) => {
    let nearest = palette[0];
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    palette.forEach((color, index) => {
      const dr = cell.r - color.r;
      const dg = cell.g - color.g;
      const db = cell.b - color.b;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = color;
        nearestIndex = index;
      }
    });
    return {
      ...nearest,
      paletteIndex: nearestIndex
    };
  });
}

function drawCrossStitchOutput(ctx, cells, cols, rows, cellSize, style) {
  ctx.save();
  ctx.clearRect(0, 0, cols * cellSize, rows * cellSize);
  ctx.fillStyle = "#f8f2e7";
  ctx.fillRect(0, 0, cols * cellSize, rows * cellSize);
  drawCrossStitchFabric(ctx, cols, rows, cellSize);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const color = cells[row * cols + col];
      const x = col * cellSize;
      const y = row * cellSize;
      if (style === "pixel" || style === "mixed") {
        drawCrossStitchPixel(ctx, x, y, cellSize, color);
      }
      if (style !== "pixel") {
        drawCrossStitchNeedle(ctx, x, y, cellSize, color);
      }
    }
  }
  drawCrossStitchGrid(ctx, cols, rows, cellSize);
  ctx.restore();
}

function drawCrossStitchFabric(ctx, cols, rows, cellSize) {
  const width = cols * cellSize;
  const height = rows * cellSize;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "rgba(120, 102, 82, 0.16)";
  ctx.lineWidth = 1;
  const gap = Math.max(4, Math.round(cellSize / 2));
  for (let x = 0; x <= width; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += gap) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCrossStitchPixel(ctx, x, y, size, color) {
  ctx.save();
  ctx.fillStyle = toRgb(color);
  ctx.globalAlpha = 0.82;
  ctx.fillRect(x + 1, y + 1, Math.max(1, size - 2), Math.max(1, size - 2));
  ctx.restore();
}

function drawCrossStitchNeedle(ctx, x, y, size, color) {
  const inset = Math.max(2, size * 0.22);
  ctx.save();
  ctx.strokeStyle = toRgb(color);
  ctx.lineWidth = Math.max(2, size * 0.22);
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.94;
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.lineTo(x + size - inset, y + size - inset);
  ctx.stroke();
  ctx.globalAlpha = 0.76;
  ctx.beginPath();
  ctx.moveTo(x + size - inset, y + inset);
  ctx.lineTo(x + inset, y + size - inset);
  ctx.stroke();
  ctx.restore();
}

function drawCrossStitchGrid(ctx, cols, rows, cellSize) {
  const width = cols * cellSize;
  const height = rows * cellSize;
  ctx.save();
  ctx.strokeStyle = "rgba(35, 31, 28, 0.16)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += cellSize) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function toRgb(color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function getMatissePalette(name) {
  const palettes = {
    vivid: [
      { r: 245, g: 205, b: 24 },
      { r: 235, g: 92, b: 94 },
      { r: 31, g: 111, b: 154 },
      { r: 32, g: 121, b: 78 },
      { r: 244, g: 139, b: 77 },
      { r: 246, g: 229, b: 168 },
      { r: 38, g: 43, b: 36 },
      { r: 245, g: 239, b: 224 }
    ],
    earth: [
      { r: 183, g: 96, b: 55 },
      { r: 124, g: 81, b: 51 },
      { r: 85, g: 116, b: 76 },
      { r: 36, g: 60, b: 54 },
      { r: 215, g: 167, b: 101 },
      { r: 232, g: 214, b: 177 },
      { r: 86, g: 45, b: 44 },
      { r: 247, g: 241, b: 226 }
    ],
    soft: [
      { r: 222, g: 153, b: 174 },
      { r: 235, g: 185, b: 130 },
      { r: 145, g: 174, b: 151 },
      { r: 129, g: 164, b: 189 },
      { r: 244, g: 221, b: 142 },
      { r: 174, g: 139, b: 104 },
      { r: 60, g: 72, b: 61 },
      { r: 250, g: 244, b: 231 }
    ]
  };
  return palettes[name] || palettes.vivid;
}

function drawMatisseCutoutOutput(ctx, cells, cols, rows, cellSize, paletteName) {
  const width = cols * cellSize;
  const height = rows * cellSize;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = paletteName === "vivid" ? "#f7d6dc" : "#f7f0df";
  ctx.fillRect(0, 0, width, height);
  drawCutoutPaperTexture(ctx, width, height);
  drawMatisseColorSheets(ctx, cells, cols, rows, cellSize);
  drawMatisseStructureLines(ctx, cells, cols, rows, cellSize, paletteName);
  drawCutoutPaperTexture(ctx, width, height, 0.08);
  ctx.restore();
}

function createContinuousMatisseImageData(imageData, palette, paletteName, detail = 64) {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const indexes = new Uint8Array(width * height);
  const background = getMatisseBackgroundColor(paletteName);
  const smoothed = smoothMatisseSourceData(data, width, height, background, detail);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const color = {
        r: smoothed[offset],
        g: smoothed[offset + 1],
        b: smoothed[offset + 2]
      };
      const match = findNearestPaletteEntry(color, palette);
      indexes[y * width + x] = match.index;
      output[offset] = match.color.r;
      output[offset + 1] = match.color.g;
      output[offset + 2] = match.color.b;
      output[offset + 3] = 255;
    }
  }
  mergeSmallMatisseRegions(indexes, width, height, palette, detail);
  writeMatissePalettePixels(output, indexes, palette);
  imageData.data.set(output);
  return {
    imageData,
    indexes,
    palette
  };
}

function smoothMatisseSourceData(data, width, height, background, detail) {
  const first = new Uint8ClampedArray(data.length);
  const passes = Number(detail) <= 44 ? 2 : 1;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] / 255;
    first[offset] = Math.round(data[offset] * alpha + background.r * (1 - alpha));
    first[offset + 1] = Math.round(data[offset + 1] * alpha + background.g * (1 - alpha));
    first[offset + 2] = Math.round(data[offset + 2] * alpha + background.b * (1 - alpha));
    first[offset + 3] = 255;
  }
  let source = first;
  let target = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        let totalWeight = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const px = Math.max(0, Math.min(width - 1, x + dx));
            const py = Math.max(0, Math.min(height - 1, y + dy));
            const weight = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
            const sample = (py * width + px) * 4;
            totalWeight += weight;
            r += source[sample] * weight;
            g += source[sample + 1] * weight;
            b += source[sample + 2] * weight;
          }
        }
        target[offset] = Math.round(r / totalWeight);
        target[offset + 1] = Math.round(g / totalWeight);
        target[offset + 2] = Math.round(b / totalWeight);
        target[offset + 3] = 255;
      }
    }
    const next = source;
    source = target;
    target = next;
  }
  return source;
}

function mergeSmallMatisseRegions(indexes, width, height, palette, detail) {
  const minArea = Number(detail) <= 44 ? 10 : Number(detail) >= 86 ? 3 : 5;
  const passes = Number(detail) <= 44 ? 2 : 1;
  const total = width * height;
  const queue = new Int32Array(total);
  const region = new Int32Array(total);
  for (let pass = 0; pass < passes; pass += 1) {
    const visited = new Uint8Array(total);
    for (let start = 0; start < total; start += 1) {
      if (visited[start]) continue;
      const colorIndex = indexes[start];
      let head = 0;
      let tail = 0;
      let regionSize = 0;
      const neighborCounts = {};
      queue[tail] = start;
      tail += 1;
      visited[start] = 1;
      while (head < tail) {
        const current = queue[head];
        head += 1;
        region[regionSize] = current;
        regionSize += 1;
        const x = current % width;
        const y = Math.floor(current / width);
        const neighbors = [
          x > 0 ? current - 1 : -1,
          x < width - 1 ? current + 1 : -1,
          y > 0 ? current - width : -1,
          y < height - 1 ? current + width : -1
        ];
        neighbors.forEach((next) => {
          if (next < 0) return;
          if (indexes[next] === colorIndex) {
            if (!visited[next]) {
              visited[next] = 1;
              queue[tail] = next;
              tail += 1;
            }
            return;
          }
          const neighborIndex = indexes[next];
          neighborCounts[neighborIndex] = (neighborCounts[neighborIndex] || 0) + 1;
        });
      }
      if (regionSize >= minArea) continue;
      const replacement = chooseMatisseMergeIndex(colorIndex, neighborCounts, palette);
      if (replacement == null || replacement === colorIndex) continue;
      for (let i = 0; i < regionSize; i += 1) {
        indexes[region[i]] = replacement;
      }
    }
  }
}

function chooseMatisseMergeIndex(colorIndex, neighborCounts, palette) {
  let bestIndex = null;
  let bestScore = -Infinity;
  Object.keys(neighborCounts).forEach((key) => {
    const index = Number(key);
    const current = palette[colorIndex] || palette[0];
    const candidate = palette[index] || palette[0];
    const dr = current.r - candidate.r;
    const dg = current.g - candidate.g;
    const db = current.b - candidate.b;
    const distancePenalty = (dr * dr + dg * dg + db * db) / 9000;
    const score = neighborCounts[key] - distancePenalty;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function writeMatissePalettePixels(data, indexes, palette) {
  for (let i = 0; i < indexes.length; i += 1) {
    const color = palette[indexes[i]] || palette[0];
    const offset = i * 4;
    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = 255;
  }
}

function findNearestPaletteEntry(color, palette) {
  let nearest = palette[0];
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  palette.forEach((candidate, index) => {
    const dr = color.r - candidate.r;
    const dg = color.g - candidate.g;
    const db = color.b - candidate.b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = candidate;
      nearestIndex = index;
    }
  });
  return {
    color: nearest,
    index: nearestIndex
  };
}

function softenQuantizedImage(data, width, height) {
  const source = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = source[offset + channel] * 0.62
          + source[offset - 4 + channel] * 0.08
          + source[offset + 4 + channel] * 0.08
          + source[offset - width * 4 + channel] * 0.11
          + source[offset + width * 4 + channel] * 0.11;
        data[offset + channel] = Math.round(value);
      }
    }
  }
}

function drawMatisseEdgesToPixels(data, indexes, width, height, paletteName) {
  const edge = paletteName === "vivid"
    ? { r: 33, g: 37, b: 31 }
    : { r: 76, g: 58, b: 44 };
  const stride = Math.max(2, Math.floor(Math.max(width, height) / 420));
  for (let y = 1; y < height - 1; y += stride) {
    for (let x = 1; x < width - 1; x += stride) {
      const index = indexes[y * width + x];
      const changed = indexes[y * width + x + 1] !== index || indexes[(y + 1) * width + x] !== index;
      if (!changed) continue;
      const wobble = Math.abs(seededNoise(y * 131 + x * 17, 5));
      if (wobble < 0.18) continue;
      paintEdgeDot(data, width, height, x, y, edge, stride);
    }
  }
}

function paintEdgeDot(data, width, height, x, y, color, radius) {
  const size = Math.max(1, Math.min(3, radius));
  for (let dy = -size; dy <= size; dy += 1) {
    for (let dx = -size; dx <= size; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      if (dx * dx + dy * dy > size * size) continue;
      const offset = (py * width + px) * 4;
      data[offset] = Math.round(data[offset] * 0.42 + color.r * 0.58);
      data[offset + 1] = Math.round(data[offset + 1] * 0.42 + color.g * 0.58);
      data[offset + 2] = Math.round(data[offset + 2] * 0.42 + color.b * 0.58);
      data[offset + 3] = 255;
    }
  }
}

function getMatisseBackgroundColor(paletteName) {
  if (paletteName === "vivid") return { r: 247, g: 214, b: 220 };
  return { r: 247, g: 240, b: 223 };
}

function drawContinuousMatisseOutput(ctx, indexes, palette, cols, rows, cellSize, paletteName) {
  const width = cols * cellSize;
  const height = rows * cellSize;
  ctx.save();
  ctx.fillStyle = paletteName === "vivid" ? "#f7d6dc" : "#f7f0df";
  ctx.fillRect(0, 0, width, height);
  drawCutoutPaperTexture(ctx, width, height, 0.045);
  palette.forEach((color, paletteIndex) => {
    ctx.fillStyle = toRgb(color);
    ctx.globalAlpha = 0.98;
    ctx.beginPath();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (indexes[row * cols + col] !== paletteIndex) continue;
        const jitterX = seededNoise(row * 97 + col * 17, paletteIndex) * cellSize * 0.018;
        const jitterY = seededNoise(row * 53 + col * 31, paletteIndex + 13) * cellSize * 0.018;
        ctx.rect(
          col * cellSize - 0.6 + jitterX,
          row * cellSize - 0.6 + jitterY,
          cellSize + 1.2,
          cellSize + 1.2
        );
      }
    }
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  drawSoftMatisseBoundaries(ctx, indexes, cols, rows, cellSize, paletteName);
  ctx.restore();
}

function drawSoftMatisseBoundaries(ctx, indexes, cols, rows, cellSize, paletteName) {
  const stroke = paletteName === "vivid"
    ? "rgba(33, 37, 31, 0.16)"
    : "rgba(72, 54, 42, 0.13)";
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.75, cellSize * 0.035);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = indexes[row * cols + col];
      const x = col * cellSize;
      const y = row * cellSize;
      if (col < cols - 1 && indexes[row * cols + col + 1] !== index) {
        if (Math.abs(seededNoise(row * 131 + col * 17, 21)) > 0.28) {
          drawWobblyLine(ctx, x + cellSize, y + cellSize * 0.08, x + cellSize, y + cellSize * 0.92, row * 19 + col * 31);
        }
      }
      if (row < rows - 1 && indexes[(row + 1) * cols + col] !== index) {
        if (Math.abs(seededNoise(row * 31 + col * 113, 22)) > 0.28) {
          drawWobblyLine(ctx, x + cellSize * 0.08, y + cellSize, x + cellSize * 0.92, y + cellSize, row * 31 + col * 19);
        }
      }
    }
  }
  ctx.restore();
}

function drawMatisseColorSheets(ctx, cells, cols, rows, cellSize) {
  const paletteIndexes = [];
  cells.forEach((cell) => {
    if (paletteIndexes.indexOf(cell.paletteIndex) < 0) paletteIndexes.push(cell.paletteIndex);
  });
  paletteIndexes.forEach((paletteIndex) => {
    const first = cells.find((cell) => cell.paletteIndex === paletteIndex);
    if (!first) return;
    ctx.save();
    ctx.fillStyle = toRgb(first);
    ctx.globalAlpha = 0.96;
    ctx.beginPath();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = cells[row * cols + col];
        if (!cell || cell.paletteIndex !== paletteIndex) continue;
        const x = col * cellSize;
        const y = row * cellSize;
        ctx.rect(x - 0.35, y - 0.35, cellSize + 0.7, cellSize + 0.7);
      }
    }
    ctx.fill();
    ctx.restore();
  });
}

function drawMatisseStructureLines(ctx, cells, cols, rows, cellSize, paletteName) {
  ctx.save();
  ctx.strokeStyle = paletteName === "vivid" ? "rgba(33, 37, 31, 0.58)" : "rgba(72, 54, 42, 0.48)";
  ctx.lineWidth = Math.max(1.5, cellSize * 0.11);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = cells[row * cols + col];
      if (!cell) continue;
      const right = col < cols - 1 ? cells[row * cols + col + 1] : null;
      const bottom = row < rows - 1 ? cells[(row + 1) * cols + col] : null;
      const x = col * cellSize;
      const y = row * cellSize;
      if (right && right.paletteIndex !== cell.paletteIndex) {
        drawWobblyLine(ctx, x + cellSize, y, x + cellSize, y + cellSize, row * 19 + col * 31);
      }
      if (bottom && bottom.paletteIndex !== cell.paletteIndex) {
        drawWobblyLine(ctx, x, y + cellSize, x + cellSize, y + cellSize, row * 31 + col * 19);
      }
    }
  }
  ctx.restore();
}

function drawWobblyLine(ctx, x1, y1, x2, y2, seed) {
  const segments = 3;
  ctx.beginPath();
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    const offset = seededNoise(seed, i + 1) * 1.4;
    const point = Math.abs(x2 - x1) > Math.abs(y2 - y1)
      ? { x, y: y + offset }
      : { x: x + offset, y };
    if (i === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.stroke();
}

function drawCutoutPatch(ctx, col, row, size, color) {
  const x = col * size;
  const y = row * size;
  const seed = (col + 1) * 73856093 ^ (row + 1) * 19349663;
  const jitter = Math.max(1, size * 0.16);
  const points = [
    { x: x + seededNoise(seed, 1) * jitter, y: y + seededNoise(seed, 2) * jitter },
    { x: x + size + seededNoise(seed, 3) * jitter, y: y + seededNoise(seed, 4) * jitter },
    { x: x + size + seededNoise(seed, 5) * jitter, y: y + size + seededNoise(seed, 6) * jitter },
    { x: x + seededNoise(seed, 7) * jitter, y: y + size + seededNoise(seed, 8) * jitter }
  ];
  ctx.save();
  ctx.fillStyle = toRgb(color);
  ctx.globalAlpha = 0.96;
  ctx.shadowColor = "rgba(38, 30, 24, 0.08)";
  ctx.shadowBlur = Math.max(0.5, size * 0.08);
  ctx.shadowOffsetX = size * 0.03;
  ctx.shadowOffsetY = size * 0.04;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.lineTo(points[2].x, points[2].y);
  ctx.lineTo(points[3].x, points[3].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCutoutPaperTexture(ctx, width, height, alpha = 0.12) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(60, 48, 35, 0.18)";
  ctx.lineWidth = 1;
  const gap = 18;
  for (let y = 6; y < height; y += gap) {
    ctx.beginPath();
    ctx.moveTo(0, y + seededNoise(y, 2) * 2);
    for (let x = 0; x <= width; x += 48) {
      ctx.lineTo(x, y + seededNoise(y, x + 3) * 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function createBotanicalImageData(imageData, toneName, detail) {
  const { width, height, data } = imageData;
  const source = new Uint8ClampedArray(data);
  const output = new Uint8ClampedArray(data.length);
  const tone = getBotanicalTone(toneName);
  const threshold = detail === "etched" ? 10 : detail === "soft" ? 21 : 15;
  const lineBoost = detail === "etched" ? 1.92 : detail === "soft" ? 1.28 : 1.58;
  const washBoost = detail === "etched" ? 0.33 : detail === "soft" ? 0.22 : 0.28;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const gray = getSourceGray(source, width, height, x, y);
      const localGray = getBotanicalLocalGray(source, width, height, x, y);
      const shapedGray = Math.max(0, Math.min(255, (gray - localGray) * 1.22 + gray * 0.9 + 13));
      const edge = getBotanicalEdgeStrength(source, width, height, x, y);
      const shadow = Math.max(0, (198 - shapedGray) / 255);
      const midtone = Math.sin(Math.PI * Math.max(0, Math.min(1, (235 - shapedGray) / 210)));
      const tonalInk = Math.pow(shadow, 1.18) * washBoost + Math.max(0, midtone) * 0.045;
      const edgeInk = edge > threshold ? Math.min(1, (edge - threshold) / 58 * lineBoost) : 0;
      const hatchInk = createBotanicalHatchInk(x, y, gray, detail);
      const microLine = createBotanicalMicroLineInk(x, y, shapedGray, edge, detail);
      const ink = Math.min(0.88, Math.max(edgeInk, tonalInk, hatchInk, microLine));
      const grain = seededNoise(y * 4099 + x * 17, 11) * 3.5 + blueprintValueNoise(x / 34, y / 31, 7) * 3;
      const paper = {
        r: clampColor(tone.paper.r + grain),
        g: clampColor(tone.paper.g + grain),
        b: clampColor(tone.paper.b + grain)
      };
      output[offset] = mixChannel(paper.r, tone.ink.r, ink);
      output[offset + 1] = mixChannel(paper.g, tone.ink.g, ink);
      output[offset + 2] = mixChannel(paper.b, tone.ink.b, ink);
      output[offset + 3] = 255;
    }
  }
  imageData.data.set(output);
  return imageData;
}

function getSourceGray(source, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, x));
  const py = Math.max(0, Math.min(height - 1, y));
  const offset = (py * width + px) * 4;
  return source[offset] * 0.299 + source[offset + 1] * 0.587 + source[offset + 2] * 0.114;
}

function getBotanicalLocalGray(source, width, height, x, y) {
  const radius = 3;
  let total = 0;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy += 3) {
    for (let dx = -radius; dx <= radius; dx += 3) {
      total += getSourceGray(source, width, height, x + dx, y + dy);
      count += 1;
    }
  }
  return total / Math.max(1, count);
}

function getBotanicalEdgeStrength(source, width, height, x, y) {
  const left = getSourceGray(source, width, height, x - 1, y);
  const right = getSourceGray(source, width, height, x + 1, y);
  const top = getSourceGray(source, width, height, x, y - 1);
  const bottom = getSourceGray(source, width, height, x, y + 1);
  const diagA = getSourceGray(source, width, height, x - 1, y - 1) - getSourceGray(source, width, height, x + 1, y + 1);
  const diagB = getSourceGray(source, width, height, x + 1, y - 1) - getSourceGray(source, width, height, x - 1, y + 1);
  return Math.abs(right - left) * 0.75 + Math.abs(bottom - top) * 0.75 + Math.abs(diagA) * 0.34 + Math.abs(diagB) * 0.34;
}

function createBotanicalHatchInk(x, y, gray, detail) {
  if (gray > 205) return 0;
  const spacing = detail === "etched" ? 10 : detail === "soft" ? 20 : 15;
  const diagonal = (x + y) % spacing;
  const cross = detail === "etched" ? Math.abs((x - y) % (spacing + 5)) : spacing;
  const shade = Math.max(0, (205 - gray) / 255);
  const primary = diagonal < 1 ? shade * 0.21 : 0;
  const secondary = cross < 0.8 ? shade * 0.13 : 0;
  return Math.max(primary, secondary);
}

function createBotanicalMicroLineInk(x, y, gray, edge, detail) {
  if (gray > 218 && edge < 18) return 0;
  const spacing = detail === "etched" ? 7 : detail === "soft" ? 14 : 10;
  const shade = Math.max(0, (218 - gray) / 255);
  const line = Math.abs((x * 0.72 + y * 0.38) % spacing);
  const broken = seededNoise(x * 19 + y * 23, 31) > (detail === "soft" ? 0.55 : 0.32);
  if (!broken || line > 0.75) return 0;
  return shade * (detail === "etched" ? 0.16 : 0.1) + Math.max(0, edge - 18) / 255 * 0.08;
}

function drawBotanicalPlateOverlay(ctx, width, height, toneName) {
  const tone = getBotanicalTone(toneName);
  ctx.save();
  drawBotanicalPaperMarks(ctx, width, height, tone);
  const pad = Math.max(22, Math.round(Math.min(width, height) * 0.045));
  ctx.strokeStyle = rgba(tone.ink, 0.34);
  ctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) * 0.002));
  ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, width * 0.39, height * 0.43, 0, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(tone.ink, 0.22);
  ctx.stroke();
  drawBotanicalLabels(ctx, width, height, tone);
  ctx.restore();
}

function drawBotanicalPaperMarks(ctx, width, height, tone) {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = rgba(tone.ink, 0.1);
  for (let i = 0; i < 80; i += 1) {
    const x = (seededNoise(i, 1) * 0.5 + 0.5) * width;
    const y = (seededNoise(i, 2) * 0.5 + 0.5) * height;
    const size = 0.6 + Math.abs(seededNoise(i, 3)) * 1.8;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBotanicalLabels(ctx, width, height, tone) {
  ctx.save();
  ctx.fillStyle = rgba(tone.ink, 0.46);
  ctx.font = `${Math.max(14, Math.round(width * 0.026))}px serif`;
  ctx.fillText("BOTANICAL STUDY", width * 0.08, height * 0.09);
  ctx.font = `${Math.max(12, Math.round(width * 0.021))}px serif`;
  ctx.fillText("plate no. 03 / local specimen", width * 0.08, height * 0.125);
  ctx.textAlign = "right";
  ctx.fillText("archive notes", width * 0.92, height * 0.9);
  ctx.fillText("tonal line illustration", width * 0.92, height * 0.928);
  ctx.restore();
}

function getBotanicalTone(name) {
  const tones = {
    blueprint: {
      paper: { r: 248, g: 246, b: 235 },
      ink: { r: 21, g: 98, b: 168 }
    },
    sage: {
      paper: { r: 249, g: 245, b: 231 },
      ink: { r: 55, g: 105, b: 82 }
    },
    sepia: {
      paper: { r: 247, g: 240, b: 222 },
      ink: { r: 75, g: 56, b: 40 }
    }
  };
  return tones[name] || tones.blueprint;
}

function rgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function mixChannel(base, ink, amount) {
  return clampColor(base * (1 - amount) + ink * amount);
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function seededNoise(seed, salt) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
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

function createBrushLayer(strokes, draft) {
  const bounds = getBrushBounds(strokes, draft);
  if (!bounds) return null;
  const width = Math.max(8, bounds.maxX - bounds.minX);
  const height = Math.max(8, bounds.maxY - bounds.minY);
  return {
    id: `brush-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type: "brush",
    x: bounds.minX,
    y: bounds.minY,
    width,
    height,
    brushWidth: width,
    brushHeight: height,
    rotation: 0,
    scale: 1,
    opacity: 1,
    zIndex: (draft.layers || []).reduce((max, layer, index) => Math.max(max, layer.zIndex == null ? index : layer.zIndex), 0) + 1,
    source: "",
    text: "",
    style: {},
    strokes: strokes.map((stroke) => ({
      type: stroke.type || "line",
      stampSource: stroke.stampSource || (stroke.type === "bow" ? BOW_BRUSH_SOURCE : ""),
      color: stroke.color || "#111111",
      size: stroke.size || 8,
      points: (stroke.points || []).map((point) => ({
        x: point.x - bounds.minX,
        y: point.y - bounds.minY
      }))
    }))
  };
}

function getBrushBounds(strokes, draft) {
  const result = strokes.reduce((bounds, stroke) => {
    const padding = Math.max(4, stroke.size || 8) / 2 + 4;
    (stroke.points || []).forEach((point) => {
      bounds.minX = Math.min(bounds.minX, point.x - padding);
      bounds.minY = Math.min(bounds.minY, point.y - padding);
      bounds.maxX = Math.max(bounds.maxX, point.x + padding);
      bounds.maxY = Math.max(bounds.maxY, point.y + padding);
    });
    return bounds;
  }, {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  });
  if (!Number.isFinite(result.minX) || !Number.isFinite(result.minY)) return null;
  return {
    minX: Math.max(0, result.minX),
    minY: Math.max(0, result.minY),
    maxX: Math.min(draft.width, result.maxX),
    maxY: Math.min(draft.height, result.maxY)
  };
}

function clampDraftPoint(point, draft) {
  return {
    x: Math.max(0, Math.min(draft.width, point.x)),
    y: Math.max(0, Math.min(draft.height, point.y))
  };
}

function getBrushStampSources(layers) {
  return (layers || []).reduce((sources, layer) => {
    (layer && layer.strokes || []).forEach((stroke) => {
      if (stroke && stroke.stampSource) sources.push(stroke.stampSource);
    });
    return sources;
  }, []);
}

function createLayerOutlineByStyle(style) {
  if (style === "cream") {
    return {
      preset: "cream",
      color: "#f4ead8",
      width: 12,
      opacity: 0.96
    };
  }
  if (style === "dark") {
    return {
      preset: "dark",
      color: "#111111",
      width: 8,
      opacity: 0.82
    };
  }
  if (style === "red") {
    return {
      preset: "red",
      color: "#d94a38",
      width: 9,
      opacity: 0.86
    };
  }
  if (style === "double") {
    return {
      preset: "double",
      strokes: [
        { color: "#ffffff", width: 18, opacity: 0.96 },
        { color: "#111111", width: 6, opacity: 0.72 }
      ]
    };
  }
  if (style === "none") return null;
  return {
    preset: "white",
    color: "#ffffff",
    width: 14,
    opacity: 0.96
  };
}

function getLayerOutlineStyleKey(outline) {
  if (!outline) return "none";
  if (outline.preset) return outline.preset;
  if (Array.isArray(outline.strokes) && outline.strokes.length) return "double";
  if (!outline.width) return "none";
  if (outline.color === "#f4ead8") return "cream";
  if (outline.color === "#d94a38") return "red";
  return outline.color === "#111111" ? "dark" : "white";
}

function createAssetPanelCategories() {
  const categories = getAssetPacks().reduce((items, pack) => {
    if (pack.category && !items.includes(pack.category)) {
      items.push(pack.category);
    }
    return items;
  }, []);
  const ordered = ASSET_PANEL_CATEGORY_ORDER.filter((category) => category === "推荐" || categories.includes(category));
  return ordered.concat(categories.filter((category) => !ordered.includes(category)));
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
  if (!category || category === "推荐") return filterRecommendedAssetPanelPacks(packs);
  return packs.filter((pack) => pack.category === category);
}

function filterRecommendedAssetPanelPacks(packs) {
  const byId = new Map((packs || []).map((pack) => [pack.id, pack]));
  return recommendedAssetPackIds.map((packId) => byId.get(packId)).filter(Boolean);
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
  const categories = options.reduce((items, option) => {
    if (option.category && !items.includes(option.category)) {
      items.push(option.category);
    }
    return items;
  }, []);
  return BACKGROUND_CATEGORY_ORDER.filter((category) => categories.includes(category))
    .concat(categories.filter((category) => !BACKGROUND_CATEGORY_ORDER.includes(category)));
}

function filterBackgroundOptions(options, category) {
  return options.filter((option) => option.category === category);
}

function createPaperBackgroundOptions() {
  return PAPER_BACKGROUND_PACKS.reduce((items, entry) => {
    const pack = entry.pack || {};
    const category = entry.category || "纸感";
    const baseUrl = (pack.baseUrl || "").replace(/\/+$/, "");
    if (!baseUrl || !Array.isArray(pack.items)) return items;
    pack.items.forEach((item, index) => {
      const fileName = Array.isArray(item) ? item[0] : item && item.fileName;
      const width = Array.isArray(item) ? item[1] : item && item.width;
      const height = Array.isArray(item) ? item[2] : item && item.height;
      if (!fileName) return;
      const source = `${baseUrl}/items/${encodeURIComponent(fileName)}`;
      items.push({
        id: `background-${pack.id}-${index + 1}`,
        name: `${pack.name || pack.id} ${index + 1}`,
        category,
        color: pack.tone || "#fdfdfb",
        source,
        thumb: source,
        width: width || 480,
        height: height || 640
      });
    });
    return items;
  }, []);
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
  const paperBackgrounds = createPaperBackgroundOptions();
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
  return colors.concat(paperBackgrounds, grids);
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

function getFontFileCacheKey(font, source) {
  const fontId = font && font.id ? font.id : "unknown";
  return `${FONT_FILE_CACHE_PREFIX}${fontId}.${hashString(source || "")}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeLegacyAssetSource(source) {
  if (!source || typeof source !== "string") return source || "";
  const migration = LEGACY_ASSET_SOURCE_MIGRATIONS.find((item) => source.startsWith(item.from));
  return migration ? `${migration.to}${source.slice(migration.from.length)}` : source;
}

const remoteCanvasImageSourceCache = {};

function resolveCanvasImageSource(src) {
  if (!isRemoteImageSource(src)) return Promise.resolve(src);
  const cached = remoteCanvasImageSourceCache[src];
  if (cached) return cached;
  const promise = resolveCachedRemoteImage(src, { logPrefix: "[canvas]" }).then((filePath) => filePath || src);
  remoteCanvasImageSourceCache[src] = promise;
  return promise;
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

function getHandmadeEffectKey(layer) {
  if (!layer) return "none";
  if (layer.tear) return "tear";
  const effect = layer.style && layer.style.handmadeEffect;
  if (!effect) return "none";
  if (effect.type === "taped" || effect.type === "floating") return effect.type;
  return "none";
}

function getTextureEffectKey(layer) {
  const texture = layer && layer.style && layer.style.textureEffect;
  return texture && getTextureEffectConfig(texture.type) ? texture.type : "none";
}

function getTextureEffectConfig(type, settings = {}) {
  const config = {
    "blueprint-print": {
      label: "蓝晒印刷",
      create: (page, layer) => page.createBlueprintPrintImage(layer, {
        tone: settings.blueprintTone || "prussian",
        intensity: settings.blueprintIntensity || "standard",
        paper: settings.blueprintPaper || "warm",
        grain: settings.blueprintGrain || "medium"
      })
    },
    "screen-print": {
      label: "丝网印",
      create: (page, layer) => page.createScreenPrintImage(layer, {
        palette: settings.screenPrintPalette || "red-blue",
        strength: settings.screenPrintStrength || "standard",
        halftone: settings.screenPrintHalftone || "medium",
        offset: settings.screenPrintOffset || "slight"
      })
    },
    "riso-print": {
      label: "Riso印刷",
      create: (page, layer) => page.createRisoPrintImage(layer, {
        palette: settings.risoPalette || "pink-blue",
        mode: settings.risoMode || "three",
        ink: settings.risoInk || "standard",
        offset: settings.risoOffset || "slight",
        grain: settings.risoGrain || "medium"
      })
    },
    "vintage-botanical": {
      label: "图鉴",
      create: (page, layer) => page.createBotanicalPlateImage(layer, {
        tone: settings.botanicalTone || "blueprint",
        detail: settings.botanicalDetail || "medium",
        frame: settings.botanicalFrame || "on"
      })
    },
    "pixel-cross-stitch": {
      label: "像素绣",
      create: (page, layer) => page.createCrossStitchImage(layer, {
        grid: settings.crossStitchGrid || 72,
        colors: settings.crossStitchColors || 8,
        style: "pixel"
      })
    },
    "matisse-cutout": {
      label: "马蒂斯",
      create: (page, layer) => page.createMatisseCutoutImage(layer, {
        detail: settings.matisseDetail || 64,
        palette: settings.matissePalette || "vivid"
      })
    },
    "kpop-card": {
      label: "小卡",
      create: (page, layer) => page.createKpopCardImage(layer, {
        text: settings.kpopCardText || "subtle"
      })
    }
  };
  return config[type] || null;
}

function getTextureEffectSettings(type, settings = {}) {
  if (type === "blueprint-print") {
    return {
      blueprintTone: settings.blueprintTone || "prussian",
      blueprintIntensity: settings.blueprintIntensity || "standard",
      blueprintPaper: settings.blueprintPaper || "warm",
      blueprintGrain: settings.blueprintGrain || "medium"
    };
  }
  if (type === "screen-print") {
    return {
      screenPrintPalette: settings.screenPrintPalette || "red-blue",
      screenPrintStrength: settings.screenPrintStrength || "standard",
      screenPrintHalftone: settings.screenPrintHalftone || "medium",
      screenPrintOffset: settings.screenPrintOffset || "slight"
    };
  }
  if (type === "riso-print") {
    return {
      risoPalette: settings.risoPalette || "pink-blue",
      risoMode: settings.risoMode || "three",
      risoInk: settings.risoInk || "standard",
      risoOffset: settings.risoOffset || "slight",
      risoGrain: settings.risoGrain || "medium"
    };
  }
  if (type === "vintage-botanical") return { botanicalTone: settings.botanicalTone || "blueprint", botanicalDetail: settings.botanicalDetail || "medium", botanicalFrame: settings.botanicalFrame || "on" };
  if (type === "pixel-cross-stitch") return { crossStitchGrid: settings.crossStitchGrid || 72, crossStitchColors: settings.crossStitchColors || 8 };
  if (type === "matisse-cutout") return { matisseDetail: settings.matisseDetail || 64, matissePalette: settings.matissePalette || "vivid" };
  if (type === "kpop-card") return { template: "pearl", kpopCardText: settings.kpopCardText || "subtle" };
  return {};
}

function areTextureEffectSettingsEqual(left = {}, right = {}) {
  const leftKeys = Object.keys(left || {});
  const rightKeys = Object.keys(right || {});
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every((key) => String(left[key]) === String(right[key]));
}

function createBlueprintPrintImageData(imageData, options = {}) {
  const data = imageData.data;
  const palette = getBlueprintPrintPalette(options);
  const paper = palette.paper;
  const ink = palette.ink;
  const exposure = palette.exposure;
  const grainAmount = palette.grain;
  const bayer4 = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  ];
  const width = imageData.width || 1;
  const height = imageData.height || Math.max(1, Math.floor(data.length / 4 / width));

  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const alpha = data[index + 3] / 255;
    if (alpha <= 0) continue;

    const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    const contrast = Math.max(0, Math.min(1, ((luminance - 128) * exposure.contrast + 128) / 255));
    const toneAmount = 1 - contrast;
    const midtonePowder = Math.sin(Math.PI * Math.max(0, Math.min(1, toneAmount)));
    const dotOffset = (bayer4[(y % 4) * 4 + (x % 4)] / 15 - 0.5) * exposure.dot * grainAmount.screen;
    const cloudNoise = blueprintValueNoise(x / 96, y / 96, 21) * grainAmount.cloud;
    const pulpNoise = blueprintValueNoise(x / 23, y / 19, 37) * grainAmount.pulp;
    const fiberNoise = (seededNoise(x * 0.18 + y * 0.05, 43) * 0.65 + seededNoise(x * 0.04 - y * 0.22, 47) * 0.35) * grainAmount.fiber;
    const sedimentNoise = (blueprintValueNoise(x / 7.5, y / 7.5, 59) + seededNoise(x * 2.3 + y * 3.1, 61) * 0.42) * grainAmount.ink;
    const sedimentWeight = 0.34 + toneAmount * 0.54 + midtonePowder * 0.2;
    const coverageBase = Math.pow(Math.max(0, Math.min(1, toneAmount + dotOffset + sedimentNoise * sedimentWeight + cloudNoise * 0.28)), exposure.gamma);
    const inkCoverage = Math.max(0, Math.min(1, coverageBase * exposure.depth));
    const paperLift = Math.max(-0.07, Math.min(0.09, cloudNoise + pulpNoise + fiberNoise * (1 - inkCoverage * 0.48)));
    const edgeFade = getBlueprintEdgeFade(x, y, width, height) * grainAmount.edgeFade;
    const settledCoverage = Math.max(0, Math.min(1, inkCoverage - edgeFade + pulpNoise * midtonePowder * 0.25));

    data[index] = mixChannel(paper[0] + 255 * paperLift, ink[0], settledCoverage);
    data[index + 1] = mixChannel(paper[1] + 255 * paperLift, ink[1], settledCoverage);
    data[index + 2] = mixChannel(paper[2] + 255 * paperLift, ink[2], settledCoverage);
    data[index + 3] = Math.round(alpha * 255);
  }
  return imageData;
}

function drawBlueprintPrintOverlay(ctx, width, height, options = {}) {
  const palette = getBlueprintPrintPalette(options);
  const areaScale = Math.max(0.7, Math.min(2.4, Math.sqrt((width * height) / (1000 * 1000))));
  const speckCount = Math.round(palette.grain.speckles * areaScale);
  const stainCount = Math.round(palette.grain.stains * areaScale);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = rgba(palette.inkColor, 0.18);
  for (let i = 0; i < stainCount; i += 1) {
    const x = (seededNoise(i, 31) * 0.5 + 0.5) * width;
    const y = (seededNoise(i, 33) * 0.5 + 0.5) * height;
    const radius = (18 + Math.abs(seededNoise(i, 35)) * 68) * areaScale;
    const opacity = palette.grain.overlay * (0.08 + Math.abs(seededNoise(i, 39)) * 0.12);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba(palette.inkColor, opacity));
    gradient.addColorStop(1, rgba(palette.inkColor, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgba(palette.inkColor, 0.2);
  for (let i = 0; i < speckCount; i += 1) {
    const x = (seededNoise(i, 41) * 0.5 + 0.5) * width;
    const y = (seededNoise(i, 43) * 0.5 + 0.5) * height;
    const size = 0.35 + Math.pow(Math.abs(seededNoise(i, 47)), 2) * 2.6;
    ctx.globalAlpha = palette.grain.overlay * (0.32 + Math.abs(seededNoise(i, 49)) * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, size * areaScale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = palette.grain.fiberLine;
  ctx.strokeStyle = rgba(palette.inkColor, 0.12);
  ctx.lineWidth = Math.max(0.45, Math.min(1, width / 1400));
  for (let i = 0; i < palette.grain.fibers * areaScale; i += 1) {
    const x = (seededNoise(i, 67) * 0.5 + 0.5) * width;
    const y = (seededNoise(i, 71) * 0.5 + 0.5) * height;
    const length = (12 + Math.abs(seededNoise(i, 73)) * 42) * areaScale;
    const angle = seededNoise(i, 79) * 0.55 + (seededNoise(i, 83) > 0 ? 0 : Math.PI);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.restore();
}

function getBlueprintPrintPalette(options = {}) {
  const toneMap = {
    prussian: { ink: [43, 62, 140], color: { r: 43, g: 62, b: 140 } },
    teal: { ink: [28, 105, 118], color: { r: 28, g: 105, b: 118 } },
    violet: { ink: [88, 69, 146], color: { r: 88, g: 69, b: 146 } },
    sepia: { ink: [105, 72, 45], color: { r: 105, g: 72, b: 45 } },
    rose: { ink: [159, 72, 104], color: { r: 159, g: 72, b: 104 } },
    mono: { ink: [54, 58, 62], color: { r: 54, g: 58, b: 62 } }
  };
  const paperMap = {
    cool: [248, 249, 246],
    warm: [243, 240, 230],
    aged: [240, 231, 209],
    gray: [231, 231, 225]
  };
  const intensityMap = {
    soft: { contrast: 1.12, gamma: 0.96, depth: 0.82, dot: 0.075 },
    standard: { contrast: 1.28, gamma: 0.84, depth: 1, dot: 0.11 },
    deep: { contrast: 1.42, gamma: 0.76, depth: 1.16, dot: 0.13 }
  };
  const grainMap = {
    low: { cloud: 0.012, pulp: 0.007, paper: 0.008, fiber: 0.006, ink: 0.018, screen: 0.42, edgeFade: 0.012, overlay: 0.08, fiberLine: 0.055, speckles: 120, fibers: 34, stains: 3 },
    medium: { cloud: 0.02, pulp: 0.012, paper: 0.014, fiber: 0.012, ink: 0.034, screen: 0.32, edgeFade: 0.018, overlay: 0.13, fiberLine: 0.085, speckles: 210, fibers: 58, stains: 5 },
    high: { cloud: 0.032, pulp: 0.018, paper: 0.022, fiber: 0.018, ink: 0.056, screen: 0.24, edgeFade: 0.026, overlay: 0.2, fiberLine: 0.12, speckles: 360, fibers: 92, stains: 8 }
  };
  const tone = toneMap[options.tone] || toneMap.prussian;
  return {
    paper: paperMap[options.paper] || paperMap.warm,
    ink: tone.ink,
    inkColor: tone.color,
    exposure: intensityMap[options.intensity] || intensityMap.standard,
    grain: grainMap[options.grain] || grainMap.medium
  };
}

function blueprintValueNoise(x, y, salt) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const n00 = seededNoise(x0 * 131 + y0 * 197, salt);
  const n10 = seededNoise((x0 + 1) * 131 + y0 * 197, salt);
  const n01 = seededNoise(x0 * 131 + (y0 + 1) * 197, salt);
  const n11 = seededNoise((x0 + 1) * 131 + (y0 + 1) * 197, salt);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v;
}

function getBlueprintEdgeFade(x, y, width, height) {
  const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
  const edgeWidth = Math.max(12, Math.min(width, height) * 0.045);
  if (edge >= edgeWidth) return 0;
  return Math.pow(1 - edge / edgeWidth, 1.6);
}

function createScreenPrintImageData(imageData, options = {}) {
  const data = imageData.data;
  const source = new Uint8ClampedArray(data);
  const width = imageData.width || 1;
  const height = imageData.height || Math.max(1, Math.floor(data.length / 4 / width));
  const palette = getScreenPrintPalette(options.palette);
  const strength = getScreenPrintStrength(options.strength);
  const halftone = getScreenPrintHalftone(options.halftone);
  const offset = getScreenPrintOffset(options.offset);

  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const alpha = source[index + 3] / 255;
    if (alpha <= 0) continue;

    const current = readScreenPrintSample(source, width, height, x, y);
    const mainSample = readScreenPrintSample(source, width, height, x - offset.x, y - offset.y);
    const shadowSample = readScreenPrintSample(source, width, height, x + offset.x, y + offset.y);
    const midSample = readScreenPrintSample(source, width, height, x + offset.y * 0.55, y - offset.x * 0.55);
    const tone = 1 - clamp01(((current.luminance - 128) * strength.contrast + 128) / 255);
    const mainTone = 1 - clamp01(((mainSample.luminance - 128) * strength.contrast + 128) / 255);
    const shadowTone = 1 - clamp01(((shadowSample.luminance - 128) * strength.contrast + 128) / 255);
    const midTone = 1 - clamp01(((midSample.luminance - 128) * strength.contrast + 128) / 255);
    const colorBias = Math.max(0, Math.min(1, current.saturation * 1.18 + (current.warmth + 0.35) * 0.18));
    const paperNoise = screenPrintValueNoise(x / 72, y / 68, 103) * strength.paperNoise;
    const leakNoise = screenPrintValueNoise(x / 11, y / 13, 109) * 0.65 + seededNoise(x * 2.1 + y * 3.7, 113) * 0.35;
    const dropout = leakNoise > strength.leakThreshold ? strength.leak : 0;
    const baseCoverage = clamp01((0.2 + colorBias * 0.5 + midTone * 0.38) * strength.base - dropout * 0.55);
    const mainCoverage = applyScreenHalftone(x, y, clamp01((mainTone - 0.13) * strength.main - dropout), halftone, 15);
    const shadowCoverage = applyScreenHalftone(x, y, clamp01((shadowTone - 0.48) * strength.shadow - dropout * 0.75), halftone, 47);
    const highlightLift = clamp01((1 - tone - 0.58) * 1.65) * strength.highlight;

    let r = palette.paper[0] + paperNoise * 255;
    let g = palette.paper[1] + paperNoise * 255;
    let b = palette.paper[2] + paperNoise * 255;

    r = mixChannel(r, palette.base[0], baseCoverage * (1 - highlightLift * 0.65));
    g = mixChannel(g, palette.base[1], baseCoverage * (1 - highlightLift * 0.65));
    b = mixChannel(b, palette.base[2], baseCoverage * (1 - highlightLift * 0.65));
    r = mixChannel(r, palette.main[0], mainCoverage);
    g = mixChannel(g, palette.main[1], mainCoverage);
    b = mixChannel(b, palette.main[2], mainCoverage);
    r = mixChannel(r, palette.shadow[0], shadowCoverage);
    g = mixChannel(g, palette.shadow[1], shadowCoverage);
    b = mixChannel(b, palette.shadow[2], shadowCoverage);

    data[index] = clampColor(r);
    data[index + 1] = clampColor(g);
    data[index + 2] = clampColor(b);
    data[index + 3] = Math.round(alpha * 255);
  }
  return imageData;
}

function drawScreenPrintOverlay(ctx, width, height, options = {}) {
  const palette = getScreenPrintPalette(options.palette);
  const strength = getScreenPrintStrength(options.strength);
  const areaScale = Math.max(0.7, Math.min(2.2, Math.sqrt((width * height) / (1000 * 1000))));
  const scuffCount = Math.round(strength.scuffs * areaScale);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = rgba({ r: palette.paper[0], g: palette.paper[1], b: palette.paper[2] }, 0.24);
  ctx.lineWidth = Math.max(0.7, Math.min(1.8, width / 900));
  for (let i = 0; i < scuffCount; i += 1) {
    const x = (seededNoise(i, 131) * 0.5 + 0.5) * width;
    const y = (seededNoise(i, 137) * 0.5 + 0.5) * height;
    const length = (16 + Math.abs(seededNoise(i, 139)) * 70) * areaScale;
    const angle = seededNoise(i, 149) * 0.8;
    ctx.globalAlpha = strength.scuffAlpha * (0.45 + Math.abs(seededNoise(i, 151)) * 0.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = rgba({ r: palette.shadow[0], g: palette.shadow[1], b: palette.shadow[2] }, 0.18);
  for (let i = 0; i < scuffCount * 0.65; i += 1) {
    const x = (seededNoise(i, 157) * 0.5 + 0.5) * width;
    const y = (seededNoise(i, 163) * 0.5 + 0.5) * height;
    const size = 0.6 + Math.abs(seededNoise(i, 167)) * 1.8;
    ctx.globalAlpha = strength.scuffAlpha * 0.55;
    ctx.fillRect(x, y, size * areaScale, size * areaScale);
  }
  ctx.restore();
}

function getScreenPrintPalette(name) {
  const palettes = {
    "red-blue": {
      paper: [246, 235, 212],
      base: [238, 92, 78],
      main: [34, 88, 150],
      shadow: [26, 42, 75]
    },
    "orange-blue": {
      paper: [245, 233, 208],
      base: [236, 128, 48],
      main: [28, 101, 151],
      shadow: [32, 55, 86]
    },
    "pink-green": {
      paper: [247, 238, 226],
      base: [229, 112, 144],
      main: [38, 128, 101],
      shadow: [31, 74, 64]
    },
    "black-cream": {
      paper: [242, 232, 207],
      base: [217, 198, 159],
      main: [55, 55, 52],
      shadow: [28, 28, 27]
    },
    "purple-yellow": {
      paper: [247, 237, 210],
      base: [235, 184, 59],
      main: [104, 72, 147],
      shadow: [56, 44, 86]
    }
  };
  return palettes[name] || palettes["red-blue"];
}

function getScreenPrintStrength(name) {
  const values = {
    soft: { contrast: 1.08, base: 0.65, main: 1.04, shadow: 1.25, leak: 0.08, leakThreshold: 0.78, highlight: 0.42, paperNoise: 0.009, scuffs: 34, scuffAlpha: 0.1 },
    standard: { contrast: 1.24, base: 0.82, main: 1.22, shadow: 1.45, leak: 0.13, leakThreshold: 0.68, highlight: 0.5, paperNoise: 0.014, scuffs: 54, scuffAlpha: 0.14 },
    bold: { contrast: 1.42, base: 1, main: 1.42, shadow: 1.7, leak: 0.18, leakThreshold: 0.58, highlight: 0.56, paperNoise: 0.019, scuffs: 78, scuffAlpha: 0.18 }
  };
  return values[name] || values.standard;
}

function getScreenPrintHalftone(name) {
  const values = {
    none: { size: 0, softness: 1 },
    fine: { size: 6, softness: 1.15 },
    medium: { size: 9, softness: 1.05 },
    coarse: { size: 14, softness: 0.96 }
  };
  return values[name] || values.medium;
}

function getScreenPrintOffset(name) {
  const values = {
    none: { x: 0, y: 0 },
    slight: { x: 2, y: 1 },
    strong: { x: 5, y: 3 }
  };
  return values[name] || values.slight;
}

function readScreenPrintSample(source, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (py * width + px) * 4;
  const r = source[index];
  const g = source[index + 1];
  const b = source[index + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return {
    luminance: r * 0.2126 + g * 0.7152 + b * 0.0722,
    saturation: max <= 0 ? 0 : (max - min) / max,
    warmth: (r - b) / 255
  };
}

function applyScreenHalftone(x, y, coverage, halftone, salt) {
  if (!halftone.size || coverage <= 0) return coverage;
  const size = halftone.size;
  const angle = salt === 15 ? 0.43 : -0.31;
  const rx = x * Math.cos(angle) - y * Math.sin(angle);
  const ry = x * Math.sin(angle) + y * Math.cos(angle);
  const cx = ((rx % size) + size) % size - size / 2;
  const cy = ((ry % size) + size) % size - size / 2;
  const distanceToCenter = Math.sqrt(cx * cx + cy * cy) / (size * 0.5);
  const dotRadius = Math.sqrt(clamp01(coverage)) * halftone.softness;
  const edge = Math.max(0, Math.min(1, (dotRadius - distanceToCenter) * 4.2));
  const dot = edge * edge * (3 - 2 * edge);
  return coverage * 0.28 + dot * 0.72;
}

function screenPrintValueNoise(x, y, salt) {
  return blueprintValueNoise(x, y, salt);
}

function createRisoPrintImageData(imageData, options = {}) {
  const data = imageData.data;
  const source = new Uint8ClampedArray(data);
  const width = imageData.width || 1;
  const height = imageData.height || Math.max(1, Math.floor(data.length / 4 / width));
  const palette = getRisoPrintPalette(options.palette);
  const ink = getRisoPrintInk(options.ink);
  const offset = getRisoPrintOffset(options.offset);
  const grain = getRisoPrintGrain(options.grain);
  const useThreeColors = options.mode !== "duo";

  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const alpha = source[index + 3] / 255;
    if (alpha <= 0) continue;

    const current = readRisoSample(source, width, height, x, y);
    const firstSample = readRisoSample(source, width, height, x - offset.a.x, y - offset.a.y);
    const secondSample = readRisoSample(source, width, height, x - offset.b.x, y - offset.b.y);
    const thirdSample = readRisoSample(source, width, height, x - offset.c.x, y - offset.c.y);
    const tone = 1 - clamp01(((current.luminance - 128) * ink.contrast + 128) / 255);
    const firstTone = 1 - clamp01(((firstSample.luminance - 128) * ink.contrast + 128) / 255);
    const secondTone = 1 - clamp01(((secondSample.luminance - 128) * ink.contrast + 128) / 255);
    const thirdTone = 1 - clamp01(((thirdSample.luminance - 128) * ink.contrast + 128) / 255);
    const chroma = clamp01(current.saturation * 1.25);
    const warmBias = clamp01((current.warmth + 1) * 0.5);
    const coolBias = 1 - warmBias;
    const midtone = Math.sin(Math.PI * clamp01(tone));
    const paperNoise = risoValueNoise(x / 82, y / 76, 211) * grain.paper;
    const grainNoise = risoValueNoise(x / 4.7, y / 4.3, 223) * 0.72 + seededNoise(x * 5.1 + y * 7.3, 227) * 0.28;
    const dropout = grainNoise > grain.dropoutThreshold ? grain.dropout : 0;
    const firstCoverage = applyRisoDot(x, y, clamp01((firstTone * 0.7 + chroma * 0.22 + warmBias * 0.2) * ink.amount - dropout), grain, 0.22);
    const secondCoverage = applyRisoDot(x, y, clamp01((secondTone * 0.78 + coolBias * 0.18 + midtone * 0.16) * ink.amount - dropout * 0.82), grain, -0.34);
    const thirdCoverage = useThreeColors
      ? applyRisoDot(x, y, clamp01((0.16 + thirdTone * 0.34 + midtone * 0.34 + chroma * 0.16) * ink.third - dropout * 0.62), grain, 0.58)
      : 0;
    const paperLift = clamp01((1 - tone - 0.56) * 1.7) * ink.paperLift;

    let r = palette.paper[0] + paperNoise * 255;
    let g = palette.paper[1] + paperNoise * 255;
    let b = palette.paper[2] + paperNoise * 255;

    r = blendRisoInk(r, palette.first[0], firstCoverage);
    g = blendRisoInk(g, palette.first[1], firstCoverage);
    b = blendRisoInk(b, palette.first[2], firstCoverage);
    r = blendRisoInk(r, palette.second[0], secondCoverage);
    g = blendRisoInk(g, palette.second[1], secondCoverage);
    b = blendRisoInk(b, palette.second[2], secondCoverage);
    if (useThreeColors) {
      r = blendRisoInk(r, palette.third[0], thirdCoverage);
      g = blendRisoInk(g, palette.third[1], thirdCoverage);
      b = blendRisoInk(b, palette.third[2], thirdCoverage);
    }

    data[index] = clampColor(r + paperLift * (palette.paper[0] - r) * 0.45);
    data[index + 1] = clampColor(g + paperLift * (palette.paper[1] - g) * 0.45);
    data[index + 2] = clampColor(b + paperLift * (palette.paper[2] - b) * 0.45);
    data[index + 3] = Math.round(alpha * 255);
  }
  return imageData;
}

function drawRisoPrintOverlay(ctx, width, height, options = {}) {
  const palette = getRisoPrintPalette(options.palette);
  const grain = getRisoPrintGrain(options.grain);
  const areaScale = Math.max(0.7, Math.min(2.3, Math.sqrt((width * height) / (1000 * 1000))));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.lineWidth = Math.max(0.45, Math.min(1.1, width / 1400));
  for (let i = 0; i < grain.scanLines * areaScale; i += 1) {
    const y = (i / Math.max(1, grain.scanLines * areaScale)) * height + seededNoise(i, 241) * 3;
    ctx.globalAlpha = grain.scanAlpha * (0.5 + Math.abs(seededNoise(i, 251)) * 0.45);
    ctx.strokeStyle = rgba({ r: palette.second[0], g: palette.second[1], b: palette.second[2] }, 0.16);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y + seededNoise(i, 257) * 2);
    ctx.stroke();
  }
  for (let i = 0; i < grain.speckles * areaScale; i += 1) {
    const x = (seededNoise(i, 263) * 0.5 + 0.5) * width;
    const y = (seededNoise(i, 269) * 0.5 + 0.5) * height;
    const size = 0.3 + Math.abs(seededNoise(i, 271)) * 1.2;
    const color = seededNoise(i, 277) > 0 ? palette.first : palette.second;
    ctx.globalAlpha = grain.speckAlpha * (0.4 + Math.abs(seededNoise(i, 281)) * 0.6);
    ctx.fillStyle = rgba({ r: color[0], g: color[1], b: color[2] }, 0.22);
    ctx.fillRect(x, y, size * areaScale, size * areaScale);
  }
  ctx.restore();
}

function applyKpopCardTone(ctx, x, y, width, height) {
  const imageData = ctx.getImageData(x, y, width, height);
  const data = imageData.data;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] / 255;
    if (alpha <= 0) continue;
    let r = data[offset];
    let g = data[offset + 1];
    let b = data[offset + 2];
    const avg = (r + g + b) / 3;
    r = avg + (r - avg) * 0.98 + 5;
    g = avg + (g - avg) * 0.96 + 4;
    b = avg + (b - avg) * 0.98 + 9;
    const lift = 7;
    data[offset] = clampColor(r + lift);
    data[offset + 1] = clampColor(g + lift);
    data[offset + 2] = clampColor(b + lift);
  }
  ctx.putImageData(imageData, x, y);
  const veil = ctx.createLinearGradient(x, y, x + width, y + height);
  veil.addColorStop(0, "rgba(255, 204, 226, 0.06)");
  veil.addColorStop(0.52, "rgba(232, 244, 255, 0.08)");
  veil.addColorStop(1, "rgba(255, 247, 190, 0.05)");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = veil;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function drawKpopCardPhysicalShadow(ctx, width, height, radius) {
  ctx.save();
  ctx.shadowColor = "rgba(35, 34, 42, 0.22)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  drawRoundedMaskPath(ctx, 18, 20, width - 36, height - 40, radius);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 6;
  drawRoundedMaskPath(ctx, 24, 26, width - 48, height - 52, radius - 4);
  ctx.stroke();
  ctx.restore();
}

function drawKpopHolographicBorder(ctx, width, height, radius, holoTexture) {
  ctx.save();
  const outerInset = 12;
  const innerInset = 80;
  const band = innerInset - outerInset;
  drawRoundedMaskPath(ctx, outerInset, outerInset, width - outerInset * 2, height - outerInset * 2, radius + 2);
  ctx.clip();

  ctx.save();
  ctx.shadowColor = "rgba(255, 255, 255, 0.48)";
  ctx.shadowBlur = 6;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
  drawRoundedMaskPath(ctx, 18, 18, width - 36, height - 36, radius);
  ctx.stroke();
  ctx.restore();

  drawKpopBorderStrips(ctx, width, height, band, () => {
    const metal = ctx.createLinearGradient(0, 0, width, height);
    metal.addColorStop(0, "rgba(166, 176, 190, 0.42)");
    metal.addColorStop(0.28, "rgba(232, 236, 242, 0.46)");
    metal.addColorStop(0.54, "rgba(138, 150, 168, 0.34)");
    metal.addColorStop(0.78, "rgba(245, 247, 250, 0.38)");
    metal.addColorStop(1, "rgba(154, 166, 184, 0.4)");
    ctx.fillStyle = metal;
    ctx.fillRect(0, 0, width, height);
  });

  if (holoTexture) {
    drawKpopHoloTextureStrip(ctx, holoTexture, width, height, 0, 0, width, band);
    drawKpopHoloTextureStrip(ctx, holoTexture, width, height, 0, height - band, width, band);
    drawKpopHoloTextureStrip(ctx, holoTexture, width, height, 0, 0, band, height);
    drawKpopHoloTextureStrip(ctx, holoTexture, width, height, width - band, 0, band, height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(255, 157, 205, 0.96)");
    gradient.addColorStop(0.22, "rgba(174, 211, 255, 0.98)");
    gradient.addColorStop(0.45, "rgba(255, 246, 153, 0.94)");
    gradient.addColorStop(0.68, "rgba(194, 157, 255, 0.96)");
    gradient.addColorStop(1, "rgba(149, 245, 221, 0.92)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, band);
    ctx.fillRect(0, height - band, width, band);
    ctx.fillRect(0, 0, band, height);
    ctx.fillRect(width - band, 0, band, height);
  }

  drawKpopPrismaticFoil(ctx, width, height, band);

  const sheen = ctx.createLinearGradient(0, 0, width, height);
  sheen.addColorStop(0, "rgba(255,255,255,0.045)");
  sheen.addColorStop(0.38, "rgba(255,255,255,0)");
  sheen.addColorStop(0.72, "rgba(255,255,255,0.04)");
  sheen.addColorStop(1, "rgba(255,255,255,0.018)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, band);
  ctx.fillRect(0, height - band, width, band);
  ctx.fillRect(0, 0, band, height);
  ctx.fillRect(width - band, 0, band, height);

  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  drawRoundedMaskPath(ctx, innerInset - 2, innerInset - 2, width - (innerInset - 2) * 2, height - (innerInset - 2) * 2, radius - 25);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(28, 30, 38, 0.2)";
  drawRoundedMaskPath(ctx, innerInset + 4, innerInset + 4, width - (innerInset + 4) * 2, height - (innerInset + 4) * 2, radius - 31);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
  drawRoundedMaskPath(ctx, 24, 24, width - 48, height - 48, radius - 3);
  ctx.stroke();
  ctx.restore();
}

function drawKpopHoloTextureStrip(ctx, texture, width, height, x, y, stripWidth, stripHeight) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, stripWidth, stripHeight);
  ctx.clip();
  const tileWidth = Math.max(160, Math.round(width * 0.36));
  const tileHeight = Math.max(160, Math.round(tileWidth * texture.height / Math.max(1, texture.width)));
  for (let drawY = y - (y % tileHeight) - tileHeight; drawY < y + stripHeight + tileHeight; drawY += tileHeight) {
    for (let drawX = x - (x % tileWidth) - tileWidth; drawX < x + stripWidth + tileWidth; drawX += tileWidth) {
      ctx.drawImage(texture, 0, 0, texture.width, texture.height, drawX, drawY, tileWidth, tileHeight);
    }
  }
  ctx.restore();
}

function drawKpopBorderStrips(ctx, width, height, band, draw) {
  const strips = [
    [0, 0, width, band],
    [0, height - band, width, band],
    [0, 0, band, height],
    [width - band, 0, band, height]
  ];
  strips.forEach(([x, y, stripWidth, stripHeight]) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, stripWidth, stripHeight);
    ctx.clip();
    draw();
    ctx.restore();
  });
}

function drawKpopPrismaticFoil(ctx, width, height, band) {
  const palette = [
    [255, 50, 164],
    [64, 198, 255],
    [255, 234, 74],
    [162, 88, 255],
    [47, 232, 198],
    [255, 111, 181],
    [118, 157, 255]
  ];

  drawKpopBorderStrips(ctx, width, height, band, () => {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    const cell = 118;
    const cols = Math.ceil(width / cell) + 2;
    const rows = Math.ceil(height / cell) + 2;
    for (let row = -1; row < rows; row += 1) {
      for (let col = -1; col < cols; col += 1) {
        const index = row * 37 + col * 19;
        if (Math.abs(seededNoise(index, 697)) < 0.38) continue;
        const x = col * cell + seededNoise(index, 701) * 13;
        const y = row * cell + seededNoise(index, 709) * 13;
        const size = cell * (0.82 + Math.abs(seededNoise(index, 719)) * 0.55);
        const heightScale = 0.24 + Math.abs(seededNoise(index, 723)) * 0.18;
        const skew = seededNoise(index, 727) * 28;
        const color = palette[Math.abs(Math.floor(seededNoise(index, 733) * 1000)) % palette.length];
        const alpha = 0.18 + Math.abs(seededNoise(index, 739)) * 0.2;
        const brightness = seededNoise(index, 743);
        const gradient = ctx.createLinearGradient(x, y, x + size, y + size * heightScale);
        gradient.addColorStop(0, brightness > 0 ? rgba({ r: color[0], g: color[1], b: color[2] }, alpha * 0.42) : "rgba(42,48,62,0.18)");
        gradient.addColorStop(0.48, rgba({ r: color[0], g: color[1], b: color[2] }, alpha));
        gradient.addColorStop(1, brightness > 0
          ? `rgba(255,255,255,${0.07 + Math.abs(brightness) * 0.12})`
          : "rgba(22,27,38,0.26)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x + skew, y);
        ctx.lineTo(x + size, y + size * heightScale * 0.22 + skew * 0.18);
        ctx.lineTo(x + size * 0.86 - skew * 0.16, y + size * heightScale);
        ctx.lineTo(x + size * 0.06, y + size * heightScale * 0.78);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = brightness > 0
          ? "rgba(255,255,255,0.16)"
          : "rgba(18,24,34,0.24)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = "multiply";
    ctx.lineWidth = 1;
    for (let i = -height; i < width; i += 42) {
      ctx.strokeStyle = "rgba(28,34,48,0.12)";
      ctx.beginPath();
      ctx.moveTo(i, height);
      ctx.lineTo(i + height * 0.55, 0);
      ctx.stroke();
    }
    for (let i = 0; i < 28; i += 1) {
      const x = (seededNoise(i, 829) * 0.5 + 0.5) * width;
      const y = (seededNoise(i, 839) * 0.5 + 0.5) * height;
      const length = 42 + Math.abs(seededNoise(i, 853)) * 88;
      ctx.strokeStyle = "rgba(45,52,68,0.13)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y + seededNoise(i, 857) * 15);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = 0.65;
    for (let i = -height; i < width; i += 16) {
      const hueShift = Math.abs(seededNoise(i, 881));
      ctx.strokeStyle = hueShift > 0.66
        ? "rgba(255,255,255,0.18)"
        : hueShift > 0.33
          ? "rgba(105,238,230,0.13)"
          : "rgba(255,151,222,0.12)";
      ctx.beginPath();
      ctx.moveTo(i, height);
      ctx.lineTo(i + height * 0.34, 0);
      ctx.stroke();
    }
    for (let i = 0; i < 14; i += 1) {
      const x = (seededNoise(i, 761) * 0.5 + 0.5) * width;
      const y = (seededNoise(i, 769) * 0.5 + 0.5) * height;
      const length = 22 + Math.abs(seededNoise(i, 773)) * 58;
      const alpha = 0.04 + Math.abs(seededNoise(i, 787)) * 0.08;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y + seededNoise(i, 797) * 8);
      ctx.stroke();
    }

    for (let i = 0; i < 8; i += 1) {
      const x = (seededNoise(i, 809) * 0.5 + 0.5) * width;
      const y = (seededNoise(i, 811) * 0.5 + 0.5) * height;
      const radius = 1.5 + Math.abs(seededNoise(i, 821)) * 3;
      const glint = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
      glint.addColorStop(0, "rgba(255,255,255,0.34)");
      glint.addColorStop(0.36, "rgba(255,255,255,0.1)");
      glint.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glint;
      ctx.beginPath();
      ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawKpopLaminateTexture(ctx, width, height, radius) {
  ctx.save();
  drawRoundedMaskPath(ctx, 24, 24, width - 48, height - 48, radius - 8);
  ctx.clip();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 42; i += 1) {
    const x = (seededNoise(i, 601) * 0.5 + 0.5) * width;
    const y = (seededNoise(i, 607) * 0.5 + 0.5) * height;
    const alpha = 0.006 + Math.abs(seededNoise(i, 613)) * 0.012;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.restore();
}

function drawKpopCardGloss(ctx, width, height, radius) {
  ctx.save();
  drawRoundedMaskPath(ctx, 0, 0, width, height, radius);
  ctx.clip();
  ctx.globalCompositeOperation = "screen";
  const thin = ctx.createLinearGradient(width * 0.62, height * 0.02, width, height * 0.36);
  thin.addColorStop(0, "rgba(255,255,255,0)");
  thin.addColorStop(0.5, "rgba(255,255,255,0.012)");
  thin.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = thin;
  ctx.beginPath();
  ctx.moveTo(width * 0.7, 0);
  ctx.lineTo(width * 0.76, 0);
  ctx.lineTo(width * 1.02, height * 0.25);
  ctx.lineTo(width * 0.96, height * 0.28);
  ctx.closePath();
  ctx.fill();
  const pearl = ctx.createRadialGradient(width * 0.72, height * 0.22, width * 0.03, width * 0.72, height * 0.22, width * 0.62);
  pearl.addColorStop(0, "rgba(255,255,255,0.012)");
  pearl.addColorStop(0.36, "rgba(197,216,255,0.008)");
  pearl.addColorStop(0.62, "rgba(255,203,232,0.006)");
  pearl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = pearl;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawKpopCardEdgeDepth(ctx, width, height, radius) {
  ctx.save();
  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
  drawRoundedMaskPath(ctx, 31, 31, width - 62, height - 62, radius - 12);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(42, 43, 54, 0.16)";
  drawRoundedMaskPath(ctx, 18, 18, width - 36, height - 36, radius);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
  drawRoundedMaskPath(ctx, 42, 42, width - 84, height - 84, radius - 26);
  ctx.stroke();
  ctx.restore();
}

function drawKpopCardDecor(ctx, x, y, width, height, radius, textMode = "subtle") {
  ctx.save();
  drawRoundedMaskPath(ctx, x, y, width, height, radius);
  ctx.clip();
  if (textMode !== "off") {
    const title = "MY CARD";
    const number = `No. ${String(Math.floor(Math.abs(seededNoise(width, height)) * 999) + 1).padStart(3, "0")}`;
    const textX = x + 28;
    const numberY = y + height - 36;
    const titleY = numberY - 36;
    const alpha = textMode === "standard" ? 0.78 : 0.46;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.strokeStyle = `rgba(31, 35, 42, ${textMode === "standard" ? 0.16 : 0.08})`;
    ctx.lineWidth = textMode === "standard" ? 2.5 : 1.4;
    ctx.font = `${textMode === "standard" ? "700 30px" : "600 24px"} sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.strokeText(title, textX, titleY);
    ctx.fillText(title, textX, titleY);
    ctx.font = `${textMode === "standard" ? "600 22px" : "500 17px"} sans-serif`;
    ctx.fillStyle = `rgba(255, 255, 255, ${textMode === "standard" ? 0.64 : 0.36})`;
    ctx.fillText(number, textX, numberY);
  }
  for (let i = 0; i < 11; i += 1) {
    const sparkleX = x + (seededNoise(i, 401) * 0.5 + 0.5) * width;
    const sparkleY = y + (seededNoise(i, 409) * 0.5 + 0.5) * height;
    const size = 6 + Math.abs(seededNoise(i, 419)) * 13;
    const alpha = 0.2 + Math.abs(seededNoise(i, 421)) * 0.26;
    drawKpopSparkle(ctx, sparkleX, sparkleY, size, `rgba(255,255,255,${alpha})`);
  }
  ctx.restore();
}

function drawKpopSparkle(ctx, x, y, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x + size * 0.18, y - size * 0.18, x + size, y);
  ctx.quadraticCurveTo(x + size * 0.18, y + size * 0.18, x, y + size);
  ctx.quadraticCurveTo(x - size * 0.18, y + size * 0.18, x - size, y);
  ctx.quadraticCurveTo(x - size * 0.18, y - size * 0.18, x, y - size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function getRisoPrintPalette(name) {
  const palettes = {
    "pink-blue": {
      paper: [246, 238, 220],
      first: [246, 92, 153],
      second: [42, 116, 201],
      third: [246, 190, 51]
    },
    "orange-teal": {
      paper: [246, 236, 214],
      first: [245, 112, 42],
      second: [24, 151, 159],
      third: [244, 69, 116]
    },
    "purple-yellow": {
      paper: [247, 238, 213],
      first: [116, 73, 179],
      second: [244, 194, 49],
      third: [238, 82, 128]
    },
    "red-black": {
      paper: [244, 234, 211],
      first: [227, 57, 65],
      second: [38, 39, 42],
      third: [47, 129, 193]
    },
    "green-pink": {
      paper: [246, 238, 219],
      first: [38, 166, 113],
      second: [240, 88, 151],
      third: [247, 171, 48]
    }
  };
  return palettes[name] || palettes["pink-blue"];
}

function getRisoPrintInk(name) {
  const values = {
    light: { contrast: 1.08, amount: 0.74, third: 0.48, paperLift: 0.42 },
    standard: { contrast: 1.22, amount: 0.9, third: 0.62, paperLift: 0.36 },
    dense: { contrast: 1.38, amount: 1.06, third: 0.78, paperLift: 0.28 }
  };
  return values[name] || values.standard;
}

function getRisoPrintOffset(name) {
  const values = {
    none: { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, c: { x: 0, y: 0 } },
    slight: { a: { x: 1.4, y: -0.7 }, b: { x: -1.6, y: 1 }, c: { x: 0.8, y: 1.7 } },
    strong: { a: { x: 3.5, y: -2.1 }, b: { x: -4.2, y: 2.5 }, c: { x: 2.3, y: 4 } }
  };
  return values[name] || values.slight;
}

function getRisoPrintGrain(name) {
  const values = {
    low: { paper: 0.009, dot: 0.035, dropout: 0.06, dropoutThreshold: 0.82, scanLines: 22, scanAlpha: 0.06, speckles: 180, speckAlpha: 0.08 },
    medium: { paper: 0.015, dot: 0.055, dropout: 0.1, dropoutThreshold: 0.72, scanLines: 34, scanAlpha: 0.09, speckles: 320, speckAlpha: 0.12 },
    high: { paper: 0.024, dot: 0.084, dropout: 0.16, dropoutThreshold: 0.62, scanLines: 48, scanAlpha: 0.13, speckles: 520, speckAlpha: 0.18 }
  };
  return values[name] || values.medium;
}

function readRisoSample(source, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (py * width + px) * 4;
  const r = source[index];
  const g = source[index + 1];
  const b = source[index + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return {
    luminance: r * 0.2126 + g * 0.7152 + b * 0.0722,
    saturation: max <= 0 ? 0 : (max - min) / max,
    warmth: (r - b) / 255
  };
}

function applyRisoDot(x, y, coverage, grain, angle) {
  const noise = risoValueNoise(x / 5.8, y / 5.4, Math.round((angle + 1) * 300)) * grain.dot;
  const rx = x * Math.cos(angle) - y * Math.sin(angle);
  const ry = x * Math.sin(angle) + y * Math.cos(angle);
  const cell = 5.5;
  const cx = ((rx % cell) + cell) % cell - cell / 2;
  const cy = ((ry % cell) + cell) % cell - cell / 2;
  const dot = Math.sqrt(cx * cx + cy * cy) / (cell * 0.5);
  const edge = clamp01((Math.sqrt(clamp01(coverage + noise)) * 1.1 - dot) * 5);
  const screen = edge * edge * (3 - 2 * edge);
  return clamp01(coverage * 0.55 + screen * 0.45 + noise);
}

function blendRisoInk(base, ink, coverage) {
  const transparentInk = base * (1 - coverage * 0.58) + ink * coverage * 0.58;
  const stainedPaper = base * (1 - coverage * 0.18) + Math.min(base, ink) * coverage * 0.18;
  return transparentInk * 0.72 + stainedPaper * 0.28;
}

function risoValueNoise(x, y, salt) {
  return blueprintValueNoise(x, y, salt);
}
