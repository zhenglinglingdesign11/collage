import { applyCommand } from './commands';
import { createDraft, type AssetReference, type Draft, type Effect, type ImageLayer, type Layer, type TextLayer, type VisibilityMask } from './document';
import type { Rect, Size, Transform } from './geometry';
import { isFiniteSize } from './geometry';
import { effectDefinitionFor } from './effects';
import { createStableId } from './identity';
import { isStableAssetReference, isValidVisibilityMask, type ValidationIssue, validateDraft } from './validation';

/**
 * This is deliberately separate from a Draft. A template describes how to
 * create a new Draft; it is never embedded in a saved work and it never owns
 * a runtime URI, CDN URL, resolver key, or executable recipe.
 */
export const TEMPLATE_SCHEMA_VERSION = 1 as const;

export type TemplateCapability =
  | 'image.replace'
  | 'image.crop'
  | 'text.replace'
  | 'material.resolve'
  | 'material.replace'
  | 'effect.shadow'
  | 'effect.outline'
  | 'effect.torn-edge'
  | 'effect.float'
  | 'effect.grain'
  | 'image.mask'
  | 'brush.draw';

export type TemplateStatus = 'draft' | 'ready' | 'published' | 'hidden' | 'retired';

type SlotLayerBase = Readonly<{
  name?: string;
  frame: Size;
  transform: Transform;
  opacity: number;
  isLocked: boolean;
  effects: ImageLayer['effects'];
}>;

/** A user-provided image becomes a new image layer during P1-T03. */
export type TemplatePhotoSlot = SlotLayerBase & Readonly<{
  type: 'photo';
  id: string;
  required: boolean;
  crop: Rect;
  /** Optional, portable preset crop for a non-rectangular photo slot. */
  visibilityMask?: Extract<VisibilityMask, { type: 'shape' }>;
}>;

/** The font reference closes the otherwise implicit font dependency. */
export type TemplateTextSlot = SlotLayerBase & Readonly<{
  type: 'text';
  id: string;
  required: boolean;
  defaultText: string;
  fontId: string;
  fontVariantId: string;
  fontReference: AssetReference;
  fontSize: number;
  color: string;
  textAlign: TextLayer['textAlign'];
  backgroundColor: string | null;
}>;

/** A decorative layer with a declared source pack for the replacement chooser. */
export type TemplateMaterialSlot = SlotLayerBase & Readonly<{
  type: 'material';
  id: string;
  initialAsset: AssetReference;
  replacementPackId: string;
  /** Omitted means every item in replacementPackId is eligible. */
  allowedItemIds?: readonly string[];
}>;

export type TemplateAssetDependency = Readonly<{
  reference: Required<AssetReference>;
  /** A source-neutral delivery commitment. URLs and local file paths are resolver data. */
  availability: 'bundled' | 'catalog-resolved';
}>;

export type TemplateDefinition = Readonly<{
  schemaVersion: typeof TEMPLATE_SCHEMA_VERSION;
  id: string;
  revision: string;
  status: TemplateStatus;
  name: string;
  canvas: Readonly<{ size: Size; background: string; backgroundAsset?: AssetReference }>;
  preview: AssetReference;
  photoSlots: readonly TemplatePhotoSlot[];
  textSlots: readonly TemplateTextSlot[];
  materialSlots: readonly TemplateMaterialSlot[];
  /** Decorative and background content. Their IDs are template-local only. */
  fixedLayers: readonly Layer[];
  /** Optional bottom-to-top order for fixed image layers and photo slots. */
  layerStack?: readonly string[];
  /** Exact transitive product-asset closure required to instantiate and render. */
  dependencies: readonly TemplateAssetDependency[];
  requiredCapabilities: readonly TemplateCapability[];
}>;

/**
 * Review-only evidence carried by an AI or human draft. It is intentionally
 * not a production-template field: the Studio consumes it on import and
 * exports only the verified TemplateDefinition.
 */
export type TemplateDraftReview = Readonly<{
  source: 'ai' | 'human';
  layerNotes?: readonly Readonly<{
    target: Readonly<{ collection: 'photoSlots' | 'textSlots' | 'materialSlots' | 'fixedLayers'; id: string }>;
    confidence?: number;
    reason?: string;
    needsReview?: boolean;
  }>[];
}>;

/** The core production fields are identical to TemplateDefinition. */
export type TemplateDraftDefinition = TemplateDefinition & Readonly<{ _draft: TemplateDraftReview }>;

/** A freshly created work is deliberately independent from the template catalog.
 * The returned map is session-side authoring context for P1-T04, never a field
 * stored inside the Draft. */
export type TemplateInstantiation = Readonly<{
  draft: Draft;
  photoSlotLayerIds: Readonly<Record<string, string>>;
}>;

export type TemplateInstantiationOptions = Readonly<{
  now: string;
  projectId?: string;
  createId?: (prefix: string) => string;
}>;

const TEMPLATE_ID = /^template:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECIMAL_REVISION = /^[1-9][0-9]*$/;
const CAPABILITIES = new Set<TemplateCapability>([
  'image.replace', 'image.crop', 'text.replace', 'material.resolve', 'material.replace',
  'effect.shadow', 'effect.outline', 'effect.torn-edge', 'effect.float',
  'effect.grain', 'image.mask', 'brush.draw',
]);
const STATUSES = new Set<TemplateStatus>(['draft', 'ready', 'published', 'hidden', 'retired']);
const FIRST_RELEASE_SLOT_COUNTS = new Map<string, number>([
  ['template://journalcollage/romantic-deco', 1],
  ['template://journalcollage/romantic-deco-two-photo', 2],
  ['template://journalcollage/play-pop', 1],
  ['template://journalcollage/soft-archive', 1],
  ['template://journalcollage/soft-archive-multi', 4],
  ['template://journalcollage/play-pop-multi', 4],
  ['template://journalcollage/fan-moodboard', 1],
  ['template://journalcollage/digital-y2k-ascii', 1],
  ['template://journalcollage/digital-y2k-multi', 6],
  ['template://journalcollage/material-remix', 1],
]);
const FIRST_RELEASE_CAPABILITIES = new Set<TemplateCapability>(['image.replace', 'image.crop', 'material.resolve']);

export type TemplateParseResult =
  | Readonly<{ ok: true; template: TemplateDefinition }>
  | Readonly<{ ok: false; issues: readonly ValidationIssue[] }>;

const dependencyKey = (reference: AssetReference): string =>
  `${reference.id}\u0000${reference.kind}\u0000${reference.revision ?? ''}`;

/** Templates are product recipes, so their assets cannot use an open provider namespace. */
const isTemplateProductReference = (reference: AssetReference): boolean =>
  isStableAssetReference(reference) && reference.id.startsWith('asset://pack/');

const push = (issues: ValidationIssue[], path: string, message: string): void => { issues.push({ path, message }); };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, path: string, issues: ValidationIssue[]): value is Record<string, unknown> => {
  if (isRecord(value)) return true;
  push(issues, path, 'Must be an object.');
  return false;
};

const rejectUnknownKeys = (value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void => {
  const known = new Set(allowed);
  Object.keys(value).forEach((key) => {
    if (!known.has(key)) push(issues, path ? `${path}.${key}` : key, 'Unknown template field.');
  });
};

/**
 * Parses untrusted template JSON at the product boundary. It deliberately
 * rejects unknown template-owned fields before the typed validator runs;
 * fixed Draft layers remain governed by the existing Draft validator.
 */
export const parseTemplateDefinition = (raw: unknown): TemplateParseResult => {
  const issues: ValidationIssue[] = [];
  if (!requireRecord(raw, '', issues)) return { ok: false, issues };
  rejectUnknownKeys(raw, ['schemaVersion', 'id', 'revision', 'status', 'name', 'canvas', 'preview', 'photoSlots', 'textSlots', 'materialSlots', 'fixedLayers', 'layerStack', 'dependencies', 'requiredCapabilities'], '', issues);
  const requiredArrays = ['photoSlots', 'textSlots', 'materialSlots', 'fixedLayers', 'dependencies', 'requiredCapabilities'] as const;
  requiredArrays.forEach((key) => { if (!Array.isArray(raw[key])) push(issues, key, 'Must be an array.'); });
  if (raw.layerStack !== undefined && (!Array.isArray(raw.layerStack) || raw.layerStack.some((item) => typeof item !== 'string'))) push(issues, 'layerStack', 'Must be an array of layer-stack identifiers.');
  if (typeof raw.schemaVersion !== 'number') push(issues, 'schemaVersion', 'Must be a number.');
  ['id', 'revision', 'status', 'name'].forEach((key) => { if (typeof raw[key] !== 'string') push(issues, key, 'Must be a string.'); });
  if (requireRecord(raw.canvas, 'canvas', issues)) {
    rejectUnknownKeys(raw.canvas, ['size', 'background', 'backgroundAsset'], 'canvas', issues);
    if (!requireRecord(raw.canvas.size, 'canvas.size', issues)) return { ok: false, issues };
    rejectUnknownKeys(raw.canvas.size, ['width', 'height'], 'canvas.size', issues);
    if (typeof raw.canvas.background !== 'string') push(issues, 'canvas.background', 'Must be a string.');
  }
  const checkReference = (reference: unknown, path: string): void => {
    if (!requireRecord(reference, path, issues)) return;
    rejectUnknownKeys(reference, ['id', 'kind', 'revision'], path, issues);
    if (typeof reference.id !== 'string' || typeof reference.kind !== 'string' || (reference.revision !== undefined && typeof reference.revision !== 'string')) push(issues, path, 'Asset reference fields have invalid types.');
  };
  checkReference(raw.preview, 'preview');
  if (isRecord(raw.canvas) && raw.canvas.backgroundAsset !== undefined) checkReference(raw.canvas.backgroundAsset, 'canvas.backgroundAsset');
  if (Array.isArray(raw.dependencies)) raw.dependencies.forEach((dependency, index) => {
    const path = `dependencies[${index}]`;
    if (!requireRecord(dependency, path, issues)) return;
    rejectUnknownKeys(dependency, ['reference', 'availability'], path, issues);
    checkReference(dependency.reference, `${path}.reference`);
    if (dependency.availability !== 'bundled' && dependency.availability !== 'catalog-resolved') push(issues, `${path}.availability`, 'Must be bundled or catalog-resolved.');
  });
  const checkSlot = (slot: unknown, path: string, type: 'photo' | 'text' | 'material'): void => {
    if (!requireRecord(slot, path, issues)) return;
    const common = ['type', 'id', 'name', 'required', 'frame', 'transform', 'opacity', 'isLocked', 'effects'];
    const specific = type === 'photo' ? ['crop', 'visibilityMask'] : type === 'text' ? ['defaultText', 'fontId', 'fontVariantId', 'fontReference', 'fontSize', 'color', 'textAlign', 'backgroundColor'] : ['initialAsset', 'replacementPackId', 'allowedItemIds'];
    rejectUnknownKeys(slot, [...common, ...specific], path, issues);
    if (slot.type !== type) push(issues, `${path}.type`, `Must be ${type}.`);
    if (typeof slot.id !== 'string') push(issues, `${path}.id`, 'Must be a string.');
    if (type === 'photo' && typeof slot.required !== 'boolean') push(issues, `${path}.required`, 'Must be a boolean.');
    const checkSize = (value: unknown, childPath: string): void => {
      if (!requireRecord(value, childPath, issues)) return;
      rejectUnknownKeys(value, ['width', 'height'], childPath, issues);
      if (typeof value.width !== 'number' || typeof value.height !== 'number') push(issues, childPath, 'Size dimensions must be numbers.');
    };
    checkSize(slot.frame, `${path}.frame`);
    if (requireRecord(slot.transform, `${path}.transform`, issues)) {
      rejectUnknownKeys(slot.transform, ['position', 'scale', 'rotation'], `${path}.transform`, issues);
      const checkPoint = (value: unknown, childPath: string): void => {
        if (!requireRecord(value, childPath, issues)) return;
        rejectUnknownKeys(value, ['x', 'y'], childPath, issues);
        if (typeof value.x !== 'number' || typeof value.y !== 'number') push(issues, childPath, 'Coordinates must be numbers.');
      };
      checkPoint(slot.transform.position, `${path}.transform.position`);
      checkPoint(slot.transform.scale, `${path}.transform.scale`);
      if (typeof slot.transform.rotation !== 'number') push(issues, `${path}.transform.rotation`, 'Must be a number.');
    }
    if (type === 'photo') {
      const crop = slot.crop;
      if (requireRecord(crop, `${path}.crop`, issues)) {
        rejectUnknownKeys(crop, ['x', 'y', 'width', 'height'], `${path}.crop`, issues);
        ['x', 'y', 'width', 'height'].forEach((key) => { if (typeof crop[key] !== 'number') push(issues, `${path}.crop.${key}`, 'Must be a number.'); });
      }
      if (slot.visibilityMask !== undefined) {
        const mask = slot.visibilityMask;
        if (requireRecord(mask, `${path}.visibilityMask`, issues)) {
          rejectUnknownKeys(mask, ['type', 'shape', 'bounds'], `${path}.visibilityMask`, issues);
          if (mask.type !== 'shape') push(issues, `${path}.visibilityMask.type`, 'Photo slot masks must be shape masks.');
          if (typeof mask.shape !== 'string') push(issues, `${path}.visibilityMask.shape`, 'Must be a supported shape identifier.');
          const bounds = mask.bounds;
          if (requireRecord(bounds, `${path}.visibilityMask.bounds`, issues)) {
            rejectUnknownKeys(bounds, ['x', 'y', 'width', 'height'], `${path}.visibilityMask.bounds`, issues);
            ['x', 'y', 'width', 'height'].forEach((key) => { if (typeof bounds[key] !== 'number') push(issues, `${path}.visibilityMask.bounds.${key}`, 'Must be a number.'); });
          }
        }
      }
    }
    if (!Array.isArray(slot.effects)) push(issues, `${path}.effects`, 'Must be an array.');
    else slot.effects.forEach((effect, effectIndex) => {
      const effectPath = `${path}.effects[${effectIndex}]`;
      if (!requireRecord(effect, effectPath, issues)) return;
      rejectUnknownKeys(effect, ['instanceId', 'type', 'version', 'enabled', 'stage', 'params', 'inputs', 'animation'], effectPath, issues);
    });
    if (type === 'text') checkReference(slot.fontReference, `${path}.fontReference`);
    if (type === 'material') checkReference(slot.initialAsset, `${path}.initialAsset`);
  };
  if (Array.isArray(raw.photoSlots)) raw.photoSlots.forEach((slot, index) => checkSlot(slot, `photoSlots[${index}]`, 'photo'));
  if (Array.isArray(raw.textSlots)) raw.textSlots.forEach((slot, index) => checkSlot(slot, `textSlots[${index}]`, 'text'));
  if (Array.isArray(raw.materialSlots)) raw.materialSlots.forEach((slot, index) => checkSlot(slot, `materialSlots[${index}]`, 'material'));
  if (issues.length > 0) return { ok: false, issues };
  try {
    const template = raw as unknown as TemplateDefinition;
    const validationIssues = validateTemplateDefinition(template);
    return validationIssues.length ? { ok: false, issues: validationIssues } : { ok: true, template };
  } catch {
    return { ok: false, issues: [{ path: '', message: 'Template structure is invalid.' }] };
  }
};

/**
 * Imports an authoring draft without weakening the production parser. The
 * returned value deliberately strips `_draft`, so callers cannot accidentally
 * persist AI confidence, review notes, or provenance in a shipped template.
 */
export const parseTemplateDraftDefinition = (raw: unknown): TemplateParseResult => {
  const issues: ValidationIssue[] = [];
  if (!requireRecord(raw, '', issues)) return { ok: false, issues };
  const review = raw._draft;
  if (!requireRecord(review, '_draft', issues)) return { ok: false, issues };
  rejectUnknownKeys(review, ['source', 'layerNotes'], '_draft', issues);
  if (review.source !== 'ai' && review.source !== 'human') push(issues, '_draft.source', 'Must be ai or human.');
  if (review.layerNotes !== undefined && !Array.isArray(review.layerNotes)) push(issues, '_draft.layerNotes', 'Must be an array.');

  const templateRaw = { ...raw };
  delete templateRaw._draft;
  const templateResult = parseTemplateDefinition(templateRaw);
  if (!templateResult.ok) issues.push(...templateResult.issues);

  if (Array.isArray(review.layerNotes)) review.layerNotes.forEach((note, index) => {
    const path = `_draft.layerNotes[${index}]`;
    if (!requireRecord(note, path, issues)) return;
    rejectUnknownKeys(note, ['target', 'confidence', 'reason', 'needsReview'], path, issues);
    const target = note.target;
    if (!requireRecord(target, `${path}.target`, issues)) return;
    rejectUnknownKeys(target, ['collection', 'id'], `${path}.target`, issues);
    if (!['photoSlots', 'textSlots', 'materialSlots', 'fixedLayers'].includes(target.collection as string)) push(issues, `${path}.target.collection`, 'Must identify a template layer collection.');
    if (typeof target.id !== 'string' || !target.id) push(issues, `${path}.target.id`, 'Must identify a non-empty layer id.');
    if (note.confidence !== undefined && (typeof note.confidence !== 'number' || !Number.isFinite(note.confidence) || note.confidence < 0 || note.confidence > 1)) push(issues, `${path}.confidence`, 'Must be a finite number from 0 through 1.');
    if (note.reason !== undefined && (typeof note.reason !== 'string' || !note.reason.trim() || note.reason.length > 500)) push(issues, `${path}.reason`, 'Must be a non-empty string of at most 500 characters.');
    if (note.needsReview !== undefined && typeof note.needsReview !== 'boolean') push(issues, `${path}.needsReview`, 'Must be a boolean.');
    if (templateResult.ok && typeof target.collection === 'string' && typeof target.id === 'string') {
      const collection = templateResult.template[target.collection as keyof Pick<TemplateDefinition, 'photoSlots' | 'textSlots' | 'materialSlots' | 'fixedLayers'>];
      if (!collection.some((layer) => layer.id === target.id)) push(issues, `${path}.target`, 'Must point to an existing template layer.');
    }
  });
  return issues.length ? { ok: false, issues } : templateResult;
};

const validateSlotLayerBase = (slot: SlotLayerBase, path: string, issues: ValidationIssue[]): void => {
  if (!isFiniteSize(slot.frame)) push(issues, `${path}.frame`, 'Template slot frame must use positive finite dimensions.');
  if (!Number.isFinite(slot.transform.position.x) || !Number.isFinite(slot.transform.position.y)
    || !Number.isFinite(slot.transform.scale.x) || !Number.isFinite(slot.transform.scale.y)
    || !Number.isFinite(slot.transform.rotation)) push(issues, `${path}.transform`, 'Template slot transform must be finite.');
  if (!Number.isFinite(slot.opacity) || slot.opacity < 0 || slot.opacity > 1) push(issues, `${path}.opacity`, 'Template slot opacity must be between 0 and 1.');
};

const directReferences = (template: TemplateDefinition): readonly AssetReference[] => {
  const references: AssetReference[] = [template.preview];
  if (template.canvas.backgroundAsset) references.push(template.canvas.backgroundAsset);
  template.textSlots.forEach((slot) => references.push(slot.fontReference));
  template.materialSlots.forEach((slot) => references.push(slot.initialAsset));
  template.fixedLayers.forEach((layer) => {
    if (layer.type === 'image' || layer.type === 'material') references.push(layer.asset);
    layer.effects.forEach((effect) => Object.values(effect.inputs ?? {}).forEach((reference) => references.push(reference)));
  });
  return references;
};

/**
 * P1-T00's strict boundary validator. P1-T02 compiles production Recipes into
 * this shape; P1-T03 will instantiate it. Neither concern belongs here.
 */
export const validateTemplateDefinition = (template: TemplateDefinition): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (template.schemaVersion !== TEMPLATE_SCHEMA_VERSION) push(issues, 'schemaVersion', 'Unsupported template schema version.');
  if (!TEMPLATE_ID.test(template.id)) push(issues, 'id', 'Template IDs must be stable template:// namespace identifiers.');
  if (!DECIMAL_REVISION.test(template.revision)) push(issues, 'revision', 'Template revisions must be positive decimal strings.');
  if (!STATUSES.has(template.status)) push(issues, 'status', 'Template status must be known.');
  if (!template.name.trim()) push(issues, 'name', 'Template name is required.');
  if (!isFiniteSize(template.canvas.size) || !template.canvas.background) push(issues, 'canvas', 'Template canvas requires a finite size and background.');

  const slotIds = new Set<string>();
  template.photoSlots.forEach((slot, index) => {
    const path = `photoSlots[${index}]`;
    if (!slot.id || slotIds.has(slot.id)) push(issues, `${path}.id`, 'Template slot IDs must be unique and non-empty.');
    slotIds.add(slot.id);
    validateSlotLayerBase(slot, path, issues);
    const crop = slot.crop;
    if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1 || crop.y + crop.height > 1) push(issues, `${path}.crop`, 'Photo slot crop must be normalized within the source image.');
    if (slot.visibilityMask && !isValidVisibilityMask(slot.visibilityMask, slot.frame)) push(issues, `${path}.visibilityMask`, 'Photo slot masks must be finite shape bounds within the slot frame.');
  });
  template.textSlots.forEach((slot, index) => {
    const path = `textSlots[${index}]`;
    if (!slot.id || slotIds.has(slot.id)) push(issues, `${path}.id`, 'Template slot IDs must be unique and non-empty.');
    slotIds.add(slot.id);
    validateSlotLayerBase(slot, path, issues);
    if (!slot.fontId || !slot.fontVariantId || !Number.isFinite(slot.fontSize) || slot.fontSize < 12 || slot.fontSize > 320) push(issues, path, 'Text slots need a stable font, variant, and supported size.');
    if (slot.fontReference.kind !== 'font' || !isTemplateProductReference(slot.fontReference)) push(issues, `${path}.fontReference`, 'Text slots require a stable product font asset reference.');
  });
  template.materialSlots.forEach((slot, index) => {
    const path = `materialSlots[${index}]`;
    if (!slot.id || slotIds.has(slot.id)) push(issues, `${path}.id`, 'Template slot IDs must be unique and non-empty.');
    slotIds.add(slot.id);
    validateSlotLayerBase(slot, path, issues);
    if (slot.initialAsset.kind !== 'image' || !isTemplateProductReference(slot.initialAsset) || !slot.initialAsset.revision || !DECIMAL_REVISION.test(slot.initialAsset.revision)) push(issues, `${path}.initialAsset`, 'Material slots require a stable, explicitly revised product image asset.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slot.replacementPackId)) push(issues, `${path}.replacementPackId`, 'Material replacement pack IDs must be stable lowercase slugs.');
    if (!slot.initialAsset.id.startsWith(`asset://pack/${slot.replacementPackId}/`)) push(issues, `${path}.initialAsset`, 'Material slot initial asset must come from its replacement pack.');
    const itemIds = new Set<string>();
    slot.allowedItemIds?.forEach((itemId, itemIndex) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(itemId) || itemIds.has(itemId)) push(issues, `${path}.allowedItemIds[${itemIndex}]`, 'Material replacement item IDs must be unique lowercase slugs.');
      itemIds.add(itemId);
    });
  });

  const fixedDraftIssues = validateDraft({
    schemaVersion: 4,
    id: 'template-validation',
    canvas: { size: template.canvas.size, background: template.canvas.background },
    layers: template.fixedLayers,
    selectedLayerId: null,
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
  });
  fixedDraftIssues.forEach((issue) => push(issues, `fixedLayers.${issue.path}`, issue.message));
  template.fixedLayers.forEach((layer, index) => {
    if (!['image', 'text', 'material', 'brush'].includes(layer.type)) {
      push(issues, `fixedLayers[${index}].type`, 'Fixed template layers must use a known renderer layer type.');
    }
    if ((layer.type === 'image' || layer.type === 'material') && !isTemplateProductReference(layer.asset)) {
      push(issues, `fixedLayers[${index}].asset`, 'Fixed template layers require product asset://pack references.');
    }
  });
  if (template.layerStack !== undefined) {
    const expected = [...template.fixedLayers.map((layer) => `fixed:${layer.id}`), ...template.photoSlots.map((slot) => `photo:${slot.id}`)];
    if (template.layerStack.length !== expected.length || new Set(template.layerStack).size !== expected.length || template.layerStack.some((item) => !expected.includes(item))) {
      push(issues, 'layerStack', 'Must include every fixed layer and photo slot exactly once, from bottom to top.');
    }
  }

  const dependencies = new Set<string>();
  template.dependencies.forEach((dependency, index) => {
    const path = `dependencies[${index}]`;
    const reference = dependency.reference;
    if (!isTemplateProductReference(reference) || !reference.revision || !DECIMAL_REVISION.test(reference.revision)) push(issues, `${path}.reference`, 'Template dependencies require stable product references with explicit decimal revisions.');
    const key = dependencyKey(reference);
    if (dependencies.has(key)) push(issues, `${path}.reference`, 'Template dependencies must not repeat an asset revision.');
    dependencies.add(key);
  });
  directReferences(template).forEach((reference, index) => {
    if (!isTemplateProductReference(reference) || !reference.revision || !DECIMAL_REVISION.test(reference.revision)) push(issues, `references[${index}]`, 'Template references require stable product references with explicit revisions.');
    if (!dependencies.has(dependencyKey(reference))) push(issues, `references[${index}]`, 'Every template asset reference must be present in its dependency closure.');
  });
  const direct = new Set(directReferences(template).map(dependencyKey));
  template.dependencies.forEach((dependency, index) => {
    if (!direct.has(dependencyKey(dependency.reference))) push(issues, `dependencies[${index}]`, 'Dependency closure must not include assets that are not used by this template definition.');
  });

  const seenCapabilities = new Set<TemplateCapability>();
  template.requiredCapabilities.forEach((capability, index) => {
    if (!CAPABILITIES.has(capability) || seenCapabilities.has(capability)) push(issues, `requiredCapabilities[${index}]`, 'Template capabilities must be known and unique.');
    seenCapabilities.add(capability);
  });
  if (template.photoSlots.length > 0 && !seenCapabilities.has('image.replace')) push(issues, 'requiredCapabilities', 'Photo slots require image.replace.');
  if (template.textSlots.length > 0 && !seenCapabilities.has('text.replace')) push(issues, 'requiredCapabilities', 'Text slots require text.replace.');
  if (template.materialSlots.length > 0 && (!seenCapabilities.has('material.resolve') || !seenCapabilities.has('material.replace'))) push(issues, 'requiredCapabilities', 'Material slots require material.resolve and material.replace.');
  return issues;
};

/** P1-T01's frozen 1.0 profile, intentionally narrower than the reusable v1 schema. */
export const validateFirstReleaseTemplateDefinition = (template: TemplateDefinition): readonly ValidationIssue[] => {
  const issues = [...validateTemplateDefinition(template)];
  const expectedPhotoSlotCount = FIRST_RELEASE_SLOT_COUNTS.get(template.id);
  if (expectedPhotoSlotCount === undefined) {
    push(issues, 'id', 'Template is not in the frozen first-release directory.');
    return issues;
  }
  if (template.status !== 'ready' && template.status !== 'published') push(issues, 'status', 'First-release templates must be ready or published.');
  if (template.photoSlots.length !== expectedPhotoSlotCount || template.photoSlots.some((slot) => !slot.required)) {
    push(issues, 'photoSlots', `First-release template requires exactly ${expectedPhotoSlotCount} required photo slot(s).`);
  }
  if (template.textSlots.length !== 0) push(issues, 'textSlots', 'First-release templates do not expose text slots.');
  if (template.materialSlots.length !== 0) push(issues, 'materialSlots', 'First-release templates do not expose material slots.');
  template.fixedLayers.forEach((layer, index) => {
    const path = `fixedLayers[${index}]`;
    // The release renderer resolves shipped bitmap assets as image layers.
    // Material is reserved for the future replacement flow; text and brush
    // layers would introduce editing semantics not in the photo-only release.
    if (layer.type !== 'image') push(issues, `${path}.type`, 'First-release fixed layers must be renderer-resolved image layers.');
    if (!layer.isLocked) push(issues, `${path}.isLocked`, 'First-release fixed layers must be locked.');
    layer.effects.forEach((effect, effectIndex) => {
      if (!effectDefinitionFor(effect.type)) push(issues, `${path}.effects[${effectIndex}]`, 'First-release fixed layers cannot use an effect unknown to the current renderer.');
    });
  });
  const capabilities = new Set(template.requiredCapabilities);
  template.requiredCapabilities.forEach((capability, index) => {
    if (!FIRST_RELEASE_CAPABILITIES.has(capability)) push(issues, `requiredCapabilities[${index}]`, 'Capability is not enabled for the first-release profile.');
  });
  FIRST_RELEASE_CAPABILITIES.forEach((capability) => {
    if (!capabilities.has(capability)) push(issues, 'requiredCapabilities', `First-release templates require ${capability}.`);
  });
  return issues;
};

const copiedEffect = (effect: Effect, createId: (prefix: string) => string): Effect => ({
  ...effect,
  instanceId: createId('template-effect'),
  params: { ...effect.params },
  ...(effect.inputs ? { inputs: { ...effect.inputs } } : {}),
  ...(effect.animation ? { animation: { ...effect.animation } } : {}),
});

const copiedTransform = (transform: Transform): Transform => ({
  position: { ...transform.position },
  scale: { ...transform.scale },
  rotation: transform.rotation,
});

/**
 * P1-T03's only persistent output is a normal Draft. Template IDs, preview
 * references, source locations and Recipe data deliberately do not cross this
 * boundary. The generated photo placeholder is an opaque local logical asset;
 * P1-T04 replaces it with a user-owned image while retaining the layer's
 * calibrated geometry and effects.
 */
export const instantiateTemplateDefinition = (template: TemplateDefinition, options: TemplateInstantiationOptions): TemplateInstantiation => {
  const issues = validateTemplateDefinition(template);
  if (issues.length > 0) throw new Error(`Cannot instantiate invalid template: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join(' ')}`);
  if (template.status !== 'ready' && template.status !== 'published') throw new Error(`Cannot instantiate template in ${template.status} status.`);
  const createId = options.createId ?? createStableId;
  const projectId = options.projectId ?? createId('project');
  const usedIds = new Set<string>([projectId]);
  const nextId = (prefix: string): string => {
    const id = createId(prefix);
    if (!id || usedIds.has(id)) throw new Error(`Template instantiation produced a duplicate or empty identity: ${id}`);
    usedIds.add(id);
    return id;
  };
  const draft = createDraft({ id: projectId, size: { ...template.canvas.size }, background: template.canvas.background, now: options.now });
  const photoSlotLayerIds: Record<string, string> = {};
  const photoLayers: ImageLayer[] = template.photoSlots.map((slot) => {
    const layerId = nextId('template-photo');
    photoSlotLayerIds[slot.id] = layerId;
    return {
      id: layerId,
      name: slot.name ?? slot.id,
      type: 'image',
      asset: { id: `generated://template-photo-slot/${projectId}/${slot.id}`, kind: 'image', revision: template.revision },
      frame: { ...slot.frame },
      crop: { ...slot.crop },
      ...(slot.visibilityMask ? { visibilityMask: { type: 'shape', shape: slot.visibilityMask.shape, bounds: { ...slot.visibilityMask.bounds } } } : {}),
      transform: copiedTransform(slot.transform),
      opacity: slot.opacity,
      isLocked: slot.isLocked,
      effects: slot.effects.map((effect) => copiedEffect(effect, nextId)),
    };
  });
  const textLayers: Layer[] = template.textSlots.map((slot) => ({
    id: nextId('template-text'), name: slot.name ?? slot.id, type: 'text', text: slot.defaultText,
    frame: { ...slot.frame }, transform: copiedTransform(slot.transform), opacity: slot.opacity, isLocked: slot.isLocked,
    effects: slot.effects.map((effect) => copiedEffect(effect, nextId)), fontId: slot.fontId, fontVariantId: slot.fontVariantId,
    fontSize: slot.fontSize, color: slot.color, textAlign: slot.textAlign, backgroundColor: slot.backgroundColor,
  }));
  const materialLayers: Layer[] = template.materialSlots.map((slot) => ({
    id: nextId('template-material'), name: slot.name ?? slot.id, type: 'material', asset: { ...slot.initialAsset },
    frame: { ...slot.frame }, transform: copiedTransform(slot.transform), opacity: slot.opacity, isLocked: slot.isLocked,
    effects: slot.effects.map((effect) => copiedEffect(effect, nextId)),
  }));
  const fixedLayers: Layer[] = template.fixedLayers.map((layer) => ({
    ...layer,
    id: nextId('template-fixed'),
    transform: copiedTransform(layer.transform),
    effects: layer.effects.map((effect) => copiedEffect(effect, nextId)),
    ...(layer.type === 'image' ? { asset: { ...layer.asset }, frame: { ...layer.frame }, crop: { ...layer.crop } } : {}),
    ...(layer.type === 'material' ? { asset: { ...layer.asset }, frame: { ...layer.frame } } : {}),
    ...(layer.type === 'text' ? { frame: { ...layer.frame } } : {}),
    ...(layer.type === 'brush' ? { frame: { ...layer.frame }, strokes: layer.strokes.map((stroke) => ({ ...stroke, id: nextId('template-stroke'), points: stroke.points.map((point) => ({ ...point })) })) } : {}),
  }));
  const stackLayers = template.layerStack === undefined
    ? [...fixedLayers, ...photoLayers, ...textLayers, ...materialLayers]
    : template.layerStack.map((entry) => {
      const [kind, sourceId] = entry.split(':', 2);
      if (kind === 'fixed') return fixedLayers[template.fixedLayers.findIndex((layer) => layer.id === sourceId)];
      return photoLayers[template.photoSlots.findIndex((slot) => slot.id === sourceId)];
    });
  const instantiated: Draft = {
    ...draft,
    canvas: { ...draft.canvas, ...(template.canvas.backgroundAsset ? { backgroundAsset: { ...template.canvas.backgroundAsset } } : {}) },
    // Fixed artwork forms the template base; user photos and editable content
    // intentionally render above it.
    layers: [...stackLayers, ...textLayers, ...materialLayers],
  };
  const draftIssues = validateDraft(instantiated);
  if (draftIssues.length > 0) throw new Error(`Template instantiation produced an invalid Draft: ${draftIssues.map((issue) => `${issue.path}: ${issue.message}`).join(' ')}`);
  return { draft: instantiated, photoSlotLayerIds };
};

/**
 * P1-T04 photo-only replacement. It accepts only an imported user image and
 * touches only the mapped placeholder layer. Template geometry, crop, effects,
 * z-order and all fixed layers therefore remain intact.
 */
export const replaceInstantiatedTemplatePhoto = (instance: TemplateInstantiation, slotId: string, asset: AssetReference, now: string): TemplateInstantiation => {
  const layerId = instance.photoSlotLayerIds[slotId];
  if (!layerId) throw new Error(`Unknown template photo slot: ${slotId}`);
  if (asset.kind !== 'image' || !asset.revision || !asset.id.startsWith('user://image/') || !isStableAssetReference(asset)) {
    throw new Error('Template photo replacement requires a stable imported user://image reference.');
  }
  const target = instance.draft.layers.find((layer) => layer.id === layerId);
  if (!target || target.type !== 'image') throw new Error(`Template photo slot ${slotId} does not resolve to an image layer.`);
  const result = applyCommand(instance.draft, { type: 'image.asset.replace', layerId, asset: { ...asset }, preserveCrop: true }, now);
  if (!result.changed) throw new Error(`Template photo slot ${slotId} could not be replaced.`);
  const issues = validateDraft(result.draft);
  if (issues.length > 0) throw new Error(`Template photo replacement produced an invalid Draft: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join(' ')}`);
  return { draft: result.draft, photoSlotLayerIds: { ...instance.photoSlotLayerIds } };
};
