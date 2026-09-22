#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const inventoryPath = path.join(root, 'content/template-layer-inventory.v1.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));

const expectedTemplateIds = new Set([
  'romantic-deco', 'romantic-deco-two-photo', 'play-pop', 'soft-archive',
  'soft-archive-multi', 'play-pop-multi', 'fan-moodboard', 'digital-y2k-ascii',
  'digital-y2k-multi', 'material-remix',
]);
const errors = [];
const unresolved = [];

if (inventory.schemaVersion !== 1) errors.push('Inventory schemaVersion must be 1.');
if (!Array.isArray(inventory.templates)) errors.push('Inventory templates must be an array.');

const seen = new Set();
for (const template of inventory.templates ?? []) {
  if (!expectedTemplateIds.has(template.id)) errors.push(`Unexpected template: ${template.id}`);
  if (seen.has(template.id)) errors.push(`Duplicate template: ${template.id}`);
  seen.add(template.id);
  if (!fs.existsSync(path.join(root, template.referencePreviewPath))) errors.push(`${template.id}: missing reference preview.`);
  if (!Number.isInteger(template.referenceSize?.width) || !Number.isInteger(template.referenceSize?.height)) errors.push(`${template.id}: referenceSize must use integer dimensions.`);
  if (!Array.isArray(template.photoSlots) || template.photoSlots.length === 0) errors.push(`${template.id}: requires at least one photo slot.`);
  for (const slot of template.photoSlots ?? []) {
    if (slot.normalizedFrame !== null) {
      const frame = slot.normalizedFrame;
      if (!['x', 'y', 'width', 'height'].every((key) => Number.isFinite(frame?.[key]))
        || frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0
        || frame.x + frame.width > 1 || frame.y + frame.height > 1) {
        errors.push(`${template.id}/${slot.id}: normalizedFrame must fit within [0, 1].`);
      }
    }
  }
  for (const layer of template.layers ?? []) {
    if (!Number.isInteger(layer.zIndex) || typeof layer.locked !== 'boolean') errors.push(`${template.id}/${layer.role}: invalid layer order or lock state.`);
    if (layer.normalizedFrame !== null) {
      const frame = layer.normalizedFrame;
      if (!['x', 'y', 'width', 'height'].every((key) => Number.isFinite(frame?.[key]))
        || frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0
        || frame.x + frame.width > 1 || frame.y + frame.height > 1) {
        errors.push(`${template.id}/${layer.role}: normalizedFrame must fit within [0, 1].`);
      }
    }
    if (layer.strictState !== 'strict') unresolved.push(`${template.id}/${layer.role}: ${layer.strictState}`);
  }
}
for (const id of expectedTemplateIds) if (!seen.has(id)) errors.push(`Missing first-release template: ${id}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${seen.size} first-release template inventories.`);
console.log(`${unresolved.length} fixed-layer entries remain unavailable for Recipe compilation:`);
unresolved.forEach((entry) => console.log(`- ${entry}`));
