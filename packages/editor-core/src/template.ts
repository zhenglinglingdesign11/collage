import type { AssetReference, ImageLayer, Layer, TextLayer } from './document';
import type { Rect, Size, Transform } from './geometry';
import { isFiniteSize } from './geometry';
import { isStableAssetReference, type ValidationIssue, validateDraft } from './validation';

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
  /** Exact transitive product-asset closure required to instantiate and render. */
  dependencies: readonly TemplateAssetDependency[];
  requiredCapabilities: readonly TemplateCapability[];
}>;

const TEMPLATE_ID = /^template:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECIMAL_REVISION = /^[1-9][0-9]*$/;
const CAPABILITIES = new Set<TemplateCapability>([
  'image.replace', 'image.crop', 'text.replace', 'material.resolve', 'material.replace',
  'effect.shadow', 'effect.outline', 'effect.torn-edge', 'effect.float',
  'effect.grain', 'image.mask', 'brush.draw',
]);

const dependencyKey = (reference: AssetReference): string =>
  `${reference.id}\u0000${reference.kind}\u0000${reference.revision ?? ''}`;

const push = (issues: ValidationIssue[], path: string, message: string): void => { issues.push({ path, message }); };

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
  });
  template.textSlots.forEach((slot, index) => {
    const path = `textSlots[${index}]`;
    if (!slot.id || slotIds.has(slot.id)) push(issues, `${path}.id`, 'Template slot IDs must be unique and non-empty.');
    slotIds.add(slot.id);
    validateSlotLayerBase(slot, path, issues);
    if (!slot.fontId || !slot.fontVariantId || !Number.isFinite(slot.fontSize) || slot.fontSize < 12 || slot.fontSize > 320) push(issues, path, 'Text slots need a stable font, variant, and supported size.');
    if (slot.fontReference.kind !== 'font' || !isStableAssetReference(slot.fontReference)) push(issues, `${path}.fontReference`, 'Text slots require a stable font asset reference.');
  });
  template.materialSlots.forEach((slot, index) => {
    const path = `materialSlots[${index}]`;
    if (!slot.id || slotIds.has(slot.id)) push(issues, `${path}.id`, 'Template slot IDs must be unique and non-empty.');
    slotIds.add(slot.id);
    validateSlotLayerBase(slot, path, issues);
    if (slot.initialAsset.kind !== 'image' || slot.initialAsset.id.startsWith('user://') || !isStableAssetReference(slot.initialAsset) || !slot.initialAsset.revision || !DECIMAL_REVISION.test(slot.initialAsset.revision)) push(issues, `${path}.initialAsset`, 'Material slots require a stable, explicitly revised product image asset.');
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
    if ((layer.type === 'image' || layer.type === 'material') && layer.asset.id.startsWith('user://')) {
      push(issues, `fixedLayers[${index}].asset`, 'Fixed template layers cannot depend on user-provided assets.');
    }
  });

  const dependencies = new Set<string>();
  template.dependencies.forEach((dependency, index) => {
    const path = `dependencies[${index}]`;
    const reference = dependency.reference;
    if (!isStableAssetReference(reference) || !reference.revision || !DECIMAL_REVISION.test(reference.revision)) push(issues, `${path}.reference`, 'Template dependencies require stable references with explicit decimal revisions.');
    const key = dependencyKey(reference);
    if (dependencies.has(key)) push(issues, `${path}.reference`, 'Template dependencies must not repeat an asset revision.');
    dependencies.add(key);
  });
  directReferences(template).forEach((reference, index) => {
    if (!isStableAssetReference(reference) || !reference.revision || !DECIMAL_REVISION.test(reference.revision)) push(issues, `references[${index}]`, 'Template references require stable explicit revisions.');
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
