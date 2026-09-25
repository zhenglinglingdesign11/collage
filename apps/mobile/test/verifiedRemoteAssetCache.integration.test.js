const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const fixtureRoot = '/private/tmp/journal-collage-p1a02-expo-fixture';
const outputRoot = '/private/tmp/journal-collage-mobile-portable-cjs';
const itemPath = path.resolve(__dirname, '../../..', 'source-assets/packs/zhenzhi01/items/1.png');
const shippedCatalogPath = path.resolve(__dirname, '../../..', 'generated/first-release-product-catalog.v1.json');
const image = fs.readFileSync(itemPath);
const sha256 = crypto.createHash('sha256').update(image).digest('hex');
const uriPath = (uri) => decodeURIComponent(new URL(uri).pathname);
const originalLoad = Module._load;

let downloads = 0;
const writeImage = async (_source, uri) => {
  fs.mkdirSync(path.dirname(uriPath(uri)), { recursive: true });
  fs.writeFileSync(uriPath(uri), image);
  return { uri, status: 200, headers: { 'content-type': 'image/png' } };
};
let downloadPlan = writeImage;
const resetFixture = () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  downloads = 0;
  downloadPlan = writeImage;
};
const legacyFileSystem = {
  documentDirectory: `file://${fixtureRoot}/documents/`,
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  async makeDirectoryAsync(uri) { fs.mkdirSync(uriPath(uri), { recursive: true }); },
  async getInfoAsync(uri) {
    try { const stat = fs.statSync(uriPath(uri)); return { exists: true, isDirectory: stat.isDirectory(), size: stat.size, modificationTime: stat.mtimeMs / 1000 }; }
    catch { return { exists: false, isDirectory: false }; }
  },
  async readDirectoryAsync(uri) { try { return fs.readdirSync(uriPath(uri)); } catch { return []; } },
  async readAsStringAsync(uri, options) { return fs.readFileSync(uriPath(uri), options?.encoding === 'base64' ? 'base64' : 'utf8'); },
  async writeAsStringAsync(uri, value, options) { fs.mkdirSync(path.dirname(uriPath(uri)), { recursive: true }); fs.writeFileSync(uriPath(uri), value, options?.encoding === 'base64' ? 'base64' : 'utf8'); },
  async moveAsync({ from, to }) { fs.mkdirSync(path.dirname(uriPath(to)), { recursive: true }); fs.renameSync(uriPath(from), uriPath(to)); },
  async deleteAsync(uri, options = {}) { try { fs.rmSync(uriPath(uri), { recursive: true, force: true }); } catch (error) { if (!options.idempotent) throw error; } },
  createDownloadResumable(source, uri) { return { downloadAsync: () => legacyFileSystem.downloadAsync(source, uri), cancelAsync: async () => {} }; },
  async downloadAsync(source, uri) {
    downloads += 1;
    return downloadPlan(source, uri);
  },
};

const core = { sha256HexForBytes: (bytes) => crypto.createHash('sha256').update(bytes).digest('hex') };
let integrity;
Module._load = function remoteAssetTestLoad(request, parent, isMain) {
  if (request === '@journalcollage/editor-core') return core;
  if (request === '@journalcollage/asset-system') return { ...integrity, remoteAssetPacks: [], upsertAsset: (catalog, record) => ({ ...catalog, assets: [...catalog.assets.filter((asset) => asset.reference.id !== record.reference.id), record] }) };
  if (request === 'expo-file-system/legacy') return legacyFileSystem;
  if (request === 'expo-file-system') return { File: class File {} };
  if (request === 'expo-image-manipulator') return { ImageManipulator: {} };
  if (request === './productAssetResolver') return { clearResolvedVerifiedProductAssetUris: () => {}, resolvedVerifiedProductAssetUri: () => undefined };
  return originalLoad.call(this, request, parent, isMain);
};

global.fetch = async (source) => {
  downloads += 1;
  const destination = `file://${fixtureRoot}/fetch-${downloads}.png`;
  const result = await downloadPlan(source, destination);
  const bytes = fs.readFileSync(uriPath(destination));
  return {
    status: result.status,
    headers: { forEach: (visit) => Object.entries(result.headers).forEach(([name, value]) => visit(value, name)) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};

integrity = require(`${outputRoot}/packages/asset-system/src/remoteAssetIntegrity.js`);
const { cacheVerifiedRemoteAsset, clearVerifiedRemoteAssetCache, findVerifiedRemoteAsset, getVerifiedRemoteCacheSummary, pruneVerifiedRemoteAssetCache } = require(`${outputRoot}/apps/mobile/src/verifiedRemoteAssetCache.js`);
const { createProductAssetResolver } = require(`${outputRoot}/packages/asset-system/src/productAssetResolver.js`);

const descriptor = {
  reference: { id: 'asset://pack/zhenzhi01/1', kind: 'image', revision: '1' },
  packRevision: '1',
  mimeType: 'image/png',
  byteLength: image.length,
  sha256,
  pixelSize: { width: 224, height: 242 },
  sourceUrl: 'https://assets.example.test/packs/zhenzhi01/items/1.png',
};
const shippedProductCatalogStub = {
  shippedProductAssetCatalog: { packs: [] },
  isShippedProductAssetReference: (reference) => reference.id === descriptor.reference.id,
  isCompatibilityProductAssetReference: (reference) => /^asset:\/\/pack\/blue-01\/[12]$/.test(reference.id),
  productCatalogAssetForReference: (reference) => /^asset:\/\/pack\/blue-01\/[12]$/.test(reference.id) ? { ...descriptor, reference } : descriptor,
  shippedProductAssetResolver: { resolve: async () => ({ uri: await cacheVerifiedRemoteAsset(descriptor), source: 'cdn' }) },
};
const originalProductLoad = Module._load;
Module._load = function productRecoveryTestLoad(request, parent, isMain) {
  if (request === './shippedProductAssetCatalog') return shippedProductCatalogStub;
  return originalProductLoad.call(this, request, parent, isMain);
};
const { recoverWorkspaceProductAssets } = require(`${outputRoot}/apps/mobile/src/localWorkspace.js`);

test('P1-A04 resolves a shipped asset from cache, then bundle, then verified CDN', async () => {
  const cover = { ...descriptor, reference: { ...descriptor.reference, id: 'asset://pack/zhenzhi01/cover' } };
  const catalog = { releaseState: 'shipped', packs: [{ id: 'zhenzhi01', revision: '1', status: 'shipped', cover, items: [descriptor] }] };
  const calls = [];
  const adapter = {
    findVerifiedCachedAsset: async () => { calls.push('cache'); return null; },
    findVerifiedBundledAsset: async () => { calls.push('bundle'); return null; },
    downloadAndCacheAsset: async () => { calls.push('cdn'); return 'file:///cache/asset.png'; },
  };
  const resolver = createProductAssetResolver(catalog, adapter);
  const fromCdn = await resolver.resolve(descriptor.reference);
  assert.deepEqual(calls, ['cache', 'bundle', 'cdn']);
  assert.deepEqual(fromCdn, { uri: 'file:///cache/asset.png', source: 'cdn' });

  calls.length = 0;
  adapter.findVerifiedCachedAsset = async () => { calls.push('cache'); return 'file:///cache/hit.png'; };
  const fromCache = await resolver.resolve(descriptor.reference);
  assert.deepEqual(calls, ['cache']);
  assert.equal(fromCache.source, 'verified-cache');
});

test('P1-A04 rejects staged catalogs and unknown stable references', async () => {
  const adapter = { findVerifiedCachedAsset: async () => null, findVerifiedBundledAsset: async () => null, downloadAndCacheAsset: async () => 'file:///unused.png' };
  const cover = { ...descriptor, reference: { ...descriptor.reference, id: 'asset://pack/zhenzhi01/cover' } };
  assert.throws(() => createProductAssetResolver({ releaseState: 'staged', packs: [{ id: 'zhenzhi01', revision: '1', status: 'staged', cover, items: [descriptor] }] }, adapter), (error) => error.code === 'asset-reference-invalid');
  const resolver = createProductAssetResolver({ releaseState: 'shipped', packs: [{ id: 'zhenzhi01', revision: '1', status: 'shipped', cover, items: [descriptor] }] }, adapter);
  await assert.rejects(resolver.resolve({ ...descriptor.reference, id: 'asset://pack/zhenzhi01/missing' }), (error) => error.code === 'asset-reference-invalid');
});

test('P1-A05 restores only a saved Draft\'s missing strict and compatibility materials', async () => {
  resetFixture();
  const strict = descriptor.reference;
  const compatibility = { id: 'asset://pack/blue-01/2', kind: 'image', revision: '1' };
  const workspace = {
    draft: { id: 'saved-work', canvas: { size: { width: 100, height: 100 }, background: '#fff', backgroundAsset: compatibility }, layers: [{ id: 'strict-layer', type: 'image', asset: strict }], createdAt: '2026-09-21T00:00:00.000Z' },
    catalog: { version: 1, assets: [] },
  };
  const restored = await recoverWorkspaceProductAssets(workspace);
  assert.equal(restored.failures.length, 0);
  assert.equal(restored.workspace.catalog.assets.length, 2);
  assert.equal(downloads, 2);
  assert.deepEqual(restored.workspace.draft, workspace.draft);
});

test('P1-A05 keeps the Draft unchanged when a compatibility material cannot be restored', async () => {
  resetFixture();
  downloadPlan = async (_source, uri) => {
    fs.mkdirSync(path.dirname(uriPath(uri)), { recursive: true });
    fs.writeFileSync(uriPath(uri), 'not an image');
    return { uri, status: 404, headers: { 'content-type': 'text/plain' } };
  };
  const compatibility = { id: 'asset://pack/blue-01/1', kind: 'image', revision: '1' };
  const workspace = {
    draft: { id: 'missing-material', canvas: { size: { width: 100, height: 100 }, background: '#fff' }, layers: [{ id: 'legacy-layer', type: 'image', asset: compatibility }], createdAt: '2026-09-21T00:00:00.000Z' },
    catalog: { version: 1, assets: [] },
  };
  const restored = await recoverWorkspaceProductAssets(workspace);
  assert.equal(restored.failures.length, 1);
  assert.equal(restored.workspace.catalog.assets.length, 0);
  assert.deepEqual(restored.workspace.draft, workspace.draft);
});

test('zhenzhi01 validates compressed bytes and rejects a tampered hash', () => {
  integrity.validateRemoteAssetDownload(descriptor, { bytes: new Uint8Array(image), mimeType: 'image/png' });
  assert.throws(
    () => integrity.validateRemoteAssetDownload({ ...descriptor, sha256: '0'.repeat(64) }, { bytes: new Uint8Array(image), mimeType: 'image/png' }),
    (error) => error.code === 'asset-hash-mismatch',
  );
});

test('Expo adapter stages, verifies, atomically promotes, and deduplicates zhenzhi01', async () => {
  resetFixture();
  const [first, second] = await Promise.all([cacheVerifiedRemoteAsset(descriptor), cacheVerifiedRemoteAsset(descriptor)]);
  assert.equal(first, second);
  assert.deepEqual(fs.readFileSync(uriPath(first)), image);
  assert.equal(fs.existsSync(path.join(path.dirname(uriPath(first)), 'record.json')), true);
  assert.equal(downloads, 1);
});

test('P1-A06 records strict-cache usage and preserves protected entries during LRU pruning', async () => {
  resetFixture();
  await cacheVerifiedRemoteAsset(descriptor);
  assert.deepEqual(await getVerifiedRemoteCacheSummary(), { bytes: image.length, files: 1 });
  const protectedKey = `${descriptor.reference.id}\u0000${descriptor.reference.kind}\u0000${descriptor.reference.revision}`;
  await pruneVerifiedRemoteAssetCache(0, new Set([protectedKey]));
  assert.deepEqual(await getVerifiedRemoteCacheSummary(), { bytes: image.length, files: 1 });
  await pruneVerifiedRemoteAssetCache(0, new Set());
  assert.deepEqual(await getVerifiedRemoteCacheSummary(), { bytes: 0, files: 0 });
});

test('P1-A07 reuses a verified strict asset while offline without another download', async () => {
  resetFixture();
  const firstUri = await cacheVerifiedRemoteAsset(descriptor);
  downloadPlan = async () => { throw new Error('network unavailable'); };
  const cachedUri = await cacheVerifiedRemoteAsset(descriptor);
  assert.equal(cachedUri, firstUri);
  assert.equal(downloads, 1);
});

test('a changed strict-cache file is revalidated before reuse', async () => {
  resetFixture();
  const uri = await cacheVerifiedRemoteAsset(descriptor);
  const changed = Buffer.from(image);
  changed[100] ^= 1;
  fs.writeFileSync(uriPath(uri), changed);
  const later = new Date(Date.now() + 2000);
  fs.utimesSync(uriPath(uri), later, later);
  assert.equal(await findVerifiedRemoteAsset(descriptor), null);
  assert.equal(fs.existsSync(uriPath(uri)), false);
});

test('strict downloads share a three-request network limit', async () => {
  resetFixture();
  let active = 0;
  let maximum = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  downloadPlan = async (source, uri) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await gate;
    const result = await writeImage(source, uri);
    active -= 1;
    return result;
  };
  const requests = Array.from({ length: 5 }, (_, index) => cacheVerifiedRemoteAsset({
    ...descriptor,
    reference: { ...descriptor.reference, id: `${descriptor.reference.id}-limit-${index}` },
  }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(maximum, 3);
  release();
  await Promise.all(requests);
  assert.equal(downloads, 5);
  assert.equal(maximum, 3);
});

test('P1-A07 rejects a strict CDN 404 without leaving a usable cache record', async () => {
  resetFixture();
  downloadPlan = async (_source, uri) => {
    fs.mkdirSync(path.dirname(uriPath(uri)), { recursive: true });
    fs.writeFileSync(uriPath(uri), 'not found');
    return { uri, status: 404, headers: { 'content-type': 'text/plain' } };
  };
  await assert.rejects(cacheVerifiedRemoteAsset(descriptor), (error) => error.code === 'asset-download-failed');
  assert.equal(downloads, 1);
  assert.deepEqual(await getVerifiedRemoteCacheSummary(), { bytes: 0, files: 0 });
});

test('P1-A07 keeps all shipped template previews on the strict resolver path', async () => {
  const catalog = JSON.parse(fs.readFileSync(shippedCatalogPath, 'utf8'));
  const previews = catalog.packs.find((pack) => pack.id === 'template-previews');
  assert.equal(previews.status, 'shipped');
  assert.equal(previews.resolverMode, 'strict');
  assert.equal(previews.visibility, 'internal');
  assert.deepEqual(previews.items.map((item) => item.itemId), ['play-pop', 'play-pop-multi', 'romantic-deco-two-photo', 'romantic-deco', 'soft-archive', 'digital-y2k-ascii', 'digital-y2k-multi', 'soft-archive-multi', 'fan-moodboard', 'material-remix']);
  const resolved = [];
  const resolver = createProductAssetResolver(catalog, {
    findVerifiedCachedAsset: async (asset) => { resolved.push(asset.reference.id); return `file:///verified/${asset.itemId}.png`; },
    findVerifiedBundledAsset: async () => null,
    downloadAndCacheAsset: async () => { throw new Error('A verified cache hit should resolve template previews.'); },
  });
  await Promise.all(previews.items.map((item) => resolver.resolve(item.reference)));
  assert.deepEqual(new Set(resolved), new Set(previews.items.map((item) => item.reference.id)));
});

test('Expo adapter retries a transient network failure and removes its first staging directory', async () => {
  resetFixture();
  let attempts = 0;
  downloadPlan = async (source, uri) => {
    attempts += 1;
    if (attempts === 1) {
      fs.mkdirSync(path.dirname(uriPath(uri)), { recursive: true });
      fs.writeFileSync(uriPath(uri), image.subarray(0, 100));
      throw new Error('network unavailable');
    }
    return writeImage(source, uri);
  };
  const uri = await cacheVerifiedRemoteAsset(descriptor);
  const cacheRoot = path.join(fixtureRoot, 'documents/journalcollage/verified-remote-assets/v1');
  assert.equal(attempts, 2);
  assert.deepEqual(fs.readFileSync(uriPath(uri)), image);
  assert.deepEqual(fs.readdirSync(cacheRoot).filter((entry) => entry.includes('.staging')), []);
});

test('Expo adapter leaves no valid record or staging directory after all retryable attempts fail', async () => {
  resetFixture();
  downloadPlan = async (_source, uri) => {
    fs.mkdirSync(path.dirname(uriPath(uri)), { recursive: true });
    fs.writeFileSync(uriPath(uri), image.subarray(0, 100));
    throw new Error('network unavailable');
  };
  await assert.rejects(cacheVerifiedRemoteAsset(descriptor), (error) => error.code === 'asset-download-failed');
  const cacheRoot = path.join(fixtureRoot, 'documents/journalcollage/verified-remote-assets/v1');
  assert.equal(downloads, 2);
  assert.deepEqual(fs.readdirSync(cacheRoot), []);
});

test('a cancelled caller does not create a partial cache record while its shared download completes', async () => {
  resetFixture();
  let startDownload;
  const started = new Promise((resolve) => { startDownload = resolve; });
  let releaseDownload;
  const release = new Promise((resolve) => { releaseDownload = resolve; });
  downloadPlan = async (source, uri) => {
    startDownload();
    await release;
    return writeImage(source, uri);
  };
  const controller = new AbortController();
  const waiting = cacheVerifiedRemoteAsset(descriptor, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(waiting, (error) => error.code === 'asset-download-cancelled');
  releaseDownload();
  const uri = await cacheVerifiedRemoteAsset(descriptor);
  assert.deepEqual(fs.readFileSync(uriPath(uri)), image);
  assert.equal(downloads, 1);
});

test('clearing cache prevents an in-flight strict download from restoring it', async () => {
  resetFixture();
  let started;
  const begun = new Promise((resolve) => { started = resolve; });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  downloadPlan = async (source, uri) => { started(); await gate; return writeImage(source, uri); };
  const pending = cacheVerifiedRemoteAsset(descriptor);
  await begun;
  await clearVerifiedRemoteAssetCache();
  release();
  await assert.rejects(pending, (error) => error.code === 'asset-download-cancelled');
  assert.deepEqual(await getVerifiedRemoteCacheSummary(), { bytes: 0, files: 0 });
});
