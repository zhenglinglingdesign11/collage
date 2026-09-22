#!/usr/bin/env node

/**
 * P1-T02's intentionally small calibration fixture.
 *
 * The reference preview remains the visual source of truth. Measure a frame
 * there in pixels, then run this command to obtain the portable normalized
 * rectangle that belongs in template-layer-inventory.v1.json.
 *
 * Example:
 * npm run calibrate:template-layer -- --template play-pop-multi \
 *   --target photoSlot:polaroid-photo --frame 63,704,334,420 --rotation -4
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const inventoryPath = path.join(root, 'content/template-layer-inventory.v1.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  if (!key?.startsWith('--')) fail(`Unexpected argument: ${key ?? ''}`);
  if (key === '--missing') { args.set(key, true); index -= 1; continue; }
  args.set(key, process.argv[index + 1]);
}

if (args.has('--missing')) {
  for (const template of inventory.templates) {
    const pending = [
      ...template.photoSlots.filter((slot) => slot.normalizedFrame === null).map((slot) => `photoSlot:${slot.id}`),
      ...template.layers.filter((layer) => layer.normalizedFrame === null).map((layer) => `layer:${layer.role}`),
    ];
    if (pending.length) console.log(`${template.id} (${template.referenceSize.width}×${template.referenceSize.height})\n${pending.map((item) => `  - ${item}`).join('\n')}`);
  }
  process.exit(0);
}

const templateId = args.get('--template');
const target = args.get('--target');
const frameValue = args.get('--frame');
if (!templateId || !target || !frameValue) fail('Usage: --template <id> --target photoSlot:<id>|layer:<role> --frame x,y,width,height [--rotation degrees]');
const template = inventory.templates.find((candidate) => candidate.id === templateId);
if (!template) fail(`Unknown template: ${templateId}`);
const [x, y, width, height] = frameValue.split(',').map(Number);
if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > template.referenceSize.width || y + height > template.referenceSize.height) {
  fail(`Frame must be an in-bounds pixel rectangle for ${template.referenceSize.width}×${template.referenceSize.height}.`);
}
const [kind, ...targetParts] = target.split(':');
const targetId = targetParts.join(':');
const entry = kind === 'photoSlot'
  ? template.photoSlots.find((slot) => slot.id === targetId)
  : kind === 'layer'
    ? template.layers.find((layer) => layer.role === targetId)
    : undefined;
if (!entry) fail(`Unknown calibration target: ${target}`);
const rotation = args.has('--rotation') ? Number(args.get('--rotation')) : 0;
if (!Number.isFinite(rotation)) fail('Rotation must be finite degrees.');
const normalizedFrame = {
  x: round(x / template.referenceSize.width),
  y: round(y / template.referenceSize.height),
  width: round(width / template.referenceSize.width),
  height: round(height / template.referenceSize.height),
};
console.log(JSON.stringify({
  template: template.id,
  referencePreviewPath: template.referencePreviewPath,
  target,
  pixelFrame: { x, y, width, height },
  normalizedFrame,
  rotation,
}, null, 2));

function round(value) { return Math.round(value * 1_000_000) / 1_000_000; }
function fail(message) { console.error(message); process.exit(1); }
