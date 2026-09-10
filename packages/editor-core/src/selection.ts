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
  return local.x >= 0 && local.x <= layer.frame.width && local.y >= 0 && local.y <= layer.frame.height;
};

/** Later layers are painted above earlier layers, so inspect in reverse order. */
export const hitTest = (draft: Draft, point: Point): Layer | null => {
  for (let index = draft.layers.length - 1; index >= 0; index -= 1) {
    const layer = draft.layers[index];
    if (layerContainsPoint(layer, point)) return layer;
  }
  return null;
};
