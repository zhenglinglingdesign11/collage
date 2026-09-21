const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('/private/tmp/journal-collage-editor-core-tests/index.js');

const transform = (x, y) => ({ ...core.identityTransform(), position: { x, y } });
const reference = (id, kind = 'image') => ({ id, kind, revision: '1' });

const sample = (id, name, photoCount) => {
  const preview = reference(`asset://pack/template-previews/${id}`);
  const paper = reference(`asset://pack/template-papers/${id}`);
  return {
    schemaVersion: core.TEMPLATE_SCHEMA_VERSION,
    id: `template://composition-test/${id}`,
    revision: '1', status: 'ready', name,
    canvas: { size: { width: 1080, height: 1350 }, background: '#FDFDFB', backgroundAsset: paper },
    preview,
    photoSlots: Array.from({ length: photoCount }, (_, index) => ({ type: 'photo', id: `photo-${index + 1}`, required: true, frame: { width: 640, height: 760 }, transform: transform(220, 180 + index * 80), opacity: 1, isLocked: false, effects: [], crop: { x: 0, y: 0, width: 1, height: 1 } })),
    textSlots: [],
    materialSlots: [{ type: 'material', id: 'paper-decoration', initialAsset: paper, replacementPackId: 'template-papers', allowedItemIds: [id], frame: { width: 1080, height: 1350 }, transform: transform(0, 0), opacity: 1, isLocked: true, effects: [] }],
    fixedLayers: [],
    dependencies: [preview, paper].map((entry) => ({ reference: entry, availability: 'bundled' })),
    requiredCapabilities: ['image.replace', 'image.crop', 'material.resolve', 'material.replace'],
  };
};

test('P1-T00 contract accommodates all three composition-test families without runtime locations', () => {
  const samples = [
    sample('romantic-deco', 'Romantic Deco', 1),
    sample('romantic-deco-two-photo', 'Romantic Deco — Two Photo', 2),
    sample('play-pop', 'Play Pop', 1),
    sample('soft-archive', 'Soft Archive', 1),
  ];
  samples.forEach((template) => assert.deepEqual(core.validateTemplateDefinition(template), []));
});

test('P1-T00 rejects CDN locations and an incomplete dependency closure', () => {
  const template = sample('romantic-deco', 'Romantic Deco', 1);
  const invalid = { ...template, preview: { id: 'https://assets.zllarchi.site/templates/romantic.png', kind: 'image', revision: '1' }, dependencies: template.dependencies.slice(1) };
  const issues = core.validateTemplateDefinition(invalid);
  assert.ok(issues.some((issue) => issue.message.includes('stable')));
  assert.ok(issues.some((issue) => issue.message.includes('dependency closure')));
});

test('P1-T00 rejects an unsupported capability and a material slot with a user photo', () => {
  const template = sample('soft-archive', 'Soft Archive', 1);
  const invalid = {
    ...template,
    materialSlots: [{ ...template.materialSlots[0], initialAsset: { id: 'user://image/phone-library', kind: 'image', revision: '1' } }],
    requiredCapabilities: [...template.requiredCapabilities, 'dynamic.shuffle'],
  };
  const issues = core.validateTemplateDefinition(invalid);
  assert.ok(issues.some((issue) => issue.message.includes('stable, explicitly revised product image asset')));
  assert.ok(issues.some((issue) => issue.message.includes('known and unique')));
});
