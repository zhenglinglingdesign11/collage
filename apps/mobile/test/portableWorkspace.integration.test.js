const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const fixtureRoot = '/private/tmp/journal-collage-portable-isolation';
const fixtureMatrix = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/portable-project/fixture-matrix.json'), 'utf8'));
const fileUri = (value) => `file://${value}`;
const filePath = (uri) => decodeURIComponent(new URL(uri).pathname);

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
  async moveAsync({ from, to }) { fs.mkdirSync(path.dirname(filePath(to)), { recursive: true }); fs.renameSync(filePath(from), filePath(to)); },
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
  if (request === '@journalcollage/asset-system') return {
    emptyAssetCatalog: () => ({ version: 1, assets: [] }),
    getTextFont: () => ({ reference: { revision: '1' } }),
    brushDefinitionsById: { 'brush://builtin/plain': { revision: '1' } },
    remoteAssetPacks: [{ id: 'paper-01', revision: '1' }],
  };
  if (request === '@journalcollage/editor-core') return require('/private/tmp/journal-collage-editor-core-tests/index.js');
  return originalLoad.call(this, request, parent, isMain);
};

const workspaceModule = require('/private/tmp/journal-collage-mobile-portable-cjs/apps/mobile/src/localWorkspace.js');
const core = require('/private/tmp/journal-collage-editor-core-tests/index.js');
const rendererParity = require('/private/tmp/journal-collage-mobile-portable-cjs/packages/editor-renderer/src/renderParity.js');
const fixture = (id) => fixtureMatrix.fixtures.find((candidate) => candidate.id === id);
const byteHashAt = (uri) => core.sha256HexForBytes(new Uint8Array(fs.readFileSync(filePath(uri))));

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
