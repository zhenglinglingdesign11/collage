const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const fixtureRoot = '/private/tmp/journal-collage-portable-isolation';
const fixtureMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/portable-project/fixture-matrix.json'), 'utf8'));
const fileUri = (value) => `file://${value}`;
const filePath = (uri) => decodeURIComponent(new URL(uri).pathname);
let failNextMoveTo = null;

const legacyFileSystem = {
  documentDirectory: `${fileUri(fixtureRoot)}/documents/`,
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  async makeDirectoryAsync(uri) { fs.mkdirSync(filePath(uri), { recursive: true }); },
  async getInfoAsync(uri) {
    try { const info = fs.statSync(filePath(uri)); return { exists: true, isDirectory: info.isDirectory(), size: info.size }; }
    catch { return { exists: false, isDirectory: false }; }
  },
  async readAsStringAsync(uri, options) { return fs.readFileSync(filePath(uri), options?.encoding === 'base64' ? 'base64' : 'utf8'); },
  async writeAsStringAsync(uri, value, options) { fs.mkdirSync(path.dirname(filePath(uri)), { recursive: true }); fs.writeFileSync(filePath(uri), value, options?.encoding === 'base64' ? 'base64' : 'utf8'); },
  async copyAsync({ from, to }) { fs.mkdirSync(path.dirname(filePath(to)), { recursive: true }); fs.copyFileSync(filePath(from), filePath(to)); },
  async moveAsync({ from, to }) { if (to === failNextMoveTo) { failNextMoveTo = null; throw new Error('Injected promotion failure'); } fs.mkdirSync(path.dirname(filePath(to)), { recursive: true }); fs.renameSync(filePath(from), filePath(to)); },
  async deleteAsync(uri, options = {}) { try { fs.rmSync(filePath(uri), { recursive: true, force: true }); } catch (error) { if (!options.idempotent) throw error; } },
  async readDirectoryAsync(uri) { return fs.readdirSync(filePath(uri)); },
};

class FileMock {
  constructor(uri) { this.uri = uri; }
  get exists() { return fs.existsSync(filePath(this.uri)); }
  textSync() { return fs.readFileSync(filePath(this.uri), 'utf8'); }
}

const originalLoad = Module._load;
Module._load = function mockPortableDependencies(request, parent, isMain) {
  if (request === 'expo-file-system/legacy') return legacyFileSystem;
  if (request === 'expo-file-system') return { File: FileMock };
  if (request === 'expo-image-manipulator') return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
    ImageManipulator: { manipulate: (uri) => {
      let size = { width: 4000, height: 3000 };
      return {
        resize: ({ width, height }) => { size = width === null ? { width: Math.round(4000 * height / 3000), height } : { width, height: Math.round(3000 * width / 4000) }; },
        renderAsync: async () => ({ saveAsync: async () => {
          const output = `${fileUri(fixtureRoot)}/normalized-${Date.now()}.jpg`;
          await legacyFileSystem.copyAsync({ from: uri, to: output });
          return { uri: output, ...size };
        } }),
      };
    } },
  };
  if (request === 'expo-asset') return { Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: null }) }) } };
  if (request === './productAssetResolver') return { clearResolvedVerifiedProductAssetUris: () => {}, resolvedVerifiedProductAssetUri: () => undefined };
  if (request === './verifiedRemoteAssetCache') return { clearVerifiedRemoteAssetCache: async () => {}, getVerifiedRemoteCacheSummary: async () => ({ bytes: 0, files: 0 }), pruneVerifiedRemoteAssetCache: async () => {} };
  if (request === './shippedProductAssetCatalog') return { isCompatibilityProductAssetReference: () => false, isShippedProductAssetReference: () => false, productCatalogAssetForReference: () => undefined, shippedProductAssetCatalog: { packs: [] }, shippedProductAssetResolver: { resolve: async () => { throw new Error('No shipped asset in this fixture.'); } } };
  if (request === '@journalcollage/asset-system') return {
    emptyAssetCatalog: () => ({ version: 1, assets: [] }),
    getTextFont: () => ({ reference: { revision: '1' } }),
    proceduralPaperForReferenceId: (id) => id === 'asset://procedural-paper' ? { shape: 'image' } : undefined,
    proceduralStickerForReferenceId: (id) => id === 'asset://procedural-sticker' ? { textureSource: 'https://example.test/texture.png' } : undefined,
    brushDefinitionsById: { 'brush://builtin/plain': { revision: '1' } },
    remoteAssetPacks: [{ id: 'paper-01', revision: '1' }],
  };
  if (request === '@journalcollage/editor-core') return require('/private/tmp/journal-collage-editor-core-tests/index.js');
  return originalLoad.call(this, request, parent, isMain);
};

const workspaceModule = require('/private/tmp/journal-collage-mobile-portable-cjs/apps/mobile/src/localWorkspace.js');
const core = require('/private/tmp/journal-collage-editor-core-tests/index.js');
const { editorReducer, MAX_UNDO_STEPS } = require('/private/tmp/journal-collage-mobile-portable-cjs/apps/mobile/src/editorHistory.js');
const { runInitialPackImport } = require('/private/tmp/journal-collage-mobile-portable-cjs/apps/mobile/src/initialPackImport.js');
const rendererParity = require('/private/tmp/journal-collage-mobile-portable-cjs/packages/editor-renderer/src/renderParity.js');
const fixture = (id) => fixtureMatrix.fixtures.find((candidate) => candidate.id === id);
const byteHashAt = (uri) => core.sha256HexForBytes(new Uint8Array(fs.readFileSync(filePath(uri))));

test('editor history is bounded and a completed slider-like command takes one undo step', () => {
  const initial = core.createDraft({ id: 'history-bound', size: { width: 100, height: 100 }, now: '2026-09-14T00:00:00.000Z' });
  let state = { past: [], present: initial, future: [] };
  for (let index = 0; index < MAX_UNDO_STEPS + 10; index += 1) {
    state = editorReducer(state, { type: 'command', command: { type: 'canvas.background.set', background: `#${(index + 1).toString(16).padStart(6, '0')}`, asset: null } });
  }
  assert.equal(state.past.length, MAX_UNDO_STEPS);
  const completedValue = state.present.canvas.background;
  state = editorReducer(state, { type: 'undo' });
  assert.notEqual(state.present.canvas.background, completedValue);
  state = editorReducer(state, { type: 'redo' });
  assert.equal(state.present.canvas.background, completedValue);
  for (let index = 0; index < MAX_UNDO_STEPS + 10; index += 1) state = editorReducer(state, { type: 'undo' });
  assert.equal(state.past.length, 0);
  assert.notEqual(state.present.canvas.background, initial.canvas.background);
});

test('checkpoint remains distinct from an explicit save and recovers after an interrupted replacement', async () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  const initial = core.createDraft({ id: 'checkpoint', size: { width: 100, height: 100 }, now: '2026-09-14T00:00:00.000Z' });
  const catalog = { version: 1, assets: [] };
  const saved = { draft: { ...initial, canvas: { ...initial.canvas, background: '#111111' } }, catalog };
  const changed = { draft: { ...initial, canvas: { ...initial.canvas, background: '#222222' } }, catalog };
  await workspaceModule.saveWorkspace(saved, { markAsSaved: true });
  assert.equal(await workspaceModule.loadUnfinishedWorkspace(), null);
  await workspaceModule.saveWorkspace(changed);
  assert.equal((await workspaceModule.loadUnfinishedWorkspace()).draft.canvas.background, '#222222');
  assert.equal((await workspaceModule.loadSavedDrafts()).length, 1);
  assert.equal((await workspaceModule.loadSavedDraft('checkpoint')).draft.canvas.background, '#111111');
  const workspacePath = `${fixtureRoot}/documents/journalcollage/workspace.json`;
  fs.writeFileSync(workspacePath, '{interrupted');
  assert.equal((await workspaceModule.loadWorkspace()).draft.canvas.background, '#111111');
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('a failed 21st index promotion keeps all 20 prior drafts accessible', async () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  const catalog = { version: 1, assets: [] };
  const makeWorkspace = (id) => ({ draft: core.createDraft({ id, size: { width: 100, height: 100 }, now: '2026-09-14T00:00:00.000Z' }), catalog });
  for (let index = 0; index < 20; index += 1) await workspaceModule.saveWorkspace(makeWorkspace(`saved-${index}`), { markAsSaved: true });
  failNextMoveTo = `${fileUri(fixtureRoot)}/documents/journalcollage/saved-drafts-index.json`;
  await assert.rejects(workspaceModule.saveWorkspace(makeWorkspace('saved-20'), { markAsSaved: true }), /Injected promotion failure/);
  const afterFailure = await workspaceModule.loadSavedDrafts();
  assert.equal(afterFailure.length, 20);
  for (let index = 0; index < 20; index += 1) assert.ok(await workspaceModule.loadSavedDraft(`saved-${index}`));
  await workspaceModule.saveWorkspace(makeWorkspace('saved-20'), { markAsSaved: true });
  assert.equal((await workspaceModule.loadSavedDrafts()).length, 20);
  assert.ok((await workspaceModule.loadSavedDrafts()).some((entry) => entry.id === 'saved-20'));
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('an explicit save remains successful when only its later workspace checkpoint fails', async () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  const catalog = { version: 1, assets: [] };
  const draft = core.createDraft({ id: 'saved-after-checkpoint-error', size: { width: 100, height: 100 }, now: '2026-09-14T00:00:00.000Z' });
  const prior = { draft: { ...draft, canvas: { ...draft.canvas, background: '#111111' } }, catalog };
  const updated = { draft: { ...draft, canvas: { ...draft.canvas, background: '#222222' }, updatedAt: '2026-09-14T00:00:01.000Z' }, catalog };
  await workspaceModule.saveWorkspace(prior);
  failNextMoveTo = `${fileUri(fixtureRoot)}/documents/journalcollage/workspace.json`;
  await workspaceModule.saveWorkspace(updated, { markAsSaved: true });
  assert.equal((await workspaceModule.loadSavedDraft(draft.id)).draft.canvas.background, '#222222');
  assert.equal((await workspaceModule.loadSavedDrafts()).length, 1);
  assert.equal((await workspaceModule.loadWorkspace()).draft.canvas.background, '#111111');
  assert.equal(await workspaceModule.loadUnfinishedWorkspace(), null);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('initial multi-material transfer waits for every resolve and commits nothing on failure or exit', async () => {
  const deferred = () => { let resolve; let reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
  const first = deferred();
  const second = deferred();
  const committed = [];
  let active = true;
  const success = runInitialPackImport([0, 1], (index) => [first, second][index].promise, () => active, (records) => committed.push(...records));
  first.resolve('first');
  await Promise.resolve();
  assert.deepEqual(committed, []);
  second.resolve('second');
  assert.equal(await success, 'committed');
  assert.deepEqual(committed, ['first', 'second']);

  const failing = deferred();
  const failed = runInitialPackImport([0, 1], (index) => index === 0 ? Promise.resolve('first') : failing.promise, () => active, (records) => committed.push(...records));
  failing.reject(new Error('offline'));
  assert.equal(await failed, 'failed');
  assert.deepEqual(committed, ['first', 'second']);

  const late = deferred();
  const cancelled = runInitialPackImport([0], () => late.promise, () => active, (records) => committed.push(...records));
  active = false;
  late.resolve('late');
  assert.equal(await cancelled, 'cancelled');
  assert.deepEqual(committed, ['first', 'second']);
});

test('photo imports run one at a time and keep the selected order', async () => {
  const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
  const first = deferred();
  const second = deferred();
  const started = [];
  const committed = [];
  const importPhotos = runInitialPackImport([0, 1], (index) => {
    started.push(index);
    return [first, second][index].promise;
  }, () => true, (records) => committed.push(...records), 1);
  assert.deepEqual(started, [0]);
  first.resolve('first');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(committed, []);
  second.resolve('second');
  assert.equal(await importPhotos, 'committed');
  assert.deepEqual(committed, ['first', 'second']);
});

test('local photo import stores a normalized, nonempty image record', async () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const source = `${fileUri(fixtureRoot)}/old-photo.heic`;
  fs.writeFileSync(filePath(source), 'fixture image bytes');
  const record = await workspaceModule.importLocalImage({ uri: source, width: 4000, height: 3000, mimeType: 'image/heic' });
  assert.equal(record.mimeType, 'image/jpeg');
  assert.equal(record.width, 2400);
  assert.equal(record.height, 1800);
  assert.match(record.originalUri, /\.jpg$/);
  assert.equal(fs.readFileSync(filePath(record.originalUri), 'utf8'), 'fixture image bytes');
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('export readiness rejects missing or remote-only image inputs before snapshot', async () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  const imageUri = `${fileUri(fixtureRoot)}/available.png`;
  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.writeFileSync(filePath(imageUri), 'png');
  const draft = core.createDraft({ id: 'export-ready', size: { width: 100, height: 100 }, now: '2026-09-14T00:00:00.000Z' });
  const withBackground = { ...draft, canvas: { ...draft.canvas, backgroundAsset: { id: 'asset://background', kind: 'image', revision: '1' } } };
  assert.deepEqual(await workspaceModule.missingExportImageReferences(withBackground, {}), ['asset://background']);
  assert.deepEqual(await workspaceModule.missingExportImageReferences(withBackground, { 'asset://background': 'https://example.test/image.png' }), ['asset://background']);
  assert.deepEqual(await workspaceModule.missingExportImageReferences(withBackground, { 'asset://background': imageUri }), []);
  const textured = { ...draft, canvas: { ...draft.canvas, backgroundAsset: { id: 'asset://procedural-paper', kind: 'image', revision: '1' } } };
  assert.deepEqual(await workspaceModule.missingExportImageReferences(textured, {}), ['asset://procedural-paper']);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  assert.deepEqual(await workspaceModule.missingExportImageReferences(withBackground, { 'asset://background': imageUri }), ['asset://background']);
});

test('Portable Project fixture matrix retains its required coverage', () => {
  assert.deepEqual(fixtureMatrix.fixtures.map((candidate) => candidate.id), ['minimal-v1', 'complex-v1', 'legacy-v0', 'missing-resource-v1', 'corrupt-resource-v1']);
  assert.equal(fixture('complex-v1').expected, 'imports-and-render-inputs-match');
});

test('Portable Project rebuilds a complex workspace with identical renderer inputs after original assets disappear', async () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  const sourcePath = `${fixtureRoot}/source/photo.png`;
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, Buffer.from(fixture('complex-v1').resource));
  const now = '2026-09-14T00:00:00.000Z';
  const draft = {
    ...core.createDraft({ id: 'project-isolation', size: { width: 800, height: 1000 }, now }),
    canvas: { size: { width: 800, height: 1000 }, background: '#FDFDFB', backgroundAsset: { id: 'asset://pack/paper-01/grid', kind: 'image', revision: '1' } },
    layers: [
      { id: 'photo', type: 'image', name: 'Photo', asset: { id: 'user://image/fixture', kind: 'image', revision: '1' }, frame: { width: 400, height: 300 }, crop: { x: 0, y: 0, width: 1, height: 1 }, transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [{ instanceId: 'outline', type: 'edge.outline', version: 1, enabled: true, stage: 'overlay', params: { color: '#fff', width: 2 } }] },
      { id: 'title', type: 'text', text: 'Portable', frame: { width: 300, height: 80 }, fontId: 'system', fontVariantId: 'system', fontSize: 30, color: '#111', textAlign: 'left', backgroundColor: null, transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [] },
      { id: 'brush', type: 'brush', frame: { width: 300, height: 100 }, transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [], strokes: [{ id: 'stroke', brushId: 'brush://builtin/plain', brushRevision: '1', points: [{ x: 10, y: 10 }], style: { color: '#111', size: 10, spacing: 4, jitter: 0, seed: 1, opacity: 1 } }] },
    ],
    selectedLayerId: 'photo',
  };
  const workspace = { draft, catalog: { version: 1, assets: [{ reference: { id: 'user://image/fixture', kind: 'image', revision: '1' }, originalUri: fileUri(sourcePath), width: 1, height: 1, mimeType: 'image/png', createdAt: now }] } };
  const targets = [
    { target: 'preview', size: { width: 360, height: 450 } },
    { target: 'thumbnail', size: { width: 80, height: 100 } },
    { target: 'export', size: { width: 800, height: 1000 } },
  ];
  const originalAsset = { referenceId: 'user://image/fixture', revision: '1', byteHash: byteHashAt(fileUri(sourcePath)), width: 1, height: 1, mimeType: 'image/png' };
  const exported = await workspaceModule.exportPortableProject(workspace, `${fileUri(fixtureRoot)}/portable/`);
  assert.equal(fs.readFileSync(filePath(exported.projectUri), 'utf8').includes(sourcePath), false);
  fs.rmSync(sourcePath);
  const rebuilt = await workspaceModule.importPortableProject(exported.directoryUri, `${fileUri(fixtureRoot)}/rebuilt/`);
  assert.deepEqual(rebuilt.draft, draft);
  assert.equal(rebuilt.catalog.assets.length, 1);
  assert.equal(rebuilt.catalog.assets[0].originalUri.startsWith(`${fileUri(fixtureRoot)}/rebuilt/`), true);
  assert.equal(fs.existsSync(filePath(rebuilt.catalog.assets[0].originalUri)), true);
  const rebuiltAsset = { ...originalAsset, byteHash: byteHashAt(rebuilt.catalog.assets[0].originalUri) };
  targets.forEach(({ target, size }) => {
    const original = rendererParity.renderParityFingerprint(rendererParity.renderParitySnapshot({ draft, target, size, assets: [originalAsset] }));
    const restored = rendererParity.renderParityFingerprint(rendererParity.renderParitySnapshot({ draft: rebuilt.draft, target, size, assets: [rebuiltAsset] }));
    assert.equal(restored, original, `${target} renderer inputs must survive isolated reconstruction`);
  });
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('Portable Project fixture outcomes cover minimal, v0, missing, and corrupt documents', async () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  const now = '2026-09-14T00:00:00.000Z';
  const minimalDraft = core.createDraft({ id: 'fixture-minimal', size: { width: 100, height: 100 }, now });
  const minimal = await workspaceModule.exportPortableProject({ draft: minimalDraft, catalog: { version: 1, assets: [] } }, `${fileUri(fixtureRoot)}/minimal/`);
  assert.deepEqual((await workspaceModule.importPortableProject(minimal.directoryUri, `${fileUri(fixtureRoot)}/minimal-rebuilt/`)).draft, minimalDraft);

  const sourcePath = `${fixtureRoot}/source/photo.png`;
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, Buffer.from(fixture('complex-v1').resource));
  const baseDraft = { ...minimalDraft, id: 'fixture-resource', layers: [{ id: 'photo', type: 'image', name: 'Photo', asset: { id: 'user://image/fixture', kind: 'image', revision: '1' }, frame: { width: 50, height: 50 }, crop: { x: 0, y: 0, width: 1, height: 1 }, transform: core.identityTransform(), opacity: 1, isLocked: false, effects: [] }] };
  const baseWorkspace = { draft: baseDraft, catalog: { version: 1, assets: [{ reference: baseDraft.layers[0].asset, originalUri: fileUri(sourcePath), width: 1, height: 1, mimeType: 'image/png', createdAt: now }] } };
  const legacy = await workspaceModule.exportPortableProject(baseWorkspace, `${fileUri(fixtureRoot)}/legacy/`);
  const v1 = JSON.parse(fs.readFileSync(filePath(legacy.projectUri), 'utf8'));
  fs.writeFileSync(filePath(legacy.projectUri), JSON.stringify({ format: v1.format, formatVersion: 0, projectId: v1.projectId, draft: v1.document, assets: v1.assetManifest, requiredPackAssets: v1.requiredPackAssets, catalogDependencies: v1.catalogDependencies, createdAt: v1.createdAt, updatedAt: v1.updatedAt, exportedAt: v1.exportedAt }));
  assert.deepEqual((await workspaceModule.importPortableProject(legacy.directoryUri, `${fileUri(fixtureRoot)}/legacy-rebuilt/`)).draft, baseDraft);

  const missing = await workspaceModule.exportPortableProject(baseWorkspace, `${fileUri(fixtureRoot)}/missing/`);
  fs.rmSync(filePath(`${missing.directoryUri}${missing.project.assetManifest[0].content.relativePath}`));
  await assert.rejects(() => workspaceModule.importPortableProject(missing.directoryUri, `${fileUri(fixtureRoot)}/missing-rebuilt/`), (error) => error.code === fixture('missing-resource-v1').expected);

  const corrupt = await workspaceModule.exportPortableProject(baseWorkspace, `${fileUri(fixtureRoot)}/corrupt/`);
  fs.writeFileSync(filePath(`${corrupt.directoryUri}${corrupt.project.assetManifest[0].content.relativePath}`), fixture('corrupt-resource-v1').resource);
  await assert.rejects(() => workspaceModule.importPortableProject(corrupt.directoryUri, `${fileUri(fixtureRoot)}/corrupt-rebuilt/`), (error) => error.code === fixture('corrupt-resource-v1').expected);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});
