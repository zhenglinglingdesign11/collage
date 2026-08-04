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
const { shareAssets } = require("../../utils/share");

const assetPageCategories = ["推荐", "收藏", "贴纸", "胶带", "便签", "主题混装", "相框", "内芯纸"];

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
  },

  onShareAppMessage() {
    return shareAssets();
  },

  onShareTimeline() {
    return shareAssets();
  },

  onShow() {
    this.captureEntryContext();
    if (!this.data.detailPack) {
      wx.showTabBar({ animation: false });
    }
    this.refreshPacks();
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setSelectedByPath) {
      tabBar.setSelectedByPath("/pages/assets/index");
    }
  },

  onHide() {
    if (!this.isTransferringSelectedAssets) {
      this.assetEntryContext = null;
    }
    this.isTransferringSelectedAssets = false;
  },

  captureEntryContext() {
    const context = wx.getStorageSync(ASSET_ENTRY_CONTEXT_STORAGE_KEY);
    wx.removeStorageSync(ASSET_ENTRY_CONTEXT_STORAGE_KEY);
    if (context && context.source === "createAssetDrawer" && context.preserveDraft) {
      this.assetEntryContext = context;
    }
  },

  refreshPacks() {
    const favoritePackIds = readFavoritePackIds();
    const packs = getAssetPacks().map((pack, index) => ({
      ...pack,
      index,
      isFavorite: favoritePackIds.includes(pack.id)
    }));
    const visiblePacks = this.filterPacks(packs, this.data.activeCategory);
    const detailPack = this.data.detailPack
      ? decoratePack(getAssetPack(this.data.detailPack.id), favoritePackIds, this.data.selectedAssetIds)
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
      currentDetailPackId ? getResolvedAssetPack(currentDetailPackId) : Promise.resolve(null)
    ]).then(([resolvedPacks, resolvedDetailPack]) => {
      if (this.assetRequestId !== requestId) return;
      const favoritePackIds = readFavoritePackIds();
      const packs = resolvedPacks.map((pack, index) => ({
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
      return packs.filter((pack) => pack.category === category);
    }
    return filterRecommendedPacks(packs);
  },

  setAssetCategory(event) {
    const activeCategory = event.currentTarget.dataset.category || "推荐";
    if (activeCategory === this.data.activeCategory) return;
    this.setData({
      activeCategory,
      visiblePacks: this.filterPacks(this.data.packs, activeCategory)
    });
  },

  openPack(event) {
    const packId = event.currentTarget.dataset.pack;
    const pack = getAssetPack(packId);
    if (!pack) return;
    wx.hideTabBar({ animation: false });
    this.setData({
      detailPack: decoratePack(pack, readFavoritePackIds(), []),
      selectedAssetIds: [],
      selectedAssets: []
    });
    getResolvedAssetPack(packId).then((resolvedPack) => {
      if (!resolvedPack || !this.data.detailPack || this.data.detailPack.id !== packId) return;
      this.setData({
        detailPack: decoratePack(resolvedPack, readFavoritePackIds(), this.data.selectedAssetIds),
        selectedAssets: getSelectedAssets(resolvedPack, this.data.selectedAssetIds)
      });
    });
  },

  closeDetail() {
    wx.showTabBar({ animation: false });
    this.setData({
      detailPack: null,
      selectedAssetIds: [],
      selectedAssets: []
    });
    this.refreshPacks();
  },

  toggleFavoritePack() {
    const pack = this.data.detailPack;
    if (!pack) return;
    const current = readFavoritePackIds();
    const favoritePackIds = current.includes(pack.id)
      ? current.filter((id) => id !== pack.id)
      : current.concat(pack.id);
    wx.setStorageSync(FAVORITE_PACK_STORAGE_KEY, favoritePackIds);
    this.refreshPacks();
  },

  selectDetailAsset(event) {
    const assetId = event.currentTarget.dataset.assetId;
    const selectedAssetIds = this.data.selectedAssetIds.includes(assetId)
      ? this.data.selectedAssetIds.filter((id) => id !== assetId)
      : this.data.selectedAssetIds.concat(assetId);
    const sourcePack = this.data.detailPack || getAssetPack(this.data.detailPack.id);
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
    const sourcePack = this.data.detailPack || getAssetPack(this.data.detailPack.id);
    const detailPack = decoratePack(sourcePack, readFavoritePackIds(), selectedAssetIds);
    this.setData({
      selectedAssetIds,
      detailPack,
      selectedAssets: getSelectedAssets(detailPack, selectedAssetIds)
    });
  },

  addSelectedAsset() {
    if (!this.data.selectedAssetIds.length) return;
    const preserveDraft = !!(this.assetEntryContext && this.assetEntryContext.preserveDraft);
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
  }
});

function readFavoritePackIds() {
  const ids = wx.getStorageSync(FAVORITE_PACK_STORAGE_KEY);
  return Array.isArray(ids) ? ids : [];
}

function decoratePack(pack, favoritePackIds, selectedAssetIds) {
  if (!pack) return null;
  const layout = layoutDetailAssets(pack.items);
  return {
    ...pack,
    isFavorite: favoritePackIds.includes(pack.id),
    items: pack.items.map((item, index) => ({
      ...item,
      assetClass: `detail-item-${item.id}`,
      layoutClass: `detail-asset-${index}`,
      detailStyle: layout.items[index].style,
      isCssAsset: !item.thumb,
      selected: selectedAssetIds.includes(item.id)
    })),
    detailPaperHeight: layout.paperHeight
  };
}

function filterRecommendedPacks(packs) {
  const byId = new Map((packs || []).map((pack) => [pack.id, pack]));
  return recommendedAssetPackIds.map((packId) => byId.get(packId)).filter(Boolean);
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
