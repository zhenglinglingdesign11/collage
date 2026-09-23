#!/usr/bin/env node
/* P1-T07: deliberately small runtime-dependency smoke check for representative
 * compiled templates. It does not fetch, decode, or visually inspect images. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const fail = (message) => { throw new Error(`Template asset sample validation failed: ${message}`); };
const keyOf = (reference) => `${reference.id}\u0000${reference.kind}\u0000${reference.revision}`;
const samples = [
  'romantic-deco-two-photo',
  'soft-archive-multi',
  'material-remix',
];

const catalog = readJson('generated/first-release-product-catalog.v1.json');
if (catalog.releaseState !== 'shipped') fail('runtime catalog is not shipped.');
const strictAssets = new Map();
catalog.packs.forEach((pack) => {
  if (pack.status !== 'shipped' || pack.resolverMode !== 'strict') return;
  [pack.cover, ...pack.items].forEach((asset) => strictAssets.set(keyOf(asset.reference), asset));
});

samples.forEach((id) => {
  const template = readJson(`generated/template-recipes/${id}.template.json`);
  const directReferences = [
    template.preview,
    template.canvas.backgroundAsset,
    ...template.fixedLayers.flatMap((layer) => layer.type === 'image' || layer.type === 'material' ? [layer.asset] : []),
  ].filter(Boolean);
  const dependencyKeys = new Set(template.dependencies.map((dependency) => keyOf(dependency.reference)));
  if (dependencyKeys.size !== template.dependencies.length) fail(`${id} repeats a dependency.`);
  directReferences.forEach((reference) => {
    if (!dependencyKeys.has(keyOf(reference))) fail(`${id} does not close dependency ${reference.id}@${reference.revision}.`);
  });
  template.dependencies.forEach(({ reference }) => {
    const descriptor = strictAssets.get(keyOf(reference));
    if (!descriptor) fail(`${id} cannot resolve ${reference.id}@${reference.revision} through the strict shipped catalog.`);
    if (!descriptor.sourceUrl || !descriptor.sha256 || !descriptor.byteLength) fail(`${id} has an incomplete resolver descriptor for ${reference.id}@${reference.revision}.`);
  });
  if (!strictAssets.has(keyOf(template.preview))) fail(`${id} preview is absent from the strict shipped catalog.`);
  console.log(`Verified ${id}: ${template.dependencies.length} strict dependencies and preview.`);
});

console.log(`Validated ${samples.length} representative compiled template asset closures.`);
