#!/usr/bin/env node
/* P1-T02: compile audited, human-calibrated template instances at build time. */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
const writeJson = (relativePath, value) => {
  const absolutePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
};
const fail = (message) => { throw new Error(`Template recipe compilation failed: ${message}`); };
const refKey = (reference) => `${reference.id}\u0000${reference.kind}\u0000${reference.revision}`;
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const clone = (value) => JSON.parse(JSON.stringify(value));

const input = readJson('content/template-recipe-compile-input.v1.json');
if (input.schemaVersion !== 1 || !Array.isArray(input.templates)) fail('compile input must be schemaVersion 1 with templates.');
const catalog = readJson('generated/first-release-product-catalog.v1.json');
const recipeInput = readJson(input.recipeInputPath);
const catalogAssets = new Map(catalog.packs.flatMap((pack) => [pack.cover, ...pack.items].map((asset) => [refKey(asset.reference), { asset, pack }])));

const assetDependency = (reference) => ({ reference: clone(reference), availability: 'bundled' });
const stableReference = (reference) => isRecord(reference) && typeof reference.id === 'string' && typeof reference.kind === 'string' && typeof reference.revision === 'string' && reference.id.startsWith('asset://pack/');
const fixedLayer = (layer) => ({ ...clone(layer), isLocked: true });
const referenceOverrideKey = (reference) => `${reference.id}@${reference.revision}`;
const applyAssetReferenceOverrides = (layer, overrides, templateId) => {
  if (!overrides || layer.type !== 'image') return layer;
  const replacement = overrides[referenceOverrideKey(layer.asset)];
  if (replacement === undefined) return layer;
  if (!stableReference(replacement)) fail(`${templateId} has an invalid fixed-asset override for ${referenceOverrideKey(layer.asset)}.`);
  return { ...layer, asset: clone(replacement) };
};
const normalizePhotoSlot = (photo) => {
  const quarterTurn = Math.PI / 2;
  // A Studio reference image is sometimes rotated solely to make that source
  // image look right in a slot. Preserve the visible slot bounds, but express
  // a quarter-turn as upright frame geometry so a replacement user photo does
  // not inherit that source-specific rotation.
  // Non-right-angle rotations are intentional composition geometry (for
  // example, a lace diamond photo slot) and must remain on the user photo.
  if (Math.abs(Math.abs(photo.transform.rotation) - quarterTurn) > 0.0001) return clone(photo);
  const oldFrame = photo.frame;
  const oldScale = photo.transform.scale;
  const center = {
    x: photo.transform.position.x + oldFrame.width * oldScale.x / 2,
    y: photo.transform.position.y + oldFrame.height * oldScale.y / 2,
  };
  const frame = { width: oldFrame.height, height: oldFrame.width };
  const scale = { x: oldScale.y, y: oldScale.x };
  return {
    ...photo,
    frame,
    transform: {
      ...photo.transform,
      position: { x: center.x - frame.width * scale.x / 2, y: center.y - frame.height * scale.y / 2 },
      scale,
      rotation: 0,
    },
  };
};

const compileStudio = (entry) => {
  const source = entry.source;
  const studio = readJson(source.path);
  if (studio.format !== 'journalcollage.template-studio' || studio.formatVersion !== 1 || !isRecord(studio.document) || !Array.isArray(studio.document.layers) || !Array.isArray(studio.photoSlotLayerIds)) fail(`${entry.id} has an invalid Template Studio export.`);
  const mappings = new Map((source.photoSlots ?? []).map((slot) => [slot.sourceLayerId, slot]));
  if (mappings.size !== studio.photoSlotLayerIds.length || studio.photoSlotLayerIds.some((id) => !mappings.has(id))) fail(`${entry.id} must map every Studio photo slot exactly once.`);
  const photoSlots = studio.photoSlotLayerIds.map((layerId) => {
    const layer = studio.document.layers.find((candidate) => candidate.id === layerId);
    const mapping = mappings.get(layerId);
    if (!layer || layer.type !== 'image' || !mapping) fail(`${entry.id} photo slot ${layerId} is missing or not an image.`);
    const { asset, ...photo } = clone(layer);
    const normalized = normalizePhotoSlot(photo);
    const calibratedPosition = source.photoSlotPositionOverrides?.[mapping.id];
    if (calibratedPosition !== undefined && (!Number.isFinite(calibratedPosition.x) || !Number.isFinite(calibratedPosition.y))) fail(`${entry.id} photo-slot position calibration for ${mapping.id} must be finite.`);
    const transform = { ...normalized.transform, ...(calibratedPosition ? { position: clone(calibratedPosition) } : {}) };
    return { ...normalized, transform, type: 'photo', id: mapping.id, name: mapping.name, required: true, isLocked: false };
  });
  const fixedLayers = studio.document.layers
    .filter((layer) => !mappings.has(layer.id))
    .map((layer) => {
      if (layer.type !== 'image' || !stableReference(layer.asset)) fail(`${entry.id} has a non-product fixed layer ${layer.id}.`);
      // Source exports can retain a legacy compatibility reference while the
      // frozen template uses its audited strict copy. Overrides are explicit
      // build-time calibration data; neither source reference escapes into the
      // compiled template nor is any asset chosen dynamically at runtime.
      return fixedLayer(applyAssetReferenceOverrides(layer, source.assetReferenceOverrides, entry.id));
    });
  const layerStack = studio.document.layers.map((layer) => mappings.has(layer.id)
    ? `photo:${mappings.get(layer.id).id}`
    : `fixed:${layer.id}`);
  if (source.fixedLayerOrder !== undefined) {
    if (!Array.isArray(source.fixedLayerOrder) || source.fixedLayerOrder.length !== fixedLayers.length) fail(`${entry.id} fixedLayerOrder must name every fixed layer exactly once.`);
    const byId = new Map(fixedLayers.map((layer) => [layer.id, layer]));
    if (new Set(source.fixedLayerOrder).size !== fixedLayers.length || source.fixedLayerOrder.some((id) => !byId.has(id))) fail(`${entry.id} fixedLayerOrder must name every fixed layer exactly once.`);
    fixedLayers.splice(0, fixedLayers.length, ...source.fixedLayerOrder.map((id) => byId.get(id)));
  }
  const sourceCanvas = studio.document.canvas;
  if (!isRecord(sourceCanvas) || !isRecord(sourceCanvas.size) || typeof sourceCanvas.size.width !== 'number' || typeof sourceCanvas.size.height !== 'number' || typeof sourceCanvas.background !== 'string') fail(`${entry.id} has an invalid Studio canvas.`);
  return {
    schemaVersion: 1,
    id: `template://journalcollage/${entry.id}`,
    revision: entry.revision,
    status: 'ready',
    name: entry.name,
    canvas: {
      size: { width: sourceCanvas.size.width, height: sourceCanvas.size.height },
      background: sourceCanvas.background,
      ...(sourceCanvas.backgroundAsset ? { backgroundAsset: clone(sourceCanvas.backgroundAsset) } : {}),
    },
    preview: clone(entry.preview),
    photoSlots,
    textSlots: [],
    materialSlots: [],
    fixedLayers,
    layerStack,
    dependencies: [],
    requiredCapabilities: ['image.replace', 'image.crop', 'material.resolve'],
  };
};

const compileDefinition = (entry) => {
  const source = readJson(entry.source.path);
  if (source.id !== `template://journalcollage/${entry.id}`) fail(`${entry.id} source ID does not match compile entry.`);
  return { ...clone(source), id: `template://journalcollage/${entry.id}`, revision: entry.revision, status: 'ready', name: entry.name, preview: clone(entry.preview), dependencies: [] };
};

const closeDependencies = (template) => {
  const references = [template.preview, template.canvas.backgroundAsset, ...template.fixedLayers.map((layer) => layer.asset)]
    .filter((reference) => reference !== undefined);
  if (references.some((reference) => !stableReference(reference))) fail(`${template.id} contains a non-stable product reference.`);
  const unique = [...new Map(references.map((reference) => [refKey(reference), reference])).values()];
  unique.forEach((reference) => {
    const descriptor = catalogAssets.get(refKey(reference));
    if (!descriptor) fail(`${template.id} references missing catalog asset ${reference.id}@${reference.revision}.`);
    if (descriptor.pack.status !== 'shipped' || descriptor.pack.resolverMode !== 'strict') fail(`${template.id} references non-strict shipped asset ${reference.id}@${reference.revision}.`);
  });
  return unique.map(assetDependency);
};

const recipeFor = (id) => recipeInput.recipes?.find((recipe) => recipe.id === id);
const outputs = input.templates.map((entry) => {
  if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.revision !== 'string' || !isRecord(entry.source)) fail('Every compile entry needs id, name, revision and source.');
  const template = entry.source.kind === 'template-studio' ? compileStudio(entry) : entry.source.kind === 'template-definition' ? compileDefinition(entry) : fail(`${entry.id} has unsupported calibration source kind.`);
  const recipe = recipeFor(entry.id);
  if (!recipe) fail(`${entry.id} has no P1-T02 recipe entry.`);
  const recipeReferences = new Set((recipe.fixedAssets ?? []).map((fixed) => refKey(fixed.reference)));
  const compiledReferences = new Set(template.fixedLayers.map((layer) => refKey(layer.asset)));
  recipeReferences.forEach((key) => { if (!compiledReferences.has(key) && key !== refKey(template.canvas.backgroundAsset ?? {})) fail(`${entry.id} calibrated output omitted Recipe fixed asset ${key}.`); });
  template.dependencies = closeDependencies(template);
  return template;
});

if (new Set(outputs.map((template) => template.id)).size !== outputs.length) fail('Duplicate template IDs.');
outputs.forEach((template) => writeJson(`generated/template-recipes/${template.id.split('/').at(-1)}.template.json`, template));
writeJson('generated/template-recipes/catalog.v1.json', { schemaVersion: 1, catalogRevision: catalog.catalogRevision, templates: outputs.map((template) => ({ id: template.id, revision: template.revision, preview: template.preview })) });
console.log(`Compiled ${outputs.length} calibrated template recipes against Catalog revision ${catalog.catalogRevision}.`);
