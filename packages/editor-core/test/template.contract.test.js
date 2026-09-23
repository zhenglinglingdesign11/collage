const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('P1-T01 parses a valid untrusted TemplateDefinition before instantiation', () => {
  const result = core.parseTemplateDefinition(sample('play-pop', 'Play Pop', 1));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.template.id, 'template://composition-test/play-pop');
});

test('P1-T06 gates templates by the client capability set without consulting entitlements', () => {
  const template = firstReleaseSample('play-pop');
  const supported = core.templateCapabilityGate(template, core.FIRST_RELEASE_TEMPLATE_CAPABILITIES);
  assert.deepEqual(supported, { supported: true, missing: [] });

  const unsupported = core.templateCapabilityGate(template, new Set(['image.replace', 'image.crop']));
  assert.deepEqual(unsupported, { supported: false, missing: ['material.resolve'] });
});

test('P1-T01 preserves a shaped photo slot through parsing and instantiation', () => {
  const template = sample('heart-layout', 'Heart layout', 1);
  const visibilityMask = { type: 'shape', shape: 'heart', bounds: { x: 0, y: 0, width: 640, height: 760 } };
  const shaped = { ...template, photoSlots: [{ ...template.photoSlots[0], visibilityMask }], materialSlots: [], requiredCapabilities: ['image.replace', 'image.crop'] };
  const parsed = core.parseTemplateDefinition(shaped);
  assert.equal(parsed.ok, true);
  let sequence = 0;
  const instance = core.instantiateTemplateDefinition(shaped, { now: '2026-09-12T00:00:00.000Z', projectId: 'heart-layout-project', createId: (prefix) => `${prefix}-${++sequence}` });
  assert.deepEqual(instance.draft.layers[0].visibilityMask, visibilityMask);
});

test('P1-T01 rejects unknown template fields, including nested slot fields', () => {
  const template = sample('soft-archive', 'Soft Archive', 1);
  const result = core.parseTemplateDefinition({
    ...template,
    deliveryUrl: 'https://assets.example.com/template.json',
    photoSlots: [{ ...template.photoSlots[0], runtimeUri: 'file:///cache/preview.png' }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => issue.path === 'deliveryUrl'));
    assert.ok(result.issues.some((issue) => issue.path === 'photoSlots[0].runtimeUri'));
  }
});

test('P1-T01 rejects malformed raw fields and unknown status without throwing', () => {
  const template = sample('romantic-deco', 'Romantic Deco', 1);
  const malformed = core.parseTemplateDefinition({ ...template, photoSlots: {}, status: 'live' });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.ok(malformed.issues.some((issue) => issue.path === 'photoSlots'));

  const unknownStatus = core.parseTemplateDefinition({ ...template, status: 'live' });
  assert.equal(unknownStatus.ok, false);
  if (!unknownStatus.ok) assert.ok(unknownStatus.issues.some((issue) => issue.path === 'status'));
});

const firstReleaseSample = (id, photoCount = 1) => {
  const template = sample(id, id, photoCount);
  return {
    ...template,
    id: `template://journalcollage/${id}`,
    materialSlots: [],
    requiredCapabilities: ['image.replace', 'image.crop', 'material.resolve'],
  };
};

test('P1-T01 freezes the photo-only first-release template profile', () => {
  const templates = [
    firstReleaseSample('romantic-deco'),
    firstReleaseSample('romantic-deco-two-photo', 2),
    firstReleaseSample('play-pop'),
    firstReleaseSample('soft-archive'),
    firstReleaseSample('soft-archive-multi', 4),
    firstReleaseSample('play-pop-multi', 4),
    firstReleaseSample('fan-moodboard'),
    firstReleaseSample('digital-y2k-ascii'),
    firstReleaseSample('digital-y2k-multi', 6),
    firstReleaseSample('material-remix'),
  ];
  templates.forEach((template) => assert.deepEqual(core.validateFirstReleaseTemplateDefinition(template), []));
});

test('P1-T01 rejects replacement capabilities and slot types outside the first-release profile', () => {
  const template = firstReleaseSample('play-pop');
  const invalid = {
    ...template,
    materialSlots: [{ ...sample('play-pop', 'Play Pop', 1).materialSlots[0] }],
    requiredCapabilities: [...template.requiredCapabilities, 'material.replace'],
  };
  const issues = core.validateFirstReleaseTemplateDefinition(invalid);
  assert.ok(issues.some((issue) => issue.path === 'materialSlots'));
  assert.ok(issues.some((issue) => issue.message.includes('not enabled for the first-release profile')));
});

test('P1-T01 imports review metadata only through the draft boundary and strips it', () => {
  const template = firstReleaseSample('soft-archive');
  const draft = {
    ...template,
    _draft: {
      source: 'ai',
      layerNotes: [{
        target: { collection: 'photoSlots', id: 'photo-1' },
        confidence: 0.84,
        reason: 'The reference image has one central portrait placeholder.',
        needsReview: true,
      }],
    },
  };
  const productionResult = core.parseTemplateDefinition(draft);
  assert.equal(productionResult.ok, false);

  const draftResult = core.parseTemplateDraftDefinition(draft);
  assert.equal(draftResult.ok, true);
  if (draftResult.ok) assert.equal(Object.hasOwn(draftResult.template, '_draft'), false);
});

test('P1-T02 promotes the visually approved Romantic Deco draft to a strict production template', () => {
  const productionPath = path.resolve(__dirname, '../../../content/templates/romantic-deco.template.json');
  const production = JSON.parse(fs.readFileSync(productionPath, 'utf8'));
  assert.equal(Object.hasOwn(production, '_draft'), false);
  assert.equal(production.status, 'ready');
  assert.deepEqual(core.parseTemplateDefinition(production), { ok: true, template: production });
  assert.deepEqual(core.validateFirstReleaseTemplateDefinition(production), []);
});

test('P1-T07 parses the representative compiled template dependency samples', () => {
  [
    'romantic-deco-two-photo',
    'soft-archive-multi',
    'material-remix',
  ].forEach((id) => {
    const template = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../generated/template-recipes/${id}.template.json`), 'utf8'));
    const result = core.parseTemplateDefinition(template);
    assert.equal(result.ok, true, `${id} should parse as a production TemplateDefinition`);
  });
});

test('P1-T01 rejects review notes without a real target and renderer-unsupported release layers', () => {
  const template = firstReleaseSample('fan-moodboard');
  const draftResult = core.parseTemplateDraftDefinition({
    ...template,
    _draft: { source: 'ai', layerNotes: [{ target: { collection: 'fixedLayers', id: 'not-a-layer' } }] },
  });
  assert.equal(draftResult.ok, false);
  if (!draftResult.ok) assert.ok(draftResult.issues.some((issue) => issue.path === '_draft.layerNotes[0].target'));

  const invalid = {
    ...template,
    fixedLayers: [{
      type: 'text', id: 'printed-copy', text: 'Not a shipped bitmap', frame: { width: 200, height: 80 },
      transform: transform(0, 0), opacity: 1, isLocked: true, effects: [],
      fontId: 'editorial', fontVariantId: 'regular', fontSize: 24, color: '#111111', textAlign: 'left', backgroundColor: null,
    }],
  };
  const issues = core.validateFirstReleaseTemplateDefinition(invalid);
  assert.ok(issues.some((issue) => issue.path === 'fixedLayers[0].type'));
});

test('P1-T03 instantiates an independent Draft while retaining calibrated layer semantics', () => {
  const backgroundAsset = { id: 'asset://pack/template-assets/play-pop-background', kind: 'image', revision: '1' };
  const fixedAsset = { id: 'asset://pack/candy-shapes/4', kind: 'image', revision: '1' };
  const template = {
    ...firstReleaseSample('play-pop'),
    canvas: { ...firstReleaseSample('play-pop').canvas, backgroundAsset },
    dependencies: [
      { reference: firstReleaseSample('play-pop').preview, availability: 'bundled' },
      { reference: backgroundAsset, availability: 'bundled' },
      { reference: fixedAsset, availability: 'bundled' },
    ],
    fixedLayers: [{ id: 'fixed-source', type: 'image', asset: fixedAsset, frame: { width: 240, height: 180 }, crop: { x: 0, y: 0, width: 1, height: 1 }, transform: transform(60, 80), opacity: 1, isLocked: true, effects: [] }],
  };
  let sequence = 0;
  const instance = core.instantiateTemplateDefinition(template, { now: '2026-09-22T00:00:00.000Z', createId: (prefix) => `${prefix}-${++sequence}` });
  assert.equal(instance.draft.id, 'project-1');
  assert.deepEqual(core.validateDraft(instance.draft), []);
  assert.equal(instance.draft.canvas.backgroundAsset.id, 'asset://pack/template-assets/play-pop-background');
  assert.equal(instance.draft.layers.length, 2);
  const fixedLayer = instance.draft.layers[0];
  const photoLayer = instance.draft.layers[1];
  assert.equal(instance.photoSlotLayerIds['photo-1'], photoLayer.id);
  assert.match(photoLayer.asset.id, /^generated:\/\/template-photo-slot\/project-1\/photo-1$/);
  assert.notEqual(fixedLayer.id, 'fixed-source');
  assert.deepEqual(fixedLayer.asset, template.fixedLayers[0].asset);
  assert.equal(JSON.stringify(instance.draft).includes('template://'), false);
});

test('P1-T04 replaces only the mapped photo placeholder and preserves calibrated geometry', () => {
  const base = firstReleaseSample('play-pop');
  const template = {
    ...base,
    photoSlots: [{ ...base.photoSlots[0], crop: { x: 0.12, y: 0.08, width: 0.76, height: 0.84 }, effects: [{ instanceId: 'slot-effect', type: 'shape.round-corners', version: 1, enabled: true, stage: 'geometry', params: { radius: 16 } }] }],
  };
  let sequence = 0;
  const instance = core.instantiateTemplateDefinition(template, { now: '2026-09-22T00:00:00.000Z', createId: (prefix) => `${prefix}-${++sequence}` });
  const photoLayerId = instance.photoSlotLayerIds['photo-1'];
  const before = instance.draft.layers.find((layer) => layer.id === photoLayerId);
  const replaced = core.replaceInstantiatedTemplatePhoto(instance, 'photo-1', { id: 'user://image/imported-photo', kind: 'image', revision: '1' }, '2026-09-22T00:00:01.000Z');
  const after = replaced.draft.layers.find((layer) => layer.id === photoLayerId);
  assert.deepEqual(after, { ...before, asset: { id: 'user://image/imported-photo', kind: 'image', revision: '1' } });
  assert.deepEqual(core.validateDraft(replaced.draft), []);
  assert.throws(() => core.replaceInstantiatedTemplatePhoto(instance, 'missing-slot', { id: 'user://image/imported-photo', kind: 'image', revision: '1' }, '2026-09-22T00:00:01.000Z'));
  assert.throws(() => core.replaceInstantiatedTemplatePhoto(instance, 'photo-1', { id: 'asset://pack/candy-shapes/4', kind: 'image', revision: '1' }, '2026-09-22T00:00:01.000Z'));
});

test('photo replacement can persist a crop selected from the new original image', () => {
  const instance = core.instantiateTemplateDefinition(firstReleaseSample('play-pop'), { now: '2026-09-23T00:00:00.000Z', projectId: 'crop-project', createId: (prefix) => `${prefix}-crop` });
  const layerId = instance.photoSlotLayerIds['photo-1'];
  const crop = { x: 0.2, y: 0, width: 0.6, height: 1 };
  const result = core.applyCommand(instance.draft, {
    type: 'image.asset.replace', layerId,
    asset: { id: 'user://image/original-wide-photo', kind: 'image', revision: '1' }, crop,
  }, '2026-09-23T00:00:01.000Z');
  const layer = result.draft.layers.find((candidate) => candidate.id === layerId);
  assert.equal(result.changed, true);
  assert.deepEqual(layer.crop, crop);
});
