const { saveDraft, saveAutoDraft, loadDraft, loadDraftById, loadLatestDraft, loadRecentDrafts } = require("../../utils/draft-store");
const { showToast, showSuccess, showError, showModal } = require("../../utils/feedback");
const { checkImageContent, checkTextContent } = require("../../utils/content-security");
const { shareCreate } = require("../../utils/share");
const { persistTempFile } = require("../../utils/local-file");
const { removeImageBackground } = require("../../utils/rembg-api");
const { generateSeedreamImage } = require("../../utils/seedream-api");
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
  createCollageSlotLayer,
  createAssetLayer,
  createTextLayer,
  createTapeLayer,
  normalizeLayerOrder
} = require("../../models/draft");
const {
  drawDraft,
  drawLayer,
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
const HOME_SHOWCASE_BASE_GROUPS = require("../../config/home-showcases");
const HOME_SHOWCASE_MANIFEST_URL = "https://assets.zllarchi.site/homecase/manifest.json?v=20260812-frame";

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
const SEEDREAM_UPLOAD_MAX_SIDE = 1600;
const SEEDREAM_INPUT_MIN_ASPECT = 1 / 3;
const SEEDREAM_INPUT_MAX_ASPECT = 3;
const LACE_CENTER_FRAME_OPTIONS = [
  {
    id: "wide-hole",
    label: "宽孔蕾丝",
    source: "https://assets.zllarchi.site/packs/leisi/items/lace-center-01.png",
    openingWidthRatio: 0.73,
    openingHeightRatio: 0.73
  },
  {
    id: "classic-doily",
    label: "经典花边",
    source: "https://assets.zllarchi.site/packs/leisi/items/lace-doily-frame-transparent.png",
    openingWidthRatio: 0.54,
    openingHeightRatio: 0.54
  }
];
const DEFAULT_LACE_CENTER_FRAME = LACE_CENTER_FRAME_OPTIONS[0];
const FOIL_CENTER_FRAME_OPTIONS = [
  {
    id: "foil-crumpled",
    label: "揉皱锡纸",
    source: "https://assets.zllarchi.site/effects/foil-frame-02-compress.png",
    openingWidthRatio: 0.72,
    openingHeightRatio: 0.72
  }
];
const DEFAULT_FOIL_CENTER_FRAME = FOIL_CENTER_FRAME_OPTIONS[0];
const LACE_CONTENT_RANGE_MIN = 0.65;
const LACE_CONTENT_RANGE_MAX = 1.8;
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
const BACKGROUND_HINT_SEEN_KEY = "journal.backgroundHintSeen.v1";
const CREATIVE_TEAR_PAPER_DAILY_KEY_PREFIX = "journal.creativeTearPaper.daily.v1.";
const TEXT_FONTS = getTextFonts();
const CUTTABLE_SOURCE_LAYER_TYPES = ["image", "sticker", "paper"];
const KPOP_HOLO_FOIL_TEXTURE = "/assets/textures/holo-foil-768.webp";
const TORN_PAPER_EDGE_ATLAS = "/assets/textures/torn-paper-edge-atlas.png";
const TORN_PAPER_FIBER_FRINGE_ATLAS = "/assets/textures/torn-paper-fiber-fringe.png";
const DEFAULT_CREATIVE_TEAR_PAPER_STYLE = "watercolor-zine-reveal";
const CREATIVE_TEAR_PAPER_STYLES = [
  { value: "watercolor-zine-reveal", label: "水彩杂志" }
];
const TEXT_FONT_OPTIONS = getTextFontOptions();
const DEFAULT_TEXT_FONT_STYLE = createTextFontStyle("system");
const PAPER_BACKGROUND_PACKS = [
  { pack: paper01Pack, category: "图案" },
  { pack: paper02Pack, category: "格纹" },
  { pack: paper03Pack, category: "图案" },
  { pack: paper04Pack, category: "格纹" },
  { pack: paper05Pack, category: "纸感" }
];
const DEFAULT_POLKA_PATTERN_CONFIG = {
  type: "polka",
  dotColor: "#b79b75",
  dotColors: [],
  dotRadius: 6,
  gap: 46,
  opacity: 0.58,
  style: "solid",
  shape: "circle",
  imageSource: "",
  imageWidth: 0,
  imageHeight: 0,
  imageSourceType: "",
  assetId: "",
  packId: "",
  offset: "staggered",
  seed: 1
};
const POLKA_BACKGROUND_COLORS = [
  { value: "#fdf7ec", label: "奶油" },
  { value: "#ffffff", label: "白" },
  { value: "#f5dfd8", label: "粉" },
  { value: "#d7dbc9", label: "绿" },
  { value: "#eaf1f6", label: "蓝" },
  { value: "#f7f7f5", label: "灰" }
];
const SOLID_PAPER_COLORS = [
  { value: "#fffaf2", label: "奶杏" },
  { value: "#f6ead8", label: "燕麦" },
  { value: "#efe2cb", label: "亚麻" },
  { value: "#f8e7e4", label: "雾桃" },
  { value: "#f2d9df", label: "豆沙" },
  { value: "#eadcf8", label: "芋紫" },
  { value: "#dfe8ff", label: "雾霜蓝" },
  { value: "#d7f0ed", label: "薄荷冰" },
  { value: "#dfeedd", label: "抹茶奶" },
  { value: "#fff2b8", label: "黄油" },
  { value: "#ffd9bf", label: "杏橘" },
  { value: "#eceff3", label: "云灰" },
  { value: "#d8d1c5", label: "石灰米" },
  { value: "#c8d7cc", label: "鼠尾草" },
  { value: "#b8d8d6", label: "海盐" },
  { value: "#f4b8c4", label: "玫瑰粉" }
];
const POLKA_DOT_COLORS = [
  { value: "#b79b75", label: "焦糖" },
  { value: "#111111", label: "黑" },
  { value: "#ffffff", label: "白" },
  { value: "#d94a38", label: "红" },
  { value: "#b45d79", label: "粉" },
  { value: "#5f806f", label: "绿" },
  { value: "#6d9bc3", label: "蓝" },
  { value: "#8fe3cf", label: "薄荷" },
  { value: "#a9d8ff", label: "冰蓝" },
  { value: "#c9b7ff", label: "薰衣草" },
  { value: "#fff08a", label: "奶油黄" },
  { value: "#ff9fb7", label: "珊瑚粉" }
];
const POLKA_DOT_SIZES = [
  { value: 5, label: "小" },
  { value: 9, label: "中" },
  { value: 15, label: "大" }
];
const POLKA_DENSITIES = [
  { value: 72, label: "稀" },
  { value: 48, label: "中" },
  { value: 32, label: "密" }
];
const POLKA_STYLES = [
  { value: "solid", label: "实心" },
  { value: "soft", label: "软点" },
  { value: "outline", label: "空心" }
];
const POLKA_SHAPES = [
  { value: "circle", label: "圆" },
  { value: "square", label: "方" },
  { value: "diamond", label: "菱" },
  { value: "heart", label: "心" },
  { value: "star", label: "星" },
  { value: "cross", label: "十" }
];
const POLKA_OPACITIES = [
  { value: 0.38, label: "弱" },
  { value: 0.64, label: "中" },
  { value: 1, label: "强" }
];
const BASIC_SHAPE_TYPES = [
  { value: "circle", label: "圆" },
  { value: "square", label: "方" },
  { value: "triangle", label: "三角" },
  { value: "heart", label: "心" },
  { value: "star", label: "星" },
  { value: "sparkle", label: "四角星" },
  { value: "flower", label: "四瓣花" },
  { value: "raindrop", label: "雨滴" },
  { value: "diamond", label: "菱" },
  { value: "rounded", label: "圆角" },
  { value: "snowflake", label: "雪花" },
  { value: "cross", label: "+" },
  { value: "tag", label: "标签" }
];
const BASIC_SHAPE_FILL_COLORS = [
  { value: "#f4b8c4", label: "玫瑰" },
  { value: "#ffd9bf", label: "杏橘" },
  { value: "#fff2b8", label: "黄油" },
  { value: "#d7f0ed", label: "薄荷" },
  { value: "#dfe8ff", label: "雾蓝" },
  { value: "#eadcf8", label: "芋紫" },
  { value: "#ffffff", label: "白" },
  { value: "#111111", label: "黑" }
];
const BASIC_SHAPE_STROKE_COLORS = [
  { value: "", label: "无" },
  { value: "#111111", label: "黑" },
  { value: "#ffffff", label: "白" },
  { value: "#d94a38", label: "红" },
  { value: "#5f806f", label: "绿" },
  { value: "#6d9bc3", label: "蓝" }
];
const BASIC_SHAPE_STROKE_WIDTHS = [
  { value: 0, label: "无" },
  { value: 3, label: "细" },
  { value: 6, label: "中" },
  { value: 10, label: "粗" }
];
const BASIC_SHAPE_OPACITIES = [
  { value: 0.38, label: "弱" },
  { value: 0.64, label: "中" },
  { value: 0.82, label: "柔" },
  { value: 1, label: "实" }
];
const BASIC_SHAPE_COUNTS = [
  { value: 1, label: "1" },
  { value: 3, label: "3" },
  { value: 6, label: "6" },
  { value: 9, label: "9" }
];
const BASIC_SHAPE_LAYOUTS = [
  { value: "single", label: "单个" },
  { value: "row", label: "横排" },
  { value: "grid", label: "网格" },
  { value: "scatter", label: "散落" }
];
const BACKGROUND_CATEGORY_ORDER = ["纯色", "波点", "格纹", "纸感", "图案"];
const BACKGROUND_OPTIONS = createBackgroundOptions();
const BACKGROUND_CATEGORIES = createBackgroundCategories(BACKGROUND_OPTIONS);
const HOME_SHOWCASES = createHomeShowcaseGroups(HOME_SHOWCASE_BASE_GROUPS);
const ASSET_PANEL_CATEGORY_ORDER = ["推荐", "贴纸", "胶带", "便签", "主题混装", "相框"];
const POLKA_PAPER_PACK_ID = "polka-paper-materials";
const LOCAL_BACKGROUND_PAPER_PACK_ID = "local-background-paper-materials";
const BASIC_SHAPE_PACK_ID = "basic-shape-materials";
const PENDING_CREATE_ACTION_STORAGE_KEY = "journal.pendingCreateAction";
const ASSET_PANEL_PACKS = createAssetPanelPacks();
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
    ratios: ["3:4", "1:1", "9:16", "16:9"],
    ratio: "3:4",
    canvasCssWidth: 300,
    canvasCssHeight: 400,
    canvasStageStyle: "",
    selectedLayerId: "",
    selectedLayerType: "",
    selectedCollageSlot: false,
    selectedHandmadeEffect: "none",
    selectedTextureEffect: "none",
    creativeTearPaperStyle: DEFAULT_CREATIVE_TEAR_PAPER_STYLE,
    creativeTearPaperStyles: CREATIVE_TEAR_PAPER_STYLES,
    textureEffectBusy: false,
    textureEffectBusyType: "",
    textureEffectBusySetting: "",
    effectAdjusting: "",
    selectedTapePlacement: "double-corners",
    laceContentScale: 100,
    laceOpeningScale: 100,
    laceFrameOptions: LACE_CENTER_FRAME_OPTIONS,
    selectedLaceFrameId: DEFAULT_LACE_CENTER_FRAME.id,
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
      { value: "#6b4f3f", label: "可可棕" },
      { value: "#8fe3cf", label: "薄荷绿" },
      { value: "#a9d8ff", label: "冰蓝" },
      { value: "#c9b7ff", label: "薰衣草" },
      { value: "#fff08a", label: "奶油黄" },
      { value: "#ff9fb7", label: "珊瑚粉" }
    ],
    textBackgrounds: ["无", "纸底", "白底", "黑底", "胶带"],
    textFont: DEFAULT_TEXT_FONT_STYLE.fontId,
    textFontGroup: DEFAULT_TEXT_FONT_STYLE.fontGroupId,
    textFontVariant: DEFAULT_TEXT_FONT_STYLE.fontId,
    textColor: "#111111",
    textSize: 54,
    textAlign: "center",
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
    embossPreviewStyle: "",
    embossImageStyle: "",
    embossMaskStyle: "",
    embossMaskShapeClass: "circle",
    embossAspectLocked: false,
    embossShapes: [
      { value: "circle", label: "圆形" },
      { value: "rect", label: "方形" },
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
    homeShowcaseGroups: HOME_SHOWCASES,
    activeTool: "",
    activeDrawer: "",
    activePalette: "",
    assetCategories: createAssetPanelCategories(),
    activeAssetCategory: "推荐",
    assetPacks: decorateAssetPanelPacks(ASSET_PANEL_PACKS),
    visibleAssetPacks: filterAssetPanelPacks(decorateAssetPanelPacks(ASSET_PANEL_PACKS), "推荐"),
    activeAssetPack: null,
    activeAssetPackItems: [],
    backgroundCategories: BACKGROUND_CATEGORIES,
    activeBackgroundCategory: "纸感",
    visibleBackgrounds: filterBackgroundOptions(BACKGROUND_OPTIONS, "纸感"),
    polkaBackgroundColors: POLKA_BACKGROUND_COLORS,
    solidPaperColors: SOLID_PAPER_COLORS,
    polkaDotColors: POLKA_DOT_COLORS,
    polkaDotSizes: POLKA_DOT_SIZES,
    polkaDensities: POLKA_DENSITIES,
    polkaStyles: POLKA_STYLES,
    polkaShapes: POLKA_SHAPES,
    polkaOpacities: POLKA_OPACITIES,
    basicShapeTypes: BASIC_SHAPE_TYPES,
    basicShapeFillColors: BASIC_SHAPE_FILL_COLORS,
    basicShapeStrokeColors: BASIC_SHAPE_STROKE_COLORS,
    basicShapeStrokeWidths: BASIC_SHAPE_STROKE_WIDTHS,
    basicShapeOpacities: BASIC_SHAPE_OPACITIES,
    basicShapeCounts: BASIC_SHAPE_COUNTS,
    basicShapeLayouts: BASIC_SHAPE_LAYOUTS,
    selectedPolkaBackground: POLKA_BACKGROUND_COLORS[0].value,
    selectedPolkaDotColor: DEFAULT_POLKA_PATTERN_CONFIG.dotColor,
    selectedPolkaDotRadius: DEFAULT_POLKA_PATTERN_CONFIG.dotRadius,
    selectedPolkaGap: DEFAULT_POLKA_PATTERN_CONFIG.gap,
    selectedPolkaStyle: DEFAULT_POLKA_PATTERN_CONFIG.style,
    selectedPolkaShape: DEFAULT_POLKA_PATTERN_CONFIG.shape,
    selectedPolkaOpacity: DEFAULT_POLKA_PATTERN_CONFIG.opacity,
    selectedPolkaImageSource: "",
    selectedPolkaImageSourceType: "",
    patternAssetPickerVisible: false,
    patternAssetCategories: createAssetPanelCategories(),
    activePatternAssetCategory: "推荐",
    patternAssetPacks: decorateAssetPanelPacks(getAssetPacks()),
    visiblePatternAssetPacks: filterAssetPanelPacks(decorateAssetPanelPacks(getAssetPacks()), "推荐"),
    activePatternAssetPack: null,
    activePatternAssetPackItems: [],
    paperPatternAssetPickerVisible: false,
    solidPaperCustomizing: false,
    selectedSolidPaperColor: SOLID_PAPER_COLORS[0].value,
    solidPaperCustomPreviewStyle: "",
    polkaPaperCustomizing: false,
    polkaPaperCustomPreviewStyle: "",
    polkaPaperCustomPreviewTiles: [],
    basicShapeCustomizing: false,
    selectedBasicShapeType: "circle",
    selectedBasicShapeFill: "#f4b8c4",
    selectedBasicShapeStroke: "",
    selectedBasicShapeStrokeWidth: 0,
    selectedBasicShapeOpacity: 1,
    selectedBasicShapeCount: 1,
    selectedBasicShapeLayout: "single",
    basicShapeCustomPreviewStyle: "",
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
    backgroundHintVisible: false,
    layerActionsOffset: 0,
    layerActionsPage: 0,
    layerActionsDragging: false,
    layerActionsScrollLeft: 0,
    layerActionsScrollIntoView: "",
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
    scissorHollowOriginal: true,
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
    this.refreshDraftTextFonts(this.draft);
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
      recentDrafts,
      ...getPolkaPatternControlData(this.draft)
    });
    this.trackCreatePageView("default", {
      hasRecentDraft: !!latestDraft,
      recentDraftCount: recentDrafts.length
    });
    this.loadHomeShowcases();
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

  ensureDraftTextFontsLoaded(draft = this.draft) {
    if (!draft || !Array.isArray(draft.layers)) return Promise.resolve(false);
    const fontIds = [];
    draft.layers.forEach((layer) => {
      if (!layer || layer.type !== "text") return;
      const style = layer.style || {};
      const font = resolveTextFont(style.fontId || style.fontLabel || "system");
      if (font && font.packaged && !fontIds.includes(font.id)) {
        fontIds.push(font.id);
      }
    });
    if (!fontIds.length) return Promise.resolve(false);
    return Promise.all(fontIds.map((fontId) => this.ensureTextFontLoaded(fontId)))
      .then((results) => results.some(Boolean));
  },

  refreshDraftTextFonts(draft = this.draft) {
    return this.ensureDraftTextFontsLoaded(draft).then((loaded) => {
      if (loaded && draft === this.draft) this.render();
      return loaded;
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
      this.syncCreateTabBarVisibility();
      return;
    }
    if (this.consumePendingCreateAction()) {
      this.syncCreateTabBarVisibility();
      return;
    }
    if (this.data.isEmptyMode) {
      this.refreshRecentDraftState();
    }
    this.syncCreateTabBarVisibility();
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
    this.trackCreatePageView("draft", { draftId });
    return true;
  },

  consumePendingCreateAction() {
    const action = wx.getStorageSync(PENDING_CREATE_ACTION_STORAGE_KEY);
    if (action) {
      wx.removeStorageSync(PENDING_CREATE_ACTION_STORAGE_KEY);
    }
    if (!action) return false;
    if (action.action === "openPolkaPaperCustom") {
      this.openPolkaPaperCustomFromExternal(action);
      return true;
    }
    if (action.action === "openSolidPaperCustom") {
      this.openSolidPaperCustomFromExternal(action);
      return true;
    }
    if (action.action === "openBasicShapeCustom") {
      this.openBasicShapeCustomFromExternal(action);
      return true;
    }
    return false;
  },

  openPolkaPaperCustomFromExternal(action = {}) {
    if (action.newDraft) {
      this.resetToBlankDraftForEmptyEntry();
    }
    this.enterEditMode();
    const category = "便签";
    const packId = POLKA_PAPER_PACK_ID;
    this.setData({
      activeTool: "asset",
      activeDrawer: "asset",
      selectedLayerId: "",
      selectedLayerType: "",
      activePalette: "",
      textInputVisible: false,
      ...this.getAssetPanelState(category, packId)
    });
    this.refreshAssetPanel(category, packId).then(() => {
      this.beginPolkaPaperCustom();
    });
    track("polka_paper_custom_open", {
      page: "create",
      source: action.source || "assetsTab",
      newDraft: !!action.newDraft,
      ...getDraftAnalyticsParams(this.draft)
    });
  },

  openSolidPaperCustomFromExternal(action = {}) {
    if (action.newDraft) {
      this.resetToBlankDraftForEmptyEntry();
    }
    this.enterEditMode();
    const category = "便签";
    const packId = LOCAL_BACKGROUND_PAPER_PACK_ID;
    this.setData({
      activeTool: "asset",
      activeDrawer: "asset",
      selectedLayerId: "",
      selectedLayerType: "",
      activePalette: "",
      textInputVisible: false,
      ...this.getAssetPanelState(category, packId)
    });
    this.refreshAssetPanel(category, packId).then(() => {
      this.beginSolidPaperCustom();
    });
    track("solid_paper_custom_open", {
      page: "create",
      source: action.source || "assetsTab",
      newDraft: !!action.newDraft,
      ...getDraftAnalyticsParams(this.draft)
    });
  },

  openBasicShapeCustomFromExternal(action = {}) {
    if (action.newDraft) {
      this.resetToBlankDraftForEmptyEntry();
    }
    this.enterEditMode();
    const category = "贴纸";
    const packId = BASIC_SHAPE_PACK_ID;
    this.setData({
      activeTool: "asset",
      activeDrawer: "asset",
      selectedLayerId: "",
      selectedLayerType: "",
      activePalette: "",
      textInputVisible: false,
      ...this.getAssetPanelState(category, packId)
    });
    this.refreshAssetPanel(category, packId).then(() => {
      this.beginBasicShapeCustom();
    });
    track("basic_shape_custom_open", {
      page: "create",
      source: action.source || "assetsTab",
      newDraft: !!action.newDraft,
      ...getDraftAnalyticsParams(this.draft)
    });
  },

  trackCreatePageView(entrySource = "default", extra = {}) {
    this.applyDraftAnalyticsEntry(entrySource, extra);
    track("create_page_view", {
      page: "create",
      entrySource,
      ...extra,
      ...getDraftAnalyticsParams(this.draft)
    });
  },

  applyDraftAnalyticsEntry(entrySource, extra = {}) {
    if (!this.draft) return;
    const analytics = {
      ...(this.draft.analytics || {}),
      entrySource: entrySource || "default"
    };
    if (extra.showcaseEffect) analytics.showcaseEffect = extra.showcaseEffect;
    this.draft.analytics = analytics;
  },

  loadHomeShowcases() {
    if (!wx.request) return;
    const manifestUrl = `${HOME_SHOWCASE_MANIFEST_URL}&t=${Date.now()}`;
    const applyManifest = (data) => {
      const groups = normalizeHomeShowcaseManifest(data);
      if (!groups.length) {
        console.warn("[home-showcases] manifest has no valid groups");
        return;
      }
      this.setData({ homeShowcaseGroups: createHomeShowcaseGroups(groups) });
    };
    const loadByDownload = () => {
      if (!wx.downloadFile || !wx.getFileSystemManager) return;
      wx.downloadFile({
        url: manifestUrl,
        success: (downloadResult) => {
          if (downloadResult.statusCode < 200 || downloadResult.statusCode >= 300) {
            console.warn("[home-showcases] manifest download returned", downloadResult.statusCode);
            return;
          }
          wx.getFileSystemManager().readFile({
            filePath: downloadResult.tempFilePath,
            encoding: "utf8",
            success: (fileResult) => applyManifest(fileResult.data),
            fail: (error) => console.warn("[home-showcases] manifest file read failed", error)
          });
        },
        fail: (error) => console.warn("[home-showcases] manifest download failed", error)
      });
    };
    wx.request({
      // manifest 很小但更新频繁；时间戳可避开 CDN 对旧 404 的负缓存。
      url: manifestUrl,
      method: "GET",
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.warn("[home-showcases] manifest request returned", res.statusCode);
          loadByDownload();
          return;
        }
        applyManifest(res.data);
      },
      fail: (error) => {
        console.warn("[home-showcases] manifest request failed; retrying with download", error);
        loadByDownload();
      }
    });
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
        if (isLaceCenterFrameSource(src)) {
          console.warn("[lace-center] frame image unavailable; upload the compressed asset to", src);
        }
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
    const effectSources = getLayerEffectSources(this.draft.layers || []);
    const layerPatternSources = getLayerPatternSources(this.draft.layers || []);
    const brushSources = getBrushStampSources(this.draft.layers || []);
    const brushDraftSources = this.brushSession
      ? getBrushStampSources([{ strokes: (this.brushSession.strokes || []).concat(this.brushStroke ? [this.brushStroke] : []) }])
      : [];
    const backgroundSource = this.draft.backgroundImage && this.draft.backgroundImage.source;
    const patternImageSource = this.draft.backgroundPatternConfig && this.draft.backgroundPatternConfig.imageSource;
    const sources = Array.from(new Set([backgroundSource, patternImageSource, TORN_PAPER_EDGE_ATLAS, TORN_PAPER_FIBER_FRINGE_ATLAS].concat(layerSources, effectSources, layerPatternSources, brushSources, brushDraftSources).filter(Boolean)));
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

  syncCreateTabBarVisibility() {
    if (this.data.isEditMode || !this.data.isEmptyMode) {
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
    selectedLayerReplaceStyle: "",
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
      scissorHollowOriginal: true,
      scissorBusy: false,
      scissorImageStyle: "",
      straightCutEditing: false,
      straightCutLineStyle: "",
      straightCutStartHandleStyle: "",
      straightCutEndHandleStyle: "",
      keyboardHeight: 0,
      textPanelBottom: 0,
      patternAssetPickerVisible: false,
      activePatternAssetPack: null,
      activePatternAssetPackItems: [],
      ...getPolkaPatternControlData(this.draft)
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
      scissorHollowOriginal: true,
      scissorBusy: false,
      scissorImageStyle: "",
      straightCutEditing: false,
      straightCutLineStyle: "",
      straightCutStartHandleStyle: "",
      straightCutEndHandleStyle: "",
      keyboardHeight: 0,
      textPanelBottom: 0,
      patternAssetPickerVisible: false,
      activePatternAssetPack: null,
      activePatternAssetPackItems: [],
      ...getPolkaPatternControlData(this.draft)
    });
  },

  refreshRecentDraftState() {
    const recentDrafts = this.getRecentDrafts();
    const latestDraft = recentDrafts[0] || null;
    this.setData({
      hasRecentDraft: !!latestDraft,
      recentDraftThumb: latestDraft && latestDraft.thumbnailPath ? latestDraft.thumbnailPath : "",
      recentDrafts
    });
  },

  hasStoredDraft() {
    return !!loadDraft();
  },

  getLatestDraftThumbnail() {
    const latestDraft = loadDraft();
    return latestDraft && latestDraft.thumbnailPath ? latestDraft.thumbnailPath : "";
  },

  getRecentDrafts() {
    return loadRecentDrafts();
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
    this.refreshDraftTextFonts(this.draft);
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
    if (this.data.activePalette !== "effect") return Promise.resolve();
    return new Promise((resolve) => {
      wx.createSelectorQuery()
        .in(this)
        .select(".canvas-stage")
        .boundingClientRect()
        .select(".effect-editor-panel")
        .boundingClientRect()
        .exec((res) => {
          const stageRect = res && res[0];
          const panelRect = res && res[1];
          if (!stageRect || !panelRect || !panelRect.height || this.data.activePalette !== "effect") {
            resolve();
            return;
          }
          const measuredPanelHeight = Math.ceil(panelRect.height);
          const measuredStageHeight = Math.max(260, Math.floor(panelRect.top - stageRect.top - EFFECT_PANEL_GAP));
          const panelChanged = Math.abs(measuredPanelHeight - (this.effectPanelHeight || 0)) >= 2;
          const stageChanged = Math.abs(measuredStageHeight - (this.effectStageHeight || 0)) >= 2;
          if (!panelChanged && !stageChanged) {
            resolve();
            return;
          }
          this.effectPanelHeight = measuredPanelHeight;
          this.effectStageHeight = measuredStageHeight;
          this.setData({ canvasStageStyle: this.getEffectCanvasStageStyle() }, () => {
            this.render().then(resolve);
          });
        });
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
      this.updateSelectedLayerLockControl("", "", false);
      return;
    }
    const style = getLayerLockControlStyle(layer, {
      canvasWidth: this.data.canvasCssWidth || 1,
      canvasHeight: this.data.canvasCssHeight || 1,
      scale: this.renderScale || 1
    });
    const replaceStyle = isReplaceableImageLayer(layer)
      ? getLayerReplaceControlStyle(layer, {
        canvasWidth: this.data.canvasCssWidth || 1,
        canvasHeight: this.data.canvasCssHeight || 1,
        scale: this.renderScale || 1
      })
      : "";
    this.updateSelectedLayerLockControl(style, replaceStyle, !!layer.locked);
  },

  updateSelectedLayerLockControl(style, replaceStyle, locked) {
    if (this.data.selectedLayerLockStyle === style && this.data.selectedLayerReplaceStyle === replaceStyle && this.data.selectedLayerLocked === locked) return;
    this.setData({
      selectedLayerLockStyle: style,
      selectedLayerReplaceStyle: replaceStyle,
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
    track("cut_tool_start", {
      cutStyle: "free",
      ...getDraftMinimalAnalyticsParams(this.draft)
    });
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
        scissorHollowOriginal: true,
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
    if ((layer.sourceWidth && layer.sourceHeight) || isVirtualPaperLayer(layer) || isVirtualBasicShapeLayer(layer)) {
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
      scissorHollowOriginal: true,
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

  toggleScissorHollowOriginal(event) {
    if (this.data.scissorBusy) return;
    const value = event && event.detail && typeof event.detail.value === "boolean"
      ? event.detail.value
      : !this.data.scissorHollowOriginal;
    this.setData({ scissorHollowOriginal: value });
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
      const remainder = this.data.scissorHollowOriginal
        ? await this.createScissorRemainderImage(layer, strokes)
        : null;
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
      if (remainder) {
        layer.source = remainder.path;
        layer.sourceWidth = remainder.width;
        layer.sourceHeight = remainder.height;
        layer.crop = null;
        this.canvasImageCache = {};
      }
      this.draft.layers = normalizeLayerOrder(this.draft.layers);
      this.scissorSession = null;
      this.scissorStroke = null;
      this.resetScissorCanvasContext();
      this.setData({
        scissorEditing: false,
        scissorHasMask: false,
        scissorHollowOriginal: true,
        scissorBusy: false,
        scissorImageStyle: "",
        selectedLayerId: cutLayer.id,
        selectedLayerType: cutLayer.type,
        activeTool: "",
        activePalette: ""
      });
      this.markDirty();
      this.resetCanvasContext();
      track("cut_tool_confirm", {
        cutStyle: "free",
        ...getDraftMinimalAnalyticsParams(this.draft)
      });
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

  async createScissorRemainderImage(layer, strokes) {
    await this.ensureScissorCanvasContext();
    if (!this.scissorCanvasNode || !this.scissorCtx) throw new Error("missing_scissor_canvas");
    const sourceImage = await this.loadScissorCanvasImage(layer.source);
    if (!sourceImage) throw new Error("missing_source_image");
    const sourceCrop = getLayerSourceCrop(layer);
    const naturalScale = Math.max(sourceCrop.width / layer.width, sourceCrop.height / layer.height);
    let outputScale = Math.min(2.5, Math.max(1, naturalScale));
    const maxSide = Math.max(layer.width, layer.height) * outputScale;
    if (maxSide > SCISSOR_MAX_OUTPUT_SIZE) outputScale *= SCISSOR_MAX_OUTPUT_SIZE / maxSide;
    const outputWidth = Math.max(1, Math.round(layer.width * outputScale));
    const outputHeight = Math.max(1, Math.round(layer.height * outputScale));
    this.scissorCanvasNode.width = outputWidth;
    this.scissorCanvasNode.height = outputHeight;
    const ctx = this.scissorCtx;
    if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, outputWidth, outputHeight);
    ctx.drawImage(sourceImage, sourceCrop.x, sourceCrop.y, sourceCrop.width, sourceCrop.height, 0, 0, outputWidth, outputHeight);
    applyScissorRemainderMask(ctx, outputWidth, outputHeight, strokes, outputScale);
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
    if (!layer.source && (isVirtualPaperLayer(layer) || isVirtualBasicShapeLayer(layer))) return true;
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
    if (!layer.source && (isVirtualPaperLayer(layer) || isVirtualBasicShapeLayer(layer))) return true;
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
    if (!layer.source && (isVirtualPaperLayer(layer) || isVirtualBasicShapeLayer(layer))) {
      return this.createVirtualLayerSourceImage(layer);
    }
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

  async createVirtualLayerSourceImage(layer) {
    const localBounds = { x: 0, y: 0, width: layer.width, height: layer.height };
    let outputScale = 2;
    const maxSide = Math.max(layer.width, layer.height) * outputScale;
    if (maxSide > SCISSOR_MAX_OUTPUT_SIZE) {
      outputScale *= SCISSOR_MAX_OUTPUT_SIZE / maxSide;
    }
    const outputWidth = Math.max(1, Math.round(layer.width * outputScale));
    const outputHeight = Math.max(1, Math.round(layer.height * outputScale));
    const patternConfig = layer.patternConfig || layer.style && layer.style.patternConfig;
    if (patternConfig && patternConfig.shape === "image" && patternConfig.imageSource) {
      await this.loadCanvasImage(patternConfig.imageSource).catch(() => null);
    }
    this.scissorCanvasNode.width = outputWidth;
    this.scissorCanvasNode.height = outputHeight;
    const ctx = this.scissorCtx;
    if (ctx.setTransform) ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
    ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.globalCompositeOperation = "source-over";
    drawLayer(ctx, {
      ...JSON.parse(JSON.stringify(layer)),
      x: 0,
      y: 0,
      rotation: 0,
      shadow: false
    }, {
      imageCache: this.canvasImageCache || {},
      disableLayerShadow: true
    });
    if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    if (layer.tear) {
      ctx.globalCompositeOperation = "destination-in";
      if (polygons.length) {
        polygons.forEach((polygon) => {
          drawTornClipPolygonMaskPath(ctx, layer, polygon, outputScale, localBounds);
          ctx.fill();
        });
      } else if (clipShape) {
        drawTornShapeMaskPath(ctx, layer, clipShape, outputWidth, outputHeight);
        ctx.fill();
      } else {
        drawTearMaskPath(ctx, outputWidth, outputHeight);
        ctx.fill();
      }
    } else if (polygons.length && !options.skipPolygons) {
      polygons.forEach((polygon) => {
        applyPolygonAlphaMask(ctx, outputWidth, outputHeight, polygon, outputScale, localBounds);
      });
    } else if (clipShape) {
      ctx.globalCompositeOperation = "destination-in";
      drawEmbossMaskPath(ctx, clipShape, 0, 0, outputWidth, outputHeight);
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
    this.refreshDraftTextFonts(this.draft);
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

  enterBlankCanvas() {
    if (!this.data.isEmptyMode) return;
    this.resetToBlankDraftForEmptyEntry();
    this.trackCreatePageView("blank_canvas", { source: "home_blank_canvas_entry" });
    this.enterEditMode();
    setTimeout(() => this.render(), 0);
  },

  async choosePhotoForShowcase(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset || {};
    if (dataset.backgroundPresetId) {
      this.applyHomeBackgroundPreset(dataset.backgroundPresetId);
      return;
    }
    const effect = dataset.effect || getHomeShowcaseEffect(dataset.showcaseId);
    if (effect === "creative-tear-paper") {
      const confirmed = await this.confirmCreativeTearPaperDailyLimit();
      if (!confirmed) return;
      this.pendingCreativeTearPaperConfirmed = true;
    }
    this.pendingShowcaseEffect = effect;
    this.pendingEntrySource = "home_showcase";
    this.choosePhotoBySource("album");
  },

  applyHomeBackgroundPreset(backgroundId) {
    const option = BACKGROUND_OPTIONS.find((item) => item.id === backgroundId);
    if (!option) {
      showError("背景应用失败");
      return;
    }
    if (this.data.isEmptyMode) {
      this.resetToBlankDraftForEmptyEntry();
    }
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
    this.draft.backgroundPatternConfig = option.patternConfig
      ? normalizePolkaPatternConfig(option.patternConfig)
      : null;
    this.setData({
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      activeBackgroundCategory: option.category || "波点",
      visibleBackgrounds: filterBackgroundOptions(BACKGROUND_OPTIONS, option.category || "波点"),
      ...getPolkaPatternControlData(this.draft)
    });
    this.trackCreatePageView("home_background_preset", {
      showcaseEffect: "background_preset",
      backgroundId: option.id,
      backgroundCategory: option.category || ""
    });
    const shouldShowBackgroundHint = !wx.getStorageSync(BACKGROUND_HINT_SEEN_KEY);
    this.markDirty();
    this.render();
    if (shouldShowBackgroundHint) {
      this.setData({ backgroundHintVisible: true });
    }
    track("home_background_preset_apply", {
      page: "create",
      backgroundId: option.id,
      backgroundCategory: option.category || "",
      ...getDraftAnalyticsParams(this.draft)
    });
  },

  choosePhotoBySource(source = "album") {
    const shouldStartBlank = this.data.isEmptyMode;
    const pendingAfterPhoto = this.pendingAfterPhoto;
    const pendingShowcaseEffect = this.pendingShowcaseEffect;
    const entrySource = this.pendingEntrySource || (shouldStartBlank ? "photo_choose" : "");
    const pendingCollageSlotId = this.pendingCollageSlotId || "";
    const pendingImageReplaceLayerId = this.pendingImageReplaceLayerId || "";
    // 相册支持批量导入；拍照及需要紧接着进入剪刀编辑的场景只能选择一张。
    const imageCount = source === "album" && pendingAfterPhoto !== "scissorFree" && !pendingShowcaseEffect && !pendingCollageSlotId && !pendingImageReplaceLayerId ? 9 : 1;
    track("photo_choose_start", {
      page: "create",
      source,
      entrySource,
      showcaseEffect: entrySource === "home_showcase" ? pendingShowcaseEffect : "",
      fromEmpty: shouldStartBlank
    });
    if (shouldStartBlank) {
      this.resetToBlankDraftForEmptyEntry();
      this.trackCreatePageView(entrySource || "photo_choose", {
        source,
        fromEmpty: true,
        showcaseEffect: entrySource === "home_showcase" ? pendingShowcaseEffect : ""
      });
    }
    this.enterEditMode();
    wx.chooseMedia({
      count: imageCount,
      mediaType: ["image"],
      sourceType: [source],
      success: (res) => {
        const files = (res.tempFiles || []).filter((file) => file && file.tempFilePath);
          if (!files.length) {
            if (pendingAfterPhoto) this.pendingAfterPhoto = "";
            if (pendingShowcaseEffect) this.pendingShowcaseEffect = "";
            if (pendingShowcaseEffect === "creative-tear-paper") this.pendingCreativeTearPaperConfirmed = false;
            if (this.pendingEntrySource === entrySource) this.pendingEntrySource = "";
            if (pendingCollageSlotId) this.pendingCollageSlotId = "";
          if (pendingImageReplaceLayerId) this.pendingImageReplaceLayerId = "";
          return;
        }
        Promise.all(files.map((file) => new Promise((resolve) => {
          wx.getImageInfo({
            src: file.tempFilePath,
            success: (info) => {
              // 临时文件可立即用于画布，不能等待 saveFile 完成后才展示图片。
              // 持久化在图层入画后后台完成，避免大图导入时出现长时间空白。
              const importResult = { file, info, imageSource: file.tempFilePath, layer: null, persistedSource: "" };
              importResult.syncPersistedSource = () => {
                const layer = importResult.layer;
                const imageSource = importResult.persistedSource;
                if (!layer || !imageSource || imageSource === file.tempFilePath) return;
                layer.persistedSource = imageSource;
                if (layer.source === file.tempFilePath) {
                  layer.source = imageSource;
                  delete this.canvasImageCache[file.tempFilePath];
                  this.markDirty();
                  this.render();
                }
                if (layer.style && layer.style.textureEffect && layer.style.textureEffect.originalSource === file.tempFilePath) {
                  layer.style.textureEffect.originalSource = imageSource;
                  this.markDirty();
                }
              };
              persistTempFile(file.tempFilePath)
                .then((imageSource) => ({ imageSource: imageSource || file.tempFilePath }))
                .catch(() => ({ imageSource: file.tempFilePath }))
                .then((persistResult) => {
                  importResult.persistedSource = persistResult.imageSource;
                  importResult.syncPersistedSource();
                });
              resolve(importResult);
            },
            fail: () => resolve(null)
          });
        }))).then((results) => {
          const importedImages = results.filter(Boolean);
          if (!importedImages.length) {
            if (pendingAfterPhoto) this.pendingAfterPhoto = "";
            if (pendingShowcaseEffect) this.pendingShowcaseEffect = "";
            track("photo_choose_fail", {
              page: "create",
              source,
              entrySource,
              showcaseEffect: entrySource === "home_showcase" ? pendingShowcaseEffect : "",
              errorCode: "get_image_info_failed"
            });
            if (this.pendingEntrySource === entrySource) this.pendingEntrySource = "";
            showError("图片添加失败");
            return;
          }
          const layers = importedImages.map((importedImage) => {
            const { file, info, imageSource } = importedImage;
            const layer = pendingCollageSlotId
              ? this.fillCollageSlot(pendingCollageSlotId, imageSource, info)
              : pendingImageReplaceLayerId
                ? this.replaceImageLayer(pendingImageReplaceLayerId, imageSource, info)
                : createImageLayer(imageSource, info, this.draft);
            if (!layer) return null;
            // saveFile 的异步结果会回写至这里，确保后续自动草稿不依赖临时路径。
            layer.persistedSource = imageSource;
            importedImage.layer = layer;
            importedImage.syncPersistedSource();
            if (!pendingCollageSlotId && !pendingImageReplaceLayerId) this.draft.layers.push(layer);
            checkImportedImageContent(this, file.tempFilePath, file.size, layer.id);
            track("photo_choose_success", {
              page: "create",
              source,
              entrySource,
              showcaseEffect: entrySource === "home_showcase" ? pendingShowcaseEffect : "",
              width: info.width || 0,
              height: info.height || 0,
              fileSize: file.size || 0,
              ...getDraftAnalyticsParams(this.draft)
            });
            return layer;
          });
          const validLayers = layers.filter(Boolean);
          if (!validLayers.length) return;
          this.pendingCollageSlotId = "";
          this.pendingImageReplaceLayerId = "";
          this.draft.layers = normalizeLayerOrder(this.draft.layers);
          this.markDirty();
          if (pendingAfterPhoto === "scissorFree") {
            this.pendingAfterPhoto = "";
            setTimeout(() => this.beginScissorCut(validLayers[0]), 0);
            return;
          }
          if (pendingShowcaseEffect) {
            this.pendingShowcaseEffect = "";
            if (this.pendingEntrySource === entrySource) this.pendingEntrySource = "";
            this.applyHomeShowcaseEffect(validLayers[0], pendingShowcaseEffect);
            return;
          }
          if (this.pendingEntrySource === entrySource) this.pendingEntrySource = "";
          this.closeAfterAddingLayer();
          this.render();
        });
      },
      fail: () => {
        if (pendingAfterPhoto) this.pendingAfterPhoto = "";
        if (pendingShowcaseEffect) this.pendingShowcaseEffect = "";
        if (pendingShowcaseEffect === "creative-tear-paper") this.pendingCreativeTearPaperConfirmed = false;
        if (this.pendingEntrySource === entrySource) this.pendingEntrySource = "";
        if (pendingCollageSlotId) this.pendingCollageSlotId = "";
        if (pendingImageReplaceLayerId) this.pendingImageReplaceLayerId = "";
        track("photo_choose_fail", {
          page: "create",
          source,
          entrySource,
          showcaseEffect: entrySource === "home_showcase" ? pendingShowcaseEffect : "",
          errorCode: "choose_media_failed"
        });
      }
    });
  },

  applyHomeShowcaseEffect(layer, effect) {
    if (!layer || !effect) {
      this.closeAfterAddingLayer();
      this.render();
      return;
    }
    const opensEffectEditor = !["emboss-circle", "emboss-stamp"].includes(effect);
    const applyEffect = () => {
      if (effect === "creative-tear-paper") {
        this.startCreativeTearPaperGeneration(layer, { skipConfirm: this.pendingCreativeTearPaperConfirmed });
        this.pendingCreativeTearPaperConfirmed = false;
        return;
      }
      if (["screen-print", "matisse-cutout", "pixel-cross-stitch", "vintage-botanical"].includes(effect)) {
        this.selectTextureEffect({ currentTarget: { dataset: { texture: effect } } });
        return;
      }
      if (effect === "lace-center" || effect === "foil-center") {
        this.selectHandmadeEffect({ currentTarget: { dataset: { effect } } });
        return;
      }
      if (effect === "emboss-circle" || effect === "emboss-stamp") {
        this.beginEmbossEdit(effect === "emboss-stamp" ? "stamp" : "circle");
        return;
      }
      this.closeAfterAddingLayer();
      this.render();
    };
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      selectedCollageSlot: isCollageSlot(layer),
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      selectedHandmadeEffect: getHandmadeEffectKey(layer),
      selectedTextureEffect: getTextureEffectKey(layer),
      effectAdjusting: "",
      effectAdjustingLabel: "",
      textInputVisible: false,
      ratioPanelVisible: false,
      canvasStageStyle: ""
    }, () => {
      // 先让原图在常规画布完成首帧，避免面板测量和效果生成抢占首屏显示。
      this.render().then(() => {
        setTimeout(() => {
          if (!opensEffectEditor) {
            applyEffect();
            return;
          }
          this.effectStageHeight = 0;
          this.effectPanelHeight = 0;
          this.setData({
            activeTool: "effect",
            activePalette: "effect",
            canvasStageStyle: this.getEffectCanvasStageStyle()
          }, () => {
            this.refreshEffectCanvasLayout().then(applyEffect);
          });
        }, 16);
      });
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
      itemList: ["从相册选择图片", "拍照", "拼图布局"],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.choosePhotoBySource("album");
          return;
        }
        if (res.tapIndex === 1) {
          this.choosePhotoBySource("camera");
          return;
        }
        if (res.tapIndex === 2) {
          this.setData({ activeTool: "collage", activeDrawer: "collage" });
        }
      }
    });
  },

  openToolPanel(event) {
    if (this.data.backgroundHintVisible) {
      this.dismissBackgroundHint();
    }
    const tool = event.currentTarget.dataset.tool || "";
    track("tool_panel_open", {
      page: "create",
      tool,
      ...getDraftAnalyticsParams(this.draft)
    });
    this.scissorPickPending = false;
    this.straightCutPickPending = false;
    this.subjectCutPickPending = false;
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
    const isDrawer = ["asset", "background", "collage"].includes(tool);
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
    this.subjectCutPickPending = false;
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

  applyCollagePreset(event) {
    const slots = getCollageSlots(event.currentTarget.dataset.preset, this.draft);
    if (!slots.length) return;
    const layoutId = `collage-${Date.now()}`;
    this.draft.layers = this.draft.layers.filter((layer) => !isCollageSlot(layer));
    slots.forEach((rect, index) => this.draft.layers.push(createCollageSlotLayer(rect, layoutId, index, this.draft)));
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.markDirty();
    this.setData({ activeTool: "", activeDrawer: "", selectedLayerId: "", selectedLayerType: "" });
    this.render();
  },

  fillCollageSlot(slotId, source, imageInfo) {
    const layer = this.getLayerById(slotId);
    if (!isCollageSlot(layer)) return null;
    layer.source = source;
    layer.sourceWidth = imageInfo.width;
    layer.sourceHeight = imageInfo.height;
    layer.style = {
      ...(layer.style || {}),
      collageSlot: {
        ...(layer.style && layer.style.collageSlot || {}),
        imageScale: 1,
        imageOffsetX: 0,
        imageOffsetY: 0
      }
    };
    return layer;
  },

  replaceImageLayer(layerId, source, imageInfo) {
    const layer = this.getLayerById(layerId);
    if (!isReplaceableImageLayer(layer)) return null;
    if (!this.pendingImageReplacementSnapshots) this.pendingImageReplacementSnapshots = new Map();
    this.pendingImageReplacementSnapshots.set(layer.id, JSON.parse(JSON.stringify(layer)));
    const defaultLayer = createImageLayer(source, imageInfo, this.draft);
    const keepsCenterFrameBox = hasCenterFrameHandmadeEffect(layer);
    if (!keepsCenterFrameBox) {
      layer.x = defaultLayer.x;
      layer.y = defaultLayer.y;
      layer.width = defaultLayer.width;
      layer.height = defaultLayer.height;
      layer.rotation = defaultLayer.rotation;
      layer.scale = defaultLayer.scale;
      layer.opacity = defaultLayer.opacity;
    }
    layer.source = defaultLayer.source;
    layer.sourceWidth = defaultLayer.sourceWidth;
    layer.sourceHeight = defaultLayer.sourceHeight;
    delete layer.crop;
    if (keepsCenterFrameBox) makeLayerSquareAroundCenter(layer);
    return layer;
  },

  collapsePanelsToMainToolbar() {
    const closesEffectEditor = this.data.activePalette === "effect";
    this.scissorPickPending = false;
    this.straightCutPickPending = false;
    this.subjectCutPickPending = false;
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
      activeAssetPackItems: [],
      patternAssetPickerVisible: false,
      paperPatternAssetPickerVisible: false,
      basicShapeCustomizing: false,
      solidPaperCustomizing: false,
      polkaPaperCustomizing: false,
      activePatternAssetPack: null,
      activePatternAssetPackItems: []
    });
  },

  getAssetPanelState(category, packId, packs, pack) {
    const assetPacks = decorateAssetPanelPacks(createAssetPanelPacks(packs));
    const activeCategory = category || "推荐";
    const activeAssetPack = packId ? decorateAssetPanelPack(prepareCreateAssetPack(pack || getCreateAssetPack(packId))) : null;
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
      packId && ![BASIC_SHAPE_PACK_ID, POLKA_PAPER_PACK_ID, LOCAL_BACKGROUND_PAPER_PACK_ID].includes(packId)
        ? getResolvedAssetPack(packId)
        : Promise.resolve(getCreateAssetPack(packId))
    ]).then(([packs, pack]) => {
      if (this.assetPanelRequestId !== requestId) return;
      this.setData(this.getAssetPanelState(category, packId, packs, pack));
    });
  },

  selectAssetCategory(event) {
    const category = event.currentTarget.dataset.category || "推荐";
    if (category === this.data.activeAssetCategory && !this.data.activeAssetPack) return;
    track("asset_category_select", { page: "create", category, source: "create" });
    this.setData(this.getAssetPanelState(category, ""));
    this.refreshAssetPanel(category, "");
  },

  openAssetPack(event) {
    const packId = event.currentTarget.dataset.pack;
    if (!packId) return;
    track("asset_pack_open", {
      page: "create",
      packId,
      category: this.data.activeAssetCategory || "推荐",
      source: "create"
    });
    this.setData({
      ...this.getAssetPanelState(this.data.activeAssetCategory || "推荐", packId),
      paperPatternAssetPickerVisible: false,
      basicShapeCustomizing: false,
      solidPaperCustomizing: false,
      polkaPaperCustomizing: false,
      ...getPolkaPaperControlData(this.getSelectedPolkaPaperLayer())
    });
    this.refreshAssetPanel(this.data.activeAssetCategory || "推荐", packId);
  },

  backToAssetPacks() {
    this.setData({
      ...this.getAssetPanelState(this.data.activeAssetCategory || "推荐", ""),
      paperPatternAssetPickerVisible: false,
      basicShapeCustomizing: false,
      solidPaperCustomizing: false,
      polkaPaperCustomizing: false
    });
    this.refreshAssetPanel(this.data.activeAssetCategory || "推荐", "");
  },

  selectBackgroundCategory(event) {
    const category = event.currentTarget.dataset.category || "纸感";
    this.setData({
      activeBackgroundCategory: category,
      visibleBackgrounds: filterBackgroundOptions(BACKGROUND_OPTIONS, category),
      patternAssetPickerVisible: false,
      ...getPolkaPatternControlData(this.draft)
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
    this.draft.backgroundPatternConfig = option.patternConfig
      ? normalizePolkaPatternConfig(option.patternConfig)
      : null;
    this.setData({
      activeBackgroundCategory: option.category,
      visibleBackgrounds: filterBackgroundOptions(BACKGROUND_OPTIONS, option.category),
      ...getPolkaPatternControlData(this.draft)
    });
    this.markDirty();
    track("background_apply", {
      page: "create",
      backgroundId: option.id,
      backgroundCategory: option.category || "",
      ...getDraftAnalyticsParams(this.draft)
    });
    this.render();
  },

  setPolkaBackgroundColor(event) {
    this.updatePolkaBackground({ background: event.currentTarget.dataset.color });
  },

  setPolkaDotColor(event) {
    this.updatePolkaBackground({ dotColor: event.currentTarget.dataset.color });
  },

  setPolkaDotSize(event) {
    this.updatePolkaBackground({ dotRadius: Number(event.currentTarget.dataset.radius) });
  },

  setPolkaDensity(event) {
    this.updatePolkaBackground({ gap: Number(event.currentTarget.dataset.gap) });
  },

  setPolkaStyle(event) {
    this.updatePolkaBackground({ style: event.currentTarget.dataset.style });
  },

  setPolkaShape(event) {
    this.updatePolkaBackground({
      shape: event.currentTarget.dataset.shape,
      imageSource: "",
      imageWidth: 0,
      imageHeight: 0,
      imageSourceType: "",
      assetId: "",
      packId: ""
    });
  },

  setPolkaOpacity(event) {
    this.updatePolkaBackground({ opacity: Number(event.currentTarget.dataset.opacity) });
  },

  choosePolkaPatternImage() {
    if (!wx.chooseMedia) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        const tempFilePath = file && file.tempFilePath;
        if (!tempFilePath) return;
        Promise.all([
          persistTempFile(tempFilePath),
          getImageInfoAsync(tempFilePath).catch(() => null)
        ]).then(([savedPath, info]) => {
          this.updatePolkaBackground({
            shape: "image",
            imageSourceType: "upload",
            imageSource: savedPath || tempFilePath,
            imageWidth: info && info.width ? info.width : 0,
            imageHeight: info && info.height ? info.height : 0,
            assetId: "",
            packId: ""
          });
        });
      }
    });
  },

  openPolkaPatternAssetPicker() {
    this.setData({
      patternAssetPickerVisible: true,
      ...this.getPatternAssetPanelState(this.data.activePatternAssetCategory || "推荐", "")
    });
    this.refreshPatternAssetPanel(this.data.activePatternAssetCategory || "推荐", "");
  },

  closePolkaPatternAssetPicker() {
    this.setData({
      patternAssetPickerVisible: false,
      activePatternAssetPack: null,
      activePatternAssetPackItems: []
    });
  },

  getPatternAssetPanelState(category, packId, packs, pack) {
    const patternAssetPacks = decorateAssetPanelPacks(packs || getAssetPacks());
    const activeCategory = category || "推荐";
    const activePatternAssetPack = packId ? decorateAssetPanelPack(pack || getAssetPack(packId)) : null;
    return {
      patternAssetPacks,
      activePatternAssetCategory: activeCategory,
      visiblePatternAssetPacks: filterAssetPanelPacks(patternAssetPacks, activeCategory),
      activePatternAssetPack,
      activePatternAssetPackItems: activePatternAssetPack ? activePatternAssetPack.items : []
    };
  },

  refreshPatternAssetPanel(category = this.data.activePatternAssetCategory || "推荐", packId = this.data.activePatternAssetPack && this.data.activePatternAssetPack.id || "") {
    const requestId = Date.now();
    this.patternAssetPanelRequestId = requestId;
    return Promise.all([
      getResolvedAssetPacks(),
      packId && packId !== POLKA_PAPER_PACK_ID ? getResolvedAssetPack(packId) : Promise.resolve(getCreateAssetPack(packId))
    ]).then(([packs, pack]) => {
      if (this.patternAssetPanelRequestId !== requestId) return;
      this.setData(this.getPatternAssetPanelState(category, packId, packs, pack));
    });
  },

  selectPatternAssetCategory(event) {
    const category = event.currentTarget.dataset.category || "推荐";
    this.setData(this.getPatternAssetPanelState(category, ""));
    this.refreshPatternAssetPanel(category, "");
  },

  openPatternAssetPack(event) {
    const packId = event.currentTarget.dataset.pack;
    if (!packId) return;
    this.setData(this.getPatternAssetPanelState(this.data.activePatternAssetCategory || "推荐", packId));
    this.refreshPatternAssetPanel(this.data.activePatternAssetCategory || "推荐", packId);
  },

  backToPatternAssetPacks() {
    this.setData(this.getPatternAssetPanelState(this.data.activePatternAssetCategory || "推荐", ""));
    this.refreshPatternAssetPanel(this.data.activePatternAssetCategory || "推荐", "");
  },

  applyPatternAsset(event) {
    const assetId = event.currentTarget.dataset.assetId;
    if (!assetId) return;
    getResolvedAssetItem(assetId).then((asset) => {
      if (!asset || !asset.source) {
        showError("素材加载失败");
        return;
      }
      this.updatePolkaBackground({
        shape: "image",
        imageSourceType: "asset",
        imageSource: asset.source,
        imageWidth: asset.width || 0,
        imageHeight: asset.height || 0,
        assetId: asset.id || assetId,
        packId: asset.packId || ""
      });
      this.setData({ patternAssetPickerVisible: false });
      track("background_pattern_asset_apply", {
        page: "create",
        assetId: asset.id || assetId,
        packId: asset.packId || "",
        ...getDraftAnalyticsParams(this.draft)
      });
    });
  },

  updatePolkaBackground(patch = {}) {
    this.enterEditMode();
    const currentConfig = this.draft.backgroundPattern === "polka"
      ? normalizePolkaPatternConfig(this.draft.backgroundPatternConfig)
      : normalizePolkaPatternConfig(DEFAULT_POLKA_PATTERN_CONFIG);
    const nextConfig = normalizePolkaPatternConfig({
      ...currentConfig,
      dotColor: patch.dotColor || currentConfig.dotColor,
      dotRadius: patch.dotRadius == null ? currentConfig.dotRadius : patch.dotRadius,
      gap: patch.gap == null ? currentConfig.gap : patch.gap,
      opacity: patch.opacity == null ? currentConfig.opacity : patch.opacity,
      style: patch.style || currentConfig.style,
      shape: patch.shape || currentConfig.shape,
      imageSource: patch.imageSource == null ? currentConfig.imageSource : patch.imageSource,
      imageWidth: patch.imageWidth == null ? currentConfig.imageWidth : patch.imageWidth,
      imageHeight: patch.imageHeight == null ? currentConfig.imageHeight : patch.imageHeight,
      imageSourceType: patch.imageSourceType == null ? currentConfig.imageSourceType : patch.imageSourceType,
      assetId: patch.assetId == null ? currentConfig.assetId : patch.assetId,
      packId: patch.packId == null ? currentConfig.packId : patch.packId
    });
    this.draft.background = patch.background || this.draft.background || POLKA_BACKGROUND_COLORS[0].value;
    this.draft.backgroundImage = null;
    this.draft.backgroundPattern = "polka";
    this.draft.backgroundPatternConfig = nextConfig;
    this.setData({
      activeBackgroundCategory: "波点",
      visibleBackgrounds: filterBackgroundOptions(BACKGROUND_OPTIONS, "波点"),
      ...getPolkaPatternControlData(this.draft)
    });
    this.markDirty();
    this.render();
  },

  closePalette() {
    this.setData({
      activeTool: "",
      activePalette: "",
      layerActionsScrollLeft: 0
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
    const asset = getCreateAssetItem(assetId);
    if (!asset || (!asset.source && !asset.cloudFileId)) {
      if (asset && asset.layer) {
        this.addAssetItemToDraft(asset);
        this.keepAssetDrawerAfterAddingLayer(this.data.activeAssetPack);
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
      this.keepAssetDrawerAfterAddingLayer(this.data.activeAssetPack);
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

  applyPolkaPaperPreset(event) {
    const assetId = event.currentTarget.dataset.assetId;
    if (!assetId) return;
    const asset = getCreateAssetItem(assetId);
    const layer = this.addAssetItemToDraft(asset);
    if (!layer) {
      showError("素材添加失败");
      return;
    }
    this.keepAssetDrawerAfterAddingLayer(this.data.activeAssetPack);
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      ...getPolkaPaperControlData(layer)
    });
    this.markDirty();
    track("polka_paper_add", {
      page: "create",
      assetId,
      packId: asset.packId || POLKA_PAPER_PACK_ID,
      ...getDraftAnalyticsParams(this.draft)
    });
    this.render();
  },

  applyBasicShapePreset(event) {
    const assetId = event.currentTarget.dataset.assetId;
    if (!assetId) return;
    const asset = getCreateAssetItem(assetId);
    const layer = this.addAssetItemToDraft(asset);
    if (!layer) {
      showError("素材添加失败");
      return;
    }
    this.keepAssetDrawerAfterAddingLayer(this.data.activeAssetPack);
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type
    });
    this.markDirty();
    track("basic_shape_add", {
      page: "create",
      assetId,
      packId: asset.packId || BASIC_SHAPE_PACK_ID,
      ...getDraftAnalyticsParams(this.draft)
    });
    this.render();
  },

  beginBasicShapeCustom() {
    const config = this.getBasicShapeCustomConfig();
    this.setData({
      basicShapeCustomizing: true,
      solidPaperCustomizing: false,
      polkaPaperCustomizing: false,
      paperPatternAssetPickerVisible: false,
      basicShapeCustomPreviewStyle: createBasicShapePreviewStyle(config)
    });
  },

  closeBasicShapeCustom() {
    this.setData({ basicShapeCustomizing: false });
  },

  setBasicShapeType(event) {
    this.updateBasicShapeCustom({ shape: event.currentTarget.dataset.shape });
  },

  setBasicShapeFill(event) {
    this.updateBasicShapeCustom({ fillColor: event.currentTarget.dataset.color });
  },

  setBasicShapeStroke(event) {
    const color = event.currentTarget.dataset.color;
    this.updateBasicShapeCustom({
      strokeColor: color,
      ...(color && !this.data.selectedBasicShapeStrokeWidth ? { strokeWidth: 3 } : {}),
      ...(!color ? { strokeWidth: 0 } : {})
    });
  },

  setBasicShapeStrokeWidth(event) {
    this.updateBasicShapeCustom({ strokeWidth: Number(event.currentTarget.dataset.width) });
  },

  setBasicShapeOpacity(event) {
    this.updateBasicShapeCustom({ opacity: Number(event.currentTarget.dataset.opacity) });
  },

  setBasicShapeCount(event) {
    this.updateBasicShapeCustom({ count: Number(event.currentTarget.dataset.count) });
  },

  setBasicShapeLayout(event) {
    this.updateBasicShapeCustom({ layout: event.currentTarget.dataset.layout });
  },

  updateBasicShapeCustom(patch = {}) {
    const next = normalizeBasicShapeConfig({
      ...this.getBasicShapeCustomConfig(),
      ...patch
    });
    this.setData({
      selectedBasicShapeType: next.shape,
      selectedBasicShapeFill: next.fillColor,
      selectedBasicShapeStroke: next.strokeColor,
      selectedBasicShapeStrokeWidth: next.strokeWidth,
      selectedBasicShapeOpacity: next.opacity,
      selectedBasicShapeCount: next.count,
      selectedBasicShapeLayout: next.layout,
      basicShapeCustomPreviewStyle: createBasicShapePreviewStyle(next)
    });
  },

  getBasicShapeCustomConfig() {
    return normalizeBasicShapeConfig({
      shape: this.data.selectedBasicShapeType,
      fillColor: this.data.selectedBasicShapeFill,
      strokeColor: this.data.selectedBasicShapeStroke,
      strokeWidth: this.data.selectedBasicShapeStrokeWidth,
      opacity: this.data.selectedBasicShapeOpacity,
      count: this.data.selectedBasicShapeCount,
      layout: this.data.selectedBasicShapeLayout
    });
  },

  addCustomBasicShape() {
    const asset = createBasicShapeAssetFromConfig({
      id: `basic-shape-custom-${Date.now()}`,
      name: "自定义图形",
      config: this.getBasicShapeCustomConfig()
    });
    const layer = this.addAssetItemToDraft(asset);
    if (!layer) {
      showError("素材添加失败");
      return;
    }
    this.keepAssetDrawerAfterAddingLayer(this.data.activeAssetPack);
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      basicShapeCustomizing: false
    });
    this.markDirty();
    track("basic_shape_custom_add", {
      page: "create",
      ...getDraftAnalyticsParams(this.draft)
    });
    this.render();
  },

  beginSolidPaperCustom() {
    const color = this.data.selectedSolidPaperColor || SOLID_PAPER_COLORS[0].value;
    this.setData({
      solidPaperCustomizing: true,
      polkaPaperCustomizing: false,
      paperPatternAssetPickerVisible: false,
      selectedSolidPaperColor: color,
      solidPaperCustomPreviewStyle: createSolidPaperCustomPreviewStyle(color)
    });
  },

  closeSolidPaperCustom() {
    this.setData({
      solidPaperCustomizing: false,
      paperPatternAssetPickerVisible: false,
      activePatternAssetPack: null,
      activePatternAssetPackItems: []
    });
  },

  setSolidPaperColor(event) {
    const color = event.currentTarget.dataset.color || SOLID_PAPER_COLORS[0].value;
    this.setData({
      selectedSolidPaperColor: color,
      solidPaperCustomPreviewStyle: createSolidPaperCustomPreviewStyle(color)
    });
  },

  addCustomSolidPaper() {
    const color = this.data.selectedSolidPaperColor || SOLID_PAPER_COLORS[0].value;
    const asset = createSolidPaperAssetFromColor(color);
    const layer = this.addAssetItemToDraft(asset);
    if (!layer) {
      showError("素材添加失败");
      return;
    }
    this.keepAssetDrawerAfterAddingLayer(this.data.activeAssetPack);
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      solidPaperCustomizing: false
    });
    this.markDirty();
    track("solid_paper_custom_add", {
      page: "create",
      ...getDraftAnalyticsParams(this.draft)
    });
    this.render();
  },

  beginPolkaPaperCustom() {
    const preset = normalizePolkaPatternConfig({
      ...DEFAULT_POLKA_PATTERN_CONFIG,
      dotRadius: 9,
      gap: 48,
      opacity: 0.64,
      offset: "grid"
    });
    const preview = createPolkaPaperCustomPreviewData(POLKA_BACKGROUND_COLORS[0].value, preset);
    this.setData({
      polkaPaperCustomizing: true,
      paperPatternAssetPickerVisible: false,
      ...getPolkaPaperControlData({
        type: "paper",
        style: {
          color: POLKA_BACKGROUND_COLORS[0].value,
          patternConfig: preset
        },
        patternConfig: preset
      }),
      ...preview
    });
  },

  closePolkaPaperCustom() {
    this.setData({
      polkaPaperCustomizing: false,
      paperPatternAssetPickerVisible: false,
      activePatternAssetPack: null,
      activePatternAssetPackItems: []
    });
  },

  addCustomPolkaPaper() {
    const background = this.data.selectedPolkaBackground || POLKA_BACKGROUND_COLORS[0].value;
    const patternConfig = this.getPolkaPaperCustomConfig();
    const asset = createPolkaPaperAssetFromConfig({
      id: `paper-custom-polka-${Date.now()}`,
      name: "自定义波点",
      color: background,
      patternConfig
    });
    const layer = this.addAssetItemToDraft(asset);
    if (!layer) {
      showError("素材添加失败");
      return;
    }
    this.keepAssetDrawerAfterAddingLayer(this.data.activeAssetPack);
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      polkaPaperCustomizing: false
    });
    this.markDirty();
    track("polka_paper_custom_add", {
      page: "create",
      ...getDraftAnalyticsParams(this.draft)
    });
    this.render();
  },

  setPolkaPaperBackgroundColor(event) {
    this.updatePolkaPaperCustom({ background: event.currentTarget.dataset.color });
  },

  setPolkaPaperDotColor(event) {
    this.updatePolkaPaperCustom({ dotColor: event.currentTarget.dataset.color });
  },

  setPolkaPaperDotSize(event) {
    this.updatePolkaPaperCustom({ dotRadius: Number(event.currentTarget.dataset.radius) });
  },

  setPolkaPaperDensity(event) {
    this.updatePolkaPaperCustom({ gap: Number(event.currentTarget.dataset.gap) });
  },

  setPolkaPaperStyle(event) {
    this.updatePolkaPaperCustom({ style: event.currentTarget.dataset.style });
  },

  setPolkaPaperShape(event) {
    this.updatePolkaPaperCustom({
      shape: event.currentTarget.dataset.shape,
      imageSource: "",
      imageWidth: 0,
      imageHeight: 0,
      imageSourceType: "",
      assetId: "",
      packId: ""
    });
  },

  setPolkaPaperOpacity(event) {
    this.updatePolkaPaperCustom({ opacity: Number(event.currentTarget.dataset.opacity) });
  },

  choosePolkaPaperPatternImage() {
    if (!wx.chooseMedia) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        const tempFilePath = file && file.tempFilePath;
        if (!tempFilePath) return;
        Promise.all([
          persistTempFile(tempFilePath),
          getImageInfoAsync(tempFilePath).catch(() => null)
        ]).then(([savedPath, info]) => {
          this.updatePolkaPaperCustom({
            shape: "image",
            imageSourceType: "upload",
            imageSource: savedPath || tempFilePath,
            imageWidth: info && info.width ? info.width : 0,
            imageHeight: info && info.height ? info.height : 0,
            assetId: "",
            packId: ""
          });
        });
      }
    });
  },

  openPolkaPaperPatternAssetPicker() {
    this.setData({
      paperPatternAssetPickerVisible: true,
      ...this.getPatternAssetPanelState(this.data.activePatternAssetCategory || "推荐", "")
    });
    this.refreshPatternAssetPanel(this.data.activePatternAssetCategory || "推荐", "");
  },

  closePolkaPaperPatternAssetPicker() {
    this.setData({
      paperPatternAssetPickerVisible: false,
      activePatternAssetPack: null,
      activePatternAssetPackItems: []
    });
  },

  applyPolkaPaperPatternAsset(event) {
    const assetId = event.currentTarget.dataset.assetId;
    if (!assetId) return;
    getResolvedAssetItem(assetId).then((asset) => {
      if (!asset || !asset.source) {
        showError("素材加载失败");
        return;
      }
      this.updatePolkaPaperCustom({
        shape: "image",
        imageSourceType: "asset",
        imageSource: asset.source,
        imageWidth: asset.width || 0,
        imageHeight: asset.height || 0,
        assetId: asset.id || assetId,
        packId: asset.packId || ""
      });
      this.setData({ paperPatternAssetPickerVisible: false });
      track("polka_paper_pattern_asset_apply", {
        page: "create",
        assetId: asset.id || assetId,
        packId: asset.packId || "",
        ...getDraftAnalyticsParams(this.draft)
      });
    });
  },

  getPolkaPaperCustomConfig() {
    return normalizePolkaPatternConfig({
      ...DEFAULT_POLKA_PATTERN_CONFIG,
      dotColor: this.data.selectedPolkaDotColor || DEFAULT_POLKA_PATTERN_CONFIG.dotColor,
      dotRadius: this.data.selectedPolkaDotRadius || DEFAULT_POLKA_PATTERN_CONFIG.dotRadius,
      gap: this.data.selectedPolkaGap || DEFAULT_POLKA_PATTERN_CONFIG.gap,
      opacity: this.data.selectedPolkaOpacity == null ? DEFAULT_POLKA_PATTERN_CONFIG.opacity : this.data.selectedPolkaOpacity,
      style: this.data.selectedPolkaStyle || DEFAULT_POLKA_PATTERN_CONFIG.style,
      shape: this.data.selectedPolkaShape || DEFAULT_POLKA_PATTERN_CONFIG.shape,
      imageSource: this.data.selectedPolkaImageSource || "",
      imageWidth: this.data.selectedPolkaImageWidth || 0,
      imageHeight: this.data.selectedPolkaImageHeight || 0,
      imageSourceType: this.data.selectedPolkaImageSourceType || "",
      assetId: this.data.selectedPolkaAssetId || "",
      packId: this.data.selectedPolkaPackId || "",
      offset: "grid"
    });
  },

  updatePolkaPaperCustom(patch = {}) {
    const currentConfig = this.getPolkaPaperCustomConfig();
    const nextConfig = normalizePolkaPatternConfig({
      ...currentConfig,
      dotColor: patch.dotColor || currentConfig.dotColor,
      dotRadius: patch.dotRadius == null ? currentConfig.dotRadius : patch.dotRadius,
      gap: patch.gap == null ? currentConfig.gap : patch.gap,
      opacity: patch.opacity == null ? currentConfig.opacity : patch.opacity,
      style: patch.style || currentConfig.style,
      shape: patch.shape || currentConfig.shape,
      imageSource: patch.imageSource == null ? currentConfig.imageSource : patch.imageSource,
      imageWidth: patch.imageWidth == null ? currentConfig.imageWidth : patch.imageWidth,
      imageHeight: patch.imageHeight == null ? currentConfig.imageHeight : patch.imageHeight,
      imageSourceType: patch.imageSourceType == null ? currentConfig.imageSourceType : patch.imageSourceType,
      assetId: patch.assetId == null ? currentConfig.assetId : patch.assetId,
      packId: patch.packId == null ? currentConfig.packId : patch.packId
    });
    const background = patch.background || this.data.selectedPolkaBackground || POLKA_BACKGROUND_COLORS[0].value;
    this.setData({
      ...getPolkaPaperControlData({
        type: "paper",
        style: {
          color: background,
          patternConfig: nextConfig
        },
        patternConfig: nextConfig
      }),
      ...createPolkaPaperCustomPreviewData(background, nextConfig)
    });
  },

  updatePolkaPaper(patch = {}) {
    this.enterEditMode();
    let layer = this.getSelectedPolkaPaperLayer();
    if (!layer) {
      const defaultOption = getCreateAssetItem("paper-polka-cream-small");
      layer = this.addAssetItemToDraft(defaultOption);
      layer = layer && this.getLayerById(layer.id) || layer;
    }
    if (!layer) return;
    const currentConfig = normalizePolkaPatternConfig(layer.patternConfig || layer.style && layer.style.patternConfig || DEFAULT_POLKA_PATTERN_CONFIG);
    const nextConfig = normalizePolkaPatternConfig({
      ...currentConfig,
      dotColor: patch.dotColor || currentConfig.dotColor,
      dotRadius: patch.dotRadius == null ? currentConfig.dotRadius : patch.dotRadius,
      gap: patch.gap == null ? currentConfig.gap : patch.gap,
      opacity: patch.opacity == null ? currentConfig.opacity : patch.opacity,
      style: patch.style || currentConfig.style,
      shape: patch.shape || currentConfig.shape,
      imageSource: patch.imageSource == null ? currentConfig.imageSource : patch.imageSource,
      imageWidth: patch.imageWidth == null ? currentConfig.imageWidth : patch.imageWidth,
      imageHeight: patch.imageHeight == null ? currentConfig.imageHeight : patch.imageHeight,
      imageSourceType: patch.imageSourceType == null ? currentConfig.imageSourceType : patch.imageSourceType,
      assetId: patch.assetId == null ? currentConfig.assetId : patch.assetId,
      packId: patch.packId == null ? currentConfig.packId : patch.packId
    });
    layer.style = {
      ...(layer.style || {}),
      color: patch.background || layer.style && layer.style.color || POLKA_BACKGROUND_COLORS[0].value,
      patternConfig: nextConfig
    };
    layer.patternConfig = nextConfig;
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      ...getPolkaPaperControlData(layer)
    });
    this.markDirty();
    this.render();
  },

  getSelectedPolkaPaperLayer() {
    const layer = this.getSelectedLayer && this.getSelectedLayer();
    if (isPolkaPaperLayer(layer)) return layer;
    return null;
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
    this.trackCreatePageView("asset_transfer", {
      source: transferMode.source || "assetsTab",
      selectedCount: assetIds.length
    });
    this.enterEditMode();
    let added = 0;
    Promise.all(assetIds.map(resolveCreateTransferAsset)).then((assets) => {
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
        textAlign: this.data.textAlign || "center",
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
      textAlign: normalizeTextAlign(layer.style.textAlign),
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
        y: layer.y,
        centerY: layer.y + layer.height / 2
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
      layer.y = Number.isFinite(session.original.centerY)
        ? session.original.centerY - layer.height / 2
        : session.original.y;
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
      const layer = this.getSelectedLayer();
      if (!layer || layer.type !== "image" || !layer.source) {
        this.subjectCutPickPending = true;
        this.setData({
          activeTool: "cut",
          activePalette: "",
          activeDrawer: "",
          selectedLayerId: "",
          selectedLayerType: ""
        });
        showToast("请在画布上选择图片图层", { icon: "none" });
        return;
      }
      return this.removeSelectedImageBackground();
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
    track("cut_tool_start", {
      cutStyle,
      ...getDraftMinimalAnalyticsParams(this.draft)
    });
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
      track("cut_tool_confirm", {
        cutStyle: session.style === "wave" ? "wave" : "straight",
        ...getDraftMinimalAnalyticsParams(this.draft)
      });
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
      resizeTextLayerToContent(layer);
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
    const rawText = this.data.textDraft || "";
    const text = rawText.trim() ? rawText : "weekend";
    this.enterEditMode();
    const selectedLayer = this.getSelectedLayer();
    if (selectedLayer && selectedLayer.type === "text" && this.data.textInputVisible) {
      selectedLayer.text = text;
      resizeTextLayerToContent(selectedLayer);
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
    resizeTextLayerToContent(layer);
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
    const text = this.data.textDraft || "";
    const hasText = !!text.trim();
    const removeNew = !!(this.textEditSession && this.textEditSession.isNew && !hasText);
    if (layer && layer.type === "text") {
      if (hasText) {
        layer.text = text;
        resizeTextLayerToContent(layer);
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
    if (this.data.backgroundHintVisible) {
      this.dismissBackgroundHint();
      return;
    }
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
      this.subjectCutPickPending = false;
      this.pendingStraightCutStyle = "";
      this.embossPickPending = false;
    }
    if (!Object.keys(patch).length) return;
    this.setData(patch);
    if (shouldRender) {
      this.render();
    }
  },

  dismissBackgroundHint() {
    wx.setStorageSync(BACKGROUND_HINT_SEEN_KEY, true);
    this.setData({ backgroundHintVisible: false });
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
      if (isCollageSlot(target) && !target.source) {
        this.pendingCollageSlotId = target.id;
        this.choosePhotoBySource("album");
        return;
      }
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
      if (this.subjectCutPickPending) {
        if (target && target.type === "image" && target.source) {
          this.subjectCutPickPending = false;
          this.setData({
            selectedLayerId: target.id,
            selectedLayerType: target.type,
            activeTool: "cut",
            activePalette: "cut",
            layerActionsPage: 0,
            layerActionsOffset: 0
          }, () => this.removeSelectedImageBackground(target));
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
        ? {
          mode: "drag",
          layerId: target.id,
          start: points[0],
          origin: { x: target.x, y: target.y, collage: getCollageImageTransform(target) }
        }
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
          collage: getCollageImageTransform(layer),
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
      if (isFilledCollageSlot(layer)) {
        setCollageImageTransform(layer, {
          imageScale: this.gesture.origin.collage.imageScale,
          imageOffsetX: this.gesture.origin.collage.imageOffsetX + points[0].x - this.gesture.start.x,
          imageOffsetY: this.gesture.origin.collage.imageOffsetY + points[0].y - this.gesture.start.y
        });
      } else {
        layer.x = this.gesture.origin.x + points[0].x - this.gesture.start.x;
        layer.y = this.gesture.origin.y + points[0].y - this.gesture.start.y;
        this.alignmentGuides = this.getStableAlignmentGuides(this.getAlignmentGuides(layer));
      }
    }

    if (this.gesture.mode === "pinch" && points.length >= 2) {
      if (this.pendingLayerTap) {
        this.pendingLayerTap.moved = true;
      }
      this.alignmentGuideState = null;
      const nextDistance = distance(points[0], points[1]);
      const nextAngle = angle(points[0], points[1]);
      const scale = Math.max(0.25, Math.min(3, nextDistance / this.gesture.distance));
      if (isFilledCollageSlot(layer)) {
        setCollageImageTransform(layer, {
          imageScale: Math.max(1, Math.min(3, this.gesture.origin.collage.imageScale * scale)),
          imageOffsetX: this.gesture.origin.collage.imageOffsetX,
          imageOffsetY: this.gesture.origin.collage.imageOffsetY
        });
      } else {
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

  beginEmbossEdit(preferredShape = "") {
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
    track("emboss_start", {
      embossShape: preferredShape || normalizeEmbossShape((layer.style || {}).clipShape || layer.clipShape || "circle") || "circle",
      ...getDraftMinimalAnalyticsParams(this.draft)
    });
    const originalLayer = JSON.parse(JSON.stringify(layer));
    const startEmboss = () => {
      const currentShape = preferredShape || normalizeEmbossShape((layer.style || {}).clipShape || layer.clipShape || "circle") || "circle";
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
        mask: defaultMask,
        initialMask: { ...defaultMask },
        aspectRatio: defaultMask.width / Math.max(1, defaultMask.height)
      };
      this.embossGesture = null;
      this.updateEmbossPreviewData(currentShape);
      this.resetCanvasContext();
      this.setData({
        embossEditing: true,
        embossShape: currentShape,
        embossAspectLocked: false,
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
    if ((layer.sourceWidth && layer.sourceHeight) || isVirtualPaperLayer(layer) || isVirtualBasicShapeLayer(layer)) {
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
      embossPreviewStyle: "",
      embossImageStyle: "",
      embossMaskStyle: "",
      embossAspectLocked: false,
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
      embossPreviewStyle: "",
      embossImageStyle: "",
      embossMaskStyle: "",
      embossAspectLocked: false,
      selectedLayerId: cutLayer.id,
      selectedLayerType: cutLayer.type,
      activeTool: "",
      activePalette: ""
    });
    this.markDirty();
    track("emboss_confirm", {
      embossShape: shape,
      ...getDraftMinimalAnalyticsParams(this.draft)
    });
    setTimeout(() => this.render(), 0);
  },

  selectEmbossShape(event) {
    const selectedShape = event.currentTarget.dataset.shape || "circle";
    this.updateEmbossPreviewData(selectedShape);
    // “rect” 在绘制时会被标准化为空形状（即矩形路径），但需保留其值以高亮当前选项。
    this.setData({ embossShape: selectedShape });
  },

  toggleEmbossAspectLock() {
    if (!this.embossSession) return;
    const isLocked = !this.data.embossAspectLocked;
    if (isLocked) {
      const mask = this.embossSession.mask;
      this.embossSession.aspectRatio = mask.width / Math.max(1, mask.height);
    }
    this.setData({ embossAspectLocked: isLocked });
  },

  resetEmbossMask() {
    if (!this.embossSession) return;
    this.embossSession.mask = { ...this.embossSession.initialMask };
    this.embossSession.aspectRatio = this.embossSession.mask.width / Math.max(1, this.embossSession.mask.height);
    // 仅恢复蒙版位置和尺寸，不改变用户当前选择的形状。
    this.updateEmbossPreviewData();
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
      const scale = this.data.embossAspectLocked ? Math.max(scaleX, scaleY) : null;
      const width = origin.width * (scale || scaleX);
      const height = origin.height * (scale || scaleY);
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
      : resizeEmbossMask(this.embossGesture.origin, dx, dy, this.embossGesture.handle, layer, this.data.embossAspectLocked ? this.embossSession.aspectRatio : 0);
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
    const selectedShape = shape || this.data.embossShape || "circle";
    // 矩形在画布路径中以空形状表示；预览层需要保留 rect 类名，不能回退为圆形。
    const nextShape = selectedShape === "rect"
      ? "rect"
      : (normalizeEmbossShape(selectedShape) || "circle");
    // 压花编辑需要展示图层当前可见的裁剪范围。直接把原图铺满预览框会
    // 忽略 crop，拼图缩放后退出拼图的图片便会在此处被拉伸。
    const sourceCrop = getLayerSourceCrop(layer);
    const sourceSize = this.embossSession.sourceSize || {};
    const cropWidth = Math.max(1, sourceCrop.width);
    const cropHeight = Math.max(1, sourceCrop.height);
    const scaleX = preview.width / cropWidth;
    const scaleY = preview.height / cropHeight;
    this.setData({
      embossPreviewStyle: `left:${preview.left}px;top:${preview.top}px;width:${preview.width}px;height:${preview.height}px;`,
      embossImageStyle: `left:${-sourceCrop.x * scaleX}px;top:${-sourceCrop.y * scaleY}px;width:${Math.max(1, sourceSize.width || layer.width) * scaleX}px;height:${Math.max(1, sourceSize.height || layer.height) * scaleY}px;`,
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
    if ((layer.sourceWidth && layer.sourceHeight) || isVirtualPaperLayer(layer) || isVirtualBasicShapeLayer(layer)) {
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

  replaceSelectedLayerPhoto() {
    const layer = this.getSelectedLayer();
    if (!isReplaceableImageLayer(layer)) return;
    if (isFilledCollageSlot(layer)) {
      this.pendingCollageSlotId = layer.id;
    } else {
      this.pendingImageReplaceLayerId = layer.id;
    }
    this.choosePhotoBySource("album");
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
      selectedCollageSlot: isCollageSlot(layer),
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

  keepAssetDrawerAfterAddingLayer(pack) {
    const activeAssetPack = pack || this.data.activeAssetPack || null;
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      selectedLayerLocked: false,
      selectedLayerLockStyle: "",
      activeTool: "asset",
      activeDrawer: "asset",
      activeAssetPack,
      activeAssetPackItems: activeAssetPack && Array.isArray(activeAssetPack.items) ? activeAssetPack.items : this.data.activeAssetPackItems,
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
      textAlign: normalizeTextAlign(layer.style.textAlign),
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
    this.trackTextStyleApply("font", fontStyle.fontId);
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
    this.trackTextStyleApply("font_variant", fontStyle.fontId);
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
    this.trackTextStyleApply("color", color);
    this.setData({ textColor: color });
  },

  setTextSize(event) {
    const size = Number(event.currentTarget.dataset.size || 54);
    this.updateEditingTextStyle({ fontSize: size });
    this.trackTextStyleApply("size", String(size));
    this.setData({ textSize: size });
  },

  setTextAlign(event) {
    const align = normalizeTextAlign(event.currentTarget.dataset.align);
    this.updateEditingTextStyle({ textAlign: align });
    this.trackTextStyleApply("align", align);
    this.setData({ textAlign: align });
  },

  setTextBackground(event) {
    const background = event.currentTarget.dataset.background || "无";
    this.updateEditingTextStyle({
      backgroundLabel: background,
      background: backgroundColorForLabel(background)
    });
    this.trackTextStyleApply("background", background);
    this.setData({ textBackground: background });
  },

  setTextOpacity(event) {
    const opacity = Number(event.currentTarget.dataset.opacity || 100);
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "text") return;
    layer.opacity = opacity / 100;
    this.trackTextStyleApply("opacity", String(opacity));
    this.setData({ textOpacity: opacity });
    if (!this.data.textInputVisible) {
      this.markDirty();
    }
    this.render();
    if (this.data.textInputVisible) {
      this.scheduleTextCanvasOffsetRefresh();
    }
  },

  trackTextStyleApply(styleType, styleValue) {
    track("text_style_apply", {
      styleType,
      styleValue,
      ...getDraftMinimalAnalyticsParams(this.draft)
    });
  },

  updateEditingTextStyle(nextStyle) {
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "text") return;
    layer.style = {
      ...(layer.style || {}),
      ...nextStyle
    };
    if (Object.prototype.hasOwnProperty.call(nextStyle, "fontSize")) {
      resizeTextLayerToContent(layer);
    }
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
    const allowedWhenLocked = ["copy", "delete", "deleteCollage", "up", "down"];
    if (this.isLayerLocked(layer) && !allowedWhenLocked.includes(action)) {
      this.showLockedLayerToast();
      return;
    }
    const activeLayerPalette = ["cut", "outline"].includes(this.data.activePalette)
      ? this.data.activePalette
      : "";
    if (activeLayerPalette && action !== activeLayerPalette) {
      this.setData({
        activeTool: "",
        activePalette: "",
        layerActionsScrollLeft: 0,
        layerActionsScrollIntoView: ""
      });
    }
    if (action === "shape") {
      if (isFilledCollageSlot(layer)) return this.confirmDetachCollageLayer(layer, "shape");
      return this.beginEmbossEdit();
    }
    if (action === "cut") {
      if (isFilledCollageSlot(layer)) return this.confirmDetachCollageLayer(layer, "cut");
      return this.openCutPalette();
    }
    if (action === "outline") {
      const isOpen = this.data.activePalette === "outline";
      this.setData({
        activeTool: isOpen ? "" : "outline",
        activePalette: isOpen ? "" : "outline",
        activeDrawer: "",
        selectedOutlineStyle: layer ? getLayerOutlineStyleKey(layer.outline) : "none",
        textInputVisible: false,
        ratioPanelVisible: false,
        layerActionsScrollLeft: 0,
        layerActionsScrollIntoView: ""
      }, () => {
        if (!isOpen) this.scrollLayerActionsIntoView("layer-action-outline");
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
    if (action === "deleteCollage") return this.deleteCollage();
    if (action === "up") return this.moveLayerUp();
    if (action === "down") return this.moveLayerDown();

    if (!layer) return;
    if (action === "shadow") layer.shadow = !layer.shadow;
    if (action === "opacity") layer.opacity = layer.opacity === 0.58 ? 1 : 0.58;
    if (action === "corner") layer.radius = layer.radius ? 0 : 36;
    this.markDirty();
    this.render();
  },

  openCutPalette() {
    const isOpen = this.data.activePalette === "cut";
    this.setData({
      activeTool: isOpen ? "" : "cut",
      activePalette: isOpen ? "" : "cut",
      activeDrawer: "",
      textInputVisible: false,
      ratioPanelVisible: false,
      layerActionsScrollLeft: 0,
      layerActionsScrollIntoView: ""
    }, () => {
      if (!isOpen) this.scrollLayerActionsIntoView("layer-action-cut");
    });
  },

  scrollLayerActionsIntoView(targetId) {
    setTimeout(() => {
      if (!["cut", "outline"].includes(this.data.activePalette)) return;
      this.setData({ layerActionsScrollIntoView: targetId });
    }, 0);
  },

  confirmDetachCollageLayer(layer, action) {
    const actionName = action === "shape" ? "压花" : "剪刀";
    showModal(
      "退出拼图",
      `使用${actionName}会将此图片变成普通图层，无法再随原拼图布局调整。原宫格将移除，但当前展示范围会保留。`,
      { confirmText: "确认继续" }
    ).then((result) => {
      if (!result.confirm) return;
      this.detachCollageLayer(layer);
      if (action === "shape") {
        this.beginEmbossEdit();
      } else {
        this.openCutPalette();
      }
    });
  },

  detachCollageLayer(layer) {
    const transform = getCollageImageTransform(layer);
    const sourceWidth = layer.sourceWidth || layer.width;
    const sourceHeight = layer.sourceHeight || layer.height;
    const fit = Math.min(layer.width / sourceWidth, layer.height / sourceHeight) * transform.imageScale;
    const renderedWidth = sourceWidth * fit;
    const renderedHeight = sourceHeight * fit;
    const imageX = layer.x + (layer.width - renderedWidth) / 2 + transform.imageOffsetX;
    const imageY = layer.y + (layer.height - renderedHeight) / 2 + transform.imageOffsetY;
    const visible = intersectRects(
      { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
      { x: imageX, y: imageY, width: renderedWidth, height: renderedHeight }
    );
    if (!visible.width || !visible.height) return;
    const existingStyle = { ...(layer.style || {}) };
    delete existingStyle.collageSlot;
    layer.x = visible.x;
    layer.y = visible.y;
    layer.width = visible.width;
    layer.height = visible.height;
    layer.crop = {
      x: (visible.x - imageX) / fit,
      y: (visible.y - imageY) / fit,
      width: visible.width / fit,
      height: visible.height / fit
    };
    layer.locked = false;
    layer.style = existingStyle;
    this.setData({ selectedCollageSlot: false, selectedLayerLocked: false, selectedLayerReplaceStyle: "" });
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
    } else if (effect === "lace-center" || effect === "foil-center") {
      const frame = effect === "foil-center" ? DEFAULT_FOIL_CENTER_FRAME : DEFAULT_LACE_CENTER_FRAME;
      style.handmadeEffect = {
        type: effect,
        frameId: frame.id,
        frameLabel: frame.label,
        frameSource: frame.source,
        openingWidthRatio: frame.openingWidthRatio,
        openingHeightRatio: frame.openingHeightRatio,
        openingScale: 1,
        contentScale: 1,
        contentOffsetX: 0,
        contentOffsetY: 0,
        frameOpacity: 1,
        shadowOffsetY: effect === "foil-center" ? 0 : 10,
        shadowBlur: effect === "foil-center" ? 0 : 22
      };
      makeLayerSquareAroundCenter(layer);
    } else {
      delete style.handmadeEffect;
    }
    layer.style = style;
    this.setData({ selectedHandmadeEffect: effect });
    this.markDirty();
    track("handmade_effect_apply", {
      page: "create",
      effect,
      ...getDraftAnalyticsParams(this.draft)
    });
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

    if (effect === "blueprint-print" || effect === "screen-print" || effect === "riso-print" || effect === "vintage-botanical" || effect === "pixel-cross-stitch" || effect === "matisse-cutout" || effect === "kpop-card" || effect === "creative-tear-paper") {
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
                  : effect === "kpop-card"
                    ? { kpopCardText: saved.kpopCardText || "subtle" }
                    : { creativeTearPaperStyle: saved.styleId || saved.creativeTearPaperStyle || DEFAULT_CREATIVE_TEAR_PAPER_STYLE };
      this.setData({ effectAdjusting: effect, effectAdjustingLabel: label, ...values });
      return;
    }

    if ((effect === "lace-center" || effect === "foil-center") && layer.style.handmadeEffect) {
      const frameOptions = getCenterFrameOptions(effect);
      this.setData({
        effectAdjusting: effect,
        effectAdjustingLabel: effect === "foil-center" ? "锡纸框裁" : "蕾丝框裁",
        laceFrameOptions: frameOptions,
        laceContentScale: laceContentScaleToSliderValue(layer.style.handmadeEffect.contentScale),
        laceOpeningScale: Math.round((layer.style.handmadeEffect.openingScale || 1) * 100),
        selectedLaceFrameId: getCenterFrameId(layer.style.handmadeEffect, frameOptions)
      });
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

  setLaceFrameOption(event) {
    const layer = this.getSelectedLayer();
    const frameOptions = getCenterFrameOptions(layer && layer.style && layer.style.handmadeEffect && layer.style.handmadeEffect.type);
    const frameId = event.currentTarget.dataset.frameId || (frameOptions[0] || DEFAULT_LACE_CENTER_FRAME).id;
    const frame = getCenterFrameOption(frameId, frameOptions);
    if (!frame || !layer || !layer.style || !layer.style.handmadeEffect) return;
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    layer.style = {
      ...layer.style,
      handmadeEffect: {
        ...layer.style.handmadeEffect,
        type: layer.style.handmadeEffect.type === "foil-center" ? "foil-center" : "lace-center",
        frameId: frame.id,
        frameLabel: frame.label,
        frameSource: frame.source,
        openingWidthRatio: frame.openingWidthRatio,
        openingHeightRatio: frame.openingHeightRatio
      }
    };
    this.setData({ selectedLaceFrameId: frame.id });
    this.markDirty();
    this.render();
  },

  setLaceOpeningScale(event) {
    const value = Number(event.detail && event.detail.value);
    const layer = this.getSelectedLayer();
    if (!layer || !layer.style || !layer.style.handmadeEffect) return;
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    const scale = Math.max(45, Math.min(100, Number.isFinite(value) ? value : 100)) / 100;
    layer.style = {
      ...layer.style,
      handmadeEffect: {
        ...layer.style.handmadeEffect,
        type: layer.style.handmadeEffect.type === "foil-center" ? "foil-center" : "lace-center",
        openingScale: scale
      }
    };
    this.setData({ laceOpeningScale: Math.round(scale * 100) });
    this.markDirty();
    this.render();
  },

  setLaceContentScale(event) {
    const value = Number(event.detail && event.detail.value);
    const layer = this.getSelectedLayer();
    if (!layer || !layer.style || !layer.style.handmadeEffect) return;
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    const sliderValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 30));
    const scale = laceContentSliderValueToScale(sliderValue);
    layer.style = {
      ...layer.style,
      handmadeEffect: {
        ...layer.style.handmadeEffect,
        type: layer.style.handmadeEffect.type === "foil-center" ? "foil-center" : "lace-center",
        contentScale: scale
      }
    };
    this.setData({ laceContentScale: Math.round(sliderValue) });
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
    if (texture === "taped" || texture === "lace-center" || texture === "foil-center") {
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
    track("texture_effect_start", {
      page: "create",
      texture,
      ...getDraftAnalyticsParams(this.draft)
    });
    await new Promise((resolve) => {
      this.setData({
        textureEffectBusy: true,
        textureEffectBusyType: texture,
        textureEffectBusySetting: busySetting,
        saveStatus: `${textureConfig.label}生成中...`
      }, resolve);
    });
    // 先把原图和“生成中”反馈绘制出来，再进入可能耗时的效果生成。
    await this.render();
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const original = current && current.originalSource
        ? current
        : {
          originalSource: layer.persistedSource || layer.source,
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
        originalSource: layer.persistedSource || original.originalSource,
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
      if (texture === "creative-tear-paper") {
        console.warn("[seedream] generation failed detail", error && (error.detail || error.errMsg || error.message || error));
      }
      this.setData({
        selectedTextureEffect: this.data.selectedLayerId === layerId ? getTextureEffectKey(layer) : this.data.selectedTextureEffect,
        textureEffectBusy: false,
        textureEffectBusyType: "",
        textureEffectBusySetting: "",
        saveStatus: `${textureConfig.label}生成失败`
      });
      this.render();
      showError(getTextureEffectErrorMessage(texture, textureConfig.label, error));
    }
  },

  async confirmCreativeTearPaperExperience() {
    const layer = this.getSelectedLayer();
    if (!layer || layer.type !== "image" || !layer.source) {
      showToast("请先选中图片图层", { icon: "none" });
      return;
    }
    this.startCreativeTearPaperGeneration(layer);
  },

  async startCreativeTearPaperGeneration(layer, options = {}) {
    const texture = "creative-tear-paper";
    if (!layer || layer.type !== "image" || !layer.source) {
      showToast("请先选中图片图层", { icon: "none" });
      return;
    }
    if (this.data.textureEffectBusy) {
      showToast("效果生成中，请稍候", { icon: "none" });
      return;
    }
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    if (!options.skipConfirm) {
      const confirmed = await this.confirmCreativeTearPaperDailyLimit();
      if (!confirmed) return;
    }
    markCreativeTearPaperUsedToday();
    this.setData({
      selectedLayerId: layer.id,
      selectedLayerType: layer.type,
      selectedCollageSlot: isCollageSlot(layer)
    });
    this.selectTextureEffect({ currentTarget: { dataset: { texture } } });
  },

  async confirmCreativeTearPaperDailyLimit() {
    if (hasUsedCreativeTearPaperToday()) {
      showToast("今日已体验，明天再来试试", { icon: "none" });
      return false;
    }
    const result = await showModal(
      "限时体验",
      "创意撕纸每个用户每天只能体验一次，选择图片后将立即开始生成",
      { confirmText: "选择图片" }
    );
    return !!result.confirm;
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
    track("outline_style_apply", {
      outlineStyle: getLayerOutlineStyleKey(layer.outline),
      ...getDraftMinimalAnalyticsParams(this.draft)
    });
    this.render();
  },

  beginBrushDrawing() {
    this.enterEditMode();
    track("brush_tool_start", {
      brushType: this.data.brushType || "line",
      ...getDraftMinimalAnalyticsParams(this.draft)
    });
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

  setCreativeTearPaperStyle(event) {
    const value = event.currentTarget.dataset.value || DEFAULT_CREATIVE_TEAR_PAPER_STYLE;
    this.setData({ creativeTearPaperStyle: value }, () => this.scheduleTextureEffectPreview("creative-tear-paper", `creativeTearPaperStyle:${value}`));
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

  async removeSelectedImageBackground(targetLayer) {
    if (this.data.backgroundRemoving) return;
    const layer = targetLayer || this.getSelectedLayer();
    if (!layer || layer.type !== "image" || !layer.source) {
      showToast("请先选中图片图层", { icon: "none" });
      return;
    }
    if (this.isLayerLocked(layer)) {
      this.showLockedLayerToast();
      return;
    }
    const startedAt = Date.now();
    track("image_bg_remove_start", {
      page: "create",
      ...getDraftAnalyticsParams(this.draft)
    });
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
      track("image_bg_remove_success", {
        page: "create",
        durationMs: Date.now() - startedAt,
        ...getDraftAnalyticsParams(this.draft)
      });
      showSuccess("主体剪完成");
    } catch (error) {
      const message = error && error.message === "missing_rembg_endpoint"
        ? "请先配置 Rembg API 地址"
        : error && error.message === "rembg_source_too_large"
          ? "主体剪支持 20MB 以内的原图"
        : error && error.message === "rembg_upload_too_large"
          ? "图片细节过多，请先裁剪后再试"
        : error && error.message === "rembg_daily_limit"
          ? "今日主体剪次数已达上限"
        : error && (error.message === "rembg_minute_limit" || error.message === "rembg_http_429")
          ? "操作过于频繁，请稍后再试"
        : error && error.message === "rembg_busy"
          ? "当前处理任务较多，请稍后再试"
          : "主体剪失败，请稍后重试";
      this.setData({ saveStatus: "主体剪失败" });
      track("image_bg_remove_fail", {
        page: "create",
        durationMs: Date.now() - startedAt,
        errorCode: error && error.message || "unknown",
        ...getDraftAnalyticsParams(this.draft)
      });
      showError(message);
    } finally {
      const panelPatch = { backgroundRemoving: false };
      if (this.data.activeTool === "cut") panelPatch.activeTool = "";
      if (this.data.activePalette === "cut") panelPatch.activePalette = "";
      this.setData(panelPatch);
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

  async createCreativeTearPaperImage(layer) {
    const uploadPath = await this.createSeedreamUploadImage(layer);
    const resultPath = await generateSeedreamImage({
      filePath: uploadPath,
      styleId: this.data.creativeTearPaperStyle || DEFAULT_CREATIVE_TEAR_PAPER_STYLE
    });
    const info = await getImageInfoAsync(resultPath);
    return {
      path: resultPath,
      width: info.width || layer.sourceWidth || layer.width,
      height: info.height || layer.sourceHeight || layer.height,
      resizeLayer: true
    };
  },

  async createSeedreamUploadImage(layer) {
    await this.ensureCanvasContext();
    if (!this.canvasNode || !this.ctx) throw new Error("canvas_not_ready");
    const image = await this.loadCanvasImage(layer.source);
    if (!image) throw new Error("seedream_input_image_unavailable");
    const sourceWidth = Math.max(1, Math.round(layer.sourceWidth || image.width || layer.width));
    const sourceHeight = Math.max(1, Math.round(layer.sourceHeight || image.height || layer.height));
    const crop = normalizeSourceCrop(layer.crop, sourceWidth, sourceHeight);
    const scale = Math.min(1, SEEDREAM_UPLOAD_MAX_SIDE / Math.max(crop.width, crop.height));
    const imageWidth = Math.max(15, Math.round(crop.width * scale));
    const imageHeight = Math.max(15, Math.round(crop.height * scale));
    const canvasSize = getSeedreamUploadCanvasSize(imageWidth, imageHeight);
    const width = canvasSize.width;
    const height = canvasSize.height;
    const drawX = Math.round((width - imageWidth) / 2);
    const drawY = Math.round((height - imageHeight) / 2);

    this.configureCanvasBitmapSize(width, height);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, drawX, drawY, imageWidth, imageHeight);

    try {
      return await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: this.canvasNode,
          width,
          height,
          destWidth: width,
          destHeight: height,
          fileType: "png",
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        }, this);
      });
    } finally {
      this.configureCanvasBitmap();
      this.render();
    }
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
    const collageSlot = this.getLayerById(id);
    if (isCollageSlot(collageSlot)) {
      collageSlot.source = "";
      collageSlot.sourceWidth = 0;
      collageSlot.sourceHeight = 0;
      collageSlot.persistedSource = "";
      const collage = { ...(collageSlot.style && collageSlot.style.collageSlot || {}) };
      delete collage.imageScale;
      delete collage.imageOffsetX;
      delete collage.imageOffsetY;
      collageSlot.style = { ...(collageSlot.style || {}), collageSlot: collage };
      this.setData({ selectedLayerId: "", selectedLayerType: "", selectedLayerLocked: false, selectedLayerLockStyle: "", selectedLayerReplaceStyle: "" });
      this.markDirty();
      this.render();
      return;
    }
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

  deleteCollage() {
    const layer = this.getSelectedLayer();
    const collage = layer && layer.style && layer.style.collageSlot;
    if (!collage || !collage.layoutId) return;
    const layoutId = collage.layoutId;
    const count = this.draft.layers.filter((item) => item && item.style && item.style.collageSlot && item.style.collageSlot.layoutId === layoutId).length;
    showModal("删除拼图", `将移除全部 ${count} 个宫格及其中图片，此操作可撤销。`, {
      confirmText: "删除拼图"
    }).then((result) => {
      if (!result.confirm) return;
      this.draft.layers = this.draft.layers.filter((item) => !(
        item && item.style && item.style.collageSlot && item.style.collageSlot.layoutId === layoutId
      ));
      this.draft.layers = normalizeLayerOrder(this.draft.layers);
      this.setData({
        selectedLayerId: "",
        selectedLayerType: "",
        selectedCollageSlot: false,
        selectedLayerLocked: false,
        selectedLayerLockStyle: "",
        selectedLayerReplaceStyle: ""
      });
      this.markDirty();
      this.render();
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
    this.refreshDraftTextFonts(this.draft);
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
      straightCutEndHandleStyle: "",
      patternAssetPickerVisible: false,
      activePatternAssetPack: null,
      activePatternAssetPackItems: [],
      ...getPolkaPatternControlData(this.draft)
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
      ...getDraftAnalyticsParams(this.draft),
      ...getDraftExportUsageAnalytics(this.draft)
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

function getHomeShowcaseEffect(id) {
  const effects = {
    "texture-screen-print": "screen-print",
    "texture-matisse": "matisse-cutout",
    "texture-pixel-cross-stitch": "pixel-cross-stitch",
    "texture-botanical": "vintage-botanical",
    "creative-tear-paper-01": "creative-tear-paper",
    "creative-tear-paper-02": "creative-tear-paper",
    "creative-tear-paper-03": "creative-tear-paper",
    "creative-tear-paper-04": "creative-tear-paper",
    "creative-tear-paper-05": "creative-tear-paper",
    "creative-tear-paper-06": "creative-tear-paper",
    "creative-tear-paper-07": "creative-tear-paper",
    "creative-tear-paper-08": "creative-tear-paper",
    "emboss-swap": "emboss-circle",
    "emboss-circle": "emboss-circle",
    "emboss-stamp": "emboss-stamp",
    "lace-circle": "lace-center",
    "foil-frame-01": "foil-center",
    "foil-crumpled": "foil-center"
  };
  return effects[id] || "";
}

function normalizeHomeShowcaseManifest(payload) {
  let data = payload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (error) {
      console.warn("[home-showcases] invalid manifest JSON", error);
      return [];
    }
  }
  const rawGroups = Array.isArray(data) ? data : data && data.groups;
  if (!Array.isArray(rawGroups)) return [];
  return rawGroups.map((group, groupIndex) => {
    const items = Array.isArray(group && group.items) ? group.items : [];
    const normalizedItems = items.map((item, itemIndex) => ({
      id: String(item && item.id || `${group && group.id || groupIndex}-${itemIndex}`),
      title: String(item && item.title || "创作灵感"),
      imageSrc: typeof (item && item.imageSrc) === "string" ? item.imageSrc : "",
      tone: typeof (item && item.tone) === "string" ? item.tone : "structure",
      effect: typeof (item && item.effect) === "string" ? item.effect : getHomeShowcaseEffect(item && item.id),
      hideTitle: item && item.hideTitle === true
    })).filter((item) => item.imageSrc);
    return {
      id: String(group && group.id || groupIndex),
      title: String(group && group.title || "创作效果"),
      items: normalizedItems
    };
  }).filter((group) => group.items.length);
}

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

function getDraftExportUsageAnalytics(draft) {
  const layers = draft && Array.isArray(draft.layers) ? draft.layers : [];
  const assetPackIds = new Set();
  const assetCategories = new Set();
  const cutStyles = new Set();
  const embossShapes = new Set();
  const textureEffects = new Set();
  const handmadeEffects = new Set();
  const outlineStyles = new Set();
  const brushTypes = new Set();

  (layers || []).forEach((layer) => {
    if (!layer) return;
    const style = layer.style || {};
    const packId = style.packId || layer.packId || "";
    if (packId) assetPackIds.add(packId);
    const category = style.category || layer.category || getAssetCategoryByPackId(packId);
    if (category) assetCategories.add(category);
    if (layer.cutStyle) cutStyles.add(layer.cutStyle);
    if (layer.cutPiece && !layer.cutStyle) cutStyles.add("unknown");

    const texture = style.textureEffect && style.textureEffect.type;
    if (texture) textureEffects.add(texture);

    if (layer.tear) handmadeEffects.add("tear");
    const handmadeEffect = style.handmadeEffect && style.handmadeEffect.type;
    if (handmadeEffect) handmadeEffects.add(handmadeEffect);

    const outlineStyle = getLayerOutlineStyleKey(layer.outline);
    if (outlineStyle && outlineStyle !== "none") outlineStyles.add(outlineStyle);

    const clipShape = normalizeOptionalEmbossShape(layer.clipShape || layer.maskShape || style.clipShape || style.maskShape || style.shape || "");
    if (clipShape && (style.embossEdge || layer.type === "image")) embossShapes.add(clipShape);

    if (layer.type === "brush") {
      (layer.strokes || []).forEach((stroke) => {
        if (stroke && stroke.type) brushTypes.add(stroke.type);
      });
    }
  });

  const analytics = draft && draft.analytics || {};
  return {
    showcaseEffect: analytics.showcaseEffect || "",
    assetPackIds: joinAnalyticsValues(assetPackIds),
    assetCategories: joinAnalyticsValues(assetCategories),
    cutStyles: joinAnalyticsValues(cutStyles),
    embossShapes: joinAnalyticsValues(embossShapes),
    textureEffects: joinAnalyticsValues(textureEffects),
    handmadeEffects: joinAnalyticsValues(handmadeEffects),
    outlineStyles: joinAnalyticsValues(outlineStyles),
    brushTypes: joinAnalyticsValues(brushTypes)
  };
}

function joinAnalyticsValues(values) {
  return Array.from(values || []).filter(Boolean).sort().join(",");
}

function getAssetCategoryByPackId(packId) {
  if (!packId) return "";
  const pack = getCreateAssetPack(packId) || getAssetPack(packId);
  return pack && normalizeCreateAssetCategory(pack.category || "") || "";
}

function getDraftMinimalAnalyticsParams(draft) {
  return {
    __analyticsFieldMode: "minimal",
    draftId: draft && draft.id || "",
    ratio: draft && draft.ratio || ""
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

function getTextureEffectErrorMessage(texture, label, error) {
  if (texture === "creative-tear-paper" && error && error.message === "seedream_input_image_unavailable") {
    return "原图文件已失效，请替换图片后再生成";
  }
  if (texture === "creative-tear-paper" && error && error.message === "ark_api_key_not_configured") {
    return "Seedream 密钥未配置";
  }
  if (texture === "creative-tear-paper" && error && error.message === "daily_limit_exceeded") {
    return "今日已体验，明天再来试试";
  }
  const detail = error && (error.errMsg || error.message || error.detail || "");
  if (texture === "creative-tear-paper" && /time(?:d)? out|超时|TIME_LIMIT_EXCEEDED|-504003/i.test(String(detail))) {
    return "云函数超时，请调长后重试";
  }
  return `${label || "效果"}生成失败`;
}

function hasUsedCreativeTearPaperToday() {
  if (!wx.getStorageSync) return false;
  return wx.getStorageSync(getCreativeTearPaperDailyKey()) === true;
}

function markCreativeTearPaperUsedToday() {
  if (!wx.setStorageSync) return;
  wx.setStorageSync(getCreativeTearPaperDailyKey(), true);
}

function getCreativeTearPaperDailyKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${CREATIVE_TEAR_PAPER_DAILY_KEY_PREFIX}${year}-${month}-${day}`;
}

function getSeedreamUploadCanvasSize(imageWidth, imageHeight) {
  let width = Math.max(15, Math.round(imageWidth || 15));
  let height = Math.max(15, Math.round(imageHeight || 15));
  const aspect = width / Math.max(1, height);
  if (aspect > SEEDREAM_INPUT_MAX_ASPECT) {
    height = Math.max(height, Math.ceil(width / SEEDREAM_INPUT_MAX_ASPECT));
  } else if (aspect < SEEDREAM_INPUT_MIN_ASPECT) {
    width = Math.max(width, Math.ceil(height * SEEDREAM_INPUT_MIN_ASPECT));
  }
  return { width, height };
}

function isCuttableSourceLayer(layer) {
  return !!(layer && CUTTABLE_SOURCE_LAYER_TYPES.includes(layer.type) && (layer.source || isVirtualPaperLayer(layer) || isVirtualBasicShapeLayer(layer)));
}

function isVirtualPaperLayer(layer) {
  if (!layer || layer.type !== "paper" || layer.source) return false;
  const style = layer.style || {};
  return !!(style.color || style.pattern || style.patternConfig || layer.pattern || layer.patternConfig);
}

function isVirtualBasicShapeLayer(layer) {
  if (!layer || layer.type !== "sticker" || layer.source) return false;
  const style = layer.style || {};
  const config = layer.shapeConfig || style.shapeConfig;
  return !!(config && config.type === "basic-shape");
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
      if (page.pendingImageReplacementSnapshots) page.pendingImageReplacementSnapshots.delete(layerId);
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
  const replacementSnapshot = page.pendingImageReplacementSnapshots && page.pendingImageReplacementSnapshots.get(layerId);
  if (replacementSnapshot) {
    const index = page.draft.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) return false;
    page.draft.layers[index] = replacementSnapshot;
    page.pendingImageReplacementSnapshots.delete(layerId);
    page.markDirty();
    page.render();
    return true;
  }
  const collageSlot = page.getLayerById(layerId);
  if (isCollageSlot(collageSlot)) {
    collageSlot.source = "";
    collageSlot.sourceWidth = 0;
    collageSlot.sourceHeight = 0;
    page.setData({ selectedLayerId: "", selectedLayerType: "" });
    page.markDirty();
    page.render();
    return true;
  }
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
  const left = clamp(Math.round(bounds.left - offset), inset, canvasWidth - inset);
  const top = clamp(Math.round(bounds.top - offset), inset, canvasHeight - inset);
  return `left:${left}px;top:${top}px;`;
}

function getLayerReplaceControlStyle(layer, options) {
  const scale = options.scale || 1;
  const canvasWidth = Math.max(1, options.canvasWidth || 1);
  const canvasHeight = Math.max(1, options.canvasHeight || 1);
  const bounds = getLayerScreenBounds(layer, { left: 0, top: 0 }, scale);
  const inset = 16;
  const offset = 12;
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

function applyScissorRemainderMask(ctx, width, height, strokes, outputScale) {
  if (!ctx || !ctx.getImageData || !ctx.putImageData) throw new Error("missing_image_data_api");
  const imageData = ctx.getImageData(0, 0, width, height);
  const mask = new Uint8ClampedArray(width * height);
  strokes.forEach((stroke) => {
    const points = (stroke.points || []).map((point) => ({ x: point.x * outputScale, y: point.y * outputScale }));
    const radius = Math.max(1, (stroke.size || SCISSOR_BRUSH_SIZE) * outputScale / 2);
    rasterizeStroke(mask, width, height, points, radius);
  });
  const data = imageData.data;
  for (let i = 0; i < mask.length; i += 1) {
    const alphaIndex = i * 4 + 3;
    data[alphaIndex] = Math.round(data[alphaIndex] * (255 - mask[i]) / 255);
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

function resizeEmbossMask(origin, dx, dy, handle, layer, aspectRatio = 0) {
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
  if (!aspectRatio) return clampEmbossMask(next, layer);
  const isLeft = handle.indexOf("l") >= 0;
  const isTop = handle.indexOf("t") >= 0;
  const useWidth = Math.abs(dx) >= Math.abs(dy);
  let width = useWidth ? next.width : next.height * aspectRatio;
  let height = useWidth ? next.width / aspectRatio : next.height;
  if (width > layer.width) {
    width = layer.width;
    height = width / aspectRatio;
  }
  if (height > layer.height) {
    height = layer.height;
    width = height * aspectRatio;
  }
  const anchorX = isLeft ? origin.x + origin.width : origin.x;
  const anchorY = isTop ? origin.y + origin.height : origin.y;
  return clampEmbossMask({
    x: isLeft ? anchorX - width : anchorX,
    y: isTop ? anchorY - height : anchorY,
    width,
    height
  }, layer);
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
    },
    pattern: spec.pattern || "",
    patternConfig: spec.patternConfig || null,
    shapeConfig: spec.shapeConfig || spec.style && spec.style.shapeConfig || null
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

function getLayerEffectSources(layers) {
  return (layers || []).reduce((sources, layer) => {
    const effect = layer && layer.style && layer.style.handmadeEffect;
    if (effect && (effect.type === "lace-center" || effect.type === "foil-center") && effect.frameSource) {
      sources.push(effect.frameSource);
    }
    return sources;
  }, []);
}

function getLayerPatternSources(layers) {
  return (layers || []).reduce((sources, layer) => {
    const patternConfig = layer && (layer.patternConfig || layer.style && layer.style.patternConfig);
    if (patternConfig && patternConfig.type === "polka" && patternConfig.shape === "image" && patternConfig.imageSource) {
      sources.push(patternConfig.imageSource);
    }
    return sources;
  }, []);
}

function getLaceCenterFrameOption(frameId) {
  return LACE_CENTER_FRAME_OPTIONS.find((option) => option.id === frameId) || DEFAULT_LACE_CENTER_FRAME;
}

function getLaceCenterFrameId(effect) {
  if (!effect || effect.type !== "lace-center") return DEFAULT_LACE_CENTER_FRAME.id;
  const idMatch = LACE_CENTER_FRAME_OPTIONS.find((option) => option.id === effect.frameId);
  if (idMatch) return idMatch.id;
  const match = LACE_CENTER_FRAME_OPTIONS.find((option) => option.source === effect.frameSource);
  return match ? match.id : DEFAULT_LACE_CENTER_FRAME.id;
}

function hasCenterFrameHandmadeEffect(layer) {
  const effect = layer && layer.style && layer.style.handmadeEffect;
  return !!effect && (effect.type === "lace-center" || effect.type === "foil-center");
}

function getCenterFrameOptions(type) {
  return type === "foil-center" ? FOIL_CENTER_FRAME_OPTIONS : LACE_CENTER_FRAME_OPTIONS;
}

function getCenterFrameOption(frameId, options = LACE_CENTER_FRAME_OPTIONS) {
  return options.find((option) => option.id === frameId) || options[0] || DEFAULT_LACE_CENTER_FRAME;
}

function getCenterFrameId(effect, options = LACE_CENTER_FRAME_OPTIONS) {
  if (!effect) return (options[0] || DEFAULT_LACE_CENTER_FRAME).id;
  const idMatch = options.find((option) => option.id === effect.frameId);
  if (idMatch) return idMatch.id;
  const match = options.find((option) => option.source === effect.frameSource);
  return match ? match.id : (options[0] || DEFAULT_LACE_CENTER_FRAME).id;
}

function isLaceCenterFrameSource(src) {
  return LACE_CENTER_FRAME_OPTIONS.concat(FOIL_CENTER_FRAME_OPTIONS).some((option) => option.source === src);
}

function laceContentSliderValueToScale(value) {
  const normalized = Math.max(0, Math.min(100, Number(value) || 0)) / 100;
  return LACE_CONTENT_RANGE_MIN + (LACE_CONTENT_RANGE_MAX - LACE_CONTENT_RANGE_MIN) * normalized;
}

function laceContentScaleToSliderValue(scale) {
  const value = Number(scale);
  const normalized = (Number.isFinite(value) ? value : 1) - LACE_CONTENT_RANGE_MIN;
  return Math.round(Math.max(0, Math.min(1, normalized / (LACE_CONTENT_RANGE_MAX - LACE_CONTENT_RANGE_MIN))) * 100);
}

function makeLayerSquareAroundCenter(layer) {
  if (!layer || !layer.width || !layer.height) return layer;
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const size = Math.max(layer.width, layer.height);
  layer.x = centerX - size / 2;
  layer.y = centerY - size / 2;
  layer.width = size;
  layer.height = size;
  layer.radius = 0;
  layer.tear = false;
  delete layer.tearSeed;
  return layer;
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
  const categories = ASSET_PANEL_PACKS.reduce((items, pack) => {
    const category = normalizeCreateAssetCategory(pack.category);
    if (category && !items.includes(category)) {
      items.push(category);
    }
    return items;
  }, []);
  const ordered = ASSET_PANEL_CATEGORY_ORDER.filter((category) => category === "推荐" || categories.includes(category));
  return ordered.concat(categories.filter((category) => !ordered.includes(category)));
}

function createAssetPanelPacks(packs) {
  const basePacks = appendLocalGridBackgroundsToPaper04(Array.isArray(packs) ? packs : getAssetPacks());
  const virtualPacks = [
    createBasicShapeAssetPack(),
    createLocalBackgroundPaperAssetPack(),
    createPolkaPaperAssetPack()
  ];
  const virtualIds = virtualPacks.map((pack) => pack.id);
  const withoutVirtual = basePacks.filter((pack) => pack && !virtualIds.includes(pack.id));
  return withoutVirtual.concat(virtualPacks);
}

function createLocalBackgroundPaperAssetPack() {
  const items = BACKGROUND_OPTIONS
    .filter((option) => option && !option.source && option.category === "纯色")
    .map((option) => createLocalBackgroundPaperAsset(option));
  return {
    id: LOCAL_BACKGROUND_PAPER_PACK_ID,
    name: "基础底纸",
    category: "便签",
    tone: "#f7f7f5",
    cover: "",
    coverStyle: "background:linear-gradient(135deg,#ffffff 0 48%,#f4efe5 48% 72%,#d7dbc9 72%);",
    isSolidPaperPack: true,
    coverPreviews: items.slice(0, 4).map((item) => ({
      previewStyle: item.previewStyle,
      previewTiles: []
    })),
    items
  };
}

function createBasicShapeAssetPack() {
  const items = createBasicShapePresetAssets();
  return {
    id: BASIC_SHAPE_PACK_ID,
    name: "基础图形",
    category: "贴纸",
    tone: "#ffffff",
    cover: "",
    isBasicShapePack: true,
    coverPreviews: items.slice(0, 4).map((item) => ({
      previewStyle: item.previewStyle,
      previewTiles: []
    })),
    items
  };
}

function createBasicShapePresetAssets() {
  const presets = [
    ["basic-shape-circle-pink", "玫瑰圆点", { shape: "circle", fillColor: "#f4b8c4", strokeColor: "", strokeWidth: 0, opacity: 1, count: 1, layout: "single" }],
    ["basic-shape-square-soft", "柔色方块", { shape: "square", fillColor: "#eadcf8", strokeColor: "", strokeWidth: 0, opacity: 0.76, count: 1, layout: "single" }],
    ["basic-shape-triangle-peach", "杏色三角", { shape: "triangle", fillColor: "#ffd9bf", strokeColor: "#111111", strokeWidth: 3, opacity: 0.9, count: 1, layout: "single" }],
    ["basic-shape-heart-row", "爱心一排", { shape: "heart", fillColor: "#ffd9bf", strokeColor: "", strokeWidth: 0, opacity: 0.82, count: 3, layout: "row" }],
    ["basic-shape-star-scatter", "星星散落", { shape: "star", fillColor: "#111111", strokeColor: "", strokeWidth: 0, opacity: 0.64, count: 9, layout: "scatter" }],
    ["basic-shape-sparkle-mint", "薄荷四角星", { shape: "sparkle", fillColor: "#d7f0ed", strokeColor: "#111111", strokeWidth: 3, opacity: 1, count: 1, layout: "single" }],
    ["basic-shape-flower-soft", "四瓣小花", { shape: "flower", fillColor: "#eadcf8", strokeColor: "#ffffff", strokeWidth: 3, opacity: 0.9, count: 1, layout: "single" }],
    ["basic-shape-raindrop-blue", "雾蓝雨滴", { shape: "raindrop", fillColor: "#dfe8ff", strokeColor: "#6d9bc3", strokeWidth: 4, opacity: 1, count: 1, layout: "single" }],
    ["basic-shape-diamond-blue", "雾蓝菱形", { shape: "diamond", fillColor: "#dfe8ff", strokeColor: "#6d9bc3", strokeWidth: 6, opacity: 1, count: 1, layout: "single" }],
    ["basic-shape-rounded-cream", "奶油圆角", { shape: "rounded", fillColor: "#fff2b8", strokeColor: "#111111", strokeWidth: 3, opacity: 0.92, count: 1, layout: "single" }],
    ["basic-shape-snowflake-grid", "雪花阵列", { shape: "snowflake", fillColor: "#6d9bc3", strokeColor: "", strokeWidth: 0, opacity: 0.82, count: 6, layout: "grid" }],
    ["basic-shape-plus-scatter", "加号散落", { shape: "cross", fillColor: "#111111", strokeColor: "", strokeWidth: 0, opacity: 0.64, count: 9, layout: "scatter" }],
    ["basic-shape-label", "手写标签", { shape: "tag", fillColor: "#fff2b8", strokeColor: "#111111", strokeWidth: 3, opacity: 1, count: 1, layout: "single" }]
  ];
  return presets.map(([id, name, config]) => createBasicShapeAssetFromConfig({ id, name, config }));
}

function createBasicShapeAssetFromConfig(options) {
  const config = normalizeBasicShapeConfig(options.config || {});
  const size = config.count > 1 ? 260 : 180;
  return {
    id: options.id,
    type: "sticker",
    name: options.name || "基础图形",
    width: size,
    height: size,
    thumb: "",
    previewStyle: createBasicShapePreviewStyle(config),
    layer: {
      type: "sticker",
      width: size,
      height: size,
      rotation: -3,
      opacity: 1,
      shadow: false,
      shapeConfig: config,
      style: {
        shapeConfig: config
      }
    }
  };
}

function normalizeBasicShapeConfig(config = {}) {
  const shape = BASIC_SHAPE_TYPES.some((item) => item.value === config.shape) ? config.shape : "circle";
  const fillColor = config.fillColor || BASIC_SHAPE_FILL_COLORS[0].value;
  const strokeColor = config.strokeColor == null ? "" : config.strokeColor;
  const strokeWidth = Math.max(0, Math.min(16, Number(config.strokeWidth) || 0));
  const opacity = Math.max(0.12, Math.min(1, Number(config.opacity) || 1));
  const countValue = Number(config.count) || 1;
  const count = BASIC_SHAPE_COUNTS.some((item) => item.value === countValue) ? countValue : 1;
  const layout = BASIC_SHAPE_LAYOUTS.some((item) => item.value === config.layout) ? config.layout : "single";
  return { type: "basic-shape", shape, fillColor, strokeColor, strokeWidth, opacity, count, layout };
}

function createBasicShapePreviewStyle(config) {
  const normalized = normalizeBasicShapeConfig(config);
  return `background-color:transparent;background-image:url("${createBasicShapeSvgDataUri(normalized)}");background-size:100% 100%;background-repeat:no-repeat;background-position:center;`;
}

function createBasicShapeSvgDataUri(config) {
  const width = 120;
  const height = 120;
  const placements = getBasicShapePreviewPlacements(config.count, config.layout, width, height);
  const shapes = placements.map((place, index) => createBasicShapeSvgShape(config, place, index)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shapes}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function getBasicShapePreviewPlacements(count, layout, width, height) {
  if (count <= 1 || layout === "single") return [{ x: width / 2, y: height / 2, size: 72, rotate: 0 }];
  if (layout === "row") {
    return Array.from({ length: count }, (_, index) => ({ x: 28 + index * (64 / Math.max(1, count - 1)), y: height / 2, size: 34, rotate: 0 }));
  }
  if (layout === "grid") {
    return Array.from({ length: count }, (_, index) => ({ x: 32 + index % 3 * 28, y: 34 + Math.floor(index / 3) * 28, size: 22, rotate: 0 }));
  }
  return Array.from({ length: count }, (_, index) => ({
    x: 24 + Math.abs(Math.sin(index * 2.1)) * 72,
    y: 24 + Math.abs(Math.cos(index * 1.7)) * 72,
    size: 18 + index % 3 * 4,
    rotate: -18 + index % 5 * 9
  }));
}

function createBasicShapeSvgShape(config, place) {
  const half = place.size / 2;
  const fill = `fill="${config.fillColor}" fill-opacity="${config.opacity}"`;
  const previewStrokeWidth = Math.max(0.8, config.strokeWidth * 0.56);
  const stroke = config.strokeColor && config.strokeWidth > 0 ? `stroke="${config.strokeColor}" stroke-width="${previewStrokeWidth}" stroke-linejoin="round" stroke-linecap="round"` : "";
  const lineStroke = `stroke="${config.fillColor}" stroke-opacity="${config.opacity}" stroke-width="${Math.max(1.6, place.size * 0.08)}" stroke-linecap="round"`;
  const lineBackStroke = config.strokeColor && config.strokeWidth > 0 ? `stroke="${config.strokeColor}" stroke-width="${Math.max(previewStrokeWidth + 1.6, place.size * 0.12)}" stroke-linecap="round"` : "";
  const transform = `transform="rotate(${place.rotate || 0} ${place.x} ${place.y})"`;
  if (config.shape === "square") return `<rect x="${place.x - half}" y="${place.y - half}" width="${place.size}" height="${place.size}" ${fill} ${stroke} ${transform}/>`;
  if (config.shape === "rounded") return `<rect x="${place.x - half}" y="${place.y - half}" width="${place.size}" height="${place.size}" rx="${place.size * 0.18}" ${fill} ${stroke} ${transform}/>`;
  if (config.shape === "diamond") return `<path d="M ${place.x} ${place.y - half} L ${place.x + half} ${place.y} L ${place.x} ${place.y + half} L ${place.x - half} ${place.y} Z" ${fill} ${stroke} ${transform}/>`;
  if (config.shape === "triangle") return `<path d="M ${place.x} ${place.y - half} L ${place.x + half} ${place.y + half} L ${place.x - half} ${place.y + half} Z" ${fill} ${stroke} ${transform}/>`;
  if (config.shape === "star") {
    const points = [];
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? half : half * 0.45;
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      points.push(`${place.x + Math.cos(angle) * r},${place.y + Math.sin(angle) * r}`);
    }
    return `<polygon points="${points.join(" ")}" ${fill} ${stroke} ${transform}/>`;
  }
  if (config.shape === "sparkle") {
    return `<path d="M ${place.x} ${place.y - half} C ${place.x + half * 0.12} ${place.y - half * 0.12}, ${place.x + half * 0.12} ${place.y - half * 0.12}, ${place.x + half} ${place.y} C ${place.x + half * 0.12} ${place.y + half * 0.12}, ${place.x + half * 0.12} ${place.y + half * 0.12}, ${place.x} ${place.y + half} C ${place.x - half * 0.12} ${place.y + half * 0.12}, ${place.x - half * 0.12} ${place.y + half * 0.12}, ${place.x - half} ${place.y} C ${place.x - half * 0.12} ${place.y - half * 0.12}, ${place.x - half * 0.12} ${place.y - half * 0.12}, ${place.x} ${place.y - half} Z" ${fill} ${stroke} ${transform}/>`;
  }
  if (config.shape === "heart") {
    const r = half;
    return `<path d="M ${place.x} ${place.y + r * 0.66} C ${place.x - r * 0.96} ${place.y + r * 0.02}, ${place.x - r * 1.04} ${place.y - r * 0.62}, ${place.x - r * 0.46} ${place.y - r * 0.66} C ${place.x - r * 0.2} ${place.y - r * 0.68}, ${place.x - r * 0.05} ${place.y - r * 0.52}, ${place.x} ${place.y - r * 0.34} C ${place.x + r * 0.05} ${place.y - r * 0.52}, ${place.x + r * 0.2} ${place.y - r * 0.68}, ${place.x + r * 0.46} ${place.y - r * 0.66} C ${place.x + r * 1.04} ${place.y - r * 0.62}, ${place.x + r * 0.96} ${place.y + r * 0.02}, ${place.x} ${place.y + r * 0.66} Z" ${fill} ${stroke} ${transform}/>`;
  }
  if (config.shape === "raindrop") {
    const r = half;
    return `<path d="M ${place.x} ${place.y + r} C ${place.x - r * 0.86} ${place.y + r * 0.18}, ${place.x - r * 0.76} ${place.y - r * 0.66}, ${place.x} ${place.y - r * 0.72} C ${place.x + r * 0.76} ${place.y - r * 0.66}, ${place.x + r * 0.86} ${place.y + r * 0.18}, ${place.x} ${place.y + r} Z" ${fill} ${stroke} ${transform}/>`;
  }
  if (config.shape === "flower") {
    const points = Array.from({ length: 73 }, (_, index) => {
      const angle = -Math.PI / 2 + index / 72 * Math.PI * 2;
      const radius = half * (0.56 + 0.32 * Math.cos(4 * angle));
      return `${place.x + Math.cos(angle) * radius},${place.y + Math.sin(angle) * radius}`;
    }).join(" ");
    return `<polygon points="${points}" ${fill} ${stroke} ${transform}/><circle cx="${place.x}" cy="${place.y}" r="${Math.max(2, half * 0.14)}" fill="#ffffff" fill-opacity="0.72" ${transform}/>`;
  }
  if (config.shape === "snowflake") {
    const arms = [0, 60, 120].map((angle) => {
      const rad = angle * Math.PI / 180;
      const dx = Math.cos(rad) * half;
      const dy = Math.sin(rad) * half;
      const branch = half * 0.22;
      const bx = Math.cos(rad + Math.PI / 4) * branch;
      const by = Math.sin(rad + Math.PI / 4) * branch;
      const cx = Math.cos(rad - Math.PI / 4) * branch;
      const cy = Math.sin(rad - Math.PI / 4) * branch;
      return `<line x1="${place.x - dx}" y1="${place.y - dy}" x2="${place.x + dx}" y2="${place.y + dy}"/><line x1="${place.x + dx * 0.58}" y1="${place.y + dy * 0.58}" x2="${place.x + dx * 0.58 - bx}" y2="${place.y + dy * 0.58 - by}"/><line x1="${place.x + dx * 0.58}" y1="${place.y + dy * 0.58}" x2="${place.x + dx * 0.58 - cx}" y2="${place.y + dy * 0.58 - cy}"/><line x1="${place.x - dx * 0.58}" y1="${place.y - dy * 0.58}" x2="${place.x - dx * 0.58 + bx}" y2="${place.y - dy * 0.58 + by}"/><line x1="${place.x - dx * 0.58}" y1="${place.y - dy * 0.58}" x2="${place.x - dx * 0.58 + cx}" y2="${place.y - dy * 0.58 + cy}"/>`;
    }).join("");
    return `${lineBackStroke ? `<g ${lineBackStroke} ${transform}>${arms}</g>` : ""}<g ${lineStroke} ${transform}>${arms}</g>`;
  }
  if (config.shape === "cross") {
    const arm = half * 0.38;
    return `<path d="M ${place.x - arm} ${place.y - half} H ${place.x + arm} V ${place.y - arm} H ${place.x + half} V ${place.y + arm} H ${place.x + arm} V ${place.y + half} H ${place.x - arm} V ${place.y + arm} H ${place.x - half} V ${place.y - arm} H ${place.x - arm} Z" ${fill} ${stroke} ${transform}/>`;
  }
  if (config.shape === "tag") {
    const w = place.size * 1.18;
    const h = place.size * 0.78;
    const notch = h * 0.28;
    return `<path d="M ${place.x - w / 2} ${place.y - h / 2} H ${place.x + w / 2 - notch} L ${place.x + w / 2} ${place.y} L ${place.x + w / 2 - notch} ${place.y + h / 2} H ${place.x - w / 2} Z" ${fill} ${stroke} ${transform}/><circle cx="${place.x - w * 0.28}" cy="${place.y}" r="${Math.max(2, h * 0.08)}" fill="#ffffff" fill-opacity="0.72" ${transform}/>`;
  }
  return `<circle cx="${place.x}" cy="${place.y}" r="${half}" ${fill} ${stroke} ${transform}/>`;
}

function appendLocalGridBackgroundsToPaper04(packs) {
  const gridItems = createLocalGridBackgroundPaperAssets();
  if (!gridItems.length) return packs;
  return (packs || []).map((pack) => {
    if (!pack || pack.id !== "paper-04") return pack;
    const existingItems = Array.isArray(pack.items) ? pack.items : [];
    const existingIds = new Set(existingItems.map((item) => item && item.id).filter(Boolean));
    const nextGridItems = gridItems.filter((item) => !existingIds.has(item.id));
    return {
      ...pack,
      items: existingItems.concat(nextGridItems)
    };
  });
}

function prepareCreateAssetPack(pack) {
  if (!pack || pack.id !== "paper-04") return pack;
  return appendLocalGridBackgroundsToPaper04([pack])[0] || pack;
}

function createLocalGridBackgroundPaperAssets() {
  return BACKGROUND_OPTIONS
    .filter((option) => option && !option.source && option.category === "格纹")
    .map((option) => createLocalBackgroundPaperAsset(option));
}

function createLocalBackgroundPaperAsset(option) {
  const color = option.color || "#ffffff";
  const pattern = option.pattern || "";
  return {
    id: `paper-${option.id}`,
    type: "paper",
    name: option.name,
    width: 580,
    height: 760,
    thumb: "",
    previewStyle: createLocalBackgroundPaperPreviewStyle(color, pattern),
    layer: {
      type: "paper",
      width: 580,
      height: 760,
      rotation: -2,
      radius: 10,
      shadow: true,
      pattern,
      style: {
        color,
        pattern
      }
    }
  };
}

function createLocalBackgroundPaperPreviewStyle(color, pattern) {
  if (pattern === "dot") {
    return `background-color:${color};background-image:radial-gradient(rgba(17,17,17,0.16) 2rpx, transparent 2rpx);background-size:24rpx 24rpx;`;
  }
  if (pattern === "line") {
    return `background-color:${color};background-image:repeating-linear-gradient(180deg, transparent 0 28rpx, rgba(17,17,17,0.12) 29rpx 30rpx);`;
  }
  if (pattern === "square") {
    return `background-color:${color};background-image:linear-gradient(rgba(17,17,17,0.10) 1rpx, transparent 1rpx),linear-gradient(90deg, rgba(17,17,17,0.10) 1rpx, transparent 1rpx);background-size:30rpx 30rpx;`;
  }
  return `background-color:${color};`;
}

function createSolidPaperCustomPreviewStyle(color) {
  return `background-color:${color || "#ffffff"};`;
}

function createSolidPaperAssetFromColor(color) {
  const paperColor = color || "#ffffff";
  return {
    id: `paper-custom-solid-${Date.now()}`,
    type: "paper",
    name: "自定义纯色纸",
    width: 580,
    height: 760,
    thumb: "",
    previewStyle: createSolidPaperCustomPreviewStyle(paperColor),
    layer: {
      type: "paper",
      width: 580,
      height: 760,
      rotation: -2,
      radius: 10,
      shadow: true,
      pattern: "",
      style: {
        color: paperColor,
        pattern: ""
      }
    }
  };
}

function createPolkaPaperAssetPack() {
  const items = BACKGROUND_OPTIONS.filter((option) => option && option.category === "波点" && option.pattern === "polka").map((option) => {
    if (!option || option.pattern !== "polka") return null;
    return createPolkaPaperAssetFromConfig({
      id: `paper-${option.id}`,
      name: option.name,
      color: option.color || "#ffffff",
      patternConfig: option.patternConfig,
      previewStyle: option.previewStyle,
      previewTiles: option.previewTiles || []
    });
  }).filter(Boolean);
  return {
    id: POLKA_PAPER_PACK_ID,
    name: "波点内芯纸",
    category: "便签",
    tone: "#ffffff",
    cover: "",
    isPolkaPaperPack: true,
    coverPreviews: items.slice(0, 4).map((item) => ({
      previewStyle: item.previewStyle,
      previewTiles: item.previewTiles || []
    })),
    items
  };
}

function createPolkaPaperAssetFromConfig(options) {
  const patternConfig = normalizePolkaPatternConfig(options.patternConfig);
  const preview = createPolkaPaperCustomPreviewData(options.color || "#ffffff", patternConfig);
  return {
    id: options.id,
    type: "paper",
    name: options.name || "波点内芯纸",
    width: 580,
    height: 760,
    thumb: "",
    previewStyle: options.previewStyle || preview.polkaPaperCustomPreviewStyle,
    previewTiles: options.previewTiles || preview.polkaPaperCustomPreviewTiles,
    layer: {
      type: "paper",
      width: 580,
      height: 760,
      rotation: -2,
      radius: 10,
      shadow: true,
      style: {
        color: options.color || "#ffffff",
        patternConfig
      },
      patternConfig
    }
  };
}

function createPolkaPaperCustomPreviewData(background, patternConfig) {
  const config = normalizePolkaPatternConfig(patternConfig);
  return {
    polkaPaperCustomPreviewStyle: createPolkaPreviewStyle(background || "#ffffff", config),
    polkaPaperCustomPreviewTiles: config.shape === "image" && config.imageSource
      ? createPolkaImagePreviewTiles(config.imageSource, config, {
        gapMultiplier: 1.72,
        offset: "grid",
        previewWidth: 260,
        previewHeight: 220
      })
      : []
  };
}

function getCreateAssetPack(packId) {
  if (packId === BASIC_SHAPE_PACK_ID) return createBasicShapeAssetPack();
  if (packId === LOCAL_BACKGROUND_PAPER_PACK_ID) return createLocalBackgroundPaperAssetPack();
  if (packId === POLKA_PAPER_PACK_ID) return createPolkaPaperAssetPack();
  return getAssetPack(packId);
}

function getCreateAssetItem(assetId) {
  const virtualItem = [createBasicShapeAssetPack(), createLocalBackgroundPaperAssetPack(), { items: createLocalGridBackgroundPaperAssets() }, createPolkaPaperAssetPack()]
    .reduce((match, pack) => match || pack.items.find((item) => item.id === assetId), null);
  return virtualItem || getAssetItem(assetId);
}

function resolveCreateTransferAsset(assetId) {
  const virtualItem = [createBasicShapeAssetPack(), createLocalBackgroundPaperAssetPack(), { items: createLocalGridBackgroundPaperAssets() }, createPolkaPaperAssetPack()]
    .reduce((match, pack) => match || pack.items.find((item) => item.id === assetId), null);
  if (virtualItem) return Promise.resolve(virtualItem);
  return getResolvedAssetItem(assetId);
}

function decorateAssetPanelPacks(packs) {
  return packs.map(decorateAssetPanelPack);
}

function decorateAssetPanelPack(pack) {
  if (!pack) return null;
  const displayName = getCreateAssetPackDisplayName(pack);
  return {
    ...pack,
    name: displayName,
    category: normalizeCreateAssetCategory(pack.category),
    isBasicShapePack: !!pack.isBasicShapePack,
    isPolkaPaperPack: !!pack.isPolkaPaperPack,
    isSolidPaperPack: !!pack.isSolidPaperPack,
    coverStyle: pack.coverStyle || "",
    coverPreviews: Array.isArray(pack.coverPreviews) ? pack.coverPreviews : [],
    itemCount: Array.isArray(pack.items) ? pack.items.length : 0,
    items: Array.isArray(pack.items)
      ? pack.items.map((item) => ({
        ...item,
        packId: pack.id,
        packName: displayName,
        panelPreviewTiles: item.previewTiles || [],
        panelPatternPreviewStyle: item.previewStyle || "",
        panelPreviewStyle: getAssetPanelPreviewStyle(item)
      }))
      : []
  };
}

function filterAssetPanelPacks(packs, category) {
  if (!category || category === "推荐") return filterRecommendedAssetPanelPacks(packs);
  const filtered = packs.filter((pack) => normalizeCreateAssetCategory(pack.category) === category);
  if (category === "贴纸") return sortStickerAssetPacks(filtered);
  return category === "便签" ? sortStickyNoteAssetPacks(filtered) : filtered;
}

function normalizeCreateAssetCategory(category) {
  return category === "内芯纸" ? "便签" : category;
}

function filterRecommendedAssetPanelPacks(packs) {
  const byId = new Map((packs || []).map((pack) => [pack.id, pack]));
  const recommended = recommendedAssetPackIds.map((packId) => byId.get(packId)).filter(Boolean);
  const polkaPaperPack = byId.get(POLKA_PAPER_PACK_ID);
  if (polkaPaperPack) {
    recommended.splice(Math.max(0, recommended.length - 2), 0, polkaPaperPack);
  }
  return recommended;
}

function sortStickyNoteAssetPacks(packs) {
  const priority = {
    [LOCAL_BACKGROUND_PAPER_PACK_ID]: 0,
    [POLKA_PAPER_PACK_ID]: 1,
    "biantie-01": 2
  };
  return (packs || [])
    .map((pack, index) => ({ pack, index }))
    .sort((a, b) => {
      const priorityA = Object.prototype.hasOwnProperty.call(priority, a.pack.id) ? priority[a.pack.id] : 99;
      const priorityB = Object.prototype.hasOwnProperty.call(priority, b.pack.id) ? priority[b.pack.id] : 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.index - b.index;
    })
    .map((entry) => entry.pack);
}

function sortStickerAssetPacks(packs) {
  const priority = {
    [BASIC_SHAPE_PACK_ID]: 0
  };
  return (packs || [])
    .map((pack, index) => ({ pack, index }))
    .sort((a, b) => {
      const priorityA = Object.prototype.hasOwnProperty.call(priority, a.pack.id) ? priority[a.pack.id] : 99;
      const priorityB = Object.prototype.hasOwnProperty.call(priority, b.pack.id) ? priority[b.pack.id] : 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.index - b.index;
    })
    .map((entry) => entry.pack);
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

function createHomeShowcaseGroups(groups) {
  const baseGroups = Array.isArray(groups) ? groups : [];
  const backgroundGroup = createBackgroundHomeShowcaseGroup();
  if (!backgroundGroup.items.length) return baseGroups;
  const textureIndex = baseGroups.findIndex((group) => group && group.id === "texture");
  const embossIndex = baseGroups.findIndex((group) => group && group.id === "emboss");
  const insertIndex = textureIndex >= 0 ? textureIndex + 1 : embossIndex >= 0 ? embossIndex : 1;
  return baseGroups.slice(0, insertIndex)
    .concat(backgroundGroup)
    .concat(baseGroups.slice(insertIndex));
}

function createBackgroundHomeShowcaseGroup() {
  const showcaseMap = [
    ["polka-cream-small", "奶油波点感"],
    ["polka-pink-heart", "爱心甜妹感"],
    ["polka-ink-fine", "黑白细波点"],
    ["polka-cream-star", "星星氛围感"],
    ["polka-red-cross", "红色十字感"],
    ["pattern-local-24", "图案波点感"]
  ];
  const items = showcaseMap.map(([backgroundId, title]) => {
    const option = BACKGROUND_OPTIONS.find((item) => item.id === backgroundId);
    if (!option) return null;
    return {
      id: `home-${backgroundId}`,
      title,
      imageSrc: "",
      tone: "pattern",
      effect: "",
      backgroundPresetId: backgroundId,
      previewStyle: option.previewStyle || `background-color:${option.color || "#ffffff"};`,
      previewTiles: createHomeShowcaseBackgroundTiles(option)
    };
  }).filter(Boolean);
  return {
    id: "pattern-background",
    title: "波点控看过来",
    items
  };
}

function getCreateAssetPackDisplayName(pack) {
  const nameMap = {
    "paper-01": "图案",
    "paper-02": "格纹",
    "paper-03": "图案",
    "paper-04": "格纹",
    "paper-05": "纸感",
    "biantie-01": "硫酸纸"
  };
  return nameMap[pack.id] || pack.name || "";
}

function createHomeShowcaseBackgroundTiles(option) {
  const config = option && option.patternConfig;
  if (!config || config.shape !== "image" || !config.imageSource) return option && option.previewTiles || [];
  return createPolkaImagePreviewTiles(config.imageSource, config, {
    gapMultiplier: 1.72,
    offset: "grid",
    previewWidth: 246,
    previewHeight: 300
  });
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
  const polkas = createPolkaBackgroundOptions();
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
  return colors.concat(polkas, paperBackgrounds, grids);
}

function createPolkaBackgroundOptions() {
  const shapePresets = [
    ["polka-cream-small", "奶油小圆", "#fdf7ec", "#b79b75", 5, 48, 0.64, "solid", "circle"],
    ["polka-pink-heart", "粉白爱心", "#f5dfd8", "#ffffff", 9, 48, 1, "solid", "heart"],
    ["polka-ink-fine", "胶片小点", "#ffffff", "#111111", 5, 48, 0.64, "solid", "circle"],
    ["polka-sage-square", "鼠尾草方格", "#d7dbc9", "#5f806f", 5, 48, 0.38, "solid", "square"],
    ["polka-blue-diamond", "雾蓝菱形", "#eaf1f6", "#6d9bc3", 9, 48, 0.64, "outline", "diamond"],
    ["polka-cream-star", "奶油星星", "#fdf7ec", "#111111", 9, 48, 0.64, "solid", "star"],
    ["polka-red-cross", "印章十字", "#ffffff", "#d94a38", 9, 48, 0.64, "solid", "cross"]
  ].map(([id, name, color, dotColor, dotRadius, gap, opacity, style, shape], index) => {
    const patternConfig = normalizePolkaPatternConfig({
      ...DEFAULT_POLKA_PATTERN_CONFIG,
      dotColor,
      dotRadius,
      gap,
      opacity,
      style,
      shape,
      offset: "grid",
      seed: index + 1
    });
    return {
      id,
      name,
      category: "波点",
      color,
      pattern: "polka",
      patternConfig,
      patternClass: "pattern-polka",
      previewStyle: createPolkaPreviewStyle(color, patternConfig)
    };
  });
  const assetPresets = [
    createPolkaLocalImageBackgroundOption({
      id: "pattern-local-24",
      name: "素材 24",
      color: "#ffffff",
      source: "/assets/packs/24.png",
      imageWidth: 177,
      imageHeight: 209,
      dotRadius: 9,
      gap: 48,
      opacity: 0.64,
      seed: 31
    }),
    createPolkaLocalImageBackgroundOption({
      id: "pattern-local-7",
      name: "素材 7",
      color: "#ffffff",
      source: "/assets/packs/7.png",
      imageWidth: 299,
      imageHeight: 169,
      dotRadius: 9,
      gap: 48,
      opacity: 0.64,
      seed: 43
    }),
    createPolkaLocalImageBackgroundOption({
      id: "pattern-local-1",
      name: "素材 1",
      color: "#ffffff",
      source: "/assets/packs/1.png",
      imageWidth: 215,
      imageHeight: 217,
      dotRadius: 9,
      gap: 48,
      opacity: 0.64,
      seed: 59
    })
  ].filter(Boolean);
  return shapePresets.concat(assetPresets);
}

function createPolkaLocalImageBackgroundOption(options) {
  const patternConfig = normalizePolkaPatternConfig({
    ...DEFAULT_POLKA_PATTERN_CONFIG,
    shape: "image",
    imageSourceType: "asset",
    imageSource: options.source,
    imageWidth: options.imageWidth || 0,
    imageHeight: options.imageHeight || 0,
    assetId: options.id,
    packId: "local-patterns",
    dotRadius: options.dotRadius,
    gap: options.gap,
    opacity: options.opacity,
    offset: "grid",
    seed: options.seed
  });
  return {
    id: options.id,
    name: options.name,
    category: "波点",
    color: options.color,
    pattern: "polka",
    patternConfig,
    patternClass: "pattern-polka",
    previewTiles: createPolkaImagePreviewTiles(options.source, patternConfig, { gapMultiplier: 1.72, offset: "grid" }),
    previewStyle: `background-color:${options.color};`
  };
}

function createPolkaAssetBackgroundOption(options) {
  const asset = getAssetItem(options.assetId);
  if (!asset || !asset.source) return null;
  const patternConfig = normalizePolkaPatternConfig({
    ...DEFAULT_POLKA_PATTERN_CONFIG,
    shape: "image",
    imageSourceType: "asset",
    imageSource: asset.source,
    imageWidth: asset.width || 0,
    imageHeight: asset.height || 0,
    assetId: asset.id || options.assetId,
    packId: asset.packId || "",
    dotRadius: options.dotRadius,
    gap: options.gap,
    opacity: options.opacity,
    offset: "grid",
    seed: options.seed
  });
  return {
    id: options.id,
    name: options.name,
    category: "波点",
    color: options.color,
    pattern: "polka",
    patternConfig,
    patternClass: "pattern-polka",
    previewStyle: createPolkaPreviewStyle(options.color, patternConfig)
  };
}

function createPolkaPreviewStyle(color, config) {
  const opacity = Math.max(0, Math.min(1, Number(config.opacity) || DEFAULT_POLKA_PATTERN_CONFIG.opacity));
  const alphaColor = hexToRgba(config.dotColor || DEFAULT_POLKA_PATTERN_CONFIG.dotColor, opacity);
  const previewScale = 240 / 900;
  const radius = Math.max(10, Math.round((Number(config.dotRadius) || DEFAULT_POLKA_PATTERN_CONFIG.dotRadius) * previewScale * 5.6));
  const gap = Math.max(12, Math.round((Number(config.gap) || DEFAULT_POLKA_PATTERN_CONFIG.gap) * previewScale));
  if (config.shape === "image" && config.imageSource) {
    return `background-color:${color};background-image:url(${config.imageSource});background-size:${gap}rpx ${gap}rpx;background-position:center;background-repeat:repeat;`;
  }
  return `background-color:${color};background-image:url("${createPolkaPreviewSvgDataUri(config.shape || "circle", alphaColor, radius, config.style)}");background-size:${gap}rpx ${gap}rpx;background-repeat:repeat;`;
}

function createPolkaImagePreviewTiles(source, config, options = {}) {
  const previewScale = 240 / 900;
  const previewWidth = options.previewWidth || 124;
  const previewHeight = options.previewHeight || 136;
  const gap = Math.max(12, Math.round((Number(config.gap) || DEFAULT_POLKA_PATTERN_CONFIG.gap) * previewScale * (options.gapMultiplier || 1)));
  const size = Math.max(12, Math.round(gap * 0.68));
  return createStaggeredPreviewTiles({
    previewWidth,
    previewHeight,
    gap,
    size,
    offset: options.offset || config.offset,
    styleForTile: (left, top) => `left:${left}rpx;top:${top}rpx;width:${size}rpx;height:${size}rpx;`
  }).map((tile) => ({
    ...tile,
    src: source
  }));
}

function createStaggeredPreviewTiles({ previewWidth, previewHeight, gap, size, offset, styleForTile }) {
  const tiles = [];
  for (let centerY = gap / 2; centerY < previewHeight + size / 2; centerY += gap) {
    const row = Math.floor(centerY / gap);
    const rowOffset = offset === "grid" ? 0 : row % 2 === 1 ? gap / 2 : 0;
    for (let centerX = gap / 2 + rowOffset - gap; centerX < previewWidth + size / 2; centerX += gap) {
      const left = Math.round(centerX - size / 2);
      const top = Math.round(centerY - size / 2);
      tiles.push({
        style: styleForTile(left, top)
      });
    }
  }
  return tiles;
}

function createPolkaPreviewSvgDataUri(shape, color, radius, style) {
  const size = Math.max(24, Math.round(radius * 4 + 16));
  const center = size / 2;
  const paint = style === "outline"
    ? `fill="none" stroke="${color}" stroke-width="${Math.max(1.2, radius * 0.35)}" stroke-linejoin="round" stroke-linecap="round"`
    : `fill="${color}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${createPolkaPreviewSvgShape(shape, center, radius, paint)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function createPolkaPreviewSvgShape(shape, center, radius, paint) {
  if (shape === "square") {
    return `<rect x="${center - radius}" y="${center - radius}" width="${radius * 2}" height="${radius * 2}" ${paint}/>`;
  }
  if (shape === "diamond") {
    const r = radius * 1.18;
    return `<path d="M ${center} ${center - r} L ${center + r} ${center} L ${center} ${center + r} L ${center - r} ${center} Z" ${paint}/>`;
  }
  if (shape === "heart") {
    const r = radius;
    return `<path d="M ${center} ${center + r * 0.86} C ${center - r * 1.18} ${center + r * 0.08}, ${center - r * 0.92} ${center - r * 0.86}, ${center - r * 0.24} ${center - r * 0.54} C ${center - r * 0.04} ${center - r * 0.44}, ${center} ${center - r * 0.18}, ${center} ${center - r * 0.02} C ${center} ${center - r * 0.18}, ${center + r * 0.04} ${center - r * 0.44}, ${center + r * 0.24} ${center - r * 0.54} C ${center + r * 0.92} ${center - r * 0.86}, ${center + r * 1.18} ${center + r * 0.08}, ${center} ${center + r * 0.86} Z" ${paint}/>`;
  }
  if (shape === "star") {
    const points = [];
    for (let i = 0; i < 10; i += 1) {
      const pointRadius = i % 2 === 0 ? radius * 1.18 : radius * 0.5;
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      points.push(`${center + Math.cos(angle) * pointRadius},${center + Math.sin(angle) * pointRadius}`);
    }
    return `<polygon points="${points.join(" ")}" ${paint}/>`;
  }
  if (shape === "cross") {
    const arm = radius * 0.42;
    return `<path d="M ${center - arm} ${center - radius} H ${center + arm} V ${center - arm} H ${center + radius} V ${center + arm} H ${center + arm} V ${center + radius} H ${center - arm} V ${center + arm} H ${center - radius} V ${center - arm} H ${center - arm} Z" ${paint}/>`;
  }
  return `<circle cx="${center}" cy="${center}" r="${radius}" ${paint}/>`;
}

function normalizePolkaPatternConfig(config = {}) {
  const dotRadius = Number(config.dotRadius);
  const gap = Number(config.gap);
  const opacity = Number(config.opacity);
  const style = ["solid", "soft", "outline"].includes(config.style) ? config.style : DEFAULT_POLKA_PATTERN_CONFIG.style;
  const shape = ["circle", "square", "diamond", "heart", "star", "cross", "image"].includes(config.shape) ? config.shape : DEFAULT_POLKA_PATTERN_CONFIG.shape;
  const dotColors = Array.isArray(config.dotColors) ? config.dotColors.filter(Boolean).slice(0, 6) : [];
  const imageWidth = Number(config.imageWidth);
  const imageHeight = Number(config.imageHeight);
  return {
    type: "polka",
    dotColor: config.dotColor || DEFAULT_POLKA_PATTERN_CONFIG.dotColor,
    dotColors,
    dotRadius: Number.isFinite(dotRadius) ? Math.max(2, Math.min(28, dotRadius)) : DEFAULT_POLKA_PATTERN_CONFIG.dotRadius,
    gap: Number.isFinite(gap) ? Math.max(18, Math.min(120, gap)) : DEFAULT_POLKA_PATTERN_CONFIG.gap,
    opacity: Number.isFinite(opacity) ? Math.max(0.12, Math.min(1, opacity)) : DEFAULT_POLKA_PATTERN_CONFIG.opacity,
    style,
    shape,
    imageSource: config.imageSource || "",
    imageWidth: Number.isFinite(imageWidth) ? Math.max(0, imageWidth) : 0,
    imageHeight: Number.isFinite(imageHeight) ? Math.max(0, imageHeight) : 0,
    imageSourceType: ["upload", "asset"].includes(config.imageSourceType) ? config.imageSourceType : "",
    assetId: config.assetId || "",
    packId: config.packId || "",
    offset: config.offset === "grid" ? "grid" : "staggered",
    seed: Number.isFinite(Number(config.seed)) ? Number(config.seed) : DEFAULT_POLKA_PATTERN_CONFIG.seed
  };
}

function getPolkaPatternControlData(draft) {
  const isPolkaBackground = !!(draft && draft.backgroundPattern === "polka");
  if (!isPolkaBackground) {
    return {
      selectedPolkaBackground: "",
      selectedPolkaDotColor: "",
      selectedPolkaDotRadius: "",
      selectedPolkaGap: "",
      selectedPolkaStyle: "",
      selectedPolkaShape: "",
      selectedPolkaOpacity: "",
      selectedPolkaImageSource: "",
      selectedPolkaImageSourceType: ""
    };
  }
  const config = normalizePolkaPatternConfig(draft.backgroundPatternConfig);
  return {
    selectedPolkaBackground: draft.background || POLKA_BACKGROUND_COLORS[0].value,
    selectedPolkaDotColor: config.dotColor,
    selectedPolkaDotRadius: config.dotRadius,
    selectedPolkaGap: config.gap,
    selectedPolkaStyle: config.style,
    selectedPolkaShape: config.shape,
    selectedPolkaOpacity: config.opacity,
    selectedPolkaImageSource: config.imageSource || "",
    selectedPolkaImageSourceType: config.imageSourceType || ""
  };
}

function isPolkaPaperLayer(layer) {
  const patternConfig = layer && (layer.patternConfig || layer.style && layer.style.patternConfig);
  return !!(layer && layer.type === "paper" && patternConfig && patternConfig.type === "polka");
}

function getPolkaPaperControlData(layer) {
  if (!isPolkaPaperLayer(layer)) {
    return {
      selectedPolkaBackground: POLKA_BACKGROUND_COLORS[0].value,
      selectedPolkaDotColor: DEFAULT_POLKA_PATTERN_CONFIG.dotColor,
      selectedPolkaDotRadius: DEFAULT_POLKA_PATTERN_CONFIG.dotRadius,
      selectedPolkaGap: DEFAULT_POLKA_PATTERN_CONFIG.gap,
      selectedPolkaStyle: DEFAULT_POLKA_PATTERN_CONFIG.style,
      selectedPolkaShape: DEFAULT_POLKA_PATTERN_CONFIG.shape,
      selectedPolkaOpacity: DEFAULT_POLKA_PATTERN_CONFIG.opacity,
      selectedPolkaImageSource: "",
      selectedPolkaImageSourceType: "",
      selectedPolkaImageWidth: 0,
      selectedPolkaImageHeight: 0,
      selectedPolkaAssetId: "",
      selectedPolkaPackId: ""
    };
  }
  const config = normalizePolkaPatternConfig(layer.patternConfig || layer.style && layer.style.patternConfig);
  return {
    selectedPolkaBackground: layer.style && layer.style.color || POLKA_BACKGROUND_COLORS[0].value,
    selectedPolkaDotColor: config.dotColor,
    selectedPolkaDotRadius: config.dotRadius,
    selectedPolkaGap: config.gap,
    selectedPolkaStyle: config.style,
    selectedPolkaShape: config.shape,
    selectedPolkaOpacity: config.opacity,
    selectedPolkaImageSource: config.imageSource || "",
    selectedPolkaImageSourceType: config.imageSourceType || "",
    selectedPolkaImageWidth: config.imageWidth || 0,
    selectedPolkaImageHeight: config.imageHeight || 0,
    selectedPolkaAssetId: config.assetId || "",
    selectedPolkaPackId: config.packId || ""
  };
}

function hexToRgba(hex, alpha) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex || "#111111";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function drawTornClipPolygonMaskPath(ctx, layer, polygon, scale, localBounds = { x: 0, y: 0 }) {
  const points = getTornClipPolygonMaskPoints(layer, polygon, scale, localBounds);
  drawPointMaskPath(ctx, points);
}

function drawTornShapeMaskPath(ctx, layer, shape, width, height) {
  const points = getTornShapeMaskPoints(layer, shape, width, height);
  drawPointMaskPath(ctx, points);
}

function drawPointMaskPath(ctx, points) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function getTornClipPolygonMaskPoints(layer, polygon, scale, localBounds = { x: 0, y: 0 }) {
  const width = Math.max(1, layer.width || 1);
  const height = Math.max(1, layer.height || 1);
  const outputWidth = Math.max(1, Math.round((localBounds.width || width) * scale));
  const outputHeight = Math.max(1, Math.round((localBounds.height || height) * scale));
  const seed = getLayerTearSeed(layer);
  const amplitude = Math.max(6, Math.min(24, Math.min(outputWidth, outputHeight) * 0.038));
  const step = Math.max(18, Math.min(38, Math.min(outputWidth, outputHeight) / 8));
  const points = [];
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    addTornMaskSegmentPoints(
      points,
      (point.x - (localBounds.x || 0)) * scale,
      (point.y - (localBounds.y || 0)) * scale,
      (next.x - (localBounds.x || 0)) * scale,
      (next.y - (localBounds.y || 0)) * scale,
      step,
      amplitude,
      seed + index * 53
    );
  });
  return points;
}

function getTornShapeMaskPoints(layer, shape, width, height) {
  const samples = sampleTearMaskShapeOutline(shape, 0, 0, width, height);
  if (!samples.length) return [];
  const seed = getLayerTearSeed(layer);
  const center = { x: width / 2, y: height / 2 };
  const amplitude = Math.max(6, Math.min(20, Math.min(width, height) * 0.034));
  return samples.map((point, index) => {
    const normal = normalizeMaskVector({ x: point.x - center.x, y: point.y - center.y }) || { x: 0, y: -1 };
    const jitter = getTearMaskJitter(seed + index * 41, index, amplitude);
    return {
      x: point.x + normal.x * jitter,
      y: point.y + normal.y * jitter
    };
  });
}

function addTornMaskSegmentPoints(points, x1, y1, x2, y2, step, amplitude, seed) {
  const length = Math.max(1, Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2));
  const count = Math.max(2, Math.ceil(length / step));
  const normal = getMaskSegmentNormal(x1, y1, x2, y2);
  for (let index = 0; index <= count; index += 1) {
    if (points.length && index === 0) continue;
    const t = index / count;
    const jitter = getTearMaskJitter(seed, index, amplitude);
    const alongJitter = (seededMaskUnit(seed + index * 173) - 0.5) * Math.min(step * 0.34, amplitude * 0.9);
    points.push({
      x: x1 + (x2 - x1) * t + normal.x * jitter + (x2 - x1) / length * alongJitter,
      y: y1 + (y2 - y1) * t + normal.y * jitter + (y2 - y1) / length * alongJitter
    });
  }
}

function sampleTearMaskShapeOutline(shape, x, y, width, height) {
  if (shape === "circle") return sampleTearMaskEllipse(x, y, width, height, 48);
  if (shape === "heart") return sampleTearMaskHeart(x, y, width, height, 64);
  if (shape === "star") return sampleTearMaskStar(x, y, width, height);
  if (shape === "tag") return sampleTearMaskTag(x, y, width, height);
  if (shape === "stamp") return sampleTearMaskStamp(x, y, width, height);
  return [];
}

function sampleTearMaskEllipse(x, y, width, height, count) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index / count * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * width / 2,
      y: cy + Math.sin(angle) * height / 2
    };
  });
}

function sampleTearMaskHeart(x, y, width, height, count) {
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / count * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    result.push({
      x: x + width / 2 + hx / 34 * width,
      y: y + height * 0.52 - hy / 34 * height
    });
  }
  return result;
}

function sampleTearMaskStar(x, y, width, height) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const outer = Math.min(width, height) * 0.48;
  const inner = outer * 0.46;
  const points = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return densifyTearMaskClosedPoints(points, Math.max(18, Math.min(width, height) / 8));
}

function sampleTearMaskTag(x, y, width, height) {
  const cut = Math.min(width, height) * 0.18;
  return densifyTearMaskClosedPoints([
    { x, y },
    { x: x + width - cut, y },
    { x: x + width, y: y + cut },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ], Math.max(18, Math.min(width, height) / 8));
}

function sampleTearMaskStamp(x, y, width, height) {
  const points = [];
  const notch = Math.max(5, Math.min(width, height) * 0.045);
  const step = notch * 2.2;
  for (let px = x + notch; px < x + width - notch; px += step) points.push({ x: px, y: y + (points.length % 2 ? notch : 0) });
  for (let py = y + notch; py < y + height - notch; py += step) points.push({ x: x + width - (points.length % 2 ? notch : 0), y: py });
  for (let px = x + width - notch; px > x + notch; px -= step) points.push({ x: px, y: y + height - (points.length % 2 ? notch : 0) });
  for (let py = y + height - notch; py > y + notch; py -= step) points.push({ x: x + (points.length % 2 ? notch : 0), y: py });
  return points;
}

function densifyTearMaskClosedPoints(points, step) {
  const result = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const length = Math.max(1, Math.sqrt((next.x - point.x) ** 2 + (next.y - point.y) ** 2));
    const count = Math.max(1, Math.ceil(length / step));
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      result.push({
        x: point.x + (next.x - point.x) * t,
        y: point.y + (next.y - point.y) * t
      });
    }
  });
  return result;
}

function getMaskSegmentNormal(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dy / length, y: -dx / length };
}

function normalizeMaskVector(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (!length) return null;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function getTearMaskJitter(seed, index, amplitude) {
  const raw = seededMaskUnit(seed + index * 97);
  const chip = seededMaskUnit(seed + index * 211);
  const wave = Math.sin((seed % 31 + index) * 1.37) * 0.24 + 0.74;
  const micro = (seededMaskUnit(seed + index * 157) - 0.5) * amplitude * 0.34;
  const notch = chip > 0.86 ? amplitude * (0.42 + seededMaskUnit(seed + index * 223) * 0.5) : 0;
  return Math.max(1, raw * amplitude * wave + micro + notch);
}

function getLayerTearSeed(layer) {
  if (layer && layer.tearSeed != null) return Number(layer.tearSeed) || 1;
  const id = String(layer && layer.id || "tear");
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function seededMaskUnit(seed) {
  let value = Math.imul(seed ^ 0x6d2b79f5, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return ((value >>> 0) % 10000) / 10000;
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
        ...createTextFontStyle(style.fontId || style.fontLabel || "system"),
        textAlign: normalizeTextAlign(style.textAlign)
      }
    };
  }).map((layer) => {
    if (layer && layer.type === "text") resizeTextLayerToContent(layer);
    return layer;
  });
  return draft;
}

function resizeTextLayerToContent(layer) {
  if (!layer || layer.type !== "text") return layer;
  const centerY = (Number(layer.y) || 0) + (Number(layer.height) || 0) / 2;
  const nextHeight = getTextLayerContentHeight(layer);
  if (!nextHeight || Math.abs(nextHeight - (Number(layer.height) || 0)) < 0.5) return layer;
  layer.y = centerY - nextHeight / 2;
  layer.height = nextHeight;
  return layer;
}

function getTextLayerContentHeight(layer) {
  const style = layer && layer.style || {};
  const fontSize = Math.max(1, Number(style.fontSize) || 54);
  const lineCount = getTextLineCount(layer && layer.text);
  const lineHeight = fontSize * 1.22;
  const verticalPadding = Math.max(20, fontSize * 0.32);
  return Math.max(86, Math.ceil(lineCount * lineHeight + verticalPadding));
}

function getTextLineCount(text) {
  const normalized = String(text == null || text === "" ? "weekend" : text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return Math.max(1, normalized.split("\n").length);
}

function normalizeTextAlign(value) {
  return ["left", "center", "right"].includes(value) ? value : "center";
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
  if (effect.type === "taped" || effect.type === "floating" || effect.type === "lace-center" || effect.type === "foil-center") return effect.type;
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
    },
    "creative-tear-paper": {
      label: "创意撕纸",
      create: (page, layer) => page.createCreativeTearPaperImage(layer)
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
  if (type === "creative-tear-paper") return { model: "doubao-seedream-4-0-250828", styleId: settings.creativeTearPaperStyle || DEFAULT_CREATIVE_TEAR_PAPER_STYLE, sequential_image_generation: "disabled" };
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

function isCollageSlot(layer) {
  return !!(layer && layer.style && layer.style.collageSlot);
}

function isFilledCollageSlot(layer) {
  return isCollageSlot(layer) && !!layer.source;
}

function isReplaceableImageLayer(layer) {
  return !!(layer && layer.type === "image" && layer.source);
}

function getCollageImageTransform(layer) {
  const collage = layer && layer.style && layer.style.collageSlot || {};
  return {
    imageScale: Math.max(1, Math.min(3, collage.imageScale || 1)),
    imageOffsetX: collage.imageOffsetX || 0,
    imageOffsetY: collage.imageOffsetY || 0
  };
}

function setCollageImageTransform(layer, transform) {
  if (!isFilledCollageSlot(layer)) return;
  const style = { ...(layer.style || {}) };
  const collage = { ...(style.collageSlot || {}) };
  const sourceWidth = layer.sourceWidth || layer.width;
  const sourceHeight = layer.sourceHeight || layer.height;
  const imageScale = Math.max(1, Math.min(3, transform.imageScale || 1));
  const fit = Math.min(layer.width / sourceWidth, layer.height / sourceHeight) * imageScale;
  const renderedWidth = sourceWidth * fit;
  const renderedHeight = sourceHeight * fit;
  collage.imageScale = imageScale;
  collage.imageOffsetX = clampCollageImageOffset(transform.imageOffsetX || 0, renderedWidth, layer.width);
  collage.imageOffsetY = clampCollageImageOffset(transform.imageOffsetY || 0, renderedHeight, layer.height);
  style.collageSlot = collage;
  layer.style = style;
}

function clampCollageImageOffset(value, renderedSize, slotSize) {
  const maximum = Math.abs(renderedSize - slotSize) / 2;
  return Math.max(-maximum, Math.min(maximum, value));
}

function intersectRects(first, second) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function getCollageSlots(preset, draft) {
  const gap = 0;
  const inset = 0;
  const x = inset;
  const y = inset;
  const width = draft.width - inset * 2;
  const height = draft.height - inset * 2;
  if (preset === "horizontal") {
    const slotWidth = (width - gap) / 2;
    return [{ x, y, width: slotWidth, height }, { x: x + slotWidth + gap, y, width: slotWidth, height }];
  }
  if (preset === "vertical") {
    const slotHeight = (height - gap) / 2;
    return [{ x, y, width, height: slotHeight }, { x, y: y + slotHeight + gap, width, height: slotHeight }];
  }
  if (preset === "grid") {
    const slotWidth = (width - gap) / 2;
    const slotHeight = (height - gap) / 2;
    return [
      { x, y, width: slotWidth, height: slotHeight },
      { x: x + slotWidth + gap, y, width: slotWidth, height: slotHeight },
      { x, y: y + slotHeight + gap, width: slotWidth, height: slotHeight },
      { x: x + slotWidth + gap, y: y + slotHeight + gap, width: slotWidth, height: slotHeight }
    ];
  }
  return [];
}
