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

test('v1 scissors fields migrate to v4 and restore after serialization', () => {
  const legacy = {
    ...makeDraft(),
    schemaVersion: 1,
    layers: [{ ...makeImage(), clipPath: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 300 }], brushCutMask: { mode: 'exclude', strokes: [{ size: 20, points: [{ x: 20, y: 20 }] }] } }],
  };
  const migrated = core.migrateDraft(JSON.parse(JSON.stringify(legacy)));
  assert.equal(migrated.ok, true);
  const layer = migrated.draft.layers[0];
  assert.equal(migrated.draft.schemaVersion, 4);
  assert.equal(layer.clipPath, undefined);
  assert.equal(layer.brushCutMask, undefined);
  assert.equal(layer.visibilityMask.type, 'intersect');
  const restored = core.migrateDraft(JSON.parse(JSON.stringify(migrated.draft)));
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.draft, migrated.draft);
});

test('v2 single-stroke brush layers migrate to v4 without changing their paint semantics', () => {
  const v2 = {
    ...makeDraft(),
    schemaVersion: 2,
    layers: [{
      id: 'legacy-brush', name: 'Lace', type: 'brush', brush: { id: 'brush://builtin/lace', kind: 'brush', revision: '4' },
      frame: { width: 400, height: 300 }, points: [{ x: 20, y: 30 }, { x: 180, y: 120 }],
      size: 36, spacing: 18, jitter: 4, seed: 17, color: '#BA786D',
      transform: core.identityTransform(), opacity: 0.8, isLocked: false, effects: [],
    }], selectedLayerId: 'legacy-brush',
  };
  const migrated = core.migrateDraft(JSON.parse(JSON.stringify(v2)));
  assert.equal(migrated.ok, true);
  assert.equal(migrated.draft.schemaVersion, 4);
  const layer = migrated.draft.layers[0];
  assert.equal(layer.type, 'brush');
  assert.equal(layer.brush, undefined);
  assert.equal(layer.points, undefined);
  assert.equal(layer.strokes.length, 1);
  assert.deepEqual(layer.strokes[0], {
    id: 'legacy-brush:stroke:0', mode: 'paint', brushId: 'brush://builtin/lace', brushRevision: '4',
    points: [{ x: 20, y: 30 }, { x: 180, y: 120 }],
    style: { color: '#BA786D', size: 36, spacing: 18, jitter: 4, seed: 17, opacity: 1 },
  });
  assert.deepEqual(core.validateDraft(migrated.draft), []);
});

test('v3 effects migrate to v4 instances without changing their product parameters', () => {
  const legacy = {
    ...makeDraft(), schemaVersion: 3,
    layers: [{ ...makeImage(), effects: [
      { id: 'shadow', color: '#392F2A', opacity: 0.2, blur: 12, offset: { x: 5, y: 8 } },
      { id: 'outline', color: '#FFFFFF', width: 4 },
      { id: 'torn-edge', seed: 9, intensity: 18 },
    ] }],
  };
  const migrated = core.migrateDraft(legacy);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.draft.layers[0].effects.map((effect) => [effect.instanceId, effect.type, effect.stage, effect.params]), [
    ['legacy-effect-image-0', 'light.shadow', 'underlay', { color: '#392F2A', opacity: 0.2, blur: 12, offset: { x: 5, y: 8 } }],
    ['legacy-effect-image-1', 'edge.outline', 'overlay', { color: '#FFFFFF', width: 4 }],
    ['legacy-effect-image-2', 'paper.torn-edge', 'geometry', { seed: 9, intensity: 18 }],
  ]);
});

test('a structurally valid future effect survives validation for a newer renderer', () => {
  const draft = { ...makeDraft(), layers: [{ ...makeImage(), effects: [{ instanceId: 'future-1', type: 'future.hologram', version: 2, enabled: true, stage: 'overlay', params: { intensity: 0.7 } }] }] };
  assert.deepEqual(core.validateDraft(draft), []);
});

test('catalog effects retain portable catalog parameters', () => {
  const effects = [
    { instanceId: 'corner', type: 'shape.round-corners', version: 1, enabled: true, stage: 'geometry', params: { radius: 24 } },
    { instanceId: 'tape', type: 'attachment.tape', version: 1, enabled: true, stage: 'overlay', params: { placement: 'double-corners', color: '#E9D28A', opacity: 0.72 } },
    { instanceId: 'float', type: 'paper.float', version: 1, enabled: true, stage: 'underlay', params: { color: '#392F2A', opacity: 0.18, blur: 30, offset: { x: 12, y: 24 } } },
    { instanceId: 'lace', type: 'frame.lace-center', version: 1, enabled: true, stage: 'overlay', params: { color: '#FFF8EB', opacity: 0.95, frameId: 'classic-doily', scale: 0.82, contentScale: 1.35 } },
    { instanceId: 'foil', type: 'frame.foil-center', version: 1, enabled: true, stage: 'overlay', params: { color: '#FFFFFF', opacity: 1, frameId: 'foil-crumpled', scale: 0.82, contentScale: 1.35 } },
    { instanceId: 'cyanotype', type: 'print.cyanotype', version: 1, enabled: true, stage: 'content', params: { tone: 'prussian', intensity: 'standard', paper: 'cool', grain: 'medium', seed: 23 } },
    { instanceId: 'screen', type: 'print.screen', version: 1, enabled: true, stage: 'content', params: { palette: 'red-blue', strength: 'standard', halftone: 'medium', offset: 'slight', seed: 23 } },
    { instanceId: 'riso', type: 'print.riso', version: 1, enabled: true, stage: 'content', params: { palette: 'pink-blue', mode: 'duo', ink: 'standard', offset: 'slight', grain: 'medium', seed: 23 } },
    { instanceId: 'botanical', type: 'art.botanical-plate', version: 1, enabled: true, stage: 'content', params: { tone: 'sage', detail: 'etched', frame: 'on', seed: 23 } },
    { instanceId: 'embroidery', type: 'art.pixel-embroidery', version: 1, enabled: true, stage: 'content', params: { grid: 72, colors: 8, style: 'pixel', seed: 23 } },
    { instanceId: 'matisse', type: 'art.matisse-cutout', version: 1, enabled: true, stage: 'content', params: { detail: 64, palette: 'vivid', seed: 23 } },
  ];
  assert.deepEqual(core.validateDraft({ ...makeDraft(), layers: [{ ...makeImage(), effects }] }), []);
});

test('effect commands add, patch, reorder, disable, and remove one stable instance', () => {
  const effect = { instanceId: 'shadow-1', type: 'light.shadow', version: 1, enabled: true, stage: 'underlay', params: { color: '#000000', opacity: 0.3, blur: 10, offset: { x: 4, y: 6 } } };
  let draft = run(makeDraft(), { type: 'layer.effect.add', layerId: 'image', effect });
  draft = run(draft, { type: 'layer.effect.patch', layerId: 'image', instanceId: 'shadow-1', params: { ...effect.params, blur: 20 } });
  draft = run(draft, { type: 'layer.effect.add', layerId: 'image', effect: { instanceId: 'outline-1', type: 'edge.outline', version: 1, enabled: true, stage: 'overlay', params: { color: '#FFFFFF', width: 3 } } });
  draft = run(draft, { type: 'layer.effect.enabled.set', layerId: 'image', instanceId: 'shadow-1', enabled: false });
  assert.equal(draft.layers[0].effects[0].enabled, false);
  draft = run(draft, { type: 'layer.effect.move', layerId: 'image', instanceId: 'shadow-1', toIndex: 1 });
  draft = run(draft, { type: 'layer.effect.remove', layerId: 'image', instanceId: 'shadow-1' });
  assert.equal(draft.layers[0].effects.length, 1);
});

test('v3 validates brush stroke safety and catalog constraints', () => {
  const draft = {
    ...makeDraft(),
    layers: [{
      id: 'brush', type: 'brush', frame: { width: 400, height: 300 }, transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [],
      strokes: [{ id: 'stroke', brushId: 'brush://builtin/marker', brushRevision: '1', points: [{ x: 10, y: 20, pressure: 0.5, timestamp: 1 }, { x: 100, y: 40, pressure: 0.8, timestamp: 2 }], style: { color: '#111111', size: 12, spacing: 4, jitter: 0, seed: 1, opacity: 1 } }],
    }], selectedLayerId: 'brush',
  };
  assert.deepEqual(core.validateDraft(draft), []);
  assert.deepEqual(core.validateBrushDefinition({
    id: 'brush://builtin/marker', revision: '1', renderer: 'path', recipe: 'marker', supports: { color: true, pressure: true, rotation: 'tangent', animation: false },
    defaults: { size: 12, spacing: 4, jitter: 0, opacity: 1 }, constraints: { minSize: 1, maxSize: 80, minSpacing: 1, maxSpacing: 40 },
  }), []);
  const invalid = { ...draft, layers: [{ ...draft.layers[0], strokes: [{ ...draft.layers[0].strokes[0], points: [{ x: 10, y: 20, timestamp: 3 }, { x: 100, y: 40, timestamp: 2 }], style: { ...draft.layers[0].strokes[0].style, spacing: 0 } }] }] };
  assert.ok(core.validateDraft(invalid).length > 0);
});

test('decorative brush commands append and undo one completed stroke at a time', () => {
  const first = { id: 'stroke-1', brushId: 'brush://builtin/plain', brushRevision: '1', points: [{ x: 10, y: 20 }, { x: 60, y: 40 }], style: { color: '#111111', size: 12, spacing: 4, jitter: 0, seed: 1, opacity: 1 } };
  const second = { id: 'stroke-2', brushId: 'brush://builtin/beads', brushRevision: '1', points: [{ x: 90, y: 50 }, { x: 160, y: 90 }], style: { color: '#BA786D', size: 20, spacing: 18, jitter: 0, seed: 2, opacity: 1 } };
  const base = { ...makeDraft(), layers: [{ id: 'brush', type: 'brush', frame: { width: 400, height: 300 }, strokes: [first], transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [] }], selectedLayerId: 'brush' };
  const appended = run(base, { type: 'brush.stroke.append', layerId: 'brush', stroke: second });
  assert.deepEqual(appended.layers[0].strokes.map((stroke) => stroke.id), ['stroke-1', 'stroke-2']);
  const undone = run(appended, { type: 'brush.stroke.undo', layerId: 'brush' });
  assert.deepEqual(undone.layers[0].strokes.map((stroke) => stroke.id), ['stroke-1']);
  const removed = run(undone, { type: 'brush.stroke.undo', layerId: 'brush' });
  assert.equal(removed.layers.length, 0);
  assert.equal(removed.selectedLayerId, null);
});

test('confirmed brush-layer editing replaces strokes without selecting the layer', () => {
  const first = { id: 'stroke-1', brushId: 'brush://builtin/plain', brushRevision: '1', points: [{ x: 10, y: 20 }], style: { color: '#111111', size: 12, spacing: 4, jitter: 0, seed: 1, opacity: 1 } };
  const replacement = { ...first, id: 'stroke-2', points: [{ x: 110, y: 120 }] };
  const base = { ...makeDraft(), layers: [{ id: 'brush', type: 'brush', frame: { width: 400, height: 300 }, strokes: [first], transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [] }], selectedLayerId: null };
  const edited = run(base, { type: 'brush.layer.replace', layerId: 'brush', strokes: [first, replacement] });
  assert.deepEqual(edited.layers[0].strokes.map((stroke) => stroke.id), ['stroke-1', 'stroke-2']);
  assert.equal(edited.selectedLayerId, null);
});

test('erase strokes remain serializable, undoable, and clear only an earlier brush footprint', () => {
  const paint = { id: 'paint', mode: 'paint', brushId: 'brush://builtin/plain', brushRevision: '1', points: [{ x: 20, y: 80 }, { x: 180, y: 80 }], style: { color: '#111111', size: 24, spacing: 4, jitter: 0, seed: 1, opacity: 1 } };
  const erase = { id: 'erase', mode: 'erase', brushId: 'brush://builtin/plain', brushRevision: '1', points: [{ x: 100, y: 80 }], style: { color: null, size: 48, spacing: 4, jitter: 0, seed: 2, opacity: 1 } };
  const base = { ...makeDraft(), layers: [{ id: 'brush', type: 'brush', frame: { width: 400, height: 300 }, strokes: [paint], transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [] }], selectedLayerId: null };
  const erased = run(base, { type: 'brush.stroke.append', layerId: 'brush', stroke: erase });
  assert.equal(core.layerContainsPoint(erased.layers[0], { x: 100, y: 80 }), false);
  assert.equal(core.layerContainsPoint(erased.layers[0], { x: 35, y: 80 }), true);
  const restored = run(erased, { type: 'brush.stroke.undo', layerId: 'brush' });
  assert.equal(core.layerContainsPoint(restored.layers[0], { x: 100, y: 80 }), true);
});

test('an unselected brush creation and later stroke appends preserve the default editor state', () => {
  const first = { id: 'stroke-1', brushId: 'brush://builtin/plain', brushRevision: '1', points: [{ x: 10, y: 20 }], style: { color: '#111111', size: 12, spacing: 4, jitter: 0, seed: 1, opacity: 1 } };
  const brush = { id: 'brush', type: 'brush', frame: { width: 400, height: 300 }, strokes: [first], transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [] };
  const created = run({ ...makeDraft(), selectedLayerId: null }, { type: 'layer.add', layer: brush, select: false });
  assert.equal(created.selectedLayerId, null);
  const appended = run(created, { type: 'brush.stroke.append', layerId: 'brush', stroke: { ...first, id: 'stroke-2', points: [{ x: 100, y: 100 }] } });
  assert.equal(appended.selectedLayerId, null);
});

test('decorative brush selection follows its painted footprint, not its canvas-sized frame', () => {
  const brush = {
    id: 'brush', type: 'brush', frame: { width: 1800, height: 2400 }, transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [],
    strokes: [{ id: 'bow', brushId: 'brush://builtin/bow', brushRevision: '1', points: [{ x: 100, y: 200 }, { x: 240, y: 220 }], style: { color: '#D94A38', size: 30, spacing: 42, jitter: 0, seed: 1, opacity: 1 } }],
  };
  const bounds = core.visibleBoundsForLayer(brush);
  assert.ok(bounds.width < 300 && bounds.height < 150);
  assert.equal(core.layerContainsPoint(brush, { x: 170, y: 210 }), true);
  assert.equal(core.layerContainsPoint(brush, { x: 1200, y: 1800 }), false);
});
