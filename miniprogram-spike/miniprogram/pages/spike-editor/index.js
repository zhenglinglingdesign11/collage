const { saveDraft, saveAutoDraft, loadDraft, loadLatestDraft } = require("../../utils/draft-store");
const { showToast, showSuccess, showError, showModal } = require("../../utils/feedback");
const { checkImageContent, checkTextContent } = require("../../utils/content-security");
const { shareCreate } = require("../../utils/share");
const { persistTempFile } = require("../../utils/local-file");
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
    selectedLayerType: "",
    selectedLayerTaped: false,
    saveStatus: "未保存",
    exporting: false,
    textInputVisible: false,
    textDraft: ""
  },

  onLoad() {
    enableShareMenu();
    const system = wx.getSystemInfoSync();
    this.dpr = system.pixelRatio || 1;
    this.screenWidth = system.windowWidth;
    this.ctx = wx.createCanvasContext("spikeCanvas", this);
    this.gesture = null;
    this.draft = loadLatestDraft() || createDraft("3:4");
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.updateCanvasSize(this.draft.ratio);
    this.updateSelectedLayerState(this.draft.layers[this.draft.layers.length - 1]?.id || "");
  },

  onShareAppMessage() {
    return shareCreate();
  },

  onShareTimeline() {
    return shareCreate();
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
      count: 9,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const files = (res.tempFiles || []).filter((file) => file && file.tempFilePath);
        if (!files.length) return;
        Promise.all(files.map((file) => new Promise((resolve) => {
          wx.getImageInfo({
            src: file.tempFilePath,
            success: (info) => {
              persistTempFile(file.tempFilePath)
                .then((imageSource) => resolve({ file, info, imageSource: imageSource || file.tempFilePath }))
                .catch(() => resolve({ file, info, imageSource: file.tempFilePath }));
            },
            fail: () => resolve(null)
          });
        }))).then((results) => {
          const importedImages = results.filter(Boolean);
          if (!importedImages.length) {
            showError("图片添加失败");
            return;
          }
          let lastLayer;
          importedImages.forEach(({ file, info, imageSource }) => {
            const layer = createImageLayer(imageSource, info, this.draft);
            this.draft.layers.push(layer);
            lastLayer = layer;
            checkImportedImageContent(this, file.tempFilePath, file.size, layer.id);
          });
          this.draft.layers = normalizeLayerOrder(this.draft.layers);
          this.updateSelectedLayerState(lastLayer.id);
          this.markDirty();
          this.render();
        });
      }
    });
  },

  addTape() {
    const layer = createTapeLayer("", "#8c9a8d", this.draft.width * 0.58, this.draft.height * 0.22, 12);
    this.draft.layers.push(layer);
    this.draft.layers = normalizeLayerOrder(this.draft.layers);
    this.updateSelectedLayerState(layer.id);
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
    this.updateSelectedLayerState(layer.id);
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
    this.updateSelectedLayerState(layer.id, {
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
      this.updateSelectedLayerState(target ? target.id : "");
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

  updateSelectedLayerState(layerId, extraData = {}) {
    const layer = this.getLayerById(layerId);
    const effect = layer && layer.style && layer.style.handmadeEffect;
    this.setData({
      selectedLayerId: layerId,
      selectedLayerType: layer ? layer.type : "",
      selectedLayerTaped: !!effect && effect.type === "taped",
      ...extraData
    });
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
    this.updateSelectedLayerState(copy.id);
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
    this.updateSelectedLayerState("");
    this.markDirty();
    this.render();
  },

  toggleTapeAttachment() {
    const layer = this.getSelectedLayer();
    if (!supportsTapeAttachment(layer)) return;

    const style = { ...(layer.style || {}) };
    const effect = style.handmadeEffect;
    if (effect && effect.type === "taped") {
      delete style.handmadeEffect;
    } else {
      style.handmadeEffect = {
        type: "taped",
        placement: "double-corners",
        tapeColor: "#f5f1e8",
        tapeOpacity: 0.64
      };
    }
    layer.style = style;
    this.updateSelectedLayerState(layer.id);
    this.markDirty();
    this.render();
  },

  clearSelection() {
    this.updateSelectedLayerState("");
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
    this.updateSelectedLayerState("", { saveStatus: "已恢复手动草稿" });
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
    if (this.data.exporting) return;
    const pendingChecks = hasPendingContentChecks(this);
    if (pendingChecks) {
      showToast("作品导出中");
    }
    this.updateSelectedLayerState("", { exporting: true });
    this.render();
    waitForPendingContentChecks(this)
      .then((canExport) => {
        if (!canExport) throw new Error("content_removed");
        return checkDraftTextContent(this);
      })
      .then(() => {
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
              fail: () => showModal("保存失败", "请确认已允许保存到相册后重试。", { showCancel: false }),
              complete: () => this.setData({ exporting: false })
            });
          },
          fail: () => {
            showError("导出失败");
            this.setData({ exporting: false });
          }
        }, this);
      })
      .catch((error) => {
        if (!error || !["content_removed", "text_removed"].includes(error.message)) {
          showError(["text_risky", "text_check_failed"].includes(error && error.message)
            ? getTextSecurityErrorMessage(error)
            : "导出失败");
        }
        this.setData({ exporting: false });
      });
  }
});

function getContentSecurityErrorMessage(error) {
  if (error && error.message === "media_too_large") return "图片需小于 10MB";
  if (error && error.message === "media_risky") return "图片内容未通过安全检测";
  if (error && error.message === "media_upload_failed") return "图片上传检测失败，请稍后重试";
  if (error && error.message === "content_check_failed") return "作品检测失败，请稍后重试";
  if (error && error.message === "cloud_unavailable") return "检测服务暂时不可用，请稍后重试";
  return "图片安全检测失败";
}

function enableShareMenu() {
  if (!wx.showShareMenu) return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ["shareAppMessage", "shareTimeline"]
  });
}

function getTextSecurityErrorMessage(error) {
  if (error && error.message === "text_risky") return "这段文字暂时无法使用";
  if (error && error.message === "text_check_failed") return "文字处理失败，请稍后重试";
  if (error && error.message === "cloud_unavailable") return "检测服务暂时不可用，请稍后重试";
  return "文字处理失败，请稍后重试";
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
    page.updateSelectedLayerState("");
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
    page.updateSelectedLayerState("");
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

function supportsTapeAttachment(layer) {
  return !!layer && ["image", "sticker", "paper"].includes(layer.type);
}
