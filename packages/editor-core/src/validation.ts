import type { AssetReference, BrushDefinition, BrushPoint, BrushStroke, Draft, Effect, EffectTrack, EffectValue, Layer, VisibilityMask } from './document';
import { effectDefinitionFor, effectValueDepth, isEffectSupportedByLayer } from './effects';
import { isFinitePoint, isFiniteSize, type Size } from './geometry';

export type ValidationIssue = Readonly<{ path: string; message: string }>;

const ASSET_KINDS = new Set(['image', 'font', 'texture', 'brush']);
const RUNTIME_ASSET_LOCATION = /^(?:assets-library|content|data|file|http|https|ph):/i;
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i;

/**
 * A Draft may name an asset but must never own the runtime location used to
 * resolve it.  Keep the namespace open for future stable providers while
 * rejecting URI schemes and absolute paths that bind a document to one device
 * or a short-lived download.
 */
export const isStableAssetReference = (asset: AssetReference): boolean =>
  typeof asset.id === 'string'
  && asset.id.length > 0
  && !RUNTIME_ASSET_LOCATION.test(asset.id)
  && !asset.id.startsWith('/')
  && !asset.id.startsWith('~/')
  && !WINDOWS_ABSOLUTE_PATH.test(asset.id)
  && ASSET_KINDS.has(asset.kind)
  && (asset.revision === undefined || (typeof asset.revision === 'string' && asset.revision.length > 0));

const validateAssetReference = (asset: AssetReference, path: string, issues: ValidationIssue[]): void => {
  if (!isStableAssetReference(asset)) issues.push({ path, message: 'Assets must use a stable logical reference, never a device path or runtime URL.' });
};

export const validateDraft = (draft: Draft): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (draft.schemaVersion !== 4) issues.push({ path: 'schemaVersion', message: 'Unsupported draft schema version.' });
  if (!draft.id) issues.push({ path: 'id', message: 'Draft id is required.' });
  if (!isFiniteSize(draft.canvas.size)) issues.push({ path: 'canvas.size', message: 'Canvas size must be positive finite values.' });
  if (draft.canvas.backgroundAsset) validateAssetReference(draft.canvas.backgroundAsset, 'canvas.backgroundAsset', issues);
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
  if (layer.type === 'image' || layer.type === 'material') validateAssetReference(layer.asset, `${path}.asset`, issues);
  validateEffects(layer, `${path}.effects`, issues);
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

const validateEffects = (layer: Layer, path: string, issues: ValidationIssue[]): void => {
  if (layer.effects.length > 24) issues.push({ path, message: 'Layers may contain at most 24 effects.' });
  const instanceIds = new Set<string>();
  const typeCounts = new Map<string, number>();
  layer.effects.forEach((effect, index) => {
    const effectPath = `${path}[${index}]`;
    if (!effect.instanceId || instanceIds.has(effect.instanceId)) issues.push({ path: `${effectPath}.instanceId`, message: 'Effect instance ids must be unique and non-empty.' });
    instanceIds.add(effect.instanceId);
    const definition = effectDefinitionFor(effect.type);
    if (!definition) {
      // Forward-compatible effects remain in the Draft even if this app
      // cannot edit or render them. Structural limits still protect Core.
      if (!effect.type || effect.type.length > 128 || !Number.isInteger(effect.version) || effect.version < 1 || !['geometry', 'underlay', 'content', 'overlay', 'post-composite'].includes(effect.stage) || typeof effect.enabled !== 'boolean') {
        issues.push({ path: effectPath, message: 'Unknown effects must retain a valid portable envelope.' });
      }
      if (Object.keys(effect.params).length > 24 || Object.values(effect.params).some((value) => effectValueDepth(value) > 8)) issues.push({ path: `${effectPath}.params`, message: 'Effect parameters exceed portable document limits.' });
      validateEffectInputs(effect, `${effectPath}.inputs`, issues);
      validateEffectAnimation(effect.animation, `${effectPath}.animation`, issues);
      return;
    }
    typeCounts.set(effect.type, (typeCounts.get(effect.type) ?? 0) + 1);
    if (!Number.isInteger(effect.version) || !isEffectSupportedByLayer(effect, layer)) issues.push({ path: effectPath, message: 'Effect version, stage, or layer compatibility is invalid.' });
    if (!definition.validateParams(effect.params)) issues.push({ path: `${effectPath}.params`, message: 'Effect parameters do not match the catalog definition.' });
    if (Object.keys(effect.params).length > 24 || Object.values(effect.params).some((value) => effectValueDepth(value) > 8)) issues.push({ path: `${effectPath}.params`, message: 'Effect parameters exceed portable document limits.' });
    validateEffectInputs(effect, `${effectPath}.inputs`, issues);
    validateEffectAnimation(effect.animation, `${effectPath}.animation`, issues);
  });
  typeCounts.forEach((count, type) => {
    const maximum = effectDefinitionFor(type)?.maxInstances;
    if (maximum !== undefined && count > maximum) issues.push({ path, message: `${type} may only be applied ${maximum} time(s) per layer.` });
  });
};

const validateEffectInputs = (effect: Effect, path: string, issues: ValidationIssue[]): void => {
  if (!effect.inputs) return;
  if (Object.keys(effect.inputs).length > 8) issues.push({ path, message: 'Effects may reference at most eight assets.' });
  Object.entries(effect.inputs).forEach(([key, asset]) => {
    if (!key) issues.push({ path: `${path}.${key}`, message: 'Effect input keys must be non-empty.' });
    validateAssetReference(asset, `${path}.${key}`, issues);
  });
};

const validateEffectAnimation = (animation: Readonly<Record<string, EffectTrack>> | undefined, path: string, issues: ValidationIssue[]): void => {
  if (!animation) return;
  if (Object.keys(animation).length > 12) issues.push({ path, message: 'Effects may animate at most twelve parameters.' });
  Object.entries(animation).forEach(([key, track]) => {
    if (!['step', 'linear', 'cubic-bezier'].includes(track.interpolation) || track.keyframes.length === 0 || track.keyframes.length > 120) {
      issues.push({ path: `${path}.${key}`, message: 'Effect tracks require a bounded supported interpolation and keyframes.' });
      return;
    }
    let previous = -1;
    track.keyframes.forEach((frame, index) => {
      if (!Number.isFinite(frame.timeMs) || frame.timeMs < 0 || frame.timeMs <= previous || effectValueDepth(frame.value) > 8) issues.push({ path: `${path}.${key}.keyframes[${index}]`, message: 'Effect keyframes need strictly increasing finite times and portable values.' });
      previous = frame.timeMs;
      if (frame.easing && (frame.easing.length !== 4 || frame.easing.some((value) => !Number.isFinite(value)))) issues.push({ path: `${path}.${key}.keyframes[${index}].easing`, message: 'Effect cubic-bezier easing needs four finite values.' });
    });
  });
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
  if (definition.asset) {
    validateAssetReference(definition.asset, 'asset', issues);
    if (definition.asset.kind !== 'brush') issues.push({ path: 'asset', message: 'Brush definition assets must be brush references.' });
  }
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
