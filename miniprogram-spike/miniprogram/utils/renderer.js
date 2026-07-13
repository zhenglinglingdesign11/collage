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
  drawAlignmentGuides(ctx, options.guides || [], draft);
  ctx.restore();
}

function drawLayer(ctx, layer) {
  ctx.save();
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation || 0) * Math.PI / 180);
  ctx.setGlobalAlpha(layer.opacity == null ? 1 : layer.opacity);
  if (layer.shadow) {
    ctx.setShadow(0, 18, 36, "rgba(17, 17, 17, 0.18)");
  } else {
    ctx.setShadow(0, 8, 18, "rgba(17, 17, 17, 0.08)");
  }

  if (layer.source) {
    drawSourceLayer(ctx, layer);
  } else if (layer.type === "text") {
    drawText(ctx, layer);
  } else if (layer.type === "tape") {
    drawTape(ctx, layer);
  } else {
    drawPaper(ctx, layer);
  }
  ctx.restore();
}

function drawSourceLayer(ctx, layer) {
  if (layer.radius) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
    ctx.clip();
  }
  const crop = layer.crop;
  if (crop && crop.width > 0 && crop.height > 0) {
    ctx.drawImage(
      layer.source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -layer.width / 2,
      -layer.height / 2,
      layer.width,
      layer.height
    );
    return;
  }
  ctx.drawImage(layer.source, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
}

function drawPaper(ctx, layer) {
  const style = layer.style || {};
  ctx.setFillStyle(style.color || "#ffffff");
  if (style.shape === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(layer.width, layer.height) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (layer.radius) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
    ctx.fill();
  } else {
    ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  }
  ctx.setShadow(0, 0, 0, "transparent");
  ctx.setStrokeStyle("rgba(17,17,17,0.08)");
  if (style.shape === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(layer.width, layer.height) / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (layer.tear) {
    drawTearStroke(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  } else if (layer.radius) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
    ctx.stroke();
  } else {
    ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
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

function drawTearStroke(ctx, x, y, width, height) {
  ctx.beginPath();
  const step = width / 12;
  ctx.moveTo(x, y);
  for (let i = 1; i <= 12; i += 1) {
    ctx.lineTo(x + step * i, y + (i % 2 ? 8 : -2));
  }
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.closePath();
  ctx.stroke();
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
  if (style.background && style.background !== "transparent") {
    ctx.setFillStyle(style.background);
    const radius = style.background === "#111111" ? 18 : 12;
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, radius);
    ctx.fill();
  }
  ctx.setFillStyle(style.color || "#111111");
  const fontSize = style.fontSize || 48;
  ctx.setFontSize(fontSize);
  if ("font" in ctx) {
    ctx.font = fontString(style.fontFamily, fontSize);
  }
  ctx.setTextBaseline("middle");
  ctx.setTextAlign("center");
  drawStyledText(ctx, layer.text || "写点什么...", style, fontSize, layer.width);
}

function fontString(fontFamily, fontSize) {
  const family = fontFamily || "sans-serif";
  const families = family.split(",").map((item) => {
    const name = item.trim();
    if (!name) return "";
    if (name.indexOf(" ") >= 0 || /[\u4e00-\u9fa5]/.test(name)) {
      return `"${name}"`;
    }
    return name;
  }).filter(Boolean);
  return `${fontSize}px ${families.join(", ") || "sans-serif"}`;
}

function drawStyledText(ctx, text, style, fontSize, maxWidth) {
  const label = style.fontLabel || "系统";
  if (label === "打字机") {
    drawMonospaceText(ctx, text, fontSize, maxWidth);
    return;
  }
  if (label === "手写") {
    ctx.save();
    ctx.rotate(-3 * Math.PI / 180);
    ctx.fillText(text, 0, 0, maxWidth);
    ctx.restore();
    return;
  }
  if (label === "衬线") {
    ctx.fillText(text, 0, 0, maxWidth);
    ctx.fillText(text, 1.2, 0, maxWidth);
    return;
  }
  if (label === "圆体") {
    ctx.fillText(text, 0, 0, maxWidth);
    ctx.fillText(text, 0.8, 0.8, maxWidth);
    return;
  }
  ctx.fillText(text, 0, 0, maxWidth);
}

function drawMonospaceText(ctx, text, fontSize, maxWidth) {
  const chars = String(text).split("");
  const charWidth = Math.min(fontSize * 0.68, maxWidth / Math.max(chars.length, 1));
  const totalWidth = charWidth * chars.length;
  const startX = -totalWidth / 2 + charWidth / 2;
  chars.forEach((char, index) => {
    ctx.fillText(char, startX + index * charWidth, 0, charWidth);
  });
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

function drawAlignmentGuides(ctx, guides, draft) {
  if (!guides || !guides.length || !draft) return;
  ctx.save();
  ctx.setShadow(0, 0, 0, "transparent");
  ctx.setStrokeStyle("rgba(217, 74, 56, 0.76)");
  ctx.setLineWidth(2);
  guides.forEach((guide) => {
    ctx.beginPath();
    if (guide.axis === "x") {
      ctx.moveTo(guide.value, 0);
      ctx.lineTo(guide.value, draft.height);
    } else if (guide.axis === "y") {
      ctx.moveTo(0, guide.value);
      ctx.lineTo(draft.width, guide.value);
    }
    ctx.stroke();
  });
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
