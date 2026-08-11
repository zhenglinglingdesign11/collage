const { getOrderedLayers } = require("../models/draft");
const TORN_PAPER_EDGE_ATLAS = "/assets/textures/torn-paper-edge-atlas.png";
const floatingAlphaShadowCache = {};
const tornSourceRenderCache = {};

function drawDraft(ctx, draft, selectedLayerId, options = {}) {
  const dpr = options.dpr || 1;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, draft.width, draft.height);
  setFillStyle(ctx, draft.background || "#fdfdfb");
  ctx.fillRect(0, 0, draft.width, draft.height);
  drawBackgroundPattern(ctx, draft, options);
  drawBackgroundImage(ctx, draft, options);

  getVisibleLayers(draft.layers, options.isolatedLayerId)
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

function getVisibleLayers(layers, isolatedLayerId) {
  const orderedLayers = getOrderedLayers(layers);
  if (!isolatedLayerId) return orderedLayers;
  return orderedLayers.filter((layer) => layer.id === isolatedLayerId);
}

function drawBackgroundPattern(ctx, draft, options = {}) {
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
  if (pattern === "polka") {
    drawPolkaPatternInRect(ctx, draft.width, draft.height, draft && draft.backgroundPatternConfig, options);
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
  const clipShape = getLayerClipShape(layer);
  const excludeShape = getLayerExcludeShape(layer);
  const clipPolygons = getLayerClipPolygons(layer);
  const clipPolygon = clipPolygons[clipPolygons.length - 1] || null;
  const hasTear = !!(layer.tear && layer.type !== "text");
  const tornSourceRender = hasTear && layer.source
    ? getTornSourceRender(layer, { clipShape, clipPolygon, hasTear }, options)
    : null;
  const floating = hasFloatingEffect(layer);
  if (floating) {
    drawFloatingPaperShadow(ctx, layer, { clipShape, clipPolygon, hasTear }, options);
  }
  if (layer.type === "brush" || floating) {
    setShadow(ctx, 0, 0, 0, "transparent");
  } else if (hasTapeAttachment(layer)) {
    setShadow(ctx, 0, 10, 20, "rgba(17, 17, 17, 0.14)");
  } else if (layer.shadow) {
    setShadow(ctx, 0, 18, 36, "rgba(17, 17, 17, 0.18)");
  } else {
    setShadow(ctx, 0, 8, 18, "rgba(17, 17, 17, 0.08)");
  }
  if (excludeShape && layer.type !== "text") {
    drawInverseShapeClip(ctx, excludeShape, layer);
  }
  if (hasTear && !tornSourceRender) {
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

  if (tornSourceRender) {
    setShadow(ctx, 0, 0, 0, "transparent");
    ctx.drawImage(
      tornSourceRender.canvas,
      -layer.width / 2 - tornSourceRender.margin,
      -layer.height / 2 - tornSourceRender.margin,
      tornSourceRender.width,
      tornSourceRender.height
    );
  } else if (layer.source) {
    drawSourceLayer(ctx, layer, options);
  } else if (isCollageSlot(layer)) {
    drawCollagePlaceholder(ctx, layer);
  } else if (layer.type === "brush") {
    drawBrushLayer(ctx, layer, options);
  } else if (layer.type === "text") {
    drawText(ctx, layer);
  } else if (layer.type === "tape") {
    drawTape(ctx, layer);
  } else {
    drawPaper(ctx, layer, options);
  }
  if (clipShape && layer.type !== "text" && !hasTear) {
    drawEmbossEdge(ctx, clipShape, layer.width, layer.height);
  }
  if (hasTear && !tornSourceRender) {
    drawTearEdge(ctx, layer, { clipShape, clipPolygon });
  }
  if (excludeShape && layer.type !== "text") {
    drawExcludeEdge(ctx, excludeShape, layer);
  }
  drawLayerOutline(ctx, layer, { clipShape, clipPolygon, hasTear });
  drawFloatingEdge(ctx, layer, options);
  drawTapeAttachment(ctx, layer);
  ctx.restore();
}

function drawPolkaPatternInRect(ctx, width, height, patternConfig, options = {}) {
  const config = normalizePolkaBackgroundConfig(patternConfig);
  const gap = config.gap;
  const radius = Math.min(config.dotRadius, gap * 0.42);
  const colors = config.dotColors.length ? config.dotColors : [config.dotColor];
  const image = config.shape === "image" && config.imageSource && options.imageCache
    ? options.imageCache[config.imageSource]
    : null;
  const rowOffset = config.offset === "grid" ? 0 : gap / 2;
  for (let y = gap / 2; y < height + radius; y += gap) {
    const row = Math.floor(y / gap);
    const startX = gap / 2 + (row % 2 === 1 ? rowOffset : 0);
    for (let x = startX - gap; x < width + radius; x += gap) {
      const color = colors[Math.abs((row * 31 + Math.floor(x / gap) * 17 + config.seed) % colors.length)];
      drawPolkaDot(ctx, x, y, radius, color, config.opacity, config.style, config.shape, image);
    }
  }
}

function drawPolkaDot(ctx, x, y, radius, color, opacity, style, shape = "circle", image = null) {
  if (shape === "image" && image && typeof image !== "string") {
    ctx.save();
    setGlobalAlpha(ctx, opacity);
    const size = radius * 2.5;
    ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    ctx.restore();
    return;
  }
  const paintColor = colorWithAlpha(color, opacity);
  if (shape !== "circle") {
    drawPolkaShape(ctx, x, y, radius, paintColor, style, shape);
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (style === "outline") {
    setLineWidth(ctx, Math.max(1.2, radius * 0.28));
    setStrokeStyle(ctx, paintColor);
    ctx.stroke();
    return;
  }
  if (style === "soft" && ctx.createRadialGradient) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.12);
    gradient.addColorStop(0, colorWithAlpha(color, opacity));
    gradient.addColorStop(0.86, colorWithAlpha(color, opacity * 0.82));
    gradient.addColorStop(1, colorWithAlpha(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.12, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  setFillStyle(ctx, paintColor);
  ctx.fill();
}

function drawPolkaShape(ctx, x, y, radius, color, style, shape) {
  ctx.save();
  ctx.translate(x, y);
  buildPolkaShapePath(ctx, radius, shape);
  if (style === "outline") {
    setLineWidth(ctx, Math.max(1.2, radius * 0.24));
    setStrokeStyle(ctx, color);
    ctx.stroke();
  } else {
    setFillStyle(ctx, color);
    ctx.fill();
  }
  ctx.restore();
}

function buildPolkaShapePath(ctx, radius, shape) {
  if (shape === "square") {
    ctx.beginPath();
    ctx.rect(-radius, -radius, radius * 2, radius * 2);
    return;
  }
  if (shape === "diamond") {
    ctx.beginPath();
    ctx.moveTo(0, -radius * 1.18);
    ctx.lineTo(radius * 1.18, 0);
    ctx.lineTo(0, radius * 1.18);
    ctx.lineTo(-radius * 1.18, 0);
    ctx.closePath();
    return;
  }
  if (shape === "heart") {
    ctx.beginPath();
    ctx.moveTo(0, radius * 0.86);
    ctx.bezierCurveTo(-radius * 1.18, radius * 0.08, -radius * 0.92, -radius * 0.86, -radius * 0.24, -radius * 0.54);
    ctx.bezierCurveTo(-radius * 0.04, -radius * 0.44, 0, -radius * 0.18, 0, -radius * 0.02);
    ctx.bezierCurveTo(0, -radius * 0.18, radius * 0.04, -radius * 0.44, radius * 0.24, -radius * 0.54);
    ctx.bezierCurveTo(radius * 0.92, -radius * 0.86, radius * 1.18, radius * 0.08, 0, radius * 0.86);
    ctx.closePath();
    return;
  }
  if (shape === "star") {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const pointRadius = i % 2 === 0 ? radius * 1.18 : radius * 0.5;
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const px = Math.cos(angle) * pointRadius;
      const py = Math.sin(angle) * pointRadius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    return;
  }
  if (shape === "cross") {
    const arm = radius * 0.42;
    ctx.beginPath();
    ctx.rect(-arm, -radius, arm * 2, radius * 2);
    ctx.rect(-radius, -arm, radius * 2, arm * 2);
    return;
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
}

function normalizePolkaBackgroundConfig(config = {}) {
  const dotRadius = Number(config.dotRadius);
  const gap = Number(config.gap);
  const opacity = Number(config.opacity);
  const style = ["solid", "soft", "outline"].includes(config.style) ? config.style : "solid";
  const shape = ["circle", "square", "diamond", "heart", "star", "cross", "image"].includes(config.shape) ? config.shape : "circle";
  const dotColors = Array.isArray(config.dotColors) ? config.dotColors.filter(Boolean).slice(0, 6) : [];
  const imageWidth = Number(config.imageWidth);
  const imageHeight = Number(config.imageHeight);
  return {
    dotColor: config.dotColor || "rgba(17,17,17,0.18)",
    dotColors,
    dotRadius: Number.isFinite(dotRadius) ? Math.max(2, Math.min(28, dotRadius)) : 6,
    gap: Number.isFinite(gap) ? Math.max(18, Math.min(120, gap)) : 46,
    opacity: Number.isFinite(opacity) ? Math.max(0.12, Math.min(1, opacity)) : 0.58,
    style,
    shape,
    imageSource: config.imageSource || "",
    imageWidth: Number.isFinite(imageWidth) ? Math.max(0, imageWidth) : 0,
    imageHeight: Number.isFinite(imageHeight) ? Math.max(0, imageHeight) : 0,
    imageSourceType: ["upload", "asset"].includes(config.imageSourceType) ? config.imageSourceType : "",
    assetId: config.assetId || "",
    packId: config.packId || "",
    offset: config.offset === "grid" ? "grid" : "staggered",
    seed: Number.isFinite(Number(config.seed)) ? Number(config.seed) : 1
  };
}

function colorWithAlpha(color, alpha) {
  const normalized = String(color || "").trim();
  const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  const hex = normalized.replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
  }
  if (normalized.indexOf("rgb(") === 0) {
    return normalized.replace("rgb(", "rgba(").replace(")", `, ${clampedAlpha})`);
  }
  return normalized || `rgba(17, 17, 17, ${clampedAlpha})`;
}

function hasTapeAttachment(layer) {
  const effect = layer && layer.style && layer.style.handmadeEffect;
  return !!effect && effect.type === "taped";
}

function hasFloatingEffect(layer) {
  const effect = layer && layer.style && layer.style.handmadeEffect;
  return !!effect && effect.type === "floating";
}

function getFloatingElevation(layer) {
  const effect = layer && layer.style && layer.style.handmadeEffect;
  const elevation = effect && Number(effect.elevation);
  return Math.max(0.8, Math.min(3, Number.isFinite(elevation) ? elevation : 1));
}

function drawFloatingPaperShadow(ctx, layer, outline = {}, options = {}) {
  if (!hasFloatingEffect(layer) || layer.type === "text" || layer.type === "brush") return;
  const elevation = getFloatingElevation(layer);
  const opacity = layer.opacity == null ? 1 : layer.opacity;
  const longOffsetX = 2 + elevation * 2.2;
  const longOffsetY = 6 + elevation * 4.6;
  const softBlur = 10 + elevation * 8;
  const contactOffsetX = 1.2 + elevation;
  const contactOffsetY = 2.2 + elevation * 1.8;
  const useSourceAlpha = shouldUseSourceAlphaShadow(layer, outline, options);
  ctx.save();
  setLineJoin(ctx, "round");
  setLineCap(ctx, "round");

  if (useSourceAlpha) {
    setGlobalAlpha(ctx, opacity * 0.78);
    drawSourceAlphaShadowOnly(ctx, layer, options, longOffsetX * 1.1, longOffsetY * 1.08, softBlur * 1.05, "rgba(35, 27, 20, 0.20)");
  } else {
    setGlobalAlpha(ctx, opacity * 0.58);
    setShadow(ctx, longOffsetX, longOffsetY, softBlur, "rgba(35, 27, 20, 0.15)");
    setFillStyle(ctx, "rgba(35, 27, 20, 0.04)");
    ctx.save();
    ctx.translate(elevation * 0.45, elevation * 0.35);
    fillLayerSurfacePath(ctx, layer, outline);
    ctx.restore();
  }

  if (useSourceAlpha) {
    setGlobalAlpha(ctx, opacity * 0.94);
    drawSourceAlphaShadowOnly(ctx, layer, options, contactOffsetX * 1.12, contactOffsetY * 1.14, 5.5 + elevation * 3.8, "rgba(35, 27, 20, 0.36)");
  } else {
    setGlobalAlpha(ctx, opacity * 0.78);
    setShadow(ctx, contactOffsetX, contactOffsetY, 5 + elevation * 3.5, "rgba(35, 27, 20, 0.24)");
    setFillStyle(ctx, "rgba(35, 27, 20, 0.07)");
    ctx.save();
    ctx.translate(elevation * 0.22, elevation * 1.1);
    fillLayerSurfacePath(ctx, layer, outline);
    ctx.restore();
  }

  if (!useSourceAlpha) {
    setShadow(ctx, 0, 0, 0, "transparent");
    setGlobalAlpha(ctx, opacity * 0.16);
    setFillStyle(ctx, "rgba(255, 255, 255, 0.86)");
    ctx.save();
    ctx.translate(-elevation * 0.8, -elevation * 0.7);
    fillLayerSurfacePath(ctx, layer, outline);
    ctx.restore();
  }

  setGlobalAlpha(ctx, opacity);
  ctx.restore();
}

function shouldUseSourceAlphaShadow(layer, outline = {}, options = {}) {
  if (!layer || !layer.source || layer.type === "paper" || layer.type === "tape") return false;
  if (outline.hasTear || outline.clipShape || outline.clipPolygon || layer.radius) return false;
  const source = getCachedLayerSource(layer, options);
  return !!source && typeof source !== "string";
}

function getTornSourceRender(layer, outline = {}, options = {}) {
  const source = getCachedLayerSource(layer, options);
  if (!source || typeof source === "string") return null;
  const margin = Math.ceil(Math.max(24, Math.min(layer.width || 1, layer.height || 1) * 0.078));
  const width = Math.max(1, Math.ceil(layer.width + margin * 2));
  const height = Math.max(1, Math.ceil(layer.height + margin * 2));
  const key = [
    layer.source || "",
    Math.round(layer.width),
    Math.round(layer.height),
    getCropCacheKey(layer.crop),
    getTearSeed(layer),
    "core-v6",
    getTearOutlineCacheKey(outline),
    width,
    height
  ].join("|");
  if (tornSourceRenderCache[key]) return tornSourceRenderCache[key];
  const canvas = createRenderCanvas(width, height);
  const tearCtx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!canvas || !tearCtx) return null;
  canvas.width = width;
  canvas.height = height;
  if (tearCtx.clearRect) tearCtx.clearRect(0, 0, width, height);

  drawTornSourceContent(tearCtx, layer, source, outline, margin);
  drawTornEdgeMaterial(tearCtx, layer, outline, margin, options);

  const result = { canvas, margin, width, height };
  tornSourceRenderCache[key] = result;
  return result;
}

function getTearOutlineCacheKey(outline = {}) {
  if (outline.clipPolygon && outline.clipPolygon.length) {
    return outline.clipPolygon
      .map((point) => `${Math.round(point.x * 10)},${Math.round(point.y * 10)}`)
      .join(";");
  }
  if (outline.clipShape) return `shape:${outline.clipShape}`;
  return "rect";
}

function drawTornSourceContent(ctx, layer, source, outline = {}, margin = 0) {
  const outerPoints = getTearPathPoints(layer, outline);
  const coreWidth = getTearCoreWidth(layer);
  const innerPoints = getInsetTearPoints(outerPoints, layer, coreWidth);
  ctx.save();
  ctx.translate(margin + layer.width / 2, margin + layer.height / 2);
  drawTearPointPath(ctx, innerPoints);
  ctx.clip();
  ctx.translate(-layer.width / 2, -layer.height / 2);
  drawSourceImageAtRect(ctx, layer, source, 0, 0, layer.width, layer.height);
  ctx.restore();
}

function drawTornEdgeMaterial(ctx, layer, outline = {}, margin = 0, options = {}) {
  ctx.save();
  ctx.translate(margin + layer.width / 2, margin + layer.height / 2);
  const seed = getTearSeed(layer);
  const points = getTearPathPoints(layer, outline);
  const coreWidth = getTearCoreWidth(layer);
  const innerPoints = getInsetTearPoints(points, layer, coreWidth);
  const texture = options.imageCache && options.imageCache[TORN_PAPER_EDGE_ATLAS] || null;
  setShadow(ctx, 0, 0, 0, "transparent");
  setLineJoin(ctx, "round");
  setLineCap(ctx, "round");
  drawTearCoreBand(ctx, points, innerPoints, layer, seed);
  drawTearTexturePatches(ctx, texture, points, innerPoints, layer, seed + 271);
  drawTearOuterFringe(ctx, points, innerPoints, layer, seed + 193, { opacity: 0.42 });
  drawTearLooseFlakes(ctx, points, innerPoints, layer, seed + 1231, { opacity: 0.46 });
  ctx.restore();
}

function getTearCoreWidth(layer) {
  return Math.max(8, Math.min(20, Math.min(layer.width || 1, layer.height || 1) * 0.045));
}

function drawTearCoreBand(ctx, outerPoints, innerPoints, layer, seed) {
  if (!outerPoints.length || !innerPoints.length) return;
  setFillStyle(ctx, "rgba(238, 228, 204, 0.82)");
  drawTearBandPath(ctx, outerPoints, innerPoints);
  ctx.fill();
  drawTearCoreSpeckles(ctx, outerPoints, innerPoints, layer, seed);
}

function drawTearCoreSpeckles(ctx, outerPoints, innerPoints, layer, seed) {
  const count = Math.max(28, Math.min(110, Math.round((layer.width + layer.height) / 7)));
  for (let index = 0; index < count; index += 1) {
    const pathIndex = Math.floor(seededUnit(seed + index * 53) * outerPoints.length) % outerPoints.length;
    const outer = outerPoints[pathIndex];
    const inner = innerPoints[pathIndex] || outer;
    const t = seededUnit(seed + index * 79);
    const x = outer.x + (inner.x - outer.x) * t + (seededUnit(seed + index * 97) - 0.5) * 3.6;
    const y = outer.y + (inner.y - outer.y) * t + (seededUnit(seed + index * 113) - 0.5) * 3.6;
    const radius = 0.35 + seededUnit(seed + index * 131) * 1.55;
    setFillStyle(ctx, seededUnit(seed + index * 149) > 0.5 ? "rgba(255, 255, 255, 0.24)" : "rgba(112, 90, 62, 0.10)");
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTearTexturePatches(ctx, texture, outerPoints, innerPoints, layer, seed) {
  if (!texture || typeof texture === "string" || !outerPoints.length || !innerPoints.length) return;
  const sourcePatches = getTornAtlasPatchRects(texture);
  if (!sourcePatches.length) return;
  const perimeter = getClosedPathLength(outerPoints);
  const count = Math.max(24, Math.min(84, Math.round(perimeter / 18)));
  const scale = Math.max(0.9, Math.min(1.75, Math.min(layer.width || 1, layer.height || 1) / 230));
  ctx.save();
  drawTearBandPath(ctx, outerPoints, innerPoints);
  ctx.clip();
  setGlobalAlpha(ctx, 0.78);
  for (let index = 0; index < count; index += 1) {
    if (seededUnit(seed + index * 47) < 0.22) continue;
    const pathIndex = Math.floor(seededUnit(seed + index * 59) * outerPoints.length) % outerPoints.length;
    const outer = outerPoints[pathIndex];
    const inner = innerPoints[pathIndex] || outer;
    const radial = normalizeVector({ x: outer.x - inner.x, y: outer.y - inner.y }) || getApproximateOuterNormal(outerPoints, pathIndex);
    if (!radial) continue;
    const tangent = getPathTangent(outerPoints, pathIndex);
    const patch = sourcePatches[Math.floor(seededUnit(seed + index * 71) * sourcePatches.length) % sourcePatches.length];
    const cropWidth = Math.max(40, Math.min(patch.width, 58 + seededUnit(seed + index * 83) * 108));
    const cropHeight = Math.max(30, Math.min(patch.height, 34 + seededUnit(seed + index * 97) * 44));
    const sx = patch.x + seededUnit(seed + index * 109) * Math.max(1, patch.width - cropWidth);
    const sy = patch.y + seededUnit(seed + index * 127) * Math.max(1, patch.height - cropHeight);
    const drawWidth = cropWidth * scale * (0.7 + seededUnit(seed + index * 139) * 0.75);
    const drawHeight = Math.max(getTearCoreWidth(layer) * 1.25, cropHeight * scale * (0.46 + seededUnit(seed + index * 151) * 0.48));
    const alongShift = (seededUnit(seed + index * 163) - 0.5) * 5 * scale;
    const radialShift = (seededUnit(seed + index * 181) - 0.5) * getTearCoreWidth(layer) * 0.32;
    const angle = Math.atan2(tangent.y, tangent.x) + (seededUnit(seed + index * 193) - 0.5) * 0.32;
    ctx.save();
    ctx.translate(
      outer.x + tangent.x * alongShift + radial.x * radialShift,
      outer.y + tangent.y * alongShift + radial.y * radialShift
    );
    ctx.rotate(angle);
    if (radial.y < 0) ctx.scale(1, -1);
    ctx.drawImage(texture, sx, sy, cropWidth, cropHeight, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }
  setGlobalAlpha(ctx, 1);
  ctx.restore();
}

function getTornAtlasPatchRects(texture) {
  const width = texture.width || 1774;
  const height = texture.height || 887;
  const scaleX = width / 1774;
  const scaleY = height / 887;
  return [
    { x: 18, y: 24, width: 1030, height: 100 },
    { x: 18, y: 168, width: 1040, height: 100 },
    { x: 14, y: 310, width: 1060, height: 112 },
    { x: 12, y: 462, width: 1065, height: 110 },
    { x: 1160, y: 18, width: 70, height: 560 },
    { x: 1290, y: 16, width: 72, height: 565 },
    { x: 1442, y: 18, width: 88, height: 570 },
    { x: 1582, y: 18, width: 78, height: 570 },
    { x: 12, y: 616, width: 178, height: 170 },
    { x: 248, y: 614, width: 220, height: 142 },
    { x: 526, y: 610, width: 210, height: 162 },
    { x: 804, y: 622, width: 268, height: 118 },
    { x: 1134, y: 634, width: 272, height: 116 },
    { x: 1412, y: 626, width: 340, height: 128 }
  ].map((rect) => ({
    x: Math.max(0, Math.round(rect.x * scaleX)),
    y: Math.max(0, Math.round(rect.y * scaleY)),
    width: Math.max(1, Math.round(rect.width * scaleX)),
    height: Math.max(1, Math.round(rect.height * scaleY))
  })).filter((rect) => rect.x < width && rect.y < height);
}

function drawTearEdgeRelief(ctx, outerPoints, innerPoints, layer, seed) {
  if (!outerPoints.length || !innerPoints.length) return;
  const coreWidth = getTearCoreWidth(layer);
  ctx.save();
  ctx.translate(1.3, 1.7);
  strokeTearPoints(ctx, innerPoints, Math.max(2.2, coreWidth * 0.34), "rgba(63, 48, 34, 0.18)");
  strokeTearPoints(ctx, outerPoints, Math.max(1.4, coreWidth * 0.18), "rgba(63, 48, 34, 0.10)");
  ctx.restore();
  ctx.save();
  ctx.translate(-0.9, -1.1);
  strokeTearPoints(ctx, outerPoints, Math.max(1.4, coreWidth * 0.2), seededUnit(seed + 17) > 0.5 ? "rgba(255, 255, 255, 0.35)" : "rgba(248, 241, 222, 0.34)");
  ctx.restore();
}

function drawTearOuterFringe(ctx, outerPoints, innerPoints, layer, seed, options = {}) {
  if (!outerPoints.length || !innerPoints.length) return;
  const perimeter = getClosedPathLength(outerPoints);
  const count = Math.max(22, Math.min(90, Math.round(perimeter / 15)));
  const scale = Math.max(1, Math.min(2.2, Math.min(layer.width || 1, layer.height || 1) / 240));
  const opacity = options.opacity == null ? 1 : options.opacity;
  for (let index = 0; index < count; index += 1) {
    if (seededUnit(seed + index * 37) < 0.52) continue;
    const pathIndex = Math.floor(seededUnit(seed + index * 61) * outerPoints.length) % outerPoints.length;
    const outer = outerPoints[pathIndex];
    const inner = innerPoints[pathIndex] || outer;
    const radial = normalizeVector({ x: outer.x - inner.x, y: outer.y - inner.y }) || getApproximateOuterNormal(outerPoints, pathIndex);
    if (!radial) continue;
    const along = getPathTangent(outerPoints, pathIndex);
    const anchorShift = (seededUnit(seed + index * 89) - 0.5) * 5.2 * scale;
    const length = (1.4 + seededUnit(seed + index * 107) * 5.5) * scale;
    const start = {
      x: outer.x + along.x * anchorShift - radial.x * seededUnit(seed + index * 131) * 1.2 * scale,
      y: outer.y + along.y * anchorShift - radial.y * seededUnit(seed + index * 149) * 1.2 * scale
    };
    const end = {
      x: start.x + radial.x * length + along.x * (seededUnit(seed + index * 167) - 0.5) * 2.8 * scale,
      y: start.y + radial.y * length + along.y * (seededUnit(seed + index * 181) - 0.5) * 2.8 * scale
    };
    const warm = seededUnit(seed + index * 197);
    setLineWidth(ctx, (0.38 + seededUnit(seed + index * 211) * 0.95) * scale);
    setStrokeStyle(ctx, warm > 0.68
      ? `rgba(255, 252, 238, ${0.42 * opacity})`
      : warm > 0.34 ? `rgba(226, 211, 181, ${0.3 * opacity})` : `rgba(132, 109, 77, ${0.16 * opacity})`);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
}

function drawTearLooseFlakes(ctx, outerPoints, innerPoints, layer, seed, options = {}) {
  if (!outerPoints.length || !innerPoints.length) return;
  const perimeter = getClosedPathLength(outerPoints);
  const count = Math.max(8, Math.min(46, Math.round(perimeter / 32)));
  const scale = Math.max(1, Math.min(2, Math.min(layer.width || 1, layer.height || 1) / 260));
  const opacity = options.opacity == null ? 1 : options.opacity;
  for (let index = 0; index < count; index += 1) {
    if (seededUnit(seed + index * 43) < 0.48) continue;
    const pathIndex = Math.floor(seededUnit(seed + index * 71) * outerPoints.length) % outerPoints.length;
    const outer = outerPoints[pathIndex];
    const inner = innerPoints[pathIndex] || outer;
    const radial = normalizeVector({ x: outer.x - inner.x, y: outer.y - inner.y }) || getApproximateOuterNormal(outerPoints, pathIndex);
    if (!radial) continue;
    const along = getPathTangent(outerPoints, pathIndex);
    const distance = (seededUnit(seed + index * 101) - 0.18) * 8 * scale;
    const side = (seededUnit(seed + index * 113) - 0.5) * 6 * scale;
    const x = outer.x + radial.x * distance + along.x * side;
    const y = outer.y + radial.y * distance + along.y * side;
    const radius = (0.45 + seededUnit(seed + index * 127) * 1.8) * scale;
    setFillStyle(ctx, seededUnit(seed + index * 151) > 0.42 ? `rgba(247, 239, 219, ${0.34 * opacity})` : `rgba(122, 98, 68, ${0.12 * opacity})`);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function getInsetTearPoints(points, layer, amount) {
  if (!points.length) return [];
  const center = getPointsCenter(points);
  const seed = getTearSeed(layer) + 577;
  return points.map((point, index) => {
    const direction = normalizeVector({
      x: center.x - point.x,
      y: center.y - point.y
    }) || { x: 0, y: 0 };
    const localAmount = amount * (0.68 + seededUnit(seed + index * 41) * 0.62);
    return {
      x: point.x + direction.x * localAmount,
      y: point.y + direction.y * localAmount
    };
  });
}

function getPointsCenter(points) {
  return points.reduce((center, point) => ({
    x: center.x + point.x / points.length,
    y: center.y + point.y / points.length
  }), { x: 0, y: 0 });
}

function drawTearBandPath(ctx, outerPoints, innerPoints) {
  ctx.beginPath();
  outerPoints.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  for (let index = innerPoints.length - 1; index >= 0; index -= 1) {
    const point = innerPoints[index];
    if (index === innerPoints.length - 1) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
}

function drawTearPointPath(ctx, points) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function drawSourceAlphaShadowOnly(ctx, layer, options = {}, offsetX, offsetY, blur, color) {
  const source = getCachedLayerSource(layer, options);
  if (!source || typeof source === "string") {
    fillLayerSurfacePath(ctx, layer);
    return;
  }
  const shadow = getFloatingAlphaShadow(source, layer, offsetX, offsetY, blur, color);
  if (shadow && shadow.canvas) {
    setShadow(ctx, 0, 0, 0, "transparent");
    ctx.drawImage(shadow.canvas, -layer.width / 2 - shadow.margin, -layer.height / 2 - shadow.margin, shadow.width, shadow.height);
    return;
  }
  setGlobalAlpha(ctx, (ctx.globalAlpha == null ? 1 : ctx.globalAlpha) * 0.28);
  setShadow(ctx, offsetX, offsetY, blur, color);
  drawSourceImage(ctx, layer, source);
}

function getFloatingAlphaShadow(source, layer, offsetX, offsetY, blur, color) {
  const margin = Math.ceil(Math.max(16, Math.abs(offsetX) + Math.abs(offsetY) + blur * 2 + 8));
  const width = Math.max(1, Math.ceil(layer.width + margin * 2));
  const height = Math.max(1, Math.ceil(layer.height + margin * 2));
  const key = [
    layer.source || "",
    Math.round(layer.width),
    Math.round(layer.height),
    getCropCacheKey(layer.crop),
    Math.round(offsetX * 10),
    Math.round(offsetY * 10),
    Math.round(blur * 10),
    color,
    width,
    height
  ].join("|");
  if (floatingAlphaShadowCache[key]) return floatingAlphaShadowCache[key];
  const canvas = createRenderCanvas(width, height);
  const shadowCtx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!canvas || !shadowCtx) return null;
  canvas.width = width;
  canvas.height = height;
  if (shadowCtx.clearRect) shadowCtx.clearRect(0, 0, width, height);
  setShadow(shadowCtx, offsetX, offsetY, blur, color);
  drawSourceImageAtRect(shadowCtx, layer, source, margin, margin, layer.width, layer.height);
  setShadow(shadowCtx, 0, 0, 0, "transparent");
  setGlobalCompositeOperation(shadowCtx, "destination-out");
  drawSourceImageAtRect(shadowCtx, layer, source, margin, margin, layer.width, layer.height);
  setGlobalCompositeOperation(shadowCtx, "source-over");
  const result = { canvas, margin, width, height };
  floatingAlphaShadowCache[key] = result;
  return result;
}

function getCropCacheKey(crop) {
  if (!crop || crop.width <= 0 || crop.height <= 0) return "full";
  return [crop.x, crop.y, crop.width, crop.height].map((value) => Math.round((Number(value) || 0) * 10)).join(",");
}

function createRenderCanvas(width, height) {
  if (typeof wx !== "undefined" && wx.createOffscreenCanvas) {
    const canvas = wx.createOffscreenCanvas({ type: "2d", width, height });
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined" && document.createElement) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function getCachedLayerSource(layer, options = {}) {
  return options.imageCache && options.imageCache[layer.source]
    ? options.imageCache[layer.source]
    : null;
}

function drawSourceImage(ctx, layer, source) {
  drawSourceImageAtOffset(ctx, layer, source, 0, 0);
}

function drawSourceImageAtOffset(ctx, layer, source, offsetX, offsetY) {
  drawSourceImageAtRect(ctx, layer, source, -layer.width / 2 + offsetX, -layer.height / 2 + offsetY, layer.width, layer.height);
}

function drawSourceImageAtRect(ctx, layer, source, x, y, width, height) {
  const crop = layer.crop;
  if (crop && crop.width > 0 && crop.height > 0) {
    ctx.drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      x,
      y,
      width,
      height
    );
    return;
  }
  if (isCollageSlot(layer)) {
    drawCollageSourceImage(ctx, layer, source, x, y, width, height);
    return;
  }
  ctx.drawImage(source, x, y, width, height);
}

function isCollageSlot(layer) {
  return !!(layer && layer.style && layer.style.collageSlot);
}

function drawCollageSourceImage(ctx, layer, source, x, y, width, height) {
  const sourceWidth = layer.sourceWidth || source.width || width;
  const sourceHeight = layer.sourceHeight || source.height || height;
  const collage = layer.style && layer.style.collageSlot || {};
  const imageScale = Math.max(1, Math.min(3, collage.imageScale || 1));
  // 拼图槽位保持整张照片可见；后续缩放和平移只作用于图片内容。
  const scale = Math.min(width / sourceWidth, height / sourceHeight) * imageScale;
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = clampCollageOffset(collage.imageOffsetX || 0, renderedWidth, width);
  const offsetY = clampCollageOffset(collage.imageOffsetY || 0, renderedHeight, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(source, x + (width - renderedWidth) / 2 + offsetX, y + (height - renderedHeight) / 2 + offsetY, renderedWidth, renderedHeight);
  ctx.restore();
}

function clampCollageOffset(value, renderedSize, slotSize) {
  const maximum = Math.abs(renderedSize - slotSize) / 2;
  return Math.max(-maximum, Math.min(maximum, value));
}

function drawCollagePlaceholder(ctx, layer) {
  setStrokeStyle(ctx, "#c9c4bb");
  setLineWidth(ctx, 3);
  if (ctx.setLineDash) ctx.setLineDash([10, 8]);
  ctx.strokeRect(-layer.width / 2 + 2, -layer.height / 2 + 2, layer.width - 4, layer.height - 4);
  if (ctx.setLineDash) ctx.setLineDash([]);
  setStrokeStyle(ctx, "#817a70");
  setLineWidth(ctx, 4);
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(18, 0);
  ctx.moveTo(0, -18);
  ctx.lineTo(0, 18);
  ctx.stroke();
}

function fillLayerSurfacePath(ctx, layer, outline = {}) {
  drawLayerSurfacePath(ctx, layer, outline);
  ctx.fill();
}

function drawLayerSurfacePath(ctx, layer, outline = {}) {
  if (outline.hasTear) {
    drawTearPath(ctx, layer, outline);
    return;
  }
  if (outline.clipPolygon && outline.clipPolygon.length >= 3) {
    drawLayerClipPolygon(ctx, outline.clipPolygon, layer);
    return;
  }
  if (outline.clipShape) {
    drawShapePath(ctx, outline.clipShape, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    return;
  }
  if (layer.radius) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
    return;
  }
  ctx.beginPath();
  ctx.rect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
}

function drawFloatingEdge(ctx, layer, options = {}) {
  if (!hasFloatingEffect(layer) || layer.type === "text" || layer.type === "brush") return;
  const clipShape = getLayerClipShape(layer);
  const clipPolygons = getLayerClipPolygons(layer);
  const clipPolygon = clipPolygons[clipPolygons.length - 1] || null;
  const hasTear = !!(layer.tear && layer.type !== "text");
  const outline = { clipShape, clipPolygon, hasTear };
  if (shouldUseSourceAlphaShadow(layer, outline, options)) {
    return;
  }
  const elevation = getFloatingElevation(layer);
  const opacity = layer.opacity == null ? 1 : layer.opacity;
  ctx.save();
  setShadow(ctx, 0, 0, 0, "transparent");
  setLineJoin(ctx, "round");
  setLineCap(ctx, "round");

  setGlobalAlpha(ctx, opacity * 0.34);
  setStrokeStyle(ctx, "rgba(64, 50, 38, 0.42)");
  setLineWidth(ctx, Math.max(1.2, elevation * 1.6));
  ctx.save();
  ctx.translate(elevation * 0.7, elevation * 1.1);
  strokeLayerOutlinePath(ctx, layer, outline);
  ctx.restore();

  setGlobalAlpha(ctx, opacity * 0.46);
  setStrokeStyle(ctx, "rgba(255, 255, 255, 0.92)");
  setLineWidth(ctx, Math.max(1, elevation * 1.15));
  ctx.save();
  ctx.translate(-elevation * 0.45, -elevation * 0.55);
  strokeLayerOutlinePath(ctx, layer, outline);
  ctx.restore();

  setGlobalAlpha(ctx, opacity * 0.18);
  setStrokeStyle(ctx, "rgba(85, 67, 49, 0.36)");
  setLineWidth(ctx, 1);
  strokeLayerOutlinePath(ctx, layer, outline);
  ctx.restore();
}

function drawTapeAttachment(ctx, layer) {
  const effect = layer && layer.style && layer.style.handmadeEffect;
  if (!effect || effect.type !== "taped") return;

  const placement = effect.placement || "double-corners";
  const stripLength = Math.max(58, Math.min(layer.width * 0.34, 150));
  const stripWidth = Math.max(22, Math.min(layer.height * 0.14, 52));
  const inset = Math.max(4, stripWidth * 0.12);
  const positions = placement === "top-left"
    ? [-1]
    : placement === "top-right"
      ? [1]
      : [-1, 1];

  ctx.save();
  setShadow(ctx, 0, 2, 4, "rgba(17, 17, 17, 0.10)");
  setGlobalAlpha(ctx, (layer.opacity == null ? 1 : layer.opacity) * (effect.tapeOpacity == null ? 0.64 : effect.tapeOpacity));
  positions.forEach((side) => {
    const x = side * (layer.width / 2 - stripLength * 0.34 - inset);
    const y = -layer.height / 2 + stripWidth * 0.12;
    drawAttachmentTapeStrip(ctx, x, y, stripLength, stripWidth, side * -8, effect.tapeColor || "#f5f1e8");
  });
  ctx.restore();
}

function drawAttachmentTapeStrip(ctx, x, y, width, height, rotation, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  setFillStyle(ctx, color);
  ctx.beginPath();
  ctx.moveTo(-width / 2, -height / 2 + 2);
  ctx.lineTo(width / 2, -height / 2);
  ctx.lineTo(width / 2 - 2, height / 2);
  ctx.lineTo(-width / 2 + 3, height / 2 - 1);
  ctx.closePath();
  ctx.fill();

  setShadow(ctx, 0, 0, 0, "transparent");
  setFillStyle(ctx, "rgba(255,255,255,0.30)");
  ctx.fillRect(-width * 0.34, -height / 2 + 2, width * 0.12, height - 4);
  ctx.fillRect(width * 0.16, -height / 2 + 1, width * 0.08, height - 2);
  setStrokeStyle(ctx, "rgba(104,96,82,0.14)");
  setLineWidth(ctx, 1);
  ctx.stroke();
  ctx.restore();
}

function drawSourceLayer(ctx, layer, options = {}) {
  if (hasLaceCenterEffect(layer)) {
    drawLaceCenterLayer(ctx, layer, options);
    return;
  }
  if (layer.radius && !layer.tear) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
    ctx.clip();
  }
  const source = getCachedLayerSource(layer, options) || layer.source;
  if (!source || typeof source === "string") return;
  drawSourceImage(ctx, layer, source);
}

function hasLaceCenterEffect(layer) {
  const effect = layer && layer.style && layer.style.handmadeEffect;
  return !!effect && effect.type === "lace-center";
}

function drawLaceCenterLayer(ctx, layer, options = {}) {
  const effect = layer.style && layer.style.handmadeEffect || {};
  const source = getCachedLayerSource(layer, options) || layer.source;
  const frameSource = effect.frameSource || layer.frameSource || "";
  const frame = frameSource ? getCachedLayerSource({ source: frameSource }, options) : null;
  const opening = getLaceCenterOpening(layer, effect);

  setShadow(ctx, 0, 0, 0, "transparent");
  if (source && typeof source !== "string") {
    ctx.save();
    drawEllipsePath(ctx, opening.x, opening.y, opening.width, opening.height);
    ctx.clip();
    drawLaceCenterContent(ctx, layer, source, effect);
    ctx.restore();
  } else {
    ctx.save();
    drawEllipsePath(ctx, opening.x, opening.y, opening.width, opening.height);
    setFillStyle(ctx, "rgba(239, 231, 216, 0.72)");
    ctx.fill();
    ctx.restore();
  }

  if (frame && typeof frame !== "string") {
    ctx.save();
    setShadow(
      ctx,
      effect.shadowOffsetX == null ? 0 : effect.shadowOffsetX,
      effect.shadowOffsetY == null ? 10 : effect.shadowOffsetY,
      effect.shadowBlur == null ? 22 : effect.shadowBlur,
      effect.shadowColor || "rgba(35, 27, 20, 0.20)"
    );
    setGlobalAlpha(ctx, effect.frameOpacity == null ? 1 : effect.frameOpacity);
    ctx.drawImage(frame, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    ctx.restore();
    return;
  }

  if (effect.showFallbackFrame) {
    drawFallbackLaceFrame(ctx, layer, opening);
  }
}

function drawLaceCenterContent(ctx, layer, source, effect = {}) {
  const scale = 1 / getLaceCenterContentRange(effect);
  const offsetX = (Number(effect.contentOffsetX) || 0) * layer.width;
  const offsetY = (Number(effect.contentOffsetY) || 0) * layer.height;
  const width = layer.width * scale;
  const height = layer.height * scale;
  drawLaceCenterSourceAtRect(
    ctx,
    layer,
    source,
    -width / 2 + offsetX,
    -height / 2 + offsetY,
    width,
    height
  );
}

function drawLaceCenterSourceAtRect(ctx, layer, source, x, y, width, height) {
  const crop = layer.crop;
  const sourceWidth = Math.max(1, crop && crop.width > 0 ? crop.width : layer.sourceWidth || source.width || width);
  const sourceHeight = Math.max(1, crop && crop.height > 0 ? crop.height : layer.sourceHeight || source.height || height);
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / Math.max(1, height);
  let drawWidth = width;
  let drawHeight = height;
  if (sourceRatio > targetRatio) {
    drawWidth = height * sourceRatio;
  } else {
    drawHeight = width / sourceRatio;
  }
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  drawSourceImageAtRect(ctx, layer, source, drawX, drawY, drawWidth, drawHeight);
}

function getLaceCenterContentRange(effect = {}) {
  const value = Number(effect.contentScale);
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.65, Math.min(1.8, value));
}

function getLaceCenterOpening(layer, effect = {}) {
  const preset = getLaceCenterFramePreset(effect);
  const openingScale = getLaceCenterOpeningScale(effect);
  const widthRatio = (effect.openingWidthRatio == null ? preset.openingWidthRatio : effect.openingWidthRatio) * openingScale;
  const heightRatio = (effect.openingHeightRatio == null ? preset.openingHeightRatio : effect.openingHeightRatio) * openingScale;
  const width = layer.width * Math.max(0.34, Math.min(0.76, widthRatio));
  const height = layer.height * Math.max(0.34, Math.min(0.76, heightRatio));
  return {
    x: -width / 2,
    y: -height / 2,
    width,
    height
  };
}

function getLaceCenterOpeningScale(effect = {}) {
  const value = Number(effect.openingScale);
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.45, Math.min(1, value));
}

function getLaceCenterFramePreset(effect = {}) {
  if (effect.frameId === "wide-hole" || /lace-center-01\.png(?:$|\?)/.test(effect.frameSource || "")) {
    return { openingWidthRatio: 0.73, openingHeightRatio: 0.73 };
  }
  if (effect.frameId === "classic-doily" || /lace-doily-frame-transparent\.png(?:$|\?)/.test(effect.frameSource || "")) {
    return { openingWidthRatio: 0.54, openingHeightRatio: 0.54 };
  }
  return { openingWidthRatio: 0.54, openingHeightRatio: 0.54 };
}

function drawEllipsePath(ctx, x, y, width, height) {
  ctx.beginPath();
  if (ctx.ellipse) {
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    return;
  }
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.scale(width / height, 1);
  ctx.arc(0, 0, height / 2, 0, Math.PI * 2);
  ctx.restore();
}

function drawFallbackLaceFrame(ctx, layer, opening) {
  ctx.save();
  setShadow(ctx, 0, 10, 22, "rgba(35, 27, 20, 0.20)");
  setStrokeStyle(ctx, "rgba(244, 234, 214, 0.96)");
  setLineWidth(ctx, Math.max(18, Math.min(layer.width, layer.height) * 0.065));
  drawEllipsePath(ctx, -layer.width / 2 + 18, -layer.height / 2 + 18, layer.width - 36, layer.height - 36);
  ctx.stroke();
  setShadow(ctx, 0, 0, 0, "transparent");
  setLineWidth(ctx, Math.max(4, Math.min(layer.width, layer.height) * 0.018));
  setStrokeStyle(ctx, "rgba(138, 119, 92, 0.18)");
  drawEllipsePath(ctx, opening.x, opening.y, opening.width, opening.height);
  ctx.stroke();
  ctx.restore();
}

function drawPaper(ctx, layer, options = {}) {
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
  drawPaperPattern(ctx, layer, options);
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
  const points = getTearPathPoints(layer, outline);
  if (!points.length) return;
  const seed = getTearSeed(layer);
  setShadow(ctx, 0, 0, 0, "transparent");
  setLineJoin(ctx, "round");
  setLineCap(ctx, "round");
  strokeTearPoints(ctx, points, 9, "rgba(255, 255, 255, 0.68)");
  strokeTearPoints(ctx, points, 5, "rgba(237, 229, 214, 0.48)");
  drawTearFiberStrokes(ctx, points, seed, layer);
  strokeTearPoints(ctx, points, 2.2, "rgba(92, 74, 55, 0.16)");
  strokeTearPoints(ctx, points, 0.9, "rgba(34, 28, 22, 0.24)");
}

function strokeTearPoints(ctx, points, width, color) {
  setLineWidth(ctx, width);
  setStrokeStyle(ctx, color);
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
}

function drawTearFiberStrokes(ctx, points, seed, layer, options = {}) {
  const scale = Math.max(1, Math.min(2.4, Math.min(layer.width || 1, layer.height || 1) / 260));
  setLineCap(ctx, "round");
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const previous = points[(index + points.length - 1) % points.length];
    const tangent = normalizeVector({
      x: next.x - previous.x,
      y: next.y - previous.y
    });
    if (!tangent) return;
    const normal = normalizeVector({ x: tangent.y, y: -tangent.x });
    if (!normal) return;
    const density = seededUnit(seed + index * 131);
    const cutoff = options.side === "outer" ? 0.26 : 0.38;
    if (density < cutoff) return;
    const length = ((options.side === "outer" ? 3.2 : 2.2) + seededUnit(seed + index * 197) * (options.side === "outer" ? 10.5 : 6.5)) * scale;
    const inward = options.side === "outer"
      ? -1
      : seededUnit(seed + index * 239) > 0.44 ? 1 : -1;
    const side = {
      x: normal.x * inward,
      y: normal.y * inward
    };
    const along = (seededUnit(seed + index * 283) - 0.5) * 4 * scale;
    const start = {
      x: point.x + tangent.x * along - side.x * 1.5 * scale,
      y: point.y + tangent.y * along - side.y * 1.5 * scale
    };
    const end = {
      x: start.x + side.x * length + tangent.x * (seededUnit(seed + index * 311) - 0.5) * 3 * scale,
      y: start.y + side.y * length + tangent.y * (seededUnit(seed + index * 337) - 0.5) * 3 * scale
    };
    setLineWidth(ctx, (0.42 + seededUnit(seed + index * 353) * (options.side === "outer" ? 1.15 : 0.85)) * scale);
    setStrokeStyle(ctx, density > 0.78
      ? "rgba(255, 255, 255, 0.58)"
      : options.side === "outer" ? "rgba(146, 119, 82, 0.25)" : "rgba(105, 82, 56, 0.20)");
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  });
}

function getClosedPathLength(points) {
  if (!points || points.length < 2) return 0;
  let length = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    length += Math.sqrt((next.x - point.x) ** 2 + (next.y - point.y) ** 2);
  });
  return length;
}

function getPathTangent(points, index) {
  const previous = points[(index + points.length - 1) % points.length];
  const next = points[(index + 1) % points.length];
  return normalizeVector({
    x: next.x - previous.x,
    y: next.y - previous.y
  }) || { x: 1, y: 0 };
}

function getApproximateOuterNormal(points, index) {
  const tangent = getPathTangent(points, index);
  const center = getPointsCenter(points);
  const point = points[index];
  const normalA = normalizeVector({ x: tangent.y, y: -tangent.x });
  const normalB = normalA ? { x: -normalA.x, y: -normalA.y } : null;
  const fromCenter = normalizeVector({ x: point.x - center.x, y: point.y - center.y });
  if (!normalA || !fromCenter) return normalA;
  const dotA = normalA.x * fromCenter.x + normalA.y * fromCenter.y;
  const dotB = normalB.x * fromCenter.x + normalB.y * fromCenter.y;
  return dotA >= dotB ? normalA : normalB;
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
  const amplitude = Math.max(8, Math.min(28, Math.min(width, height) * 0.042));
  const step = Math.max(18, Math.min(38, Math.min(width, height) / 8));
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
  const amplitude = Math.max(8, Math.min(28, Math.min(width, height) * 0.042));
  const step = Math.max(18, Math.min(38, Math.min(width, height) / 8));
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
  const amplitude = Math.max(6, Math.min(20, Math.min(width, height) * 0.034));
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
    const alongJitter = (seededUnit(seed + index * 173) - 0.5) * Math.min(step * 0.34, amplitude * 0.9);
    points.push({
      x: x1 + (x2 - x1) * t + normal.x * jitter + (x2 - x1) / length * alongJitter,
      y: y1 + (y2 - y1) * t + normal.y * jitter + (y2 - y1) / length * alongJitter
    });
  }
}

function drawPaperPattern(ctx, layer, options = {}) {
  const style = layer.style || {};
  const patternConfig = style.patternConfig || layer.patternConfig;
  if (!patternConfig || patternConfig.type !== "polka") return;
  const shape = getLayerClipShape(layer);
  ctx.save();
  setShadow(ctx, 0, 0, 0, "transparent");
  if (layer.tear) {
    drawTearPath(ctx, layer);
  } else if (shape) {
    drawShapePath(ctx, shape, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  } else if (layer.radius) {
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, layer.radius);
  } else {
    ctx.beginPath();
    ctx.rect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  }
  ctx.clip();
  ctx.translate(-layer.width / 2, -layer.height / 2);
  drawPolkaPatternInRect(ctx, layer.width, layer.height, patternConfig, options);
  ctx.restore();
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
    const alongJitter = (seededUnit(seed + index * 173) - 0.5) * Math.min(step * 0.34, amplitude * 0.9);
    const unitX = (x2 - x1) / length;
    const unitY = (y2 - y1) / length;
    const x = x1 + (x2 - x1) * t + unitX * alongJitter;
    const y = y1 + (y2 - y1) * t + unitY * alongJitter;
    const jitter = getTearJitter(seed, index, amplitude);
    if (edge === "top") points.push({ x, y: y + jitter });
    if (edge === "right") points.push({ x: x - jitter, y });
    if (edge === "bottom") points.push({ x, y: y - jitter });
    if (edge === "left") points.push({ x: x + jitter, y });
  }
}

function getTearJitter(seed, index, amplitude) {
  const raw = seededUnit(seed + index * 97);
  const chip = seededUnit(seed + index * 211);
  const wave = Math.sin((seed % 31 + index) * 1.37) * 0.24 + 0.74;
  const micro = (seededUnit(seed + index * 157) - 0.5) * amplitude * 0.34;
  const notch = chip > 0.86 ? amplitude * (0.42 + seededUnit(seed + index * 223) * 0.5) : 0;
  return Math.max(1, raw * amplitude * wave + micro + notch);
}

function normalizeVector(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (!length) return null;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
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
  const fontSize = style.fontSize || 48;
  const lines = getTextLines(layer.text || "写点什么...");
  const lineHeight = getTextLineHeight(fontSize);
  const textBlockHeight = lineHeight * lines.length;
  const firstLineY = lines.length > 1 ? -textBlockHeight / 2 + lineHeight / 2 : 0;
  const textAlign = getTextAlign(style.textAlign);
  const textX = getTextDrawX(textAlign, layer.width);
  setShadow(ctx, 0, 0, 0, "transparent");
  if (style.background && style.background !== "transparent") {
    setFillStyle(ctx, style.background);
    const radius = style.background === "#111111" ? 18 : 12;
    roundedRect(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, radius);
    ctx.fill();
  }
  setFillStyle(ctx, style.color || "#111111");
  setFontSize(ctx, fontSize);
  ctx.font = fontString(style.canvasFontFamily || style.fontFamily, fontSize);
  setTextBaseline(ctx, "middle");
  setTextAlign(ctx, textAlign);
  if (outline) {
    setLineJoin(ctx, "round");
    setLineCap(ctx, "round");
    outline.strokes.forEach((stroke) => {
      setLineWidth(ctx, Math.max(stroke.width, fontSize * 0.1));
      setStrokeStyle(ctx, colorWithOpacity(stroke.color, stroke.opacity));
      drawStyledTextLines(ctx, lines, style, fontSize, layer.width, lineHeight, firstLineY, textX, textAlign, "stroke");
    });
  }
  setFillStyle(ctx, style.color || "#111111");
  drawStyledTextLines(ctx, lines, style, fontSize, layer.width, lineHeight, firstLineY, textX, textAlign, "fill");
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

function getTextLines(text) {
  const normalized = String(text == null ? "" : text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  return lines.length ? lines : [""];
}

function getTextLineHeight(fontSize) {
  return Math.max(1, fontSize * 1.22);
}

function getTextAlign(value) {
  return ["left", "center", "right"].includes(value) ? value : "center";
}

function getTextDrawX(textAlign, width) {
  if (textAlign === "left") return -width / 2;
  if (textAlign === "right") return width / 2;
  return 0;
}

function drawStyledTextLines(ctx, lines, style, fontSize, maxWidth, lineHeight, firstLineY, x, textAlign, mode = "fill") {
  lines.forEach((line, index) => {
    if (!line) return;
    drawStyledText(ctx, line, style, fontSize, maxWidth, mode, firstLineY + index * lineHeight, x, textAlign);
  });
}

function drawStyledText(ctx, text, style, fontSize, maxWidth, mode = "fill", y = 0, x = 0, textAlign = "center") {
  const label = style.fontLabel || "系统";
  const customCanvasFont = !!style.canvasFontFamily && !isFallbackOnlyFont(style.canvasFontFamily);
  if (label === "打字机") {
    drawMonospaceText(ctx, text, fontSize, maxWidth, mode, y, textAlign);
    return;
  }
  if (label === "手写") {
    ctx.save();
    ctx.rotate(-3 * Math.PI / 180);
    paintLayerText(ctx, text, x, y, maxWidth, customCanvasFont, mode);
    ctx.restore();
    return;
  }
  if (label === "衬线") {
    paintLayerText(ctx, text, x, y, maxWidth, customCanvasFont, mode);
    paintLayerText(ctx, text, x + 1.2, y, maxWidth, customCanvasFont, mode);
    return;
  }
  if (label === "圆体") {
    paintLayerText(ctx, text, x, y, maxWidth, customCanvasFont, mode);
    paintLayerText(ctx, text, x + 0.8, y + 0.8, maxWidth, customCanvasFont, mode);
    return;
  }
  paintLayerText(ctx, text, x, y, maxWidth, customCanvasFont, mode);
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

function drawMonospaceText(ctx, text, fontSize, maxWidth, mode = "fill", y = 0, textAlign = "center") {
  const chars = String(text).split("");
  const charWidth = Math.min(fontSize * 0.68, maxWidth / Math.max(chars.length, 1));
  const totalWidth = charWidth * chars.length;
  const startX = getMonospaceStartX(textAlign, maxWidth, totalWidth, charWidth);
  ctx.save();
  setTextAlign(ctx, "center");
  chars.forEach((char, index) => {
    if (mode === "stroke") {
      ctx.strokeText(char, startX + index * charWidth, y, charWidth);
    } else {
      ctx.fillText(char, startX + index * charWidth, y, charWidth);
    }
  });
  ctx.restore();
}

function getMonospaceStartX(textAlign, maxWidth, totalWidth, charWidth) {
  if (textAlign === "left") return -maxWidth / 2 + charWidth / 2;
  if (textAlign === "right") return maxWidth / 2 - totalWidth + charWidth / 2;
  return -totalWidth / 2 + charWidth / 2;
}

function drawSelection(ctx, layer) {
  ctx.save();
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation || 0) * Math.PI / 180);
  setShadow(ctx, 0, 0, 0, "transparent");
  setStrokeStyle(ctx, layer.locked ? "rgba(17, 17, 17, 0.58)" : "#111111");
  setLineWidth(ctx, 3);
  const clipPolygons = getLayerClipPolygons(layer);
  const clipPolygon = clipPolygons[clipPolygons.length - 1] || null;
  if (clipPolygon && clipPolygon.length >= 3) {
    drawLayerClipPolygon(ctx, clipPolygon, layer);
    ctx.stroke();
    setFillStyle(ctx, layer.locked ? "rgba(17, 17, 17, 0.58)" : "#111111");
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
  setFillStyle(ctx, layer.locked ? "rgba(17, 17, 17, 0.58)" : "#111111");
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

function setGlobalCompositeOperation(ctx, value) {
  ctx.globalCompositeOperation = value;
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
