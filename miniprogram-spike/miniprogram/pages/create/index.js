const { saveDraft, saveAutoDraft, loadDraft, loadDraftById, loadLatestDraft, loadRecentDrafts } = require("../../utils/draft-store");
const { showToast, showSuccess, showError, showModal } = require("../../utils/feedback");
const {
  ASSET_TRANSFER_STORAGE_KEY,
  getAssetPacks,
  getAssetItem,
  getAssetPack
} = require("../../config/assets");
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
    textInputVisible: false,
    textDraft: "",
    textToolMode: "font",
    textFonts: ["系统", "手写", "打字机", "衬线", "圆体"],
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
    textFont: "系统",
    textColor: "#111111",
    textSize: 54,
    textBackground: "无",
    textOpacity: 100,
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
    ratioPopoverTop: 0
  },

  onLoad() {
    const system = wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    this.dpr = system.pixelRatio || 1;
    this.screenWidth = system.windowWidth;
    this.ctx = wx.createCanvasContext("spikeCanvas", this);
    this.gesture = null;
    this.pendingLayerTap = null;
    this.keyboardHandler = (res) => {
      this.updateKeyboardHeight(res);
    };
    if (wx.onKeyboardHeightChange) {
      wx.onKeyboardHeightChange(this.keyboardHandler);
    }
    const latestDraft = loadLatestDraft();
    const recentDrafts = this.getRecentDrafts();
    this.draft = latestDraft || createDraft("3:4");
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.resetHistory();
    this.updateCanvasSize(this.draft.ratio);
    this.setEditorMode(!!latestDraft);
    const statusTop = Math.ceil((system.statusBarHeight || 0) + 2);
    const chromeTop = menu ? Math.ceil(menu.bottom + 4) : Math.ceil((system.statusBarHeight || 0) + 44);
    this.setData({
      chromeTop,
      statusTop,
      toolbarGap: Math.max(0, chromeTop - statusTop),
      ratioPopoverTop: Math.ceil(chromeTop + 112 * system.windowWidth / 750),
      hasRecentDraft: !!latestDraft,
      recentDraftThumb: latestDraft && latestDraft.thumbnailPath ? latestDraft.thumbnailPath : "",
      recentDrafts
    });
  },

  onReady() {
    this.render();
  },

  onShow() {
    this.consumePendingAssets();
    if (this.data.isEmptyMode) {
      this.refreshRecentDraftState();
    }
  },

  onUnload() {
    if (wx.offKeyboardHeightChange && this.keyboardHandler) {
      wx.offKeyboardHeightChange(this.keyboardHandler);
    }
  },

  ensureCanvasContext() {
    if (!this.ctx) {
      this.ctx = wx.createCanvasContext("spikeCanvas", this);
    }
  },

  setEditorMode(isEditing) {
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
    this.draft = createDraft(this.data.ratio || "3:4");
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
      keyboardHeight: 0,
      textPanelBottom: 0
    });
    this.setEditorMode(true);
    setTimeout(() => this.render(), 0);
  },

  resetToBlankDraftForEmptyEntry() {
    clearTimeout(this.saveTimer);
    this.textEditSession = null;
    this.draft = createDraft(this.data.ratio || "3:4");
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
    wx.switchTab({ url: "/pages/assets/index" });
  },

  openRecentDraft(event) {
    clearTimeout(this.saveTimer);
    this.textEditSession = null;
    const draftId = event && event.currentTarget && event.currentTarget.dataset.id;
    const draft = draftId ? loadDraftById(draftId) : loadLatestDraft();
    if (!draft) {
      showError("暂无草稿");
      return;
    }
    this.draft = draft;
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
    this.setData({
      selectedLayerId: "",
      selectedLayerType: "",
      textInputVisible: false,
      textDraft: "",
      activeTool: "",
      activeDrawer: "",
      activePalette: "",
      ratioPanelVisible: false,
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

  render() {
    if (this.data.isEmptyMode) return;
    this.ctx = wx.createCanvasContext("spikeCanvas", this);
    if (!this.ctx || !this.draft) return;
    drawDraft(this.ctx, this.draft, this.data.selectedLayerId, { dpr: this.renderScale || 1 });
    this.ctx.draw();
  },

  drawCanvasSnapshot(callback) {
    this.ensureCanvasContext();
    if (!this.ctx || !this.draft) {
      if (callback) callback();
      return;
    }
    drawDraft(this.ctx, this.draft, "", { dpr: this.renderScale || 1 });
    this.ctx.draw(false, () => {
      if (callback) callback();
    });
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
    this.draft = draft;
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
      this.draft = createDraft(ratio);
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
        if (!file || !file.tempFilePath) return;
        wx.getImageInfo({
          src: file.tempFilePath,
          success: (info) => {
            const layer = createImageLayer(file.tempFilePath, info, this.draft);
            this.draft.layers.push(layer);
            this.draft.layers = normalizeLayerOrder(this.draft.layers);
            this.closeAfterAddingLayer();
            this.markDirty();
            this.render();
          },
          fail: () => showError("图片添加失败")
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
    this.enterEditMode();
    if (tool === "image") {
      this.openImageSourceSheet();
      return;
    }
    if (tool === "text") {
      this.addText();
      return;
    }
    const isDrawer = ["asset", "tape"].includes(tool);
    const isPalette = ["cut", "shape"].includes(tool);
    const nextData = {
      activeTool: tool,
      activeDrawer: isDrawer ? tool : "",
      activePalette: isPalette ? tool : "",
      selectedLayerId: "",
      textInputVisible: false,
      ratioPanelVisible: false,
      keyboardHeight: 0,
      textPanelBottom: 0
    };
    if (tool === "asset") {
      Object.assign(nextData, this.getAssetPanelState(this.data.activeAssetCategory || "推荐", ""));
    }
    this.setData(nextData);
    setTimeout(() => this.render(), 0);
  },

  closeToolPanel() {
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

  getAssetPanelState(category, packId) {
    const assetPacks = decorateAssetPanelPacks(getAssetPacks());
    const activeCategory = category || "推荐";
    const activeAssetPack = packId ? decorateAssetPanelPack(getAssetPack(packId)) : null;
    return {
      assetPacks,
      activeAssetCategory: activeCategory,
      visibleAssetPacks: filterAssetPanelPacks(assetPacks, activeCategory),
      activeAssetPack,
      activeAssetPackItems: activeAssetPack ? activeAssetPack.items : []
    };
  },

  selectAssetCategory(event) {
    const category = event.currentTarget.dataset.category || "推荐";
    if (category === this.data.activeAssetCategory && !this.data.activeAssetPack) return;
    this.setData(this.getAssetPanelState(category, ""));
  },

  openAssetPack(event) {
    const packId = event.currentTarget.dataset.pack;
    if (!packId) return;
    this.setData(this.getAssetPanelState(this.data.activeAssetCategory || "推荐", packId));
  },

  backToAssetPacks() {
    this.setData(this.getAssetPanelState(this.data.activeAssetCategory || "推荐", ""));
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
    if (!asset || !asset.source) {
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
    this.addAssetItemToDraft(asset);
    this.keepAssetDrawerAfterAddingLayer();
    this.markDirty();
    this.render();
  },

  consumePendingAssets() {
    const assetIds = wx.getStorageSync(ASSET_TRANSFER_STORAGE_KEY);
    if (!Array.isArray(assetIds) || !assetIds.length) return;
    wx.removeStorageSync(ASSET_TRANSFER_STORAGE_KEY);
    this.enterEditMode();
    let added = 0;
    assetIds.forEach((assetId) => {
      const asset = getAssetItem(assetId);
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
        fontLabel: this.data.textFont || "系统",
        fontFamily: fontFamilyForLabel(this.data.textFont || "系统"),
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
      textFont: layer.style.fontLabel || "系统",
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
    const names = { straight: "直边", scallop: "花边", tear: "撕边" };
    this.setData({ activeTool: "cut", activePalette: "cut" });
    showToast(`${names[style] || "剪刀"}待接入`, { icon: "none" });
  },

  addShape(event) {
    this.enterEditMode();
    const shape = event.currentTarget.dataset.shape || "rect";
    const layer = createTapeLayer("", "#f4efe5", this.draft.width * 0.5, this.draft.height * 0.5, shape === "note" ? -4 : 0, this.draft);
    layer.type = "paper";
    layer.width = shape === "circle" ? 180 : 240;
    layer.height = shape === "circle" ? 180 : shape === "note" ? 210 : 160;
    layer.style = {
      color: shape === "circle" ? "#f5dfd8" : "#f4efe5",
      shape
    };
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.closeAfterAddingLayer();
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
    }
    if (!Object.keys(patch).length) return;
    this.setData(patch);
    if (shouldRender) {
      this.render();
    }
  },

  noopCanvasTap() {},

  onTouchStart(event) {
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
      layer.x = this.gesture.origin.x + points[0].x - this.gesture.start.x;
      layer.y = this.gesture.origin.y + points[0].y - this.gesture.start.y;
    }

    if (this.gesture.mode === "pinch" && points.length >= 2) {
      if (this.pendingLayerTap) {
        this.pendingLayerTap.moved = true;
      }
      const nextDistance = distance(points[0], points[1]);
      const nextAngle = angle(points[0], points[1]);
      const scale = Math.max(0.25, Math.min(3, nextDistance / this.gesture.distance));
      layer.width = this.gesture.origin.width * scale;
      layer.height = this.gesture.origin.height * scale;
      layer.rotation = this.gesture.origin.rotation + nextAngle - this.gesture.angle;
    }

    this.render();
  },

  onTouchEnd() {
    const pendingTap = this.pendingLayerTap;
    const gesture = this.gesture;
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
    }
  },

  toDraftPoint(touch) {
    return {
      x: touch.x / this.renderScale,
      y: touch.y / this.renderScale
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
    this.beginTextLayerEditing(layer, { isNew: false });
    this.setData({
      activeTool: "text",
      activeDrawer: "",
      activePalette: "",
      textInputVisible: true,
      textDraft: layer.text || "",
      textToolMode: "font",
      textFont: layer.style.fontLabel || "系统",
      textColor: layer.style.color || "#111111",
      textSize: layer.style.fontSize || 54,
      textBackground: layer.style.backgroundLabel || "无",
      textOpacity: Math.round((layer.opacity == null ? 1 : layer.opacity) * 100),
      textPanelBottom: this.data.keyboardHeight || 0
    });
  },

  setTextToolMode(event) {
    this.setData({ textToolMode: event.currentTarget.dataset.mode || "font" });
  },

  setTextFont(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const font = event.currentTarget.dataset.font || this.data.textFonts[index] || "系统";
    this.updateEditingTextStyle({
      fontLabel: font,
      fontFamily: fontFamilyForLabel(font)
    });
    this.setData({ textFont: font });
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
    if (action === "cut") {
      this.setData({ activeTool: "cut", activePalette: "cut" });
      showToast("剪切路径待接入", { icon: "none" });
      return;
    }
    if (action === "copy") return this.duplicateLayer();
    if (action === "delete") return this.deleteLayer();
    if (action === "up") return this.moveLayerUp();
    if (action === "down") return this.moveLayerDown();

    const layer = this.getSelectedLayer();
    if (!layer) return;
    if (action === "shadow") layer.shadow = !layer.shadow;
    if (action === "opacity") layer.opacity = layer.opacity === 0.58 ? 1 : 0.58;
    if (action === "corner") layer.radius = layer.radius ? 0 : 36;
    if (action === "tear") layer.tear = !layer.tear;
    this.markDirty();
    this.render();
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
          canvasId: "spikeCanvas",
          width: this.data.canvasCssWidth,
          height: this.data.canvasCssHeight,
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
    const draft = loadDraft();
    if (!draft) {
      showError("暂无手动草稿");
      return;
    }
    this.draft = draft;
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.resetHistory();
    this.updateCanvasSize(draft.ratio);
    this.setEditorMode(true);
    this.setData({ selectedLayerId: "", saveStatus: "已恢复手动草稿", hasRecentDraft: true });
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
    this.render();
    wx.canvasToTempFilePath({
      canvasId: "spikeCanvas",
      width: this.data.canvasCssWidth,
      height: this.data.canvasCssHeight,
      destWidth: this.draft.width,
      destHeight: this.draft.height,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => showSuccess("已保存到相册"),
          fail: () => showModal("保存失败", "请确认已允许保存到相册后重试。", { showCancel: false })
        });
      },
      fail: () => showError("导出失败"),
      complete: () => this.setData({ exporting: false })
    }, this);
  }
});

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function angle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
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

function fontFamilyForLabel(label) {
  const map = {
    "系统": "PingFang SC, sans-serif",
    "手写": "Kaiti SC, STKaiti, cursive",
    "打字机": "Menlo, Monaco, Consolas, monospace",
    "衬线": "Songti SC, STSong, serif",
    "圆体": "PingFang SC, Hiragino Sans GB, sans-serif"
  };
  return map[label] || "PingFang SC, sans-serif";
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
