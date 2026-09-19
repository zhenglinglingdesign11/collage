import type { AssetReference, Draft } from './document';
import { isStableAssetReference } from './validation';

export const PORTABLE_PROJECT_FORMAT = 'journalcollage.portable-project' as const;
export const PORTABLE_PROJECT_FORMAT_VERSION = 1 as const;

export type PortableProjectIssueCode = 'invalid-envelope' | 'unsupported-version' | 'future-version' | 'unknown-field' | 'invalid-extension';
export type PortableProjectIssue = Readonly<{ code: PortableProjectIssueCode; path: string; message: string }>;
export type PortableEnvelopeMigration =
  | Readonly<{ ok: true; payload: Record<string, unknown>; migrated: boolean }>
  | Readonly<{ ok: false; issues: readonly PortableProjectIssue[] }>;

/**
 * Keeps envelope migration separate from Draft migration. v0 was the internal
 * pre-release shape (`draft`/`assets`); v1 is the published contract. Newer
 * versions are rejected rather than partially imported.
 */
export const migratePortableProjectEnvelope = (raw: unknown): PortableEnvelopeMigration => {
  if (!isRecord(raw) || raw.format !== PORTABLE_PROJECT_FORMAT || typeof raw.formatVersion !== 'number' || !Number.isInteger(raw.formatVersion)) return failure('invalid-envelope', '$', 'Missing Portable Project format or version.');
  if (raw.formatVersion > PORTABLE_PROJECT_FORMAT_VERSION) return failure('future-version', 'formatVersion', 'This Portable Project was created by a newer app version.');
  if (raw.formatVersion < 0) return failure('unsupported-version', 'formatVersion', 'Portable Project version is unsupported.');
  if (raw.formatVersion === 0) {
    const allowed = new Set(['format', 'formatVersion', 'projectId', 'draft', 'assets', 'requiredPackAssets', 'catalogDependencies', 'createdAt', 'updatedAt', 'exportedAt']);
    const unexpected = Object.keys(raw).find((key) => !allowed.has(key));
    if (unexpected) return failure('unknown-field', unexpected, 'Unknown field in v0 Portable Project.');
    if (!('draft' in raw) || !Array.isArray(raw.assets)) return failure('invalid-envelope', '$', 'v0 Portable Project is missing draft or assets.');
    return { ok: true, migrated: true, payload: { ...raw, formatVersion: 1, document: raw.draft, assetManifest: raw.assets, draft: undefined, assets: undefined } };
  }
  const allowed = new Set(['format', 'formatVersion', 'projectId', 'document', 'assetManifest', 'requiredPackAssets', 'catalogDependencies', 'createdAt', 'updatedAt', 'exportedAt', 'extensions']);
  const unexpected = Object.keys(raw).find((key) => !allowed.has(key));
  if (unexpected) return failure('unknown-field', unexpected, 'Unknown field in v1 Portable Project.');
  if (raw.extensions !== undefined && (!isRecord(raw.extensions) || Object.keys(raw.extensions).some((key) => !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/i.test(key)))) return failure('invalid-extension', 'extensions', 'Extension keys must use reverse-DNS namespaces.');
  return { ok: true, migrated: false, payload: raw };
};

const failure = (code: PortableProjectIssueCode, path: string, message: string): PortableEnvelopeMigration => ({ ok: false, issues: [{ code, path, message }] });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export type PortableAssetReference = Readonly<{
  id: string;
  kind: AssetReference['kind'];
  revision: string;
}>;

/** Normalizes legacy revision-less Draft references at the export boundary. */
export const portableAssetReference = (reference: AssetReference): PortableAssetReference => {
  if (!isStableAssetReference(reference)) throw new Error(`Portable Project cannot include an unstable asset reference: ${reference.id}`);
  return { id: reference.id, kind: reference.kind, revision: reference.revision ?? '1' };
};

/** Every asset location persisted by the current Draft schema. */
export const portableAssetReferencesForDraft = (draft: Draft): readonly PortableAssetReference[] => {
  const references: AssetReference[] = [];
  if (draft.canvas.backgroundAsset) references.push(draft.canvas.backgroundAsset);
  draft.layers.forEach((layer) => {
    if (layer.type === 'image' || layer.type === 'material') references.push(layer.asset);
    layer.effects.forEach((effect) => Object.values(effect.inputs ?? {}).forEach((reference) => references.push(reference)));
  });
  const seen = new Set<string>();
  return references.map(portableAssetReference).filter((reference) => {
    const key = `${reference.id}\u0000${reference.kind}\u0000${reference.revision}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const sha256HexForBytes = (input: Uint8Array): string => {
  const bitLength = input.length * 8;
  const paddedLength = (((input.length + 9 + 63) >> 6) << 6);
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(bytes.length - 4, bitLength >>> 0);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15]; const b = words[index - 2];
      words[index] = (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + words[index - 16] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)) + words[index - 7];
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choose = (e & f) ^ (~e & g);
      const constant = SHA256_CONSTANTS[index];
      const temp1 = h + s1 + choose + constant + words[index];
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = s0 + majority;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, (value) => value.toString(16).padStart(8, '0')).join('');
};

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
