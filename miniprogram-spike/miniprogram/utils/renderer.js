const { getOrderedLayers } = require("../models/draft");

function drawDraft(ctx, draft, selectedLayerId, options = {}) {
  const dpr = options.dpr || 1;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, draft.width, draft.height);
  setFillStyle(ctx, draft.background || "#fdfdfb");
  ctx.fillRect(0, 0, draft.width, draft.height);
  drawBackgroundPattern(ctx, draft);
  drawBackgroundImage(ctx, draft, options);

  getOrderedLayers(draft.layers)
    .forEach((layer) => {
      drawLayer(ctx, layer, options);
      if (layer.id === selectedLayerId) {
        drawSelection(ctx, layer);
      }
    });
  drawScissorOverlay(ctx, options.scissor);
  drawAlignmentGuides(ctx, options.guides || [], draft);
  ctx.restore();
}

function drawBackgroundPattern(ctx, draft) {
  const pattern = draft && draft.backgroundPattern;
  if (!pattern) return;
  ctx.save();
  setShadow(ctx, 0, 0, 0, "transparent");
  setStrokeStyle(ctx, "rgba(17,17,17,0.10)");
  setFillStyle(ctx, "rgba(17,17,17,0.13)");
  if (pattern === "dot") {
    const gap = 36;
    for (let y = gap / 2; y < draft.height; y += gap) {
      for (let x = gap / 2; x < draft.width; x += gap) {
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (pattern === "line") {
    setLineWidth(ctx, 1.4);
    for (let y = 52; y < draft.height; y += 52) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(draft.width, y);
      ctx.stroke();
    }
  }
  if (pattern === "square") {
    setLineWidth(ctx, 1.1);
    const gap = 48;
    for (let x = gap; x < draft.width; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, draft.height);
      ctx.stroke();
    }
    for (let y = gap; y < draft.height; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(draft.width, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBackgroundImage(ctx, draft, options = {}) {
  const backgroundImage = draft && draft.backgroundImage;
  if (!backgroundImage || !backgroundImage.source) return;
  const source = options.imageCache && options.imageCache[backgroundImage.source]
    ? options.imageCache[backgroundImage.source]
    : null;
  if (!source) return;
  const sourceWidth = backgroundImage.width || source.width || draft.width;
  const sourceHeight = backgroundImage.height || source.height || draft.height;
  const scale = Math.max(draft.width / sourceWidth, draft.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  ctx.save();
  ctx.drawImage(source, (draft.width - width) / 2, (draft.height - height) / 2, width, height);
  ctx.restore();
}

function drawLayer(ctx, layer, options = {}) {
  ctx.save();
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation || 0) * Math.PI / 180);
  setGlobalAlpha(ctx, layer.opacity == null ? 1 : layer.opacity);
  if (layer.shadow) {
    setShadow(ctx, 0, 18, 36, "rgba(17, 17, 17, 0.18)");
  } else {
    setShadow(ctx, 0, 8, 18, "rgba(17, 17, 17, 0.08)");
  }
  const clipShape = getLayerClipShape(layer);
  if (clipShape && layer.type !== "text") {
    drawShapePath(ctx, clipShape, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    ctx.clip();
  }

  if (layer.source) {
    drawSourceLayer(ctx, layer, options);
  } else if (layer.type === "text") {
    drawText(ctx, layer);
  } else if (layer.type === "tape") {
    drawTape(ctx, layer);
  } else {
    drawPaper(ctx, layer);
  }
  if (clipShape && layer.type !== "text") {
    drawEmbossEdge(ctx, clipShape, layer.width, layer.height);
  }
  ctx.restore();
}

function drawSourceLayer(ctx, layer, options = {}) {
  if (layer.radius) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
    ctx.clip();
  }
  const source = options.imageCache && options.imageCache[layer.source]
    ? options.imageCache[layer.source]
    : layer.source;
  if (!source || typeof source === "string") return;
  const crop = layer.crop;
  if (crop && crop.width > 0 && crop.height > 0) {
    ctx.drawImage(
      source,
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
  ctx.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
}

function drawPaper(ctx, layer) {
  const style = layer.style || {};
  setFillStyle(ctx, style.color || "#ffffff");
  const shape = getLayerClipShape(layer);
  if (shape) {
    drawShapePath(ctx, shape, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    ctx.fill();
  } else if (layer.radius) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
    ctx.fill();
  } else {
    ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  }
  setShadow(ctx, 0, 0, 0, "transparent");
  setStrokeStyle(ctx, "rgba(17,17,17,0.08)");
  if (shape) {
    drawShapePath(ctx, shape, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
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

function getLayerClipShape(layer) {
  const style = layer.style || {};
  const shape = layer.clipShape || layer.maskShape || style.clipShape || style.maskShape || style.shape || "";
  if (shape === "note") return "tag";
  if (shape === "rect") return "";
  return ["circle", "heart", "star", "tag", "stamp"].includes(shape) ? shape : "";
}

function drawShapePath(ctx, shape, x, y, width, height) {
  if (shape === "circle") {
    const radius = Math.min(width, height) / 2;
    ctx.beginPath();
    ctx.arc(x + width / 2, y + height / 2, radius, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (shape === "heart") {
    drawHeartPath(ctx, x, y, width, height);
    return;
  }
  if (shape === "star") {
    drawStarPath(ctx, x, y, width, height);
    return;
  }
  if (shape === "tag") {
    drawTagPath(ctx, x, y, width, height);
    return;
  }
  if (shape === "stamp") {
    drawStampPath(ctx, x, y, width, height);
    return;
  }
  ctx.beginPath();
  ctx.rect(x, y, width, height);
}

function drawHeartPath(ctx, x, y, width, height) {
  ctx.beginPath();
  ctx.moveTo(x + width * 0.5, y + height * 0.88);
  ctx.bezierCurveTo(x + width * 0.08, y + height * 0.62, x + width * 0.02, y + height * 0.28, x + width * 0.28, y + height * 0.18);
  ctx.bezierCurveTo(x + width * 0.4, y + height * 0.13, x + width * 0.49, y + height * 0.2, x + width * 0.5, y + height * 0.33);
  ctx.bezierCurveTo(x + width * 0.51, y + height * 0.2, x + width * 0.6, y + height * 0.13, x + width * 0.72, y + height * 0.18);
  ctx.bezierCurveTo(x + width * 0.98, y + height * 0.28, x + width * 0.92, y + height * 0.62, x + width * 0.5, y + height * 0.88);
  ctx.closePath();
}

function drawStarPath(ctx, x, y, width, height) {
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
}

function drawTagPath(ctx, x, y, width, height) {
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
}

function drawStampPath(ctx, x, y, width, height) {
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
}

function drawEmbossEdge(ctx, shape, width, height) {
  setShadow(ctx, 0, 0, 0, "transparent");
  setLineWidth(ctx, 3);
  setStrokeStyle(ctx, "rgba(255,255,255,0.55)");
  ctx.save();
  ctx.translate(-2, -2);
  drawShapePath(ctx, shape, -width / 2, -height / 2, width, height);
  ctx.stroke();
  ctx.restore();
  setStrokeStyle(ctx, "rgba(17,17,17,0.16)");
  ctx.save();
  ctx.translate(2, 2);
  drawShapePath(ctx, shape, -width / 2, -height / 2, width, height);
  ctx.stroke();
  ctx.restore();
  setLineWidth(ctx, 1.5);
  setStrokeStyle(ctx, "rgba(17,17,17,0.12)");
  drawShapePath(ctx, shape, -width / 2, -height / 2, width, height);
  ctx.stroke();
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
  setFillStyle(ctx, color);
  ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  setShadow(ctx, 0, 0, 0, "transparent");
  setFillStyle(ctx, "rgba(255,255,255,0.28)");
  for (let x = -layer.width / 2 + 16; x < layer.width / 2; x += 34) {
    ctx.fillRect(x, -layer.height / 2, 8, layer.height);
  }
}

function drawText(ctx, layer) {
  const style = layer.style || {};
  setShadow(ctx, 0, 0, 0, "transparent");
  if (style.background && style.background !== "transparent") {
    setFillStyle(ctx, style.background);
    const radius = style.background === "#111111" ? 18 : 12;
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, radius);
    ctx.fill();
  }
  setFillStyle(ctx, style.color || "#111111");
  const fontSize = style.fontSize || 48;
  setFontSize(ctx, fontSize);
  ctx.font = fontString(style.canvasFontFamily || style.fontFamily, fontSize);
  setTextBaseline(ctx, "middle");
  setTextAlign(ctx, "center");
  drawStyledText(ctx, layer.text || "写点什么...", style, fontSize, layer.width);
}

function fontString(fontFamily, fontSize) {
  const family = fontFamily || "sans-serif";
  const families = family.split(",").map((item) => {
    const name = item.trim();
    if (!name) return "";
    if (!isGenericFontFamily(name)) {
      return `"${name}"`;
    }
    return name;
  }).filter(Boolean);
  return `${fontSize}px ${families.join(", ") || "sans-serif"}`;
}

function isGenericFontFamily(name) {
  return ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"].includes(name);
}

function drawStyledText(ctx, text, style, fontSize, maxWidth) {
  const label = style.fontLabel || "系统";
  const customCanvasFont = !!style.canvasFontFamily && !isFallbackOnlyFont(style.canvasFontFamily);
  if (label === "打字机") {
    drawMonospaceText(ctx, text, fontSize, maxWidth);
    return;
  }
  if (label === "手写") {
    ctx.save();
    ctx.rotate(-3 * Math.PI / 180);
    fillLayerText(ctx, text, 0, 0, maxWidth, customCanvasFont);
    ctx.restore();
    return;
  }
  if (label === "衬线") {
    fillLayerText(ctx, text, 0, 0, maxWidth, customCanvasFont);
    fillLayerText(ctx, text, 1.2, 0, maxWidth, customCanvasFont);
    return;
  }
  if (label === "圆体") {
    fillLayerText(ctx, text, 0, 0, maxWidth, customCanvasFont);
    fillLayerText(ctx, text, 0.8, 0.8, maxWidth, customCanvasFont);
    return;
  }
  fillLayerText(ctx, text, 0, 0, maxWidth, customCanvasFont);
}

function fillLayerText(ctx, text, x, y, maxWidth, customCanvasFont) {
  if (customCanvasFont) {
    ctx.fillText(text, x, y);
    return;
  }
  ctx.fillText(text, x, y, maxWidth);
}

function isFallbackOnlyFont(fontFamily) {
  return fontFamily.split(",").every((item) => isGenericFontFamily(item.trim()));
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
  setShadow(ctx, 0, 0, 0, "transparent");
  setStrokeStyle(ctx, "#111111");
  setLineWidth(ctx, 3);
  ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  setFillStyle(ctx, "#111111");
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
  setShadow(ctx, 0, 0, 0, "transparent");
  setStrokeStyle(ctx, "rgba(217, 74, 56, 0.76)");
  setLineWidth(ctx, 2);
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

function drawScissorOverlay(ctx, scissor) {
  if (!scissor || !scissor.layer || !Array.isArray(scissor.strokes) || !scissor.strokes.length) return;
  const layer = scissor.layer;
  ctx.save();
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation || 0) * Math.PI / 180);
  setShadow(ctx, 0, 0, 0, "transparent");
  setStrokeStyle(ctx, scissor.color || "rgba(217, 74, 56, 0.58)");
  setLineCap(ctx, "round");
  setLineJoin(ctx, "round");
  roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius || 0);
  ctx.clip();
  scissor.strokes.forEach((stroke) => {
    const points = stroke.points || [];
    if (!points.length) return;
    setLineWidth(ctx, stroke.size || scissor.brushSize || 42);
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point.x - layer.width / 2;
      const y = point.y - layer.height / 2;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    if (points.length === 1) {
      const point = points[0];
      ctx.lineTo(point.x - layer.width / 2 + 0.01, point.y - layer.height / 2 + 0.01);
    }
    ctx.stroke();
  });
  ctx.restore();
}

function setFillStyle(ctx, value) {
  if (ctx.setFillStyle) ctx.setFillStyle(value);
  ctx.fillStyle = value;
}

function setStrokeStyle(ctx, value) {
  if (ctx.setStrokeStyle) ctx.setStrokeStyle(value);
  ctx.strokeStyle = value;
}

function setLineWidth(ctx, value) {
  if (ctx.setLineWidth) ctx.setLineWidth(value);
  ctx.lineWidth = value;
}

function setLineCap(ctx, value) {
  if (ctx.setLineCap) ctx.setLineCap(value);
  ctx.lineCap = value;
}

function setLineJoin(ctx, value) {
  if (ctx.setLineJoin) ctx.setLineJoin(value);
  ctx.lineJoin = value;
}

function setGlobalAlpha(ctx, value) {
  if (ctx.setGlobalAlpha) ctx.setGlobalAlpha(value);
  ctx.globalAlpha = value;
}

function setShadow(ctx, offsetX, offsetY, blur, color) {
  if (ctx.setShadow) ctx.setShadow(offsetX, offsetY, blur, color);
  ctx.shadowOffsetX = offsetX;
  ctx.shadowOffsetY = offsetY;
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
}

function setFontSize(ctx, value) {
  if (ctx.setFontSize) ctx.setFontSize(value);
}

function setTextBaseline(ctx, value) {
  if (ctx.setTextBaseline) ctx.setTextBaseline(value);
  ctx.textBaseline = value;
}

function setTextAlign(ctx, value) {
  if (ctx.setTextAlign) ctx.setTextAlign(value);
  ctx.textAlign = value;
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
