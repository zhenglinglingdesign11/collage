#!/usr/bin/env node
/* P1-T07: derive the offline bundle closure for every shipped template. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repoRoot, 'source-assets');
const generatedManifest = path.join(repoRoot, 'generated/template-bundle-dependencies.v1.json');
const generatedModule = path.join(repoRoot, 'apps/mobile/src/bundledTemplateDependencies.generated.ts');
const refKey = (reference) => `${reference.id}\u0000${reference.kind}\u0000${reference.revision}`;
const fail = (message) => { throw new Error(`Template bundle compilation failed: ${message}`); };
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
const write = (filePath, content) => { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, content); };
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const pngSize = (bytes, filePath) => {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail(`Invalid PNG: ${filePath}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
const jpegSize = (bytes, filePath) => {
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
};
const imageMetadata = (absolutePath) => {
  const bytes = fs.readFileSync(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(extension)) fail(`Unsupported bundle image: ${absolutePath}`);
  return {
    mimeType: extension === '.png' ? 'image/png' : 'image/jpeg',
    byteLength: bytes.length,
    sha256: sha256(bytes),
    pixelSize: extension === '.png' ? pngSize(bytes, absolutePath) : jpegSize(bytes, absolutePath),
  };
};
const filesUnder = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const absolutePath = path.join(directory, entry.name);
  return entry.isDirectory() ? filesUnder(absolutePath) : [absolutePath];
});

const catalog = readJson('generated/first-release-product-catalog.v1.json');
const descriptors = new Map();
catalog.packs.filter((pack) => pack.status === 'shipped' && pack.resolverMode === 'strict').forEach((pack) => {
  [pack.cover, ...pack.items].forEach((asset) => descriptors.set(refKey(asset.reference), { ...asset, packRevision: pack.revision }));
});

const templateDirectory = path.join(repoRoot, 'generated/template-recipes');
const templates = fs.readdirSync(templateDirectory)
  .filter((file) => file.endsWith('.template.json'))
  .sort()
  .map((file) => JSON.parse(fs.readFileSync(path.join(templateDirectory, file), 'utf8')));
if (templates.length !== 10) fail(`Expected 10 compiled templates, found ${templates.length}.`);
const dependencies = new Map();
templates.forEach((template) => {
  if (!Array.isArray(template.dependencies)) fail(`${template.id} has no dependency closure.`);
  template.dependencies.forEach((dependency) => {
    const reference = dependency.reference;
    if (dependency.availability !== 'bundled') fail(`${template.id} dependency ${reference?.id ?? '<unknown>'} is not bundle eligible.`);
    const key = refKey(reference);
    if (!descriptors.has(key)) fail(`${template.id} dependency ${reference.id}@${reference.revision} is absent from the strict shipped catalog.`);
    dependencies.set(key, reference);
  });
});

const localByHash = new Map();
filesUnder(sourceRoot).filter((file) => /\.(png|jpe?g)$/i.test(file)).forEach((absolutePath) => {
  const metadata = imageMetadata(absolutePath);
  const relativePath = path.relative(repoRoot, absolutePath).split(path.sep).join('/');
  const matches = localByHash.get(metadata.sha256) ?? [];
  matches.push({ relativePath, metadata });
  localByHash.set(metadata.sha256, matches);
});

const entries = [...dependencies.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, reference]) => {
  const descriptor = descriptors.get(key);
  const matches = localByHash.get(descriptor.sha256) ?? [];
  if (!matches.length) fail(`Missing exact local bytes for ${reference.id}@${reference.revision} (${descriptor.sha256}).`);
  // Locked copies win over generic source files: those copies exist only when
  // an upstream source was replaced after the Catalog was published.
  const candidate = matches.sort((left, right) => {
    const leftLocked = left.relativePath.includes('/template-bundle-locked/') ? 0 : 1;
    const rightLocked = right.relativePath.includes('/template-bundle-locked/') ? 0 : 1;
    return leftLocked - rightLocked || left.relativePath.localeCompare(right.relativePath);
  })[0];
  const metadata = candidate.metadata;
  if (metadata.mimeType !== descriptor.mimeType || metadata.byteLength !== descriptor.byteLength || metadata.sha256 !== descriptor.sha256
    || metadata.pixelSize.width !== descriptor.pixelSize.width || metadata.pixelSize.height !== descriptor.pixelSize.height) {
    fail(`Local integrity mismatch for ${reference.id}@${reference.revision}: ${candidate.relativePath}.`);
  }
  return { reference, sourcePath: candidate.relativePath, mimeType: metadata.mimeType, byteLength: metadata.byteLength, sha256: metadata.sha256, pixelSize: metadata.pixelSize };
});

const idToEntry = new Map();
entries.forEach((entry) => {
  const previous = idToEntry.get(entry.reference.id);
  if (previous && previous.sha256 !== entry.sha256) fail(`Reference ID ${entry.reference.id} maps to multiple immutable bytes.`);
  idToEntry.set(entry.reference.id, entry);
});

write(generatedManifest, `${JSON.stringify({ schemaVersion: 1, templateCount: templates.length, dependencyCount: entries.length, dependencies: entries }, null, 2)}\n`);
const appSourceDirectory = path.dirname(generatedModule);
const requirePathFor = (sourcePath) => {
  const relative = path.relative(appSourceDirectory, path.join(repoRoot, sourcePath)).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
};
const escape = (value) => JSON.stringify(value);
const moduleLines = [
  '/* This file is generated by scripts/compile-template-bundle-dependencies.js. Do not edit manually. */',
  "import type { BundledProductAssets } from './productAssetResolver';",
  '',
  'declare const require: (path: string) => number;',
  '',
  '/** Exact, integrity-checked local closure for all compiled first-release templates. */',
  'export const bundledTemplateDependencyModules: BundledProductAssets = {',
  ...[...idToEntry.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, entry]) => `  ${escape(id)}: require(${escape(requirePathFor(entry.sourcePath))}),`),
  '};',
  '',
];
write(generatedModule, moduleLines.join('\n'));
console.log(`Verified and generated the bundle closure for ${templates.length} templates (${entries.length} immutable assets).`);
