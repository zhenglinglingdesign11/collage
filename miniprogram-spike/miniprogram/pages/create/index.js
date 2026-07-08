const { saveDraft, saveAutoDraft, loadDraft, loadLatestDraft } = require("../../utils/draft-store");
const { showSuccess, showError, showModal } = require("../../utils/feedback");
const {
  ratioSizeMap,
  createDraft,
  createImageLayer,
  createTextLayer,
  createTapeLayer,
  normalizeLayerOrder
} = require("../../models/draft");
const {
  drawDraft,
  hitTest
} = require("../../utils/renderer");

Page({
  data: {
    ratios: ["3:4", "1:1", "9:16"],
    ratio: "3:4",
    canvasCssWidth: 300,
    canvasCssHeight: 400,
    selectedLayerId: "",
    saveStatus: "未保存",
    exporting: false,
    textInputVisible: false,
    textDraft: ""
  },

  onLoad() {
    const system = wx.getSystemInfoSync();
    this.dpr = system.pixelRatio || 1;
    this.screenWidth = system.windowWidth;
    this.ctx = wx.createCanvasContext("spikeCanvas", this);
    this.gesture = null;
    this.draft = loadLatestDraft() || createDraft("3:4");
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.updateCanvasSize(this.draft.ratio);
  },

  onReady() {
    this.render();
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
    if (!this.ctx || !this.draft) return;
    drawDraft(this.ctx, this.draft, this.data.selectedLayerId, { dpr: this.renderScale || 1 });
    this.ctx.draw();
  },

  changeRatio(event) {
    const ratio = event.currentTarget.dataset.ratio;
    const size = ratioSizeMap[ratio];
    this.draft = {
      ...this.draft,
      ratio,
      width: size.width,
      height: size.height,
      updatedAt: Date.now()
    };
    this.updateCanvasSize(ratio);
    this.markDirty();
    setTimeout(() => this.render(), 0);
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        wx.getImageInfo({
          src: file.tempFilePath,
          success: (info) => {
            const layer = createImageLayer(file.tempFilePath, info, this.draft);
            this.draft.layers.push(layer);
            this.draft.layers = normalizeLayerOrder(this.draft.layers);
            this.setData({ selectedLayerId: layer.id });
            this.markDirty();
            this.render();
          },
          fail: () => showError("图片添加失败")
        });
      }
    });
  },

  addTape() {
    const layer = createTapeLayer("", "#8c9a8d", this.draft.width * 0.58, this.draft.height * 0.22, 12);
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.setData({ selectedLayerId: layer.id });
    this.markDirty();
    this.render();
  },

  addPaper() {
    const layer = createTapeLayer("", "#efe7d8", this.draft.width * 0.2, this.draft.height * 0.55, -5);
    layer.type = "paper";
    layer.width = 260;
    layer.height = 330;
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.setData({ selectedLayerId: layer.id });
    this.markDirty();
    this.render();
  },

  addText() {
    this.setData({
      textInputVisible: true
    });
  },

  onTextInput(event) {
    this.setData({ textDraft: event.detail.value });
  },

  confirmText() {
    const text = (this.data.textDraft || "").trim() || "weekend";
    const layer = createTextLayer(text, this.draft);
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.setData({
      selectedLayerId: layer.id,
      textInputVisible: true,
      textDraft: ""
    });
    this.markDirty();
    this.render();
  },

  cancelText() {
    this.setData({
      textInputVisible: false,
      textDraft: ""
    });
  },

  onTouchStart(event) {
    const touches = event.touches || [];
    if (!touches.length) return;
    const points = touches.map((touch) => this.toDraftPoint(touch));

    if (touches.length === 1) {
      const target = hitTest(points[0].x, points[0].y, this.draft.layers);
      this.setData({ selectedLayerId: target ? target.id : "" });
      this.gesture = target
        ? { mode: "drag", layerId: target.id, start: points[0], origin: { x: target.x, y: target.y } }
        : null;
      this.render();
      return;
    }

    const layer = this.getSelectedLayer();
    if (touches.length >= 2 && layer) {
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
      layer.x = this.gesture.origin.x + points[0].x - this.gesture.start.x;
      layer.y = this.gesture.origin.y + points[0].y - this.gesture.start.y;
    }

    if (this.gesture.mode === "pinch" && points.length >= 2) {
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
    if (this.gesture) {
      this.gesture = null;
      this.markDirty();
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
    this.setData({ selectedLayerId: copy.id });
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
    this.setData({ selectedLayerId: "" });
    this.markDirty();
    this.render();
  },

  clearSelection() {
    this.setData({ selectedLayerId: "" });
    this.render();
  },

  saveCurrentDraft() {
    clearTimeout(this.saveTimer);
    this.draft = saveDraft(this.draft);
    this.setData({ saveStatus: "手动草稿已保存" });
    showSuccess("草稿已保存");
  },

  restoreDraft() {
    clearTimeout(this.saveTimer);
    const draft = loadDraft();
    if (!draft) {
      showError("暂无手动草稿");
      return;
    }
    this.draft = draft;
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.updateCanvasSize(draft.ratio);
    this.setData({ selectedLayerId: "", saveStatus: "已恢复手动草稿" });
    setTimeout(() => this.render(), 0);
  },

  markDirty() {
    this.setData({ saveStatus: "保存中..." });
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.draft = saveAutoDraft(this.draft);
      this.setData({ saveStatus: "已自动保存" });
    }, 900);
  },

  exportImage() {
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
