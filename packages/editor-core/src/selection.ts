import type { Draft, Layer, VisibilityMask } from './document';
import type { Point, Rect } from './geometry';

/**
 * Converts a canvas point into a layer's untransformed local coordinate space.
 * Layer position represents the top-left corner; rotation is around frame center.
 */
export const pointInLayerSpace = (point: Point, layer: Layer): Point => {
  const { frame, transform } = layer;
  const center = { x: frame.width / 2, y: frame.height / 2 };
  const translated = {
    x: point.x - transform.position.x - center.x,
    y: point.y - transform.position.y - center.y,
  };
  const cosine = Math.cos(-transform.rotation);
  const sine = Math.sin(-transform.rotation);
  const unrotated = {
    x: translated.x * cosine - translated.y * sine,
    y: translated.x * sine + translated.y * cosine,
  };
  return {
    x: unrotated.x / transform.scale.x + center.x,
    y: unrotated.y / transform.scale.y + center.y,
  };
};

export const layerContainsPoint = (layer: Layer, point: Point): boolean => {
  if (layer.isLocked || layer.opacity <= 0) return false;
  const local = pointInLayerSpace(point, layer);
  if (local.x < 0 || local.x > layer.frame.width || local.y < 0 || local.y > layer.frame.height) return false;
  if (layer.type !== 'image') return true;
  if (layer.visibilityMask !== undefined && !visibilityMaskContainsPoint(layer.visibilityMask, local)) return false;
  if (layer.brushCutMask === undefined) return true;
  const contentFrame = layer.contentFrame ?? { x: 0, y: 0 };
  const maskPoint = layer.brushCutMask.coordinateSpace === 'content'
    ? { x: local.x - contentFrame.x, y: local.y - contentFrame.y }
    : local;
  const painted = layer.brushCutMask.strokes.some((stroke) => strokeContainsPoint(stroke, maskPoint));
  const excluded = (layer.brushCutMask.excludeStrokes ?? []).some((stroke) => strokeContainsPoint(stroke, maskPoint));
  return layer.brushCutMask.mode === 'include' ? painted && !excluded : !painted;
};

/**
 * Mirrors the renderer's persisted-mask semantics for hit testing. Exact Skia
 * paths remain renderer implementation details; this deterministic geometric
 * test prevents transparent split regions from stealing selection.
 */
export const visibilityMaskContainsPoint = (mask: VisibilityMask, point: Point): boolean => {
  switch (mask.type) {
    case 'all': return true;
    case 'shape': return shapeContainsPoint(mask.shape, mask.bounds, point);
    case 'polygon': return polygonContainsPoint(mask.points, point);
    case 'brush': return mask.strokes.some((stroke) => strokeContainsPoint(stroke, point));
    case 'intersect': return mask.masks.every((child) => visibilityMaskContainsPoint(child, point));
    case 'subtract': return visibilityMaskContainsPoint(mask.base, point) && !visibilityMaskContainsPoint(mask.cut, point);
  }
};

/**
 * The smallest practical interaction rectangle for a visible mask. Subtract
 * masks intentionally retain their base bounds: an internal hole does not
 * make the remaining image's outer edge any smaller.
 */
export const visibilityMaskBounds = (mask: VisibilityMask, frame: { width: number; height: number }): Rect => {
  switch (mask.type) {
    case 'all': return { x: 0, y: 0, width: frame.width, height: frame.height };
    case 'shape': return shapeBounds(mask.shape, mask.bounds);
    case 'polygon': return pointsBounds(mask.points);
    case 'brush': return brushBounds(mask.strokes);
    case 'subtract': return visibilityMaskBounds(mask.base, frame);
    case 'intersect': return mask.masks.slice(1).reduce(
      (bounds, child) => intersectBounds(bounds, visibilityMaskBounds(child, frame)),
      visibilityMaskBounds(mask.masks[0], frame),
    );
  }
};

/** Shared by overlays and renderers so selection chrome matches hit testing. */
export const visibleBoundsForLayer = (layer: Layer): Rect => {
  const full = { x: 0, y: 0, width: layer.frame.width, height: layer.frame.height };
  if (layer.type !== 'image') return full;
  let bounds = layer.visibilityMask === undefined ? full : visibilityMaskBounds(layer.visibilityMask, layer.frame);
  const legacyPaths = layer.clipPaths ?? (layer.clipPath ? [layer.clipPath] : []);
  legacyPaths.forEach((path) => { bounds = intersectBounds(bounds, pointsBounds(path)); });
  if (layer.brushCutMask?.mode === 'include') {
    const offset = layer.brushCutMask.coordinateSpace === 'content' ? layer.contentFrame ?? { x: 0, y: 0 } : { x: 0, y: 0 };
    bounds = intersectBounds(bounds, translateBounds(brushBounds(layer.brushCutMask.strokes), offset));
  }
  return bounds;
};

const shapeContainsPoint = (shape: Extract<VisibilityMask, { type: 'shape' }>['shape'], bounds: { x: number; y: number; width: number; height: number }, point: Point): boolean => {
  const { x, y, width, height } = bounds;
  if (point.x < x || point.x > x + width || point.y < y || point.y > y + height) return false;
  if (shape === 'rect') return true;
  const nx = (point.x - (x + width / 2)) / (width / 2);
  const ny = (point.y - (y + height / 2)) / (height / 2);
  if (shape === 'circle') return nx * nx + ny * ny <= 1;
  if (shape === 'heart') return polygonContainsPoint(heartPoints(x, y, width, height), point);
  if (shape === 'star') return polygonContainsPoint(starPoints(x + width / 2, y + height / 2, Math.min(width, height) / 2), point);
  if (shape === 'tag') return polygonContainsPoint([{ x, y }, { x: x + width * 0.82, y }, { x: x + width, y: y + height * 0.18 }, { x: x + width, y: y + height }, { x, y: y + height }], point);
  return polygonContainsPoint(stampPoints(x, y, width, height), point);
};

const heartPoints = (x: number, y: number, width: number, height: number): readonly Point[] => [
  [0.50, 0.90], [0.40, 0.81], [0.30, 0.73], [0.20, 0.62], [0.10, 0.49], [0.07, 0.35], [0.10, 0.24], [0.19, 0.16], [0.32, 0.14], [0.42, 0.17], [0.48, 0.27], [0.50, 0.34], [0.52, 0.27], [0.58, 0.17], [0.68, 0.14], [0.81, 0.16], [0.90, 0.24], [0.93, 0.35], [0.90, 0.49], [0.80, 0.62], [0.70, 0.73], [0.60, 0.81],
].map(([relativeX, relativeY]) => ({ x: x + width * relativeX, y: y + height * relativeY }));

const stampPoints = (x: number, y: number, width: number, height: number): readonly Point[] => [
  [0.07, 0], [0.13, 0.05], [0.20, 0], [0.27, 0.05], [0.34, 0], [0.41, 0.05], [0.48, 0], [0.55, 0.05], [0.62, 0], [0.69, 0.05], [0.76, 0], [0.83, 0.05], [0.93, 0], [1, 0.07], [0.95, 0.13], [1, 0.20], [0.95, 0.27], [1, 0.34], [0.95, 0.41], [1, 0.48], [0.95, 0.55], [1, 0.62], [0.95, 0.69], [1, 0.76], [0.95, 0.83], [1, 0.93], [0.93, 1], [0.83, 0.95], [0.76, 1], [0.69, 0.95], [0.62, 1], [0.55, 0.95], [0.48, 1], [0.41, 0.95], [0.34, 1], [0.27, 0.95], [0.20, 1], [0.13, 0.95], [0.07, 1], [0, 0.93], [0.05, 0.83], [0, 0.76], [0.05, 0.69], [0, 0.62], [0.05, 0.55], [0, 0.48], [0.05, 0.41], [0, 0.34], [0.05, 0.27], [0, 0.20], [0.05, 0.13], [0, 0.07],
].map(([relativeX, relativeY]) => ({ x: x + width * relativeX, y: y + height * relativeY }));

const shapeBounds = (shape: Extract<VisibilityMask, { type: 'shape' }>['shape'], bounds: Rect): Rect => {
  if (shape !== 'star') return bounds;
  const diameter = Math.min(bounds.width, bounds.height);
  return { x: bounds.x + (bounds.width - diameter) / 2, y: bounds.y + (bounds.height - diameter) / 2, width: diameter, height: diameter };
};

const starPoints = (cx: number, cy: number, outer: number): readonly Point[] => Array.from({ length: 10 }, (_, index) => {
  const angle = -Math.PI / 2 + index * Math.PI / 5;
  const radius = index % 2 === 0 ? outer : outer * 0.42;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
});

const polygonContainsPoint = (points: readonly Point[], point: Point): boolean => {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const start = points[index];
    const end = points[previous];
    if ((start.y > point.y) !== (end.y > point.y) && point.x < (end.x - start.x) * (point.y - start.y) / (end.y - start.y) + start.x) inside = !inside;
  }
  return inside;
};

const pointsBounds = (points: readonly Point[]): Rect => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(0.001, Math.max(...xs) - Math.min(...xs)), height: Math.max(0.001, Math.max(...ys) - Math.min(...ys)) };
};

const brushBounds = (strokes: readonly { size: number; points: readonly Point[] }[]): Rect => {
  const extents = strokes.flatMap((stroke) => stroke.points.map((point) => ({ left: point.x - stroke.size / 2, top: point.y - stroke.size / 2, right: point.x + stroke.size / 2, bottom: point.y + stroke.size / 2 })));
  if (extents.length === 0) return { x: 0, y: 0, width: 0.001, height: 0.001 };
  const left = Math.min(...extents.map((extent) => extent.left));
  const top = Math.min(...extents.map((extent) => extent.top));
  return { x: left, y: top, width: Math.max(0.001, Math.max(...extents.map((extent) => extent.right)) - left), height: Math.max(0.001, Math.max(...extents.map((extent) => extent.bottom)) - top) };
};

const intersectBounds = (first: Rect, second: Rect): Rect => {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.max(left + 0.001, Math.min(first.x + first.width, second.x + second.width));
  const bottom = Math.max(top + 0.001, Math.min(first.y + first.height, second.y + second.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const translateBounds = (bounds: Rect, offset: { x: number; y: number }): Rect => ({ ...bounds, x: bounds.x + offset.x, y: bounds.y + offset.y });

const strokeContainsPoint = (stroke: { size: number; points: readonly Point[] }, point: Point): boolean => {
  const radius = stroke.size / 2;
  if (stroke.points.length === 1) return Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) <= radius;
  return stroke.points.slice(1).some((end, index) => distanceToSegment(point, stroke.points[index], end) <= radius);
};

const distanceToSegment = (point: Point, start: Point, end: Point): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + progress * dx), point.y - (start.y + progress * dy));
};

/** Later layers are painted above earlier layers, so inspect in reverse order. */
export const hitTest = (draft: Draft, point: Point): Layer | null => {
  for (let index = draft.layers.length - 1; index >= 0; index -= 1) {
    const layer = draft.layers[index];
    if (layerContainsPoint(layer, point)) return layer;
  }
  return null;
};
