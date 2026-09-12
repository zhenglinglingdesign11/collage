import type { Draft, Layer } from './document';
import type { Point } from './geometry';

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
  if (layer.type !== 'image' || layer.brushCutMask === undefined) return true;
  const contentFrame = layer.contentFrame ?? { x: 0, y: 0 };
  const maskPoint = layer.brushCutMask.coordinateSpace === 'content'
    ? { x: local.x - contentFrame.x, y: local.y - contentFrame.y }
    : local;
  const painted = layer.brushCutMask.strokes.some((stroke) => strokeContainsPoint(stroke, maskPoint));
  const excluded = (layer.brushCutMask.excludeStrokes ?? []).some((stroke) => strokeContainsPoint(stroke, maskPoint));
  return layer.brushCutMask.mode === 'include' ? painted && !excluded : !painted;
};

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
