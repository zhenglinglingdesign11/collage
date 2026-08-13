const {
  ASSET_TRANSFER_STORAGE_KEY,
  ASSET_TRANSFER_MODE_STORAGE_KEY,
  ASSET_ENTRY_CONTEXT_STORAGE_KEY,
  FAVORITE_PACK_STORAGE_KEY,
  recommendedAssetPackIds,
  getAssetPacks,
  getAssetPack,
  getResolvedAssetPacks,
  getResolvedAssetPack
} = require("../../config/assets");
const { showModal } = require("../../utils/feedback");
const { shareAssets } = require("../../utils/share");
const { track, trackPageShow, trackPageHide, trackShare } = require("../../utils/analytics");

const assetPageCategories = ["推荐", "收藏", "贴纸", "胶带", "便签", "主题混装", "相框"];
const POLKA_PAPER_PACK_ID = "polka-paper-materials";
const LOCAL_BACKGROUND_PAPER_PACK_ID = "local-background-paper-materials";
const BASIC_SHAPE_PACK_ID = "basic-shape-materials";
const POLKA_PAPER_CUSTOM_ENTRY_ID = "paper-polka-custom-entry";
const SOLID_PAPER_CUSTOM_ENTRY_ID = "paper-solid-custom-entry";
const BASIC_SHAPE_CUSTOM_ENTRY_ID = "basic-shape-custom-entry";
const PENDING_CREATE_ACTION_STORAGE_KEY = "journal.pendingCreateAction";
const DEFAULT_POLKA_PATTERN_CONFIG = {
  type: "polka",
  dotColor: "#111111",
  dotRadius: 5,
  gap: 48,
  opacity: 0.64,
  style: "solid",
  shape: "circle",
  offset: "grid",
  imageSource: "",
  imageWidth: 0,
  imageHeight: 0,
  assetId: "",
  packId: "",
  seed: 0
};
const localBackgroundPaperOptions = [
  ["plain-warm", "暖白", "#fdfdfb", ""],
  ["plain-white", "白色", "#ffffff", ""],
  ["plain-mist", "浅灰", "#f7f7f5", ""],
  ["plain-cream", "奶油", "#f4efe5", ""],
  ["plain-pink", "浅粉", "#f5dfd8", ""],
  ["plain-sage", "鼠尾草", "#d7dbc9", ""],
  ["grid-dot", "点阵", "#fdfdfb", "dot"],
  ["grid-line", "横线", "#ffffff", "line"],
  ["grid-square", "方格", "#f7f7f5", "square"]
];
const polkaPaperPresetDefinitions = [
  ["polka-cream-small", "奶油小圆", "#fdf7ec", "#b79b75", 5, 48, 0.64, "solid", "circle"],
  ["polka-pink-heart", "粉白爱心", "#f5dfd8", "#ffffff", 9, 48, 1, "solid", "heart"],
  ["polka-ink-fine", "胶片小点", "#ffffff", "#111111", 5, 48, 0.64, "solid", "circle"],
  ["polka-sage-square", "鼠尾草方格", "#d7dbc9", "#5f806f", 5, 48, 0.38, "solid", "square"],
  ["polka-blue-diamond", "雾蓝菱形", "#eaf1f6", "#6d9bc3", 9, 48, 0.64, "outline", "diamond"],
  ["polka-cream-star", "奶油星星", "#fdf7ec", "#111111", 9, 48, 0.64, "solid", "star"],
  ["polka-red-cross", "印章十字", "#ffffff", "#d94a38", 9, 48, 0.64, "solid", "cross"],
  ["pattern-local-24", "素材 24", "#ffffff", "#111111", 9, 48, 0.64, "solid", "image", "/assets/packs/24.png", 177, 209],
  ["pattern-local-7", "素材 7", "#ffffff", "#111111", 9, 48, 0.64, "solid", "image", "/assets/packs/7.png", 299, 169],
  ["pattern-local-1", "素材 1", "#ffffff", "#111111", 9, 48, 0.64, "solid", "image", "/assets/packs/1.png", 215, 217]
];
const basicShapeTypeOptions = ["circle", "square", "triangle", "heart", "star", "sparkle", "flower", "raindrop", "diamond", "rounded", "snowflake", "cross", "tag"];
const basicShapePresetDefinitions = [
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

const detailPaperWidth = 670;
const detailPaperMinHeight = 920;
const detailPaperBottomReserve = 238;
const detailPaperPaddingX = 42;
const detailPaperPaddingTop = 52;
const detailPaperGapY = 52;
const detailTwoColumnGap = 36;
const detailScatterOffsets = [
  { x: -6, y: 0, rotate: -7 },
  { x: 12, y: 12, rotate: 5 },
  { x: 4, y: -4, rotate: -3 },
  { x: -10, y: 10, rotate: 6 },
  { x: 8, y: 4, rotate: -6 },
  { x: -4, y: 14, rotate: 4 }
];

Page({
  data: {
    categories: assetPageCategories,
    activeCategory: "推荐",
    packs: [],
    visiblePacks: [],
    detailPack: null,
    selectedAssetIds: [],
    selectedAssets: [],
    assetSelectionMode: false,
    statusBarHeight: 0,
    navBarHeight: 88,
    statusTop: 0,
    toolbarGap: 0,
    detailPaperMinHeight
  },

  onLoad() {
    enableShareMenu();
    const system = wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const statusBarHeight = system.statusBarHeight || 0;
    const navBarHeight = menu
      ? Math.ceil(menu.bottom + 8)
      : Math.ceil(statusBarHeight + 44);
    const statusTop = Math.ceil(statusBarHeight + 2);
    const chromeTop = menu ? Math.ceil(menu.bottom + 4) : Math.ceil(statusBarHeight + 44);
    this.setData({
      statusBarHeight,
      navBarHeight,
      statusTop,
      toolbarGap: Math.max(0, chromeTop - statusTop)
    });
    this.refreshPacks();
    track("assets_page_view", { page: "assets" });
  },

  onShareAppMessage() {
    trackShare("assets", "app_message");
    return shareAssets();
  },

  onShareTimeline() {
    trackShare("assets", "timeline");
    return shareAssets();
  },

  onShow() {
    trackPageShow(this, "assets");
    this.captureEntryContext();
    this.syncTabBarVisibility();
    this.refreshPacks();
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setSelectedByPath) {
      tabBar.setSelectedByPath("/pages/assets/index");
    }
  },

  onHide() {
    trackPageHide(this);
    if (!this.isTransferringSelectedAssets) {
      this.assetEntryContext = null;
      this.setData({ assetSelectionMode: false });
    }
    this.isTransferringSelectedAssets = false;
  },

  captureEntryContext() {
    const context = wx.getStorageSync(ASSET_ENTRY_CONTEXT_STORAGE_KEY);
    wx.removeStorageSync(ASSET_ENTRY_CONTEXT_STORAGE_KEY);
    if (context && context.source === "createAssetDrawer" && context.preserveDraft) {
      this.assetEntryContext = context;
    } else {
      this.assetEntryContext = null;
    }
    this.setData({ assetSelectionMode: this.isCreateAssetSelectionMode() });
  },

  isCreateAssetSelectionMode() {
    return !!(this.assetEntryContext && this.assetEntryContext.source === "createAssetDrawer" && this.assetEntryContext.preserveDraft);
  },

  syncTabBarVisibility() {
    if (this.data.detailPack || this.isCreateAssetSelectionMode()) {
      wx.hideTabBar({ animation: false });
      return;
    }
    wx.showTabBar({ animation: false });
  },

  refreshPacks() {
    const favoritePackIds = readFavoritePackIds();
    const packs = createAssetPagePacks(getAssetPacks()).map((pack, index) => ({
      ...pack,
      index,
      isFavorite: favoritePackIds.includes(pack.id)
    }));
    const visiblePacks = this.filterPacks(packs, this.data.activeCategory);
    const detailPack = this.data.detailPack
      ? decoratePack(getAssetPagePack(this.data.detailPack.id), favoritePackIds, this.data.selectedAssetIds)
      : null;
    this.setData({
      packs,
      visiblePacks,
      detailPack,
      selectedAssets: getSelectedAssets(detailPack, this.data.selectedAssetIds)
    });
    this.refreshResolvedPacks();
  },

  refreshResolvedPacks() {
    const requestId = Date.now();
    this.assetRequestId = requestId;
    const currentDetailPackId = this.data.detailPack && this.data.detailPack.id;
    Promise.all([
      getResolvedAssetPacks(),
      currentDetailPackId ? getResolvedAssetPagePack(currentDetailPackId) : Promise.resolve(null)
    ]).then(([resolvedPacks, resolvedDetailPack]) => {
      if (this.assetRequestId !== requestId) return;
      const favoritePackIds = readFavoritePackIds();
      const packs = createAssetPagePacks(resolvedPacks).map((pack, index) => ({
        ...pack,
        index,
        isFavorite: favoritePackIds.includes(pack.id)
      }));
      const detailPack = resolvedDetailPack
        ? decoratePack(resolvedDetailPack, favoritePackIds, this.data.selectedAssetIds)
        : null;
      this.setData({
        packs,
        visiblePacks: this.filterPacks(packs, this.data.activeCategory),
        detailPack,
        selectedAssets: getSelectedAssets(detailPack, this.data.selectedAssetIds)
      });
    });
  },

  filterPacks(packs, category) {
    if (category === "收藏") {
      return packs.filter((pack) => pack.isFavorite);
    }
    if (category && category !== "推荐") {
      const filtered = packs.filter((pack) => normalizeAssetPageCategory(pack.category) === category);
      if (category === "贴纸") return sortStickerAssetPacks(filtered);
      return category === "便签" ? sortStickyNoteAssetPacks(filtered) : filtered;
    }
    return filterRecommendedPacks(packs);
  },

  setAssetCategory(event) {
    const activeCategory = event.currentTarget.dataset.category || "推荐";
    if (activeCategory === this.data.activeCategory) return;
    track("asset_category_select", { page: "assets", category: activeCategory, source: "assets" });
    this.setData({
      activeCategory,
      visiblePacks: this.filterPacks(this.data.packs, activeCategory)
    });
  },

  openPack(event) {
    const packId = event.currentTarget.dataset.pack;
    const pack = getAssetPagePack(packId);
    if (!pack) return;
    track("asset_pack_open", {
      page: "assets",
      packId: pack.id,
      category: normalizeAssetPageCategory(pack.category || ""),
      source: "assets",
      itemCount: Array.isArray(pack.items) ? pack.items.length : 0
    });
    wx.hideTabBar({ animation: false });
    this.setData({
      detailPack: decoratePack(pack, readFavoritePackIds(), []),
      selectedAssetIds: [],
      selectedAssets: []
    });
    getResolvedAssetPagePack(packId).then((resolvedPack) => {
      if (!resolvedPack || !this.data.detailPack || this.data.detailPack.id !== packId) return;
      this.setData({
        detailPack: decoratePack(resolvedPack, readFavoritePackIds(), this.data.selectedAssetIds),
        selectedAssets: getSelectedAssets(resolvedPack, this.data.selectedAssetIds)
      });
    });
  },

  closeDetail() {
    this.setData({
      detailPack: null,
      selectedAssetIds: [],
      selectedAssets: []
    });
    this.syncTabBarVisibility();
    this.refreshPacks();
  },

  returnToCreateFromAssets() {
    this.assetEntryContext = null;
    this.isTransferringSelectedAssets = true;
    this.setData({
      detailPack: null,
      selectedAssetIds: [],
      selectedAssets: [],
      assetSelectionMode: false
    });
    wx.switchTab({ url: "/pages/create/index" });
  },

  toggleFavoritePack() {
    const pack = this.data.detailPack;
    if (!pack) return;
    const current = readFavoritePackIds();
    const wasFavorite = current.includes(pack.id);
    const favoritePackIds = wasFavorite
      ? current.filter((id) => id !== pack.id)
      : current.concat(pack.id);
    wx.setStorageSync(FAVORITE_PACK_STORAGE_KEY, favoritePackIds);
    track(wasFavorite ? "asset_pack_unfavorite" : "asset_pack_favorite", {
      page: "assets",
      packId: pack.id,
      category: pack.category || ""
    });
    this.refreshPacks();
  },

  selectDetailAsset(event) {
    const assetId = event.currentTarget.dataset.assetId;
    if (assetId === POLKA_PAPER_CUSTOM_ENTRY_ID) {
      this.confirmOpenPolkaPaperCustom();
      return;
    }
    if (assetId === SOLID_PAPER_CUSTOM_ENTRY_ID) {
      this.confirmOpenSolidPaperCustom();
      return;
    }
    if (assetId === BASIC_SHAPE_CUSTOM_ENTRY_ID) {
      this.confirmOpenBasicShapeCustom();
      return;
    }
    const wasSelected = this.data.selectedAssetIds.includes(assetId);
    const selectedAssetIds = wasSelected
      ? this.data.selectedAssetIds.filter((id) => id !== assetId)
      : this.data.selectedAssetIds.concat(assetId);
    track(wasSelected ? "asset_unselect" : "asset_select", {
      page: "assets",
      packId: this.data.detailPack && this.data.detailPack.id || "",
      assetId,
      selectedCount: selectedAssetIds.length
    });
    const sourcePack = this.data.detailPack || getAssetPagePack(this.data.detailPack.id);
    const detailPack = decoratePack(sourcePack, readFavoritePackIds(), selectedAssetIds);
    this.setData({
      selectedAssetIds,
      detailPack,
      selectedAssets: getSelectedAssets(detailPack, selectedAssetIds)
    });
  },

  removeDetailAsset(event) {
    const assetId = event.currentTarget.dataset.assetId;
    const selectedAssetIds = this.data.selectedAssetIds.filter((id) => id !== assetId);
    const sourcePack = this.data.detailPack || getAssetPagePack(this.data.detailPack.id);
    const detailPack = decoratePack(sourcePack, readFavoritePackIds(), selectedAssetIds);
    this.setData({
      selectedAssetIds,
      detailPack,
      selectedAssets: getSelectedAssets(detailPack, selectedAssetIds)
    });
  },

  addSelectedAsset() {
    if (!this.data.selectedAssetIds.length) return;
    const preserveDraft = this.isCreateAssetSelectionMode();
    track("asset_transfer_to_editor", {
      page: "assets",
      source: preserveDraft ? "createAssetDrawer" : "assetsTab",
      selectedCount: this.data.selectedAssetIds.length,
      packId: this.data.detailPack && this.data.detailPack.id || ""
    });
    wx.setStorageSync(ASSET_TRANSFER_STORAGE_KEY, this.data.selectedAssetIds);
    wx.setStorageSync(ASSET_TRANSFER_MODE_STORAGE_KEY, {
      preserveDraft,
      source: preserveDraft ? "createAssetDrawer" : "assetsTab",
      createdAt: Date.now()
    });
    this.assetEntryContext = null;
    this.isTransferringSelectedAssets = true;
    this.setData({
      detailPack: null,
      selectedAssetIds: [],
      selectedAssets: []
    });
    wx.switchTab({ url: "/pages/create/index" });
  },

  async confirmOpenPolkaPaperCustom() {
    const result = await showModal("前往创作页", "自定义波点需要在创作页里调整图形、颜色和密度。", {
      confirmText: "继续"
    });
    if (!result.confirm) return;
    const preserveDraft = this.isCreateAssetSelectionMode();
    track("asset_polka_custom_to_create", {
      page: "assets",
      packId: this.data.detailPack && this.data.detailPack.id || "",
      source: preserveDraft ? "createAssetDrawer" : "assetsTab"
    });
    wx.setStorageSync(PENDING_CREATE_ACTION_STORAGE_KEY, {
      action: "openPolkaPaperCustom",
      newDraft: !preserveDraft,
      source: preserveDraft ? "createAssetDrawer" : "assetsTab",
      createdAt: Date.now()
    });
    this.assetEntryContext = null;
    this.setData({
      detailPack: null,
      selectedAssetIds: [],
      selectedAssets: [],
      assetSelectionMode: false
    });
    this.isTransferringSelectedAssets = true;
    wx.switchTab({ url: "/pages/create/index" });
  },

  async confirmOpenSolidPaperCustom() {
    const result = await showModal("前往创作页", "自定义纯色纸需要在创作页里选择颜色并添加。", {
      confirmText: "继续"
    });
    if (!result.confirm) return;
    const preserveDraft = !!(this.assetEntryContext && this.assetEntryContext.preserveDraft);
    track("asset_solid_custom_to_create", {
      page: "assets",
      packId: this.data.detailPack && this.data.detailPack.id || "",
      source: preserveDraft ? "createAssetDrawer" : "assetsTab"
    });
    wx.setStorageSync(PENDING_CREATE_ACTION_STORAGE_KEY, {
      action: "openSolidPaperCustom",
      newDraft: !preserveDraft,
      source: preserveDraft ? "createAssetDrawer" : "assetsTab",
      createdAt: Date.now()
    });
    this.assetEntryContext = null;
    this.setData({
      detailPack: null,
      selectedAssetIds: [],
      selectedAssets: [],
      assetSelectionMode: false
    });
    this.isTransferringSelectedAssets = true;
    wx.switchTab({ url: "/pages/create/index" });
  },

  async confirmOpenBasicShapeCustom() {
    const result = await showModal("前往创作页", "自定义基础图形需要在创作页里调整图形、颜色和数量。", {
      confirmText: "继续"
    });
    if (!result.confirm) return;
    const preserveDraft = !!(this.assetEntryContext && this.assetEntryContext.preserveDraft);
    track("asset_basic_shape_custom_to_create", {
      page: "assets",
      packId: this.data.detailPack && this.data.detailPack.id || "",
      source: preserveDraft ? "createAssetDrawer" : "assetsTab"
    });
    wx.setStorageSync(PENDING_CREATE_ACTION_STORAGE_KEY, {
      action: "openBasicShapeCustom",
      newDraft: !preserveDraft,
      source: preserveDraft ? "createAssetDrawer" : "assetsTab",
      createdAt: Date.now()
    });
    this.assetEntryContext = null;
    this.setData({
      detailPack: null,
      selectedAssetIds: [],
      selectedAssets: [],
      assetSelectionMode: false
    });
    this.isTransferringSelectedAssets = true;
    wx.switchTab({ url: "/pages/create/index" });
  }
});

function readFavoritePackIds() {
  const ids = wx.getStorageSync(FAVORITE_PACK_STORAGE_KEY);
  return Array.isArray(ids) ? ids : [];
}

function createAssetPagePacks(packs) {
  const basePacks = appendLocalGridBackgroundsToPaper04(Array.isArray(packs) ? packs : getAssetPacks());
  const virtualPacks = [
    createBasicShapeAssetPack(),
    createLocalBackgroundPaperAssetPack(),
    createPolkaPaperAssetPack()
  ];
  const virtualIds = virtualPacks.map((pack) => pack.id);
  return basePacks
    .filter((pack) => pack && !virtualIds.includes(pack.id))
    .map(prepareAssetPagePack)
    .concat(virtualPacks);
}

function getAssetPagePack(packId) {
  if (packId === BASIC_SHAPE_PACK_ID) return createBasicShapeAssetPack();
  if (packId === LOCAL_BACKGROUND_PAPER_PACK_ID) return createLocalBackgroundPaperAssetPack();
  if (packId === POLKA_PAPER_PACK_ID) return createPolkaPaperAssetPack();
  return prepareAssetPagePack(appendLocalGridBackgroundsToPaper04([getAssetPack(packId)])[0]);
}

function getResolvedAssetPagePack(packId) {
  if (packId === BASIC_SHAPE_PACK_ID || packId === LOCAL_BACKGROUND_PAPER_PACK_ID || packId === POLKA_PAPER_PACK_ID) {
    return Promise.resolve(getAssetPagePack(packId));
  }
  return getResolvedAssetPack(packId).then((pack) => getAssetPagePackFromResolved(pack));
}

function getAssetPagePackFromResolved(pack) {
  if (!pack) return null;
  return prepareAssetPagePack(appendLocalGridBackgroundsToPaper04([pack])[0]);
}

function prepareAssetPagePack(pack) {
  if (!pack) return null;
  const displayName = getAssetPagePackDisplayName(pack);
  return {
    ...pack,
    name: displayName,
    category: normalizeAssetPageCategory(pack.category),
    isBasicShapePack: !!pack.isBasicShapePack,
    isPolkaPaperPack: !!pack.isPolkaPaperPack,
    isSolidPaperPack: !!pack.isSolidPaperPack,
    itemCount: Array.isArray(pack.items) ? pack.items.length : 0,
    coverStyle: pack.coverStyle || "",
    coverPreviews: Array.isArray(pack.coverPreviews) ? pack.coverPreviews : [],
    items: Array.isArray(pack.items)
      ? pack.items.map((item) => ({
        ...item,
        packId: pack.id,
        packName: displayName
      }))
      : []
  };
}

function appendLocalGridBackgroundsToPaper04(packs) {
  const gridItems = createLocalBackgroundPaperAssets("格纹");
  if (!gridItems.length) return packs;
  return (packs || []).map((pack) => {
    if (!pack || pack.id !== "paper-04") return pack;
    const existingItems = Array.isArray(pack.items) ? pack.items : [];
    const existingIds = new Set(existingItems.map((item) => item && item.id).filter(Boolean));
    return {
      ...pack,
      items: existingItems.concat(gridItems.filter((item) => !existingIds.has(item.id)))
    };
  });
}

function createLocalBackgroundPaperAssetPack() {
  const items = createLocalBackgroundPaperAssets("纯色");
  return prepareAssetPagePack({
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
  });
}

function createLocalBackgroundPaperAssets(kind) {
  return localBackgroundPaperOptions
    .filter((option) => kind === "纯色" ? !option[3] : !!option[3])
    .map(([id, name, color, pattern]) => ({
      id: `paper-${id}`,
      type: "paper",
      name,
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
    }));
}

function createBasicShapeAssetPack() {
  const items = basicShapePresetDefinitions.map(([id, name, config]) => createBasicShapeAssetFromConfig({ id, name, config }));
  return prepareAssetPagePack({
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
  });
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

function createPolkaPaperAssetPack() {
  const items = polkaPaperPresetDefinitions.map(createPolkaPaperPresetAsset);
  return prepareAssetPagePack({
    id: POLKA_PAPER_PACK_ID,
    name: "波点内芯纸",
    category: "便签",
    tone: "#f8f4ec",
    cover: "",
    isPolkaPaperPack: true,
    coverPreviews: items.slice(0, 4).map((item) => ({
      previewStyle: item.previewStyle,
      previewTiles: item.previewTiles || []
    })),
    items
  });
}

function createPolkaPaperPresetAsset(definition) {
  const [id, name, color, dotColor, dotRadius, gap, opacity, style, shape, imageSource, imageWidth, imageHeight] = definition;
  const patternConfig = normalizePolkaPatternConfig({
    ...DEFAULT_POLKA_PATTERN_CONFIG,
    dotColor,
    dotRadius,
    gap,
    opacity,
    style,
    shape,
    offset: "grid",
    imageSource: imageSource || "",
    imageWidth: imageWidth || 0,
    imageHeight: imageHeight || 0
  });
  return createPolkaPaperAssetFromConfig({
    id: `paper-${id}`,
    name,
    color,
    patternConfig
  });
}

function createPolkaPaperAssetFromConfig(options) {
  const patternConfig = normalizePolkaPatternConfig(options.patternConfig);
  const isImagePattern = patternConfig.shape === "image" && patternConfig.imageSource;
  return {
    id: options.id,
    type: "paper",
    name: options.name || "波点内芯纸",
    width: 580,
    height: 760,
    thumb: "",
    previewStyle: isImagePattern
      ? `background-color:${options.color || "#ffffff"};`
      : createPolkaPreviewStyle(options.color || "#ffffff", patternConfig),
    previewTiles: isImagePattern
      ? createPolkaImagePreviewTiles(patternConfig.imageSource, patternConfig)
      : [],
    layer: {
      type: "paper",
      width: 580,
      height: 760,
      rotation: -2,
      radius: 10,
      shadow: true,
      style: {
        color: options.color || "#ffffff",
        pattern: "polka",
        patternConfig
      },
      patternConfig
    }
  };
}

function decoratePack(pack, favoritePackIds, selectedAssetIds) {
  if (!pack) return null;
  const rawItems = pack.items || [];
  let items = rawItems;
  if (pack.id === POLKA_PAPER_PACK_ID && !items.some((item) => item.id === POLKA_PAPER_CUSTOM_ENTRY_ID)) {
    items = [createPolkaPaperCustomEntry()].concat(items);
  }
  if (pack.id === LOCAL_BACKGROUND_PAPER_PACK_ID && !items.some((item) => item.id === SOLID_PAPER_CUSTOM_ENTRY_ID)) {
    items = [createSolidPaperCustomEntry()].concat(items);
  }
  if (pack.id === BASIC_SHAPE_PACK_ID && !items.some((item) => item.id === BASIC_SHAPE_CUSTOM_ENTRY_ID)) {
    items = [createBasicShapeCustomEntry()].concat(items);
  }
  const layout = layoutDetailAssets(items);
  return {
    ...pack,
    isFavorite: favoritePackIds.includes(pack.id),
    category: normalizeAssetPageCategory(pack.category),
    items: items.map((item, index) => ({
      ...item,
      assetClass: `detail-item-${item.id}`,
      layoutClass: `detail-asset-${index}`,
      detailStyle: layout.items[index].style,
      isCssAsset: !item.thumb,
      isCustomPolkaEntry: item.id === POLKA_PAPER_CUSTOM_ENTRY_ID,
      isCustomSolidEntry: item.id === SOLID_PAPER_CUSTOM_ENTRY_ID,
      isCustomBasicShapeEntry: item.id === BASIC_SHAPE_CUSTOM_ENTRY_ID,
      selected: selectedAssetIds.includes(item.id)
    })),
    detailPaperHeight: layout.paperHeight
  };
}

function createPolkaPaperCustomEntry() {
  return {
    id: POLKA_PAPER_CUSTOM_ENTRY_ID,
    type: "action",
    name: "自定义",
    width: 160,
    height: 160,
    thumb: "",
    previewStyle: "",
    previewTiles: []
  };
}

function createSolidPaperCustomEntry() {
  return {
    id: SOLID_PAPER_CUSTOM_ENTRY_ID,
    type: "action",
    name: "自定义",
    width: 160,
    height: 160,
    thumb: "",
    previewStyle: "",
    previewTiles: []
  };
}

function createBasicShapeCustomEntry() {
  return {
    id: BASIC_SHAPE_CUSTOM_ENTRY_ID,
    type: "action",
    name: "自定义",
    width: 160,
    height: 160,
    thumb: "",
    previewStyle: "",
    previewTiles: []
  };
}

function filterRecommendedPacks(packs) {
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

function normalizeBasicShapeConfig(config = {}) {
  const shape = basicShapeTypeOptions.includes(config.shape) ? config.shape : "circle";
  const strokeWidth = Math.max(0, Math.min(16, Number(config.strokeWidth) || 0));
  const opacity = Math.max(0.12, Math.min(1, Number(config.opacity) || 1));
  const countValue = Number(config.count) || 1;
  const count = [1, 3, 6, 9].includes(countValue) ? countValue : 1;
  const layout = ["single", "row", "grid", "scatter"].includes(config.layout) ? config.layout : "single";
  return {
    type: "basic-shape",
    shape,
    fillColor: config.fillColor || "#f4b8c4",
    strokeColor: config.strokeColor || "",
    strokeWidth,
    opacity,
    count,
    layout
  };
}

function createBasicShapePreviewStyle(config) {
  const normalized = normalizeBasicShapeConfig(config);
  return `background-color:transparent;background-image:url("${createBasicShapeSvgDataUri(normalized)}");background-size:100% 100%;background-repeat:no-repeat;background-position:center;`;
}

function createBasicShapeSvgDataUri(config) {
  const width = 120;
  const height = 120;
  const placements = getBasicShapePreviewPlacements(config.count, config.layout, width, height);
  const shapes = placements.map((place) => createBasicShapeSvgShape(config, place)).join("");
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

function enableShareMenu() {
  if (!wx.showShareMenu) return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ["shareAppMessage", "shareTimeline"]
  });
}

function getSelectedAssets(pack, selectedAssetIds) {
  if (!pack || !Array.isArray(pack.items)) return [];
  return pack.items.filter((item) => selectedAssetIds.includes(item.id));
}

function normalizeAssetPageCategory(category) {
  return category === "内芯纸" ? "便签" : category;
}

function getAssetPagePackDisplayName(pack) {
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

function createPolkaPreviewStyle(background, config) {
  const opacity = Math.max(0, Math.min(1, Number(config.opacity) || DEFAULT_POLKA_PATTERN_CONFIG.opacity));
  const alphaColor = hexToRgba(config.dotColor || DEFAULT_POLKA_PATTERN_CONFIG.dotColor, opacity);
  const previewScale = 240 / 900;
  const radius = Math.max(10, Math.round((Number(config.dotRadius) || DEFAULT_POLKA_PATTERN_CONFIG.dotRadius) * previewScale * 5.6));
  const gap = Math.max(12, Math.round((Number(config.gap) || DEFAULT_POLKA_PATTERN_CONFIG.gap) * previewScale));
  if (config.shape === "image" && config.imageSource) {
    return `background-color:${background};background-image:url(${config.imageSource});background-size:${gap}rpx ${gap}rpx;background-position:center;background-repeat:repeat;`;
  }
  return `background-color:${background};background-image:url("${createPolkaPreviewSvgDataUri(config.shape || "circle", alphaColor, radius, config.style)}");background-size:${gap}rpx ${gap}rpx;background-repeat:repeat;`;
}

function createPolkaImagePreviewTiles(source, config) {
  const previewScale = 240 / 900;
  const previewWidth = 124;
  const previewHeight = 136;
  const gap = Math.max(12, Math.round((Number(config.gap) || DEFAULT_POLKA_PATTERN_CONFIG.gap) * previewScale * 1.72));
  const size = Math.max(12, Math.round(gap * 0.68));
  return createStaggeredPreviewTiles({
    previewWidth,
    previewHeight,
    gap,
    size,
    offset: "grid",
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
  const opacity = Number(config.opacity);
  const dotRadius = Number(config.dotRadius);
  const gap = Number(config.gap);
  return {
    ...DEFAULT_POLKA_PATTERN_CONFIG,
    ...config,
    dotRadius: Number.isFinite(dotRadius) ? Math.max(2, Math.min(28, dotRadius)) : DEFAULT_POLKA_PATTERN_CONFIG.dotRadius,
    gap: Number.isFinite(gap) ? Math.max(18, Math.min(120, gap)) : DEFAULT_POLKA_PATTERN_CONFIG.gap,
    opacity: Number.isFinite(opacity) ? Math.max(0.12, Math.min(1, opacity)) : DEFAULT_POLKA_PATTERN_CONFIG.opacity
  };
}

function hexToRgba(hex, alpha = 1) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(17,17,17,${alpha})`;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getDetailAssetSize(item) {
  const sourceWidth = Math.max(1, Number(item.width) || 160);
  const sourceHeight = Math.max(1, Number(item.height) || 160);
  const ratio = sourceWidth / sourceHeight;
  let maxWidth = 176;
  let maxHeight = 176;

  if (ratio >= 2.2) {
    maxWidth = 300;
    maxHeight = 124;
  } else if (ratio <= 0.35) {
    maxWidth = 122;
    maxHeight = 410;
  } else if (ratio <= 0.65) {
    maxWidth = 146;
    maxHeight = 270;
  } else if (ratio >= 1.45) {
    maxWidth = 236;
    maxHeight = 150;
  }

  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: Math.max(88, Math.round(sourceWidth * scale)),
    height: Math.max(88, Math.round(sourceHeight * scale))
  };
}

function layoutDetailAssets(items) {
  const assets = items.map((item, index) => ({
    item,
    index,
    size: getDetailAssetSize(item)
  }));
  const placed = [];
  let y = detailPaperPaddingTop;
  let index = 0;

  while (index < assets.length) {
    const current = assets[index];
    if (shouldUseFullRow(current)) {
      placed.push(placeFullRowAsset(current, y));
      y += current.size.height + detailPaperGapY;
      index += 1;
      continue;
    }

    const next = assets[index + 1];
    const canPair = next && !shouldUseFullRow(next);
    const rowAssets = canPair ? [current, next] : [current];
    const rowHeight = Math.max(...rowAssets.map((asset) => asset.size.height));

    rowAssets.forEach((asset, rowIndex) => {
      placed.push(placeColumnAsset(asset, y, rowHeight, rowIndex));
    });

    y += rowHeight + detailPaperGapY;
    index += rowAssets.length;
  }

  const paperHeight = Math.max(detailPaperMinHeight, y + detailPaperBottomReserve);
  placed.sort((a, b) => a.index - b.index);

  return {
    paperHeight,
    items: placed
  };
}

function shouldUseFullRow(asset) {
  return asset.size.width > 250 || asset.size.height > 285;
}

function placeFullRowAsset(asset, y) {
  const offset = detailScatterOffsets[asset.index % detailScatterOffsets.length];
  const availableWidth = detailPaperWidth - detailPaperPaddingX * 2;
  const centerLeft = detailPaperPaddingX + (availableWidth - asset.size.width) / 2;
  const left = clamp(Math.round(centerLeft + offset.x * 1.6), 24, detailPaperWidth - asset.size.width - 24);
  const top = Math.round(y + Math.max(0, offset.y));

  return buildPlacedAsset(asset, left, top, offset.rotate);
}

function placeColumnAsset(asset, y, rowHeight, rowIndex) {
  const offset = detailScatterOffsets[asset.index % detailScatterOffsets.length];
  const columnWidth = (detailPaperWidth - detailPaperPaddingX * 2 - detailTwoColumnGap) / 2;
  const columnLeft = detailPaperPaddingX + rowIndex * (columnWidth + detailTwoColumnGap);
  const left = clamp(
    Math.round(columnLeft + (columnWidth - asset.size.width) / 2 + offset.x),
    24,
    detailPaperWidth - asset.size.width - 24
  );
  const top = Math.round(y + Math.max(0, (rowHeight - asset.size.height) / 2) + offset.y);

  return buildPlacedAsset(asset, left, top, offset.rotate);
}

function buildPlacedAsset(asset, left, top, rotate) {
  return {
    index: asset.index,
    style: [
      `left:${left}rpx`,
      `top:${top}rpx`,
      `width:${asset.size.width}rpx`,
      `height:${asset.size.height}rpx`,
      `transform:rotate(${rotate}deg)`
    ].join(";")
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
