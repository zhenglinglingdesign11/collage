const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const fixtureRoot = '/private/tmp/journal-collage-p1a02-expo-fixture';
const outputRoot = '/private/tmp/journal-collage-mobile-portable-cjs';
const itemPath = path.resolve(__dirname, '../../..', 'source-assets/packs/zhenzhi01/items/1.png');
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
    try { const stat = fs.statSync(uriPath(uri)); return { exists: true, isDirectory: stat.isDirectory(), size: stat.size }; }
    catch { return { exists: false, isDirectory: false }; }
  },
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
  if (request === '@journalcollage/asset-system') return integrity;
  if (request === 'expo-file-system/legacy') return legacyFileSystem;
  return originalLoad.call(this, request, parent, isMain);
};

integrity = require(`${outputRoot}/packages/asset-system/src/remoteAssetIntegrity.js`);
const { cacheVerifiedRemoteAsset } = require(`${outputRoot}/apps/mobile/src/verifiedRemoteAssetCache.js`);

const descriptor = {
  reference: { id: 'asset://pack/zhenzhi01/1', kind: 'image', revision: '1' },
  packRevision: '1',
  mimeType: 'image/png',
  byteLength: image.length,
  sha256,
  pixelSize: { width: 224, height: 242 },
  sourceUrl: 'https://assets.example.test/packs/zhenzhi01/items/1.png',
};

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
