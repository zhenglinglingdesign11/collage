import type { BrushDefinition, BrushPoint, BrushStroke, Draft, Layer, VisibilityMask } from './document';
import { isFinitePoint, isFiniteSize, type Size } from './geometry';

export type ValidationIssue = Readonly<{ path: string; message: string }>;

export const validateDraft = (draft: Draft): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (draft.schemaVersion !== 3) issues.push({ path: 'schemaVersion', message: 'Unsupported draft schema version.' });
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
  if (layer.type === 'brush') {
    if (layer.strokes.length === 0) issues.push({ path: `${path}.strokes`, message: 'Brush layers must contain at least one stroke.' });
    layer.strokes.forEach((stroke, strokeIndex) => validateBrushStroke(stroke, layer.frame, `${path}.strokes[${strokeIndex}]`, issues));
  }
};

export const validateBrushDefinition = (definition: BrushDefinition): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!definition.id || !definition.revision) issues.push({ path: 'brush', message: 'Brush definitions require stable id and revision.' });
  if (!['plain', 'crayon', 'marker', 'stitch', 'knit', 'beads', 'lace', 'bow'].includes(definition.recipe)) issues.push({ path: 'recipe', message: 'Brush definitions require a supported renderer recipe.' });
  const { minSize, maxSize, minSpacing, maxSpacing } = definition.constraints;
  if (![minSize, maxSize, minSpacing, maxSpacing].every(Number.isFinite) || minSize <= 0 || maxSize < minSize || minSpacing <= 0 || maxSpacing < minSpacing) {
    issues.push({ path: 'constraints', message: 'Brush constraints must be finite positive ranges.' });
  }
  const { size, spacing, jitter, opacity } = definition.defaults;
  if (![size, spacing, jitter, opacity].every(Number.isFinite) || size <= 0 || spacing <= 0 || jitter < 0 || opacity < 0 || opacity > 1) {
    issues.push({ path: 'defaults', message: 'Brush defaults must be finite and within supported ranges.' });
  }
  if (definition.asset && (!definition.asset.id || definition.asset.kind !== 'brush')) issues.push({ path: 'asset', message: 'Brush definition assets must be stable brush references.' });
  return issues;
};

const validateBrushStroke = (stroke: BrushStroke, frame: Size, path: string, issues: ValidationIssue[]): void => {
  if (!stroke.id || !stroke.brushId || !stroke.brushRevision) issues.push({ path, message: 'Brush strokes require stable id, brush id, and revision.' });
  if (stroke.mode !== undefined && stroke.mode !== 'paint' && stroke.mode !== 'erase') issues.push({ path: `${path}.mode`, message: 'Brush strokes must paint or erase.' });
  if (stroke.points.length === 0) issues.push({ path: `${path}.points`, message: 'Brush strokes require at least one point.' });
  let priorTimestamp: number | undefined;
  stroke.points.forEach((point, index) => {
    if (!isValidBrushPoint(point, frame)) issues.push({ path: `${path}.points[${index}]`, message: 'Brush points must be finite and remain within the layer frame.' });
    if (point.timestamp !== undefined && priorTimestamp !== undefined && point.timestamp < priorTimestamp) issues.push({ path: `${path}.points[${index}].timestamp`, message: 'Brush point timestamps must be monotonic.' });
    if (point.timestamp !== undefined) priorTimestamp = point.timestamp;
  });
  const { color, size, spacing, jitter, seed, opacity } = stroke.style;
  if ((color !== null && color.length === 0) || ![size, spacing, jitter, seed, opacity].every(Number.isFinite) || size <= 0 || spacing <= 0 || jitter < 0 || !Number.isInteger(seed) || opacity < 0 || opacity > 1) {
    issues.push({ path: `${path}.style`, message: 'Brush stroke style contains unsupported values.' });
  }
};

const isValidBrushPoint = (point: BrushPoint, frame: Size): boolean => isFinitePoint(point)
  && point.x >= 0 && point.y >= 0 && point.x <= frame.width && point.y <= frame.height
  && (point.pressure === undefined || (Number.isFinite(point.pressure) && point.pressure >= 0 && point.pressure <= 1))
  && (point.timestamp === undefined || (Number.isFinite(point.timestamp) && point.timestamp >= 0))
  && (point.tiltX === undefined || (Number.isFinite(point.tiltX) && point.tiltX >= -1 && point.tiltX <= 1))
  && (point.tiltY === undefined || (Number.isFinite(point.tiltY) && point.tiltY >= -1 && point.tiltY <= 1));

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
