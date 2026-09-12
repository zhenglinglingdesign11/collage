import type { Draft, Layer } from './document';
import { isFinitePoint, isFiniteSize } from './geometry';

export type ValidationIssue = Readonly<{ path: string; message: string }>;

export const validateDraft = (draft: Draft): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (draft.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: 'Unsupported draft schema version.' });
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
};
