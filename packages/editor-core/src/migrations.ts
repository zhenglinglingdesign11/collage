import { DRAFT_SCHEMA_VERSION, type Draft } from './document';
import { validateDraft, type ValidationIssue } from './validation';

export type MigrationResult =
  | Readonly<{ ok: true; draft: Draft; migrated: boolean }>
  | Readonly<{ ok: false; issues: readonly ValidationIssue[] }>;

/**
 * The first release has no prior schema to transform. Keeping this as the only
 * import boundary for untrusted stored JSON prevents ad-hoc migrations later.
 */
export const migrateDraft = (raw: unknown): MigrationResult => {
  if (!isRecord(raw) || (raw.schemaVersion !== 1 && raw.schemaVersion !== 2 && raw.schemaVersion !== 3 && raw.schemaVersion !== DRAFT_SCHEMA_VERSION)) {
    return { ok: false, issues: [{ path: 'schemaVersion', message: 'Unsupported or missing draft schema version.' }] };
  }
  // v2 makes visibility expressions the only persisted cut representation.
  // Old paths and brush masks are converted at this one import boundary, so
  // renderers and future commands never need to guess which system owns a
  // layer's visible pixels.
  const draft = normalizeEffects(normalizeBrushLayers(normalizeLegacyMasks(normalizeTextLayers(raw)))) as Draft;
  const issues = validateDraft(draft);
  return issues.length === 0 ? { ok: true, draft, migrated: JSON.stringify(raw) !== JSON.stringify(draft) } : { ok: false, issues };
};

/** v4 gives effects stable instance identities, explicit stages and versions. */
const normalizeEffects = (raw: Record<string, unknown>): Record<string, unknown> => {
  if (!Array.isArray(raw.layers)) return raw.schemaVersion === DRAFT_SCHEMA_VERSION ? raw : { ...raw, schemaVersion: DRAFT_SCHEMA_VERSION };
  let changed = raw.schemaVersion !== DRAFT_SCHEMA_VERSION;
  const layers = raw.layers.map((layer) => {
    if (!isRecord(layer) || !Array.isArray(layer.effects)) return layer;
    const effects = layer.effects.map((effect, index) => {
      if (!isRecord(effect)) return effect;
      if (typeof effect.instanceId === 'string' && typeof effect.type === 'string') return effect;
      const instanceId = `legacy-effect-${typeof layer.id === 'string' ? layer.id : 'layer'}-${index}`;
      if (effect.id === 'shadow') return { instanceId, type: 'light.shadow', version: 1, enabled: true, stage: 'underlay', params: { color: effect.color, opacity: effect.opacity, blur: effect.blur, offset: effect.offset } };
      if (effect.id === 'outline') return { instanceId, type: 'edge.outline', version: 1, enabled: true, stage: 'overlay', params: { color: effect.color, width: effect.width } };
      if (effect.id === 'torn-edge') return { instanceId, type: 'paper.torn-edge', version: 1, enabled: true, stage: 'geometry', params: { seed: effect.seed, intensity: effect.intensity } };
      return effect;
    });
    changed ||= JSON.stringify(effects) !== JSON.stringify(layer.effects);
    return effects === layer.effects ? layer : { ...layer, effects };
  });
  return changed ? { ...raw, schemaVersion: DRAFT_SCHEMA_VERSION, layers } : raw;
};

const normalizeLegacyMasks = (raw: Record<string, unknown>): Record<string, unknown> => {
  if (!Array.isArray(raw.layers)) return raw.schemaVersion === DRAFT_SCHEMA_VERSION ? raw : { ...raw, schemaVersion: DRAFT_SCHEMA_VERSION };
  let changed = raw.schemaVersion !== DRAFT_SCHEMA_VERSION;
  const layers = raw.layers.map((layer) => {
    if (!isRecord(layer) || layer.type !== 'image') return layer;
    const masks: unknown[] = [];
    if (layer.visibilityMask !== undefined) masks.push(layer.visibilityMask);
    const legacyPaths = Array.isArray(layer.clipPaths)
      ? layer.clipPaths
      : Array.isArray(layer.clipPath) ? [layer.clipPath] : [];
    legacyPaths.forEach((points) => masks.push({ type: 'polygon', points }));
    const brushMask = legacyBrushMask(layer.brushCutMask, layer.contentFrame);
    if (brushMask !== undefined) masks.push(brushMask);
    const visibilityMask = combineMasks(masks);
    const hasLegacy = layer.clipPath !== undefined || layer.clipPaths !== undefined || layer.brushCutMask !== undefined;
    if (!hasLegacy) return layer;
    const { clipPath: _clipPath, clipPaths: _clipPaths, brushCutMask: _brushCutMask, ...next } = layer;
    changed = true;
    return visibilityMask === undefined ? next : { ...next, visibilityMask };
  });
  return changed ? { ...raw, schemaVersion: DRAFT_SCHEMA_VERSION, layers } : raw;
};

const combineMasks = (masks: readonly unknown[]): unknown => {
  if (masks.length === 0) return undefined;
  if (masks.length === 1) return masks[0];
  return { type: 'intersect', masks };
};

const legacyBrushMask = (value: unknown, contentFrame: unknown): unknown => {
  if (!isRecord(value) || (value.mode !== 'include' && value.mode !== 'exclude') || !Array.isArray(value.strokes)) return undefined;
  const offset = isRecord(contentFrame) && typeof contentFrame.x === 'number' && typeof contentFrame.y === 'number'
    ? { x: contentFrame.x, y: contentFrame.y } : { x: 0, y: 0 };
  const toLayerCoordinates = (strokes: unknown) => Array.isArray(strokes) ? strokes.map((stroke) => {
    if (!isRecord(stroke) || !Array.isArray(stroke.points)) return stroke;
    const points = value.coordinateSpace === 'content'
      ? stroke.points.map((point) => isRecord(point) && typeof point.x === 'number' && typeof point.y === 'number' ? { ...point, x: point.x + offset.x, y: point.y + offset.y } : point)
      : stroke.points;
    return { ...stroke, points };
  }) : strokes;
  const primary = { type: 'brush', strokes: toLayerCoordinates(value.strokes) };
  const excluded = toLayerCoordinates(value.excludeStrokes);
  if (value.mode === 'exclude') return { type: 'subtract', base: { type: 'all' }, cut: primary };
  if (Array.isArray(excluded) && excluded.length > 0) return { type: 'subtract', base: primary, cut: { type: 'brush', strokes: excluded } };
  return primary;
};

const normalizeTextLayers = (raw: Record<string, unknown>): Record<string, unknown> => {
  if (!Array.isArray(raw.layers)) return raw;
  let changed = false;
  const layers = raw.layers.map((layer) => {
    if (!isRecord(layer) || layer.type !== 'text') return layer;
    const next = {
      ...layer,
      ...(typeof layer.fontId === 'string' ? {} : { fontId: 'system' }),
      ...(typeof layer.fontVariantId === 'string' ? {} : { fontVariantId: 'system' }),
      ...(layer.textAlign === 'left' || layer.textAlign === 'center' || layer.textAlign === 'right' ? {} : { textAlign: 'left' }),
      ...(typeof layer.backgroundColor === 'string' || layer.backgroundColor === null ? {} : { backgroundColor: null }),
    };
    changed ||= JSON.stringify(next) !== JSON.stringify(layer);
    return next;
  });
  return changed ? { ...raw, layers } : raw;
};

/** v3 groups independent brush marks in a layer and versions their renderer contract. */
const normalizeBrushLayers = (raw: Record<string, unknown>): Record<string, unknown> => {
  if (!Array.isArray(raw.layers)) return raw;
  let changed = false;
  const layers = raw.layers.map((layer) => {
    if (!isRecord(layer) || layer.type !== 'brush' || Array.isArray(layer.strokes)) return layer;
    const legacyBrush = isRecord(layer.brush) ? layer.brush : undefined;
    const brushId = typeof legacyBrush?.id === 'string' && legacyBrush.id.length > 0 ? legacyBrush.id : 'brush://legacy/default';
    const brushRevision = typeof legacyBrush?.revision === 'string' && legacyBrush.revision.length > 0 ? legacyBrush.revision : 'legacy';
    const { brush: _brush, points, size, spacing, jitter, seed, color, ...next } = layer;
    changed = true;
    return {
      ...next,
      strokes: [{
        id: `${typeof layer.id === 'string' ? layer.id : 'brush'}:stroke:0`,
        mode: 'paint',
        brushId,
        brushRevision,
        points: Array.isArray(points) ? points : [],
        style: {
          color: typeof color === 'string' ? color : null,
          size: typeof size === 'number' ? size : 1,
          spacing: typeof spacing === 'number' ? spacing : 1,
          jitter: typeof jitter === 'number' ? jitter : 0,
          seed: typeof seed === 'number' ? seed : 0,
          opacity: 1,
        },
      }],
    };
  });
  return changed ? { ...raw, schemaVersion: DRAFT_SCHEMA_VERSION, layers } : raw;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
