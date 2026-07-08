const SCHEMA_VERSION = 1;

const DRAFT_RATIOS = ["3:4", "1:1", "9:16"];

const ratioSizeMap = {
  "3:4": { width: 900, height: 1200 },
  "1:1": { width: 1000, height: 1000 },
  "9:16": { width: 900, height: 1600 }
};

const layerTypes = {
  image: "image",
  text: "text",
  sticker: "sticker",
  tape: "tape",
  paper: "paper"
};

function createDraft(ratio = "3:4") {
  const size = ratioSizeMap[ratio] || ratioSizeMap["3:4"];
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `draft-${Date.now()}`,
    ratio,
    width: size.width,
    height: size.height,
    background: "#fdfdfb",
    layers: normalizeLayerOrder([
      createPaperLayer(),
      createTapeLayer("胶带", "#ead48a", 260, 220, -14)
    ]),
    assets: [],
    updatedAt: Date.now()
  };
}

function createImageLayer(source, imageInfo, draft) {
  const maxWidth = draft.width * 0.72;
  const scale = maxWidth / imageInfo.width;
  const width = maxWidth;
  const height = imageInfo.height * scale;
  return baseLayer(layerTypes.image, {
    source,
    x: (draft.width - width) / 2,
    y: (draft.height - height) / 2,
    width,
    height,
    rotation: -2,
    zIndex: nextLayerOrder(draft)
  });
}

function createTextLayer(text, draft) {
  return baseLayer(layerTypes.text, {
    text: text || "weekend",
    x: draft.width * 0.56,
    y: draft.height * 0.68,
    width: 260,
    height: 86,
    rotation: -6,
    zIndex: nextLayerOrder(draft),
    style: {
      fontSize: 54,
      color: "#111111",
      fontFamily: "serif"
    }
  });
}

function createTapeLayer(text, color, x, y, rotation, draft) {
  return baseLayer(layerTypes.tape, {
    text: text || "",
    x,
    y,
    width: 260,
    height: 76,
    rotation,
    zIndex: draft ? nextLayerOrder(draft) : 1,
    style: { color: color || "#ead48a" }
  });
}

function createPaperLayer() {
  return baseLayer(layerTypes.paper, {
    x: 150,
    y: 170,
    width: 580,
    height: 640,
    rotation: 2,
    zIndex: 1,
    style: { color: "#efe7d8" }
  });
}

function baseLayer(type, extra) {
  return {
    id: `${type}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    scale: 1,
    opacity: 1,
    zIndex: 1,
    source: "",
    text: "",
    style: {},
    ...extra
  };
}

function nextLayerOrder(draft) {
  const layers = draft && Array.isArray(draft.layers) ? draft.layers : [];
  return layers.reduce((max, layer, index) => Math.max(max, layer.zIndex == null ? index : layer.zIndex), 0) + 1;
}

function normalizeLayerOrder(layers = []) {
  return layers.map((layer, index) => ({
    ...layer,
    zIndex: index + 1
  }));
}

function getOrderedLayers(layers = []) {
  return layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => {
      const aOrder = a.layer.zIndex == null ? a.index + 1 : a.layer.zIndex;
      const bOrder = b.layer.zIndex == null ? b.index + 1 : b.layer.zIndex;
      if (aOrder === bOrder) return a.index - b.index;
      return aOrder - bOrder;
    })
    .map((item) => item.layer);
}

function migrateDraft(draft) {
  const ratio = DRAFT_RATIOS.includes(draft.ratio) ? draft.ratio : "3:4";
  const size = ratioSizeMap[ratio];
  return {
    schemaVersion: SCHEMA_VERSION,
    id: draft.id || `draft-${Date.now()}`,
    ratio,
    width: draft.width || size.width,
    height: draft.height || size.height,
    background: draft.background || "#fdfdfb",
    layers: normalizeLayerOrder(Array.isArray(draft.layers) ? draft.layers : []),
    assets: Array.isArray(draft.assets) ? draft.assets : [],
    updatedAt: draft.updatedAt || Date.now()
  };
}

module.exports = {
  SCHEMA_VERSION,
  DRAFT_RATIOS,
  layerTypes,
  ratioSizeMap,
  createDraft,
  createImageLayer,
  createTextLayer,
  createTapeLayer,
  createPaperLayer,
  normalizeLayerOrder,
  getOrderedLayers,
  migrateDraft
};
