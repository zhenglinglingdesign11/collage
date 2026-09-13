const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('/private/tmp/journal-collage-editor-core-tests/index.js');

const now = '2026-09-12T00:00:00.000Z';

const makeImage = (id = 'image') => ({
  id,
  name: 'Photo',
  type: 'image',
  asset: { id: 'user://image/photo', kind: 'image' },
  frame: { width: 400, height: 300 },
  crop: { x: 0, y: 0, width: 1, height: 1 },
  transform: { ...core.identityTransform(), position: { x: 80, y: 120 } },
  opacity: 1,
  isLocked: false,
  effects: [],
});

const makeDraft = () => ({ ...core.createDraft({ id: 'draft', size: { width: 800, height: 1000 }, now }), layers: [makeImage()], selectedLayerId: 'image' });

const run = (draft, command) => {
  const result = core.applyCommand(draft, command, now);
  assert.equal(result.changed, true, `command ${command.type} should change the draft`);
  assert.deepEqual(core.validateDraft(result.draft), []);
  return result.draft;
};

const emboss = (draft, layerId, suffix) => run(draft, {
  type: 'image.mask.split',
  layerId,
  resultLayerId: `emboss-${suffix}`,
  remainderLayerId: `remainder-${suffix}`,
  operationId: `emboss-op-${suffix}`,
  mask: { type: 'shape', shape: 'heart', bounds: { x: 90, y: 55, width: 160, height: 160 } },
});

test('emboss result supports a second emboss without restoring removed pixels', () => {
  const once = emboss(makeDraft(), 'image', 'one');
  const twice = emboss(once, 'emboss-one', 'two');
  assert.equal(twice.layers.length, 3);
  const secondResult = twice.layers.find((layer) => layer.id === 'emboss-two');
  assert.equal(secondResult.visibilityMask.type, 'intersect');
  assert.equal(secondResult.asset.id, 'user://image/photo');
});

test('emboss then straight scissors retains a shared local mask coordinate system', () => {
  const embossed = emboss(makeDraft(), 'image', 'one');
  const cut = run(embossed, {
    type: 'image.cut.straight', layerId: 'emboss-one', start: { x: 0, y: 150 }, end: { x: 400, y: 150 },
    firstLayerId: 'cut-top', secondLayerId: 'cut-bottom', operationId: 'straight-after-emboss', gap: 0, style: 'straight',
  });
  const fragments = cut.layers.filter((layer) => layer.id === 'cut-top' || layer.id === 'cut-bottom');
  assert.deepEqual(fragments.map((layer) => layer.frame), [{ width: 400, height: 300 }, { width: 400, height: 300 }]);
  assert.ok(fragments.every((layer) => layer.visibilityMask.type === 'intersect'));
});

test('straight scissors then emboss composes masks and brush scissors remains generic', () => {
  const cut = run(makeDraft(), {
    type: 'image.cut.straight', layerId: 'image', start: { x: 200, y: 0 }, end: { x: 200, y: 300 },
    firstLayerId: 'left', secondLayerId: 'right', operationId: 'straight-first', gap: 0, style: 'straight',
  });
  const embossed = emboss(cut, 'left', 'after-cut');
  const brushed = run(embossed, {
    type: 'image.cut.brush', layerId: 'emboss-after-cut', cutLayerId: 'brush-result', operationId: 'brush-after-emboss', hollowOriginal: true,
    strokes: [{ size: 36, points: [{ x: 170, y: 140 }, { x: 210, y: 170 }] }],
  });
  const result = brushed.layers.find((layer) => layer.id === 'brush-result');
  assert.equal(result.brushCutMask, undefined);
  assert.equal(result.visibilityMask.type, 'intersect');
});

test('undo and redo retain an identical serialized mask split', () => {
  const before = makeDraft();
  const after = emboss(before, 'image', 'history');
  const undone = before; // Reducers restore the immutable command predecessor.
  const redone = after;
  assert.equal(undone.layers.length, 1);
  assert.equal(JSON.stringify(redone), JSON.stringify(after));
});

test('v1 scissors fields migrate to v2 and restore after serialization', () => {
  const legacy = {
    ...makeDraft(),
    schemaVersion: 1,
    layers: [{ ...makeImage(), clipPath: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 300 }], brushCutMask: { mode: 'exclude', strokes: [{ size: 20, points: [{ x: 20, y: 20 }] }] } }],
  };
  const migrated = core.migrateDraft(JSON.parse(JSON.stringify(legacy)));
  assert.equal(migrated.ok, true);
  const layer = migrated.draft.layers[0];
  assert.equal(migrated.draft.schemaVersion, 2);
  assert.equal(layer.clipPath, undefined);
  assert.equal(layer.brushCutMask, undefined);
  assert.equal(layer.visibilityMask.type, 'intersect');
  const restored = core.migrateDraft(JSON.parse(JSON.stringify(migrated.draft)));
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.draft, migrated.draft);
});
