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
  drawBrushDraft(ctx, options.brushDraft, options);
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
  if (layer.type === "brush") {
    setShadow(ctx, 0, 0, 0, "transparent");
  } else if (layer.shadow) {
    setShadow(ctx, 0, 18, 36, "rgba(17, 17, 17, 0.18)");
  } else {
    setShadow(ctx, 0, 8, 18, "rgba(17, 17, 17, 0.08)");
  }
  const clipShape = getLayerClipShape(layer);
  const excludeShape = getLayerExcludeShape(layer);
  const clipPolygons = getLayerClipPolygons(layer);
  const clipPolygon = clipPolygons[clipPolygons.length - 1] || null;
  const hasTear = !!(layer.tear && layer.type !== "text");
  if (excludeShape && layer.type !== "text") {
    drawInverseShapeClip(ctx, excludeShape, layer);
  }
  if (hasTear) {
    drawTearPath(ctx, layer, { clipShape, clipPolygon });
    ctx.clip();
  } else if (clipPolygons.length && layer.type !== "text") {
    clipPolygons.forEach((polygon) => {
      drawLayerClipPolygon(ctx, polygon, layer);
      ctx.clip();
    });
  } else if (clipShape && layer.type !== "text") {
    drawShapePath(ctx, clipShape, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    ctx.clip();
  }

  if (layer.source) {
    drawSourceLayer(ctx, layer, options);
  } else if (layer.type === "brush") {
    drawBrushLayer(ctx, layer, options);
  } else if (layer.type === "text") {
    drawText(ctx, layer);
  } else if (layer.type === "tape") {
    drawTape(ctx, layer);
  } else {
    drawPaper(ctx, layer);
  }
  if (clipShape && layer.type !== "text" && !hasTear) {
    drawEmbossEdge(ctx, clipShape, layer.width, layer.height);
  }
  if (hasTear) {
    drawTearEdge(ctx, layer, { clipShape, clipPolygon });
  }
  if (excludeShape && layer.type !== "text") {
    drawExcludeEdge(ctx, excludeShape, layer);
  }
  drawLayerOutline(ctx, layer, { clipShape, clipPolygon, hasTear });
  ctx.restore();
}

function drawSourceLayer(ctx, layer, options = {}) {
  if (layer.radius && !layer.tear) {
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
  if (layer.tear) {
    ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  } else if (shape) {
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
    drawTearPath(ctx, layer);
    ctx.stroke();
  } else if (layer.radius) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
    ctx.stroke();
  } else {
    ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  }
}

function drawLayerOutline(ctx, layer, outline = {}) {
  if (layer.type === "text") return;
  const style = normalizeOutline(layer.outline);
  if (!style) return;
  setShadow(ctx, 0, 0, 0, "transparent");
  setLineJoin(ctx, "round");
  setLineCap(ctx, "round");
  style.strokes.forEach((stroke) => {
    setLineWidth(ctx, stroke.width);
    setStrokeStyle(ctx, colorWithOpacity(stroke.color, stroke.opacity));
    strokeLayerOutlinePath(ctx, layer, outline);
  });
}

function strokeLayerOutlinePath(ctx, layer, outline = {}) {
  if (outline.hasTear) {
    drawTearPath(ctx, layer, outline);
    ctx.stroke();
    return;
  }
  if (outline.clipPolygon && outline.clipPolygon.length >= 3) {
    drawLayerClipPolygon(ctx, outline.clipPolygon, layer);
    ctx.stroke();
    return;
  }
  if (outline.clipShape) {
    drawShapePath(ctx, outline.clipShape, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    ctx.stroke();
    return;
  }
  if (layer.radius) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
    ctx.stroke();
    return;
  }
  ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
}

function normalizeOutline(outline) {
  if (!outline) return null;
  const sourceStrokes = Array.isArray(outline.strokes) && outline.strokes.length
    ? outline.strokes
    : [outline];
  const strokes = sourceStrokes
    .map((stroke) => {
      const width = Number(stroke.width || 0);
      if (width <= 0) return null;
      return {
        color: stroke.color || "#ffffff",
        width: Math.max(1, width),
        opacity: stroke.opacity == null ? 1 : Math.max(0, Math.min(1, Number(stroke.opacity) || 0))
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.width - a.width);
  if (!strokes.length) return null;
  return {
    strokes
  };
}

function colorWithOpacity(color, opacity) {
  if (opacity >= 1) return color;
  if (typeof color !== "string") return color;
  if (color.startsWith("rgba(")) return color;
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }
  const hex = color.replace("#", "");
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

function getLayerClipShape(layer) {
  const style = layer.style || {};
  const shape = layer.clipShape || layer.maskShape || style.clipShape || style.maskShape || style.shape || "";
  if (shape === "note") return "tag";
  if (shape === "rect") return "";
  return ["circle", "heart", "star", "tag", "stamp"].includes(shape) ? shape : "";
}

function getLayerExcludeShape(layer) {
  const style = layer.style || {};
  const shape = layer.excludeShape || style.excludeShape || "";
  return ["circle", "heart", "star", "tag", "stamp"].includes(shape) ? shape : "";
}

function getLayerExcludeFrame(layer) {
  const style = layer.style || {};
  const frame = layer.excludeFrame || style.excludeFrame || null;
  if (!frame || frame.width <= 0 || frame.height <= 0) return null;
  return {
    x: frame.x - layer.width / 2,
    y: frame.y - layer.height / 2,
    width: frame.width,
    height: frame.height
  };
}

function drawInverseShapeClip(ctx, shape, layer) {
  const frame = getLayerExcludeFrame(layer);
  if (!frame) return;
  ctx.beginPath();
  ctx.rect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  drawReverseShapePath(ctx, shape, frame.x, frame.y, frame.width, frame.height);
  ctx.clip();
}

function drawShapePath(ctx, shape, x, y, width, height, append = false) {
  if (shape === "circle") {
    const radius = Math.min(width, height) / 2;
    if (!append) ctx.beginPath();
    ctx.arc(x + width / 2, y + height / 2, radius, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (shape === "heart") {
    drawHeartPath(ctx, x, y, width, height, append);
    return;
  }
  if (shape === "star") {
    drawStarPath(ctx, x, y, width, height, append);
    return;
  }
  if (shape === "tag") {
    drawTagPath(ctx, x, y, width, height, append);
    return;
  }
  if (shape === "stamp") {
    drawStampPath(ctx, x, y, width, height, append);
    return;
  }
  if (!append) ctx.beginPath();
  ctx.rect(x, y, width, height);
}

function drawLayerClipPolygon(ctx, points, layer) {
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x - layer.width / 2;
    const y = point.y - layer.height / 2;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function drawReverseShapePath(ctx, shape, x, y, width, height) {
  if (shape === "circle") {
    const radius = Math.min(width, height) / 2;
    ctx.moveTo(x + width / 2 + radius, y + height / 2);
    ctx.arc(x + width / 2, y + height / 2, radius, 0, Math.PI * 2, true);
    ctx.closePath();
    return;
  }
  if (shape === "heart") {
    drawReverseHeartPath(ctx, x, y, width, height);
    return;
  }
  if (shape === "star") {
    drawStarPath(ctx, x, y, width, height, true, true);
    return;
  }
  if (shape === "tag") {
    drawReverseTagPath(ctx, x, y, width, height);
    return;
  }
  if (shape === "stamp") {
    drawStampPath(ctx, x, y, width, height, true, true);
    return;
  }
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + width, y);
  ctx.closePath();
}

function drawHeartPath(ctx, x, y, width, height, append = false) {
  if (!append) ctx.beginPath();
  ctx.moveTo(x + width * 0.5, y + height * 0.88);
  ctx.bezierCurveTo(x + width * 0.08, y + height * 0.62, x + width * 0.02, y + height * 0.28, x + width * 0.28, y + height * 0.18);
  ctx.bezierCurveTo(x + width * 0.4, y + height * 0.13, x + width * 0.49, y + height * 0.2, x + width * 0.5, y + height * 0.33);
  ctx.bezierCurveTo(x + width * 0.51, y + height * 0.2, x + width * 0.6, y + height * 0.13, x + width * 0.72, y + height * 0.18);
  ctx.bezierCurveTo(x + width * 0.98, y + height * 0.28, x + width * 0.92, y + height * 0.62, x + width * 0.5, y + height * 0.88);
  ctx.closePath();
}

function drawReverseHeartPath(ctx, x, y, width, height) {
  const p0 = { x: x + width * 0.5, y: y + height * 0.88 };
  ctx.moveTo(p0.x, p0.y);
  ctx.bezierCurveTo(x + width * 0.92, y + height * 0.62, x + width * 0.98, y + height * 0.28, x + width * 0.72, y + height * 0.18);
  ctx.bezierCurveTo(x + width * 0.6, y + height * 0.13, x + width * 0.51, y + height * 0.2, x + width * 0.5, y + height * 0.33);
  ctx.bezierCurveTo(x + width * 0.49, y + height * 0.2, x + width * 0.4, y + height * 0.13, x + width * 0.28, y + height * 0.18);
  ctx.bezierCurveTo(x + width * 0.02, y + height * 0.28, x + width * 0.08, y + height * 0.62, p0.x, p0.y);
  ctx.closePath();
}

function drawStarPath(ctx, x, y, width, height, append = false, reverse = false) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const outer = Math.min(width, height) * 0.48;
  const inner = outer * 0.46;
  if (!append) ctx.beginPath();
  const indexes = reverse ? [0, 9, 8, 7, 6, 5, 4, 3, 2, 1] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  indexes.forEach((i, index) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

function drawTagPath(ctx, x, y, width, height, append = false) {
  const cut = Math.min(width, height) * 0.18;
  const radius = Math.min(width, height) * 0.08;
  if (!append) ctx.beginPath();
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

function drawReverseTagPath(ctx, x, y, width, height) {
  const cut = Math.min(width, height) * 0.18;
  const radius = Math.min(width, height) * 0.08;
  ctx.moveTo(x + radius, y);
  ctx.quadraticCurveTo(x, y, x, y + radius);
  ctx.lineTo(x, y + height - radius);
  ctx.quadraticCurveTo(x, y + height, x + radius, y + height);
  ctx.lineTo(x + width - radius, y + height);
  ctx.quadraticCurveTo(x + width, y + height, x + width, y + height - radius);
  ctx.lineTo(x + width, y + cut);
  ctx.lineTo(x + width - cut, y);
  ctx.lineTo(x + radius, y);
  ctx.closePath();
}

function drawStampPath(ctx, x, y, width, height, append = false, reverse = false) {
  const notch = Math.max(5, Math.min(width, height) * 0.045);
  const step = notch * 2.2;
  if (!append) ctx.beginPath();
  if (reverse) {
    ctx.moveTo(x + notch, y);
    ctx.lineTo(x, y + notch);
    for (let py = y + notch; py < y + height - notch; py += step) {
      ctx.quadraticCurveTo(x + notch, py + step / 2, x, Math.min(py + step, y + height - notch));
    }
    ctx.lineTo(x + notch, y + height);
    for (let px = x + notch; px < x + width - notch; px += step) {
      ctx.quadraticCurveTo(px + step / 2, y + height - notch, Math.min(px + step, x + width - notch), y + height);
    }
    ctx.lineTo(x + width, y + height - notch);
    for (let py = y + height - notch; py > y + notch; py -= step) {
      ctx.quadraticCurveTo(x + width - notch, py - step / 2, x + width, Math.max(py - step, y + notch));
    }
    ctx.lineTo(x + width - notch, y);
    for (let px = x + width - notch; px > x + notch; px -= step) {
      ctx.quadraticCurveTo(px - step / 2, y + notch, Math.max(px - step, x + notch), y);
    }
    ctx.closePath();
    return;
  }
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

function drawExcludeEdge(ctx, shape, layer) {
  const frame = getLayerExcludeFrame(layer);
  if (!frame) return;
  setShadow(ctx, 0, 0, 0, "transparent");
  setLineWidth(ctx, 1.5);
  setStrokeStyle(ctx, "rgba(17,17,17,0.12)");
  drawShapePath(ctx, shape, frame.x, frame.y, frame.width, frame.height);
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

function drawTearPath(ctx, layer, outline = {}) {
  const points = getTearPathPoints(layer, outline);
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.closePath();
}

function drawTearEdge(ctx, layer, outline = {}) {
  setShadow(ctx, 0, 0, 0, "transparent");
  setLineJoin(ctx, "round");
  setLineCap(ctx, "round");
  setLineWidth(ctx, 8);
  setStrokeStyle(ctx, "rgba(255,255,255,0.72)");
  drawTearPath(ctx, layer, outline);
  ctx.stroke();
  setLineWidth(ctx, 3);
  setStrokeStyle(ctx, "rgba(17,17,17,0.12)");
  drawTearPath(ctx, layer, outline);
  ctx.stroke();
  setLineWidth(ctx, 1);
  setStrokeStyle(ctx, "rgba(17,17,17,0.2)");
  drawTearPath(ctx, layer, outline);
  ctx.stroke();
}

function getTearPathPoints(layer, outline = {}) {
  if (outline.clipPolygon && outline.clipPolygon.length >= 3) {
    return getTornPolygonPoints(layer, outline.clipPolygon);
  }
  if (outline.clipShape) {
    return getTornShapePoints(layer, outline.clipShape);
  }
  const width = Math.max(1, layer.width || 1);
  const height = Math.max(1, layer.height || 1);
  const left = -width / 2;
  const top = -height / 2;
  const right = width / 2;
  const bottom = height / 2;
  const seed = getTearSeed(layer);
  const amplitude = Math.max(7, Math.min(24, Math.min(width, height) * 0.035));
  const step = Math.max(24, Math.min(48, Math.min(width, height) / 7));
  const points = [];
  addTearEdgePoints(points, "top", left, top, right, top, step, amplitude, seed + 11);
  addTearEdgePoints(points, "right", right, top, right, bottom, step, amplitude, seed + 29);
  addTearEdgePoints(points, "bottom", right, bottom, left, bottom, step, amplitude, seed + 47);
  addTearEdgePoints(points, "left", left, bottom, left, top, step, amplitude, seed + 71);
  return points;
}

function getTornPolygonPoints(layer, polygon) {
  const width = Math.max(1, layer.width || 1);
  const height = Math.max(1, layer.height || 1);
  const seed = getTearSeed(layer);
  const amplitude = Math.max(7, Math.min(24, Math.min(width, height) * 0.035));
  const step = Math.max(24, Math.min(48, Math.min(width, height) / 7));
  const points = [];
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    addTornSegmentPoints(
      points,
      point.x - width / 2,
      point.y - height / 2,
      next.x - width / 2,
      next.y - height / 2,
      step,
      amplitude,
      seed + index * 53
    );
  });
  return points;
}

function getTornShapePoints(layer, shape) {
  const width = Math.max(1, layer.width || 1);
  const height = Math.max(1, layer.height || 1);
  const samples = sampleShapeOutline(shape, -width / 2, -height / 2, width, height);
  if (!samples.length) return getTearPathPoints(layer);
  const seed = getTearSeed(layer);
  const amplitude = Math.max(5, Math.min(18, Math.min(width, height) * 0.028));
  return samples.map((point, index) => {
    const normal = getOutwardNormal(point, width, height);
    const jitter = getTearJitter(seed + index * 41, index, amplitude);
    return {
      x: point.x + normal.x * jitter,
      y: point.y + normal.y * jitter
    };
  });
}

function addTornSegmentPoints(points, x1, y1, x2, y2, step, amplitude, seed) {
  const length = Math.max(1, Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2));
  const count = Math.max(2, Math.ceil(length / step));
  const normal = getSegmentNormal(x1, y1, x2, y2);
  for (let index = 0; index <= count; index += 1) {
    if (points.length && index === 0) continue;
    const t = index / count;
    const jitter = getTearJitter(seed, index, amplitude);
    points.push({
      x: x1 + (x2 - x1) * t + normal.x * jitter,
      y: y1 + (y2 - y1) * t + normal.y * jitter
    });
  }
}

function sampleShapeOutline(shape, x, y, width, height) {
  if (shape === "circle") return sampleEllipse(x, y, width, height, 48);
  if (shape === "heart") return sampleHeart(x, y, width, height, 64);
  if (shape === "star") return sampleStar(x, y, width, height);
  if (shape === "tag") return sampleTag(x, y, width, height);
  if (shape === "stamp") return sampleStamp(x, y, width, height);
  return [];
}

function sampleEllipse(x, y, width, height, count) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index / count * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * width / 2,
      y: cy + Math.sin(angle) * height / 2
    };
  });
}

function sampleHeart(x, y, width, height, count) {
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / count * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    result.push({
      x: x + width / 2 + hx / 34 * width,
      y: y + height * 0.52 - hy / 34 * height
    });
  }
  return result;
}

function sampleStar(x, y, width, height) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const outer = Math.min(width, height) * 0.48;
  const inner = outer * 0.46;
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return densifyClosedPoints(points, Math.max(18, Math.min(width, height) / 8));
}

function sampleTag(x, y, width, height) {
  const cut = Math.min(width, height) * 0.18;
  return densifyClosedPoints([
    { x, y },
    { x: x + width - cut, y },
    { x: x + width, y: y + cut },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ], Math.max(18, Math.min(width, height) / 8));
}

function sampleStamp(x, y, width, height) {
  const points = [];
  const notch = Math.max(5, Math.min(width, height) * 0.045);
  const step = notch * 2.2;
  for (let px = x + notch; px < x + width - notch; px += step) points.push({ x: px, y: y + (points.length % 2 ? notch : 0) });
  for (let py = y + notch; py < y + height - notch; py += step) points.push({ x: x + width - (points.length % 2 ? notch : 0), y: py });
  for (let px = x + width - notch; px > x + notch; px -= step) points.push({ x: px, y: y + height - (points.length % 2 ? notch : 0) });
  for (let py = y + height - notch; py > y + notch; py -= step) points.push({ x: x + (points.length % 2 ? notch : 0), y: py });
  return points;
}

function densifyClosedPoints(points, step) {
  const result = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const length = Math.max(1, Math.sqrt((next.x - point.x) ** 2 + (next.y - point.y) ** 2));
    const count = Math.max(1, Math.ceil(length / step));
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      result.push({
        x: point.x + (next.x - point.x) * t,
        y: point.y + (next.y - point.y) * t
      });
    }
  });
  return result;
}

function getOutwardNormal(point, width, height) {
  const length = Math.sqrt(point.x ** 2 + point.y ** 2) || 1;
  return { x: point.x / length, y: point.y / length };
}

function getSegmentNormal(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx ** 2 + dy ** 2) || 1;
  return { x: dy / length, y: -dx / length };
}

function addTearEdgePoints(points, edge, x1, y1, x2, y2, step, amplitude, seed) {
  const length = Math.max(1, Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2));
  const count = Math.max(2, Math.ceil(length / step));
  for (let index = 0; index <= count; index += 1) {
    if (points.length && index === 0) continue;
    const t = index / count;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    const jitter = getTearJitter(seed, index, amplitude);
    if (edge === "top") points.push({ x, y: y + jitter });
    if (edge === "right") points.push({ x: x - jitter, y });
    if (edge === "bottom") points.push({ x, y: y - jitter });
    if (edge === "left") points.push({ x: x + jitter, y });
  }
}

function getTearJitter(seed, index, amplitude) {
  const raw = seededUnit(seed + index * 97);
  const wave = Math.sin((seed % 31 + index) * 1.37) * 0.28 + 0.72;
  return Math.max(1, raw * amplitude * wave);
}

function getTearSeed(layer) {
  if (layer.tearSeed != null) return Number(layer.tearSeed) || 1;
  const id = String(layer.id || "tear");
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function seededUnit(seed) {
  let value = Math.imul(seed ^ 0x6d2b79f5, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return ((value >>> 0) % 10000) / 10000;
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

function drawBrushLayer(ctx, layer, options = {}) {
  const baseWidth = layer.brushWidth || layer.width || 1;
  const baseHeight = layer.brushHeight || layer.height || 1;
  const scaleX = (layer.width || baseWidth) / baseWidth;
  const scaleY = (layer.height || baseHeight) / baseHeight;
  const lineScale = Math.max(0.2, (Math.abs(scaleX) + Math.abs(scaleY)) / 2);
  drawBrushStrokes(ctx, layer.strokes || [], {
    offsetX: -layer.width / 2,
    offsetY: -layer.height / 2,
    scaleX,
    scaleY,
    lineScale,
    imageCache: options.imageCache || {}
  });
}

function drawBrushDraft(ctx, brushDraft, options = {}) {
  if (!brushDraft || !Array.isArray(brushDraft.strokes) || !brushDraft.strokes.length) return;
  ctx.save();
  setShadow(ctx, 0, 0, 0, "transparent");
  drawBrushStrokes(ctx, brushDraft.strokes, { imageCache: options.imageCache || {} });
  ctx.restore();
}

function drawBrushStrokes(ctx, strokes, options = {}) {
  const offsetX = options.offsetX || 0;
  const offsetY = options.offsetY || 0;
  const scaleX = options.scaleX == null ? 1 : options.scaleX;
  const scaleY = options.scaleY == null ? 1 : options.scaleY;
  const lineScale = options.lineScale == null ? 1 : options.lineScale;
  const imageCache = options.imageCache || {};
  setLineCap(ctx, "round");
  setLineJoin(ctx, "round");
  strokes.forEach((stroke) => {
    const points = stroke.points || [];
    if (!points.length) return;
    const mappedPoints = points.map((point) => ({
      x: offsetX + point.x * scaleX,
      y: offsetY + point.y * scaleY
    }));
    const size = Math.max(1, (stroke.size || 8) * lineScale);
    if (stroke.type === "stitch") {
      drawStitchBrush(ctx, mappedPoints, stroke.color || "#111111", size);
    } else if (stroke.type === "knit") {
      drawKnitBrush(ctx, mappedPoints, stroke.color || "#111111", size);
    } else if (stroke.type === "bead") {
      drawBeadBrush(ctx, mappedPoints, stroke.color || "#111111", size);
    } else if (stroke.type === "lace") {
      drawLaceBrush(ctx, mappedPoints, stroke.color || "#111111", size);
    } else if (stroke.type === "bow") {
      drawStampBrush(ctx, mappedPoints, stroke, size, imageCache);
    } else {
      drawLineBrush(ctx, mappedPoints, stroke.color || "#111111", size);
    }
  });
}

function drawLineBrush(ctx, points, color, size) {
  setStrokeStyle(ctx, color);
  setLineWidth(ctx, size);
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();
}

function drawStitchBrush(ctx, points, color, size) {
  const samples = sampleBrushPath(points, Math.max(9, size * 1.7));
  setStrokeStyle(ctx, color);
  setLineWidth(ctx, Math.max(2, size * 0.5));
  samples.forEach((sample) => {
    const length = Math.max(7, size * 1.25);
    drawRotatedLine(ctx, sample.x, sample.y, sample.angle, -length / 2, 0, length / 2, 0);
  });
}

function drawKnitBrush(ctx, points, color, size) {
  const samples = sampleBrushPath(points, Math.max(14, size * 2.2));
  setStrokeStyle(ctx, color);
  setLineWidth(ctx, Math.max(1.4, size * 0.34));
  samples.forEach((sample) => {
    const length = Math.max(9, size * 1.45);
    const spread = Math.max(4, size * 0.55);
    drawRotatedLine(ctx, sample.x, sample.y, sample.angle, -spread, -length / 2, 0, length / 2);
    drawRotatedLine(ctx, sample.x, sample.y, sample.angle, spread, -length / 2, 0, length / 2);
  });
}

function drawBeadBrush(ctx, points, color, size) {
  const samples = sampleBrushPath(points, Math.max(9, size * 1.65));
  setFillStyle(ctx, color);
  samples.forEach((sample) => {
    ctx.beginPath();
    ctx.arc(sample.x, sample.y, Math.max(2.5, size * 0.5), 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawLaceBrush(ctx, points, color, size) {
  const samples = sampleBrushPath(points, Math.max(14, size * 2.05));
  const radius = Math.max(5, size * 0.9);
  setStrokeStyle(ctx, color);
  setFillStyle(ctx, color);
  setLineWidth(ctx, Math.max(1.4, size * 0.24));
  samples.forEach((sample, index) => {
    ctx.save();
    ctx.translate(sample.x, sample.y);
    ctx.rotate(sample.angle);
    ctx.beginPath();
    ctx.arc(0, radius * 0.12, radius, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-radius * 0.46, radius * 0.08, Math.max(1.4, size * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(radius * 0.46, radius * 0.08, Math.max(1.4, size * 0.16), 0, Math.PI * 2);
    ctx.fill();
    if (index % 2 === 0) {
      ctx.beginPath();
      ctx.arc(0, -radius * 0.28, Math.max(1.3, size * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawStampBrush(ctx, points, stroke, size, imageCache) {
  const samples = sampleBrushPath(points, Math.max(28, size * 3.2));
  const source = stroke.stampSource || "";
  const image = source && imageCache ? imageCache[source] : null;
  const stampSize = Math.max(24, size * 3.4);
  samples.forEach((sample, index) => {
    const rotation = sample.angle + (index % 2 === 0 ? -0.16 : 0.16);
    ctx.save();
    ctx.translate(sample.x, sample.y);
    ctx.rotate(rotation);
    if (image && typeof image !== "string") {
      ctx.drawImage(image, -stampSize / 2, -stampSize / 2, stampSize, stampSize);
    } else {
      drawFallbackBowStamp(ctx, stampSize, stroke.color || "#d94a38");
    }
    ctx.restore();
  });
}

function drawFallbackBowStamp(ctx, size, color) {
  const width = size;
  const height = size * 0.68;
  setFillStyle(ctx, color);
  setStrokeStyle(ctx, color);
  setLineWidth(ctx, Math.max(1.4, size * 0.08));
  ctx.beginPath();
  ctx.moveTo(-width * 0.08, 0);
  ctx.bezierCurveTo(-width * 0.42, -height * 0.42, -width * 0.52, height * 0.32, -width * 0.08, height * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width * 0.08, 0);
  ctx.bezierCurveTo(width * 0.42, -height * 0.42, width * 0.52, height * 0.32, width * 0.08, height * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2, size * 0.12), 0, Math.PI * 2);
  ctx.fill();
}

function drawRotatedLine(ctx, x, y, angle, x1, y1, x2, y2) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(x + x1 * cos - y1 * sin, y + x1 * sin + y1 * cos);
  ctx.lineTo(x + x2 * cos - y2 * sin, y + x2 * sin + y2 * cos);
  ctx.stroke();
}

function sampleBrushPath(points, spacing) {
  if (!points || points.length < 2) return [];
  const samples = [];
  let carry = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.sqrt(dx ** 2 + dy ** 2);
    if (segmentLength <= 0.01) continue;
    const angle = Math.atan2(dy, dx);
    let distanceOnSegment = spacing - carry;
    while (distanceOnSegment <= segmentLength) {
      const t = distanceOnSegment / segmentLength;
      samples.push({
        x: start.x + dx * t,
        y: start.y + dy * t,
        angle
      });
      distanceOnSegment += spacing;
    }
    carry = segmentLength - (distanceOnSegment - spacing);
    if (carry >= spacing) carry = 0;
  }
  if (!samples.length && points.length >= 2) {
    const start = points[0];
    const end = points[points.length - 1];
    samples.push({
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
      angle: Math.atan2(end.y - start.y, end.x - start.x)
    });
  }
  return samples;
}

function drawText(ctx, layer) {
  const style = layer.style || {};
  const outline = normalizeOutline(layer.outline);
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
  if (outline) {
    setLineJoin(ctx, "round");
    setLineCap(ctx, "round");
    outline.strokes.forEach((stroke) => {
      setLineWidth(ctx, Math.max(stroke.width, fontSize * 0.1));
      setStrokeStyle(ctx, colorWithOpacity(stroke.color, stroke.opacity));
      drawStyledText(ctx, layer.text || "写点什么...", style, fontSize, layer.width, "stroke");
    });
  }
  setFillStyle(ctx, style.color || "#111111");
  drawStyledText(ctx, layer.text || "写点什么...", style, fontSize, layer.width, "fill");
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

function drawStyledText(ctx, text, style, fontSize, maxWidth, mode = "fill") {
  const label = style.fontLabel || "系统";
  const customCanvasFont = !!style.canvasFontFamily && !isFallbackOnlyFont(style.canvasFontFamily);
  if (label === "打字机") {
    drawMonospaceText(ctx, text, fontSize, maxWidth, mode);
    return;
  }
  if (label === "手写") {
    ctx.save();
    ctx.rotate(-3 * Math.PI / 180);
    paintLayerText(ctx, text, 0, 0, maxWidth, customCanvasFont, mode);
    ctx.restore();
    return;
  }
  if (label === "衬线") {
    paintLayerText(ctx, text, 0, 0, maxWidth, customCanvasFont, mode);
    paintLayerText(ctx, text, 1.2, 0, maxWidth, customCanvasFont, mode);
    return;
  }
  if (label === "圆体") {
    paintLayerText(ctx, text, 0, 0, maxWidth, customCanvasFont, mode);
    paintLayerText(ctx, text, 0.8, 0.8, maxWidth, customCanvasFont, mode);
    return;
  }
  paintLayerText(ctx, text, 0, 0, maxWidth, customCanvasFont, mode);
}

function paintLayerText(ctx, text, x, y, maxWidth, customCanvasFont, mode) {
  if (customCanvasFont) {
    if (mode === "stroke") {
      ctx.strokeText(text, x, y);
    } else {
      ctx.fillText(text, x, y);
    }
    return;
  }
  if (mode === "stroke") {
    ctx.strokeText(text, x, y, maxWidth);
  } else {
    ctx.fillText(text, x, y, maxWidth);
  }
}

function isFallbackOnlyFont(fontFamily) {
  return fontFamily.split(",").every((item) => isGenericFontFamily(item.trim()));
}

function drawMonospaceText(ctx, text, fontSize, maxWidth, mode = "fill") {
  const chars = String(text).split("");
  const charWidth = Math.min(fontSize * 0.68, maxWidth / Math.max(chars.length, 1));
  const totalWidth = charWidth * chars.length;
  const startX = -totalWidth / 2 + charWidth / 2;
  chars.forEach((char, index) => {
    if (mode === "stroke") {
      ctx.strokeText(char, startX + index * charWidth, 0, charWidth);
    } else {
      ctx.fillText(char, startX + index * charWidth, 0, charWidth);
    }
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
  const clipPolygons = getLayerClipPolygons(layer);
  const clipPolygon = clipPolygons[clipPolygons.length - 1] || null;
  if (clipPolygon && clipPolygon.length >= 3) {
    drawLayerClipPolygon(ctx, clipPolygon, layer);
    ctx.stroke();
    setFillStyle(ctx, "#111111");
    const bounds = getClipPolygonBounds(clipPolygon);
    [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.minY],
      [bounds.maxX, bounds.maxY],
      [bounds.minX, bounds.maxY]
    ].forEach(([x, y]) => ctx.fillRect(x - layer.width / 2 - 7, y - layer.height / 2 - 7, 14, 14));
    ctx.restore();
    return;
  }
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

function getClipPolygonBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y)
  }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  });
}

function getLayerClipPolygons(layer) {
  const polygons = [];
  if (Array.isArray(layer.clipPolygons)) {
    layer.clipPolygons.forEach((polygon) => {
      if (Array.isArray(polygon) && polygon.length >= 3) polygons.push(polygon);
    });
  }
  if (Array.isArray(layer.clipPolygon) && layer.clipPolygon.length >= 3) {
    const alreadyIncluded = polygons.some((polygon) => polygon === layer.clipPolygon);
    if (!alreadyIncluded) polygons.push(layer.clipPolygon);
  }
  return polygons;
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
    const clipPolygons = getLayerClipPolygons(layer);
    if (clipPolygons.length) {
      const point = {
        x: localX + layer.width / 2,
        y: localY + layer.height / 2
      };
      return clipPolygons.every((polygon) => pointInPolygon(point, polygon));
    }
    return Math.abs(localX) <= layer.width / 2 && Math.abs(localY) <= layer.height / 2;
  });
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y))
      && (point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y) / ((previousPoint.y - currentPoint.y) || 1) + currentPoint.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

module.exports = {
  drawDraft,
  hitTest
};
