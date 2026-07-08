const { getOrderedLayers } = require("../models/draft");

function drawDraft(ctx, draft, selectedLayerId, options = {}) {
  const dpr = options.dpr || 1;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, draft.width, draft.height);
  ctx.setFillStyle(draft.background || "#fdfdfb");
  ctx.fillRect(0, 0, draft.width, draft.height);

  getOrderedLayers(draft.layers)
    .forEach((layer) => {
      drawLayer(ctx, layer);
      if (layer.id === selectedLayerId) {
        drawSelection(ctx, layer);
      }
    });
  ctx.restore();
}

function drawLayer(ctx, layer) {
  ctx.save();
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation || 0) * Math.PI / 180);
  ctx.setGlobalAlpha(layer.opacity == null ? 1 : layer.opacity);
  ctx.setShadow(0, 14, 30, "rgba(17, 17, 17, 0.12)");

  if (layer.type === "image" && layer.source) {
    ctx.drawImage(layer.source, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  } else if (layer.type === "text") {
    drawText(ctx, layer);
  } else if (layer.type === "tape") {
    drawTape(ctx, layer);
  } else {
    drawPaper(ctx, layer);
  }
  ctx.restore();
}

function drawPaper(ctx, layer) {
  ctx.setFillStyle(layer.style && layer.style.color ? layer.style.color : "#ffffff");
  ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.setShadow(0, 0, 0, "transparent");
  ctx.setStrokeStyle("rgba(17,17,17,0.08)");
  ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
}

function drawTape(ctx, layer) {
  const color = layer.style && layer.style.color ? layer.style.color : "#ead48a";
  ctx.setFillStyle(color);
  ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.setShadow(0, 0, 0, "transparent");
  ctx.setFillStyle("rgba(255,255,255,0.28)");
  for (let x = -layer.width / 2 + 16; x < layer.width / 2; x += 34) {
    ctx.fillRect(x, -layer.height / 2, 8, layer.height);
  }
}

function drawText(ctx, layer) {
  const style = layer.style || {};
  ctx.setShadow(0, 0, 0, "transparent");
  ctx.setFillStyle(style.color || "#111111");
  ctx.setFontSize(style.fontSize || 48);
  ctx.setTextBaseline("middle");
  ctx.setTextAlign("center");
  ctx.fillText(layer.text || "文字", 0, 0, layer.width);
}

function drawSelection(ctx, layer) {
  ctx.save();
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation || 0) * Math.PI / 180);
  ctx.setShadow(0, 0, 0, "transparent");
  ctx.setStrokeStyle("#111111");
  ctx.setLineWidth(3);
  ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.setFillStyle("#111111");
  const points = [
    [-layer.width / 2, -layer.height / 2],
    [layer.width / 2, -layer.height / 2],
    [layer.width / 2, layer.height / 2],
    [-layer.width / 2, layer.height / 2]
  ];
  points.forEach(([x, y]) => ctx.fillRect(x - 7, y - 7, 14, 14));
  ctx.restore();
}

function hitTest(x, y, layers) {
  const sorted = getOrderedLayers(layers).reverse();
  return sorted.find((layer) => {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    const angle = -(layer.rotation || 0) * Math.PI / 180;
    const dx = x - cx;
    const dy = y - cy;
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
    return Math.abs(localX) <= layer.width / 2 && Math.abs(localY) <= layer.height / 2;
  });
}

module.exports = {
  drawDraft,
  hitTest
};
