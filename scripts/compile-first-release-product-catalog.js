#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const inputPath = path.join(repoRoot, 'content', 'first-release-pack-input.v1.json');
const packsRoot = path.join(repoRoot, 'source-assets', 'packs');
const runtime = process.argv.includes('--runtime');
const outputPath = path.join(repoRoot, 'generated', runtime ? 'first-release-product-catalog.v1.json' : 'first-release-staging-catalog.v1.json');
const uploadPath = path.join(repoRoot, 'generated', 'first-release-r2-upload.v1.json');
const PNG_SIGNATURE = '89504e470d0a1a0a';

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (input.schemaVersion !== 1 || !Array.isArray(input.packs) || (input.remotePacks !== undefined && !Array.isArray(input.remotePacks)) || !/^https:\/\//.test(input.baseUrl)) fail('Invalid first-release pack input.');

const packs = input.packs.concat(input.remotePacks ?? []).map((definition) => compilePack(definition));
if (runtime && packs.some((pack) => pack.status !== 'shipped')) fail('Runtime catalog requires every pack to be marked shipped after remote verification.');
const catalog = {
  schemaVersion: 1,
  catalogRevision: input.catalogRevision,
  releaseState: runtime ? 'shipped' : 'staged',
  // Build provenance is useful in staging, but must not expose a developer
  // source-tree convention to the client-facing frozen catalog.
  sourceOfTruth: runtime ? 'first-release-product-catalog.v1' : input.sourceOfTruth,
  packs: packs.map(publicPack),
  aliases: input.aliases ?? [],
};
const uploads = packs.flatMap((pack) => pack.uploadRequired ? [pack.cover, ...pack.items].filter((asset) => asset.localPath).map((asset) => ({
  localPath: asset.localPath,
  r2Path: asset.r2Path,
  contentType: asset.mimeType,
  byteLength: asset.byteLength,
  sha256: asset.sha256,
})) : []);

writeJson(outputPath, catalog);
writeJson(uploadPath, { schemaVersion: 1, catalogRevision: input.catalogRevision, uploads });
console.log(`Compiled ${packs.length} packs and ${uploads.length} files.`);
console.log(`Catalog: ${path.relative(repoRoot, outputPath)}`);
console.log(`Upload manifest: ${path.relative(repoRoot, uploadPath)}`);

function compilePack(definition) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) fail(`Invalid pack ID: ${definition.id}`);
  if (!['sticker', 'tape', 'note', 'mixed', 'frame', 'paper'].includes(definition.category)) fail(`Invalid frontend category for ${definition.id}`);
  if (Array.isArray(definition.remoteAssets)) return compileRemotePack(definition);
  const packDirectory = path.join(packsRoot, definition.sourceDirectory);
  const revision = definition.revision ?? '1';
  if (!/^\d+$/.test(revision)) fail(`Invalid revision for ${definition.id}`);
  // Stable pack IDs are intentionally independent from their R2 object prefix:
  // existing buckets retain the source-directory names visible in the CDN.
  const r2Directory = definition.r2Directory ?? definition.sourceDirectory;
  if (typeof r2Directory !== 'string' || !r2Directory || r2Directory.includes('/') || r2Directory === '.' || r2Directory === '..') fail(`Invalid R2 directory for ${definition.id}`);
  const itemsDirectory = path.join(packDirectory, 'items');
  if (!fs.existsSync(itemsDirectory)) fail(`Missing items directory for ${definition.id}: ${itemsDirectory}`);
  // A pack sheet is a browse-only cover. Prefer the generated JPEG so the R2
  // manifest does not accidentally publish the larger PNG source alongside it.
  const coverName = ['pack-sheet.jpg', 'pack-sheet.jpeg', 'pack-sheet.png', 'cover.jpg', 'cover.jpeg', 'cover.png'].find((name) => fs.existsSync(path.join(packDirectory, name)));
  if (!coverName) fail(`Missing cover for ${definition.id}.`);
  const names = fs.readdirSync(itemsDirectory).filter((name) => ['.png', '.jpg', '.jpeg'].includes(path.extname(name).toLowerCase())).sort(naturalCompare);
  if (!names.length) fail(`No items in ${definition.id}.`);
  const buildAsset = (filePath, itemId, role) => {
    const metadata = imageMetadata(filePath);
    const fileName = path.basename(filePath);
    return {
      role,
      itemId,
      reference: { id: `asset://pack/${definition.id}/${itemId}`, kind: 'image', revision },
      packRevision: revision,
      mimeType: metadata.mimeType,
      byteLength: metadata.byteLength,
      sha256: metadata.sha256,
      pixelSize: metadata.pixelSize,
      // Cloudflare caches query variants independently. The frozen catalog
      // revision makes an object URL immutable for clients even when a legacy
      // unversioned key had previously been cached at the edge.
      sourceUrl: `${remoteUrl(input.baseUrl, r2Directory, role === 'cover' ? fileName : 'items', role === 'cover' ? null : fileName)}?v=${encodeURIComponent(revision)}`,
      r2Path: `${r2Directory}/${role === 'cover' ? fileName : `items/${fileName}`}`,
      localPath: path.relative(repoRoot, filePath),
    };
  };
  return {
    id: definition.id,
    revision,
    status: definition.status ?? input.defaultPackStatus,
    name: definition.name,
    category: definition.category,
    semanticTags: definition.semanticTags ?? [],
    styles: definition.styles,
    visibility: definition.visibility ?? 'visible',
    // A pre-existing R2 package has no byte-for-byte freeze manifest until it
    // is republished. Keep it on the MIME-checked compatibility cache path.
    resolverMode: definition.resolverMode ?? (definition.uploadRequired === false ? 'compatibility' : 'strict'),
    sourceDirectory: definition.sourceDirectory,
    uploadRequired: definition.uploadRequired !== false,
    cover: buildAsset(path.join(packDirectory, coverName), 'cover', 'cover'),
    items: (() => {
      const itemIds = names.map(assetItemId);
      if (new Set(itemIds).size !== itemIds.length) fail(`Item filenames collapse to duplicate stable IDs in ${definition.id}.`);
      return names.map((name, index) => buildAsset(path.join(itemsDirectory, name), itemIds[index], 'item'));
    })(),
  };
}

function compileRemotePack(definition) {
  if (!definition.remoteAssets.length) fail(`No remote assets in ${definition.id}.`);
  const revision = definition.revision ?? '1';
  if (!/^\d+$/.test(revision)) fail(`Invalid revision for ${definition.id}`);
  const items = definition.remoteAssets.map((asset) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.itemId)) fail(`Invalid remote item ID in ${definition.id}: ${asset.itemId}`);
    if (!/^https:\/\//.test(asset.sourceUrl) || !asset.r2Path || asset.r2Path.startsWith('/') || asset.r2Path.includes('..')) fail(`Invalid remote URL or R2 path for ${definition.id}/${asset.itemId}`);
    if (!['image/png', 'image/jpeg'].includes(asset.mimeType) || !Number.isInteger(asset.byteLength) || asset.byteLength <= 0 || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.pixelSize?.width) || !Number.isInteger(asset.pixelSize?.height) || asset.pixelSize.width <= 0 || asset.pixelSize.height <= 0) fail(`Invalid remote metadata for ${definition.id}/${asset.itemId}`);
    return {
      role: 'item',
      itemId: asset.itemId,
      reference: { id: `asset://pack/${definition.id}/${asset.itemId}`, kind: 'image', revision },
      packRevision: revision,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
      pixelSize: asset.pixelSize,
      sourceUrl: versionedUrl(asset.sourceUrl, revision),
      r2Path: asset.r2Path,
      localPath: null,
    };
  });
  const coverItem = items[0];
  return {
    id: definition.id,
    revision,
    status: definition.status ?? input.defaultPackStatus,
    name: definition.name,
    category: definition.category,
    semanticTags: definition.semanticTags ?? [],
    styles: definition.styles,
    visibility: definition.visibility ?? 'visible',
    resolverMode: definition.resolverMode ?? 'strict',
    uploadRequired: false,
    cover: { ...coverItem, role: 'cover', itemId: 'cover', reference: { id: `asset://pack/${definition.id}/cover`, kind: 'image', revision: input.catalogRevision } },
    items,
  };
}

/** The runtime catalog must never disclose a developer machine path. */
function publicPack(pack) {
  const { cover, items, uploadRequired, ...metadata } = pack;
  return { ...metadata, cover: publicAsset(cover), items: items.map(publicAsset) };
}

function publicAsset(asset) {
  const { localPath, ...publicMetadata } = asset;
  return publicMetadata;
}

function imageMetadata(filePath) {
  const bytes = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const pixelSize = extension === '.png' ? pngSize(bytes, filePath) : jpegSize(bytes, filePath);
  return { mimeType: extension === '.png' ? 'image/png' : 'image/jpeg', byteLength: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), pixelSize };
}

function pngSize(bytes, filePath) {
  if (bytes.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) fail(`Invalid PNG: ${filePath}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes, filePath) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) fail(`Invalid JPEG marker: ${filePath}`);
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) fail(`Invalid JPEG length: ${filePath}`);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    offset += 2 + length;
  }
  fail(`JPEG dimensions unavailable: ${filePath}`);
}

function naturalCompare(a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }
/** Stable IDs must not inherit spaces, parentheses, or underscores from R2 filenames. */
function assetItemId(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const id = base.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail(`Cannot derive stable item ID from ${fileName}.`);
  return id;
}
function remoteUrl(baseUrl, ...segments) { return `${baseUrl}/${segments.filter((segment) => segment !== null).map((segment) => encodeURIComponent(segment)).join('/')}`; }
function versionedUrl(url, revision) { const parsed = new URL(url); parsed.searchParams.set('v', revision); return parsed.toString(); }
function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`); }
function fail(message) { throw new Error(message); }
