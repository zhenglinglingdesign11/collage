const {
  ASSET_TRANSFER_STORAGE_KEY,
  FAVORITE_PACK_STORAGE_KEY,
  getAssetPacks,
  getAssetPack
} = require("../../config/assets");

const assetPageCategories = ["推荐", "收藏", "纸张", "胶带", "票据", "贴纸", "标记", "纹理"];

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
    toolbarGap: 0
  },

  onLoad() {
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

  onShow() {
    if (!this.data.detailPack) {
      wx.showTabBar({ animation: false });
    }
    this.refreshPacks();
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setSelectedByPath) {
      tabBar.setSelectedByPath("/pages/assets/index");
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
  },

  filterPacks(packs, category) {
    if (category === "收藏") {
      return packs.filter((pack) => pack.isFavorite);
    }
    return packs;
  },

  setAssetCategory(event) {
    const activeCategory = event.currentTarget.dataset.category || "推荐";
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
    const detailPack = decoratePack(getAssetPack(this.data.detailPack.id), readFavoritePackIds(), selectedAssetIds);
    this.setData({
      selectedAssetIds,
      detailPack,
      selectedAssets: getSelectedAssets(detailPack, selectedAssetIds)
    });
  },

  removeDetailAsset(event) {
    const assetId = event.currentTarget.dataset.assetId;
    const selectedAssetIds = this.data.selectedAssetIds.filter((id) => id !== assetId);
    const detailPack = decoratePack(getAssetPack(this.data.detailPack.id), readFavoritePackIds(), selectedAssetIds);
    this.setData({
      selectedAssetIds,
      detailPack,
      selectedAssets: getSelectedAssets(detailPack, selectedAssetIds)
    });
  },

  addSelectedAsset() {
    if (!this.data.selectedAssetIds.length) return;
    wx.setStorageSync(ASSET_TRANSFER_STORAGE_KEY, this.data.selectedAssetIds);
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
  return {
    ...pack,
    isFavorite: favoritePackIds.includes(pack.id),
    items: pack.items.map((item, index) => ({
      ...item,
      assetClass: `detail-item-${item.id}`,
      layoutClass: `detail-asset-${index}`,
      isCssAsset: !item.thumb,
      selected: selectedAssetIds.includes(item.id)
    }))
  };
}

function getSelectedAssets(pack, selectedAssetIds) {
  if (!pack || !Array.isArray(pack.items)) return [];
  return pack.items.filter((item) => selectedAssetIds.includes(item.id));
}
