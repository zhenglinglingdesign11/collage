import type { Draft, Layer, VisibilityMask } from './document';
import { isFinitePoint, isFiniteSize, type Size } from './geometry';

export type ValidationIssue = Readonly<{ path: string; message: string }>;

export const validateDraft = (draft: Draft): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (draft.schemaVersion !== 2) issues.push({ path: 'schemaVersion', message: 'Unsupported draft schema version.' });
  if (!draft.id) issues.push({ path: 'id', message: 'Draft id is required.' });
  if (!isFiniteSize(draft.canvas.size)) issues.push({ path: 'canvas.size', message: 'Canvas size must be positive finite values.' });
  if (draft.canvas.backgroundAsset && (!draft.canvas.backgroundAsset.id || !draft.canvas.backgroundAsset.kind)) {
    issues.push({ path: 'canvas.backgroundAsset', message: 'Background asset must have a stable id and kind.' });
  }
  const layerIds = new Set<string>();
  draft.layers.forEach((layer, index) => validateLayer(layer, index, layerIds, issues));
  if (draft.selectedLayerId && !layerIds.has(draft.selectedLayerId)) issues.push({ path: 'selectedLayerId', message: 'Selected layer must exist.' });
  return issues;
};

const validateLayer = (layer: Layer, index: number, ids: Set<string>, issues: ValidationIssue[]): void => {
  const path = `layers[${index}]`;
  if (!layer.id || ids.has(layer.id)) issues.push({ path: `${path}.id`, message: 'Layer ids must be unique and non-empty.' });
  ids.add(layer.id);
  if (!isFinitePoint(layer.transform.position) || !isFinitePoint(layer.transform.scale) || !Number.isFinite(layer.transform.rotation)) {
    issues.push({ path: `${path}.transform`, message: 'Layer transform must contain finite values.' });
  }
  if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) issues.push({ path: `${path}.opacity`, message: 'Opacity must be between 0 and 1.' });
  if (!isFiniteSize(layer.frame)) issues.push({ path: `${path}.frame`, message: 'Layer frame must be positive finite values.' });
  if (layer.type === 'text') {
    if (!layer.fontId || !layer.fontVariantId) issues.push({ path: `${path}.font`, message: 'Text layers must retain stable font and variant ids.' });
    if (!Number.isFinite(layer.fontSize) || layer.fontSize < 12 || layer.fontSize > 320) issues.push({ path: `${path}.fontSize`, message: 'Text font size must be within the supported range.' });
  }
  if (layer.type === 'image' && (!Number.isFinite(layer.crop.x) || !Number.isFinite(layer.crop.y) || layer.crop.x < 0 || layer.crop.y < 0 || layer.crop.width <= 0 || layer.crop.height <= 0 || layer.crop.x + layer.crop.width > 1 || layer.crop.y + layer.crop.height > 1)) {
    issues.push({ path: `${path}.crop`, message: 'Image crop must be a normalized rectangle within the source image.' });
  }
  if (layer.type === 'image' && layer.clipPath && (layer.clipPath.length < 3 || layer.clipPath.some((point) => !isFinitePoint(point) || point.x < 0 || point.y < 0 || point.x > layer.frame.width || point.y > layer.frame.height))) {
    issues.push({ path: `${path}.clipPath`, message: 'Image clip path must contain at least three finite points.' });
  }
  if (layer.type === 'image' && layer.clipPaths && layer.clipPaths.some((pathPoints) => pathPoints.length < 3 || pathPoints.some((point) => !isFinitePoint(point) || point.x < 0 || point.y < 0 || point.x > layer.frame.width || point.y > layer.frame.height))) {
    issues.push({ path: `${path}.clipPaths`, message: 'Image clip paths must contain in-frame finite polygons.' });
  }
  if (layer.type === 'image' && layer.contentFrame && (!Number.isFinite(layer.contentFrame.x) || !Number.isFinite(layer.contentFrame.y) || !isFiniteSize(layer.contentFrame))) {
    issues.push({ path: `${path}.contentFrame`, message: 'Image content frame must contain finite dimensions.' });
  }
  if (layer.type === 'image' && layer.brushCutMask && [...layer.brushCutMask.strokes, ...(layer.brushCutMask.excludeStrokes ?? [])].some((stroke) => !Number.isFinite(stroke.size) || stroke.size <= 0 || stroke.points.length === 0 || stroke.points.some((point) => !isFinitePoint(point)))) {
    issues.push({ path: `${path}.brushCutMask`, message: 'Brush cut masks must contain finite non-empty strokes.' });
  }
  if (layer.type === 'image' && layer.visibilityMask && !isValidVisibilityMask(layer.visibilityMask, layer.frame)) {
    issues.push({ path: `${path}.visibilityMask`, message: 'Visibility masks must be finite, non-empty, and remain within the image frame.' });
  }
};

/** Shared by command validation so invalid masks cannot enter a Draft. */
export const isValidVisibilityMask = (mask: VisibilityMask, frame: Size, depth = 0): boolean => {
  // A bounded expression prevents corrupt persisted JSON from exhausting the
  // renderer or validator while still allowing plenty of repeated operations.
  if (depth > 32) return false;
  const pointInFrame = (point: { x: number; y: number }) => isFinitePoint(point)
    && point.x >= 0 && point.y >= 0 && point.x <= frame.width && point.y <= frame.height;
  const rectInFrame = (rect: { x: number; y: number; width: number; height: number }) => Number.isFinite(rect.x)
    && Number.isFinite(rect.y) && Number.isFinite(rect.width) && Number.isFinite(rect.height)
    && rect.width > 0 && rect.height > 0
    && rect.x >= 0 && rect.y >= 0
    && rect.x + rect.width <= frame.width && rect.y + rect.height <= frame.height;
  const strokesInFrame = (strokes: readonly { size: number; points: readonly { x: number; y: number }[] }[]) => strokes.length > 0
    && strokes.every((stroke) => Number.isFinite(stroke.size) && stroke.size > 0 && stroke.points.length > 0 && stroke.points.every(pointInFrame));

  switch (mask.type) {
    case 'all': return true;
    case 'shape': return rectInFrame(mask.bounds);
    case 'polygon': return mask.points.length >= 3 && mask.points.every(pointInFrame);
    case 'brush': return strokesInFrame(mask.strokes);
    case 'intersect': return mask.masks.length >= 2 && mask.masks.every((child) => isValidVisibilityMask(child, frame, depth + 1));
    case 'subtract': return isValidVisibilityMask(mask.base, frame, depth + 1) && isValidVisibilityMask(mask.cut, frame, depth + 1);
  }
};
