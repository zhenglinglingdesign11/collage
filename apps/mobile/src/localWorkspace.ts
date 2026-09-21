import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import { brushDefinitionsById, emptyAssetCatalog, getTextFont, remoteAssetPacks, upsertAsset, type AssetCatalog, type LocalAssetRecord, type RemotePackItem } from '@journalcollage/asset-system';
import { isCompatibilityProductAssetReference, isShippedProductAssetReference, productCatalogAssetForReference, shippedProductAssetCatalog, shippedProductAssetResolver } from './shippedProductAssetCatalog';
import { clearResolvedVerifiedProductAssetUris } from './productAssetResolver';
import { clearVerifiedRemoteAssetCache, getVerifiedRemoteCacheSummary, pruneVerifiedRemoteAssetCache } from './verifiedRemoteAssetCache';
import { createStableId, migrateDraft, migratePortableProjectEnvelope, PORTABLE_PROJECT_FORMAT, PORTABLE_PROJECT_FORMAT_VERSION, portableAssetReference, portableAssetReferencesForDraft, sha256HexForBytes, type AssetReference, type Draft, type PortableAssetReference, type PortableProjectIssue } from '@journalcollage/editor-core';

const root = `${FileSystem.documentDirectory}journalcollage/`;
const assetDirectory = `${root}assets/`;
const remoteCacheDirectory = `${root}remote-cache/`;
const workspaceUri = `${root}workspace.json`;
const remoteCacheIndexUri = `${root}remote-cache-index.json`;
const savedDraftDirectory = `${root}saved-drafts/`;
const savedDraftIndexUri = `${root}saved-drafts-index.json`;
const portableProjectDirectory = `${root}portable-projects/`;
const importedAssetDirectory = `${root}imported-project-assets/`;
const homeShowcaseManifestUri = (market: string): string => `${root}home-showcase-manifest-${market.replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`;
const MAX_SAVED_DRAFTS = 20;
const DOWNLOAD_CACHE_LIMIT_BYTES = 250 * 1024 * 1024;

type RemoteCacheEntry = Readonly<{ key: string; source: string; uri: string; lastAccessedAt: string }>;
type RemoteCacheIndex = Readonly<{ version: 1; entries: readonly RemoteCacheEntry[] }>;
let remoteCacheIndex: RemoteCacheIndex | null = null;
const pendingRemoteDownloads = new Map<string, Promise<string>>();
/** Avoid a disk round-trip (and a blank first frame) when a drawer view remounts. */
const resolvedRemoteUris = new Map<string, string>();

/** Workspace-only lifecycle metadata; it deliberately never enters Draft. */
export type StoredWorkspace = Readonly<{ draft: Draft; catalog: AssetCatalog; savedAt?: string }>;
export type SavedDraft = Readonly<{ id: string; savedAt: string; workspace: StoredWorkspace }>;
type SavedDraftIndex = Readonly<{ version: 1; drafts: readonly Readonly<{ id: string; savedAt: string }>[] }>;

type StoredWorkspacePayload = Readonly<{ draft: unknown; catalog: AssetCatalog; savedAt?: unknown }>;
export type CachedHomeShowcaseManifest = Readonly<{ payload: unknown; etag: string | null; cachedAt: string }>;

type PortableOwnership = 'user' | 'generated' | 'catalog';
type PortableManifestEntry = Readonly<{
  reference: PortableAssetReference;
  ownership: PortableOwnership;
  required: boolean;
  content?: Readonly<{ relativePath: string; mimeType: string; byteLength: number; sha256: string }>;
  pixelSize?: Readonly<{ width: number; height: number }>;
  source?: Readonly<{ type: 'imported' | 'generated' }>;
}>;
type PortableProjectPayload = Readonly<{
  format: typeof PORTABLE_PROJECT_FORMAT;
  formatVersion: typeof PORTABLE_PROJECT_FORMAT_VERSION;
  projectId: string;
  document: Draft;
  assetManifest: readonly PortableManifestEntry[];
  requiredPackAssets: readonly Readonly<{ packId: string; packRevision: string; itemReference: PortableAssetReference }>[];
  catalogDependencies: Readonly<{ fonts: readonly Readonly<{ fontId: string; fontVariantId: string; revision: string }>[]; brushes: readonly Readonly<{ id: string; revision: string }>[] }>;
  createdAt: string;
  updatedAt: string;
  exportedAt: string;
}>;
export type PortableProjectExport = Readonly<{ directoryUri: string; projectUri: string; project: PortableProjectPayload }>;
type PortablePayloadWithBytes = Readonly<{ entry: PortableManifestEntry; base64: string }>;
export type PortableProjectImportErrorCode = 'invalid-json' | 'invalid-schema' | 'unsupported-version' | 'future-version' | 'missing-resource' | 'resource-size-mismatch' | 'resource-hash-mismatch' | 'destination-exists';
export class PortableProjectImportError extends Error {
  readonly code: PortableProjectImportErrorCode;
  readonly issues: readonly PortableProjectIssue[];
  constructor(code: PortableProjectImportErrorCode, message: string, issues: readonly PortableProjectIssue[] = []) {
    super(message);
    this.name = 'PortableProjectImportError';
    this.code = code;
    this.issues = issues;
  }
}

const ensureDirectories = async (): Promise<void> => {
  await FileSystem.makeDirectoryAsync(assetDirectory, { intermediates: true });
  await FileSystem.makeDirectoryAsync(remoteCacheDirectory, { intermediates: true });
  await FileSystem.makeDirectoryAsync(savedDraftDirectory, { intermediates: true });
};

const ensurePortableDirectories = async (): Promise<void> => {
  await FileSystem.makeDirectoryAsync(portableProjectDirectory, { intermediates: true });
  await FileSystem.makeDirectoryAsync(importedAssetDirectory, { intermediates: true });
};

/** Product configuration is cached separately from Drafts and image assets. */
export const loadCachedHomeShowcaseManifest = async (market: string): Promise<CachedHomeShowcaseManifest | null> => {
  const uri = homeShowcaseManifestUri(market);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return null;
  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 })) as { version?: unknown; payload?: unknown; etag?: unknown; cachedAt?: unknown };
    if (parsed.version !== 1 || parsed.payload === undefined || typeof parsed.cachedAt !== 'string') return null;
    return { payload: parsed.payload, etag: typeof parsed.etag === 'string' ? parsed.etag : null, cachedAt: parsed.cachedAt };
  } catch { return null; }
};

export const saveCachedHomeShowcaseManifest = async (market: string, payload: unknown, etag: string | null): Promise<void> => {
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  await FileSystem.writeAsStringAsync(homeShowcaseManifestUri(market), JSON.stringify({ version: 1, payload, etag, cachedAt: new Date().toISOString() }), { encoding: FileSystem.EncodingType.UTF8 });
};

const loadRemoteCacheIndex = async (): Promise<RemoteCacheIndex> => {
  if (remoteCacheIndex !== null) return remoteCacheIndex;
  const info = await FileSystem.getInfoAsync(remoteCacheIndexUri);
  if (!info.exists) return (remoteCacheIndex = { version: 1, entries: [] });
  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(remoteCacheIndexUri, { encoding: FileSystem.EncodingType.UTF8 })) as RemoteCacheIndex;
    return (remoteCacheIndex = parsed.version === 1 && Array.isArray(parsed.entries) ? parsed : { version: 1, entries: [] });
  } catch {
    return (remoteCacheIndex = { version: 1, entries: [] });
  }
};

const saveRemoteCacheIndex = async (entries: readonly RemoteCacheEntry[]): Promise<void> => {
  remoteCacheIndex = { version: 1, entries };
  await FileSystem.writeAsStringAsync(remoteCacheIndexUri, JSON.stringify(remoteCacheIndex), { encoding: FileSystem.EncodingType.UTF8 });
};

const cacheFileExtension = (source: string): string => /\.(?:jpe?g)(?:\?|$)/i.test(source) ? 'jpg' : /\.webp(?:\?|$)/i.test(source) ? 'webp' : 'png';
const remoteCacheMemoryKey = (key: string, source: string): string => `${key}\u0000${source}`;

/** Returns a URI only when it was resolved during this app session; it never does I/O. */
export const resolvedRemoteResourceUri = (key: string, source: string): string | undefined => resolvedRemoteUris.get(remoteCacheMemoryKey(key, source));

/** Shared preview cache for covers and thumbnails. It is deliberately separate from a Draft's asset catalog. */
export const cacheRemoteResource = async (key: string, source: string, options: Readonly<{ requireImageMime?: boolean }> = {}): Promise<string> => {
  if (source.startsWith('data:')) return source;
  const memoryKey = remoteCacheMemoryKey(key, source);
  const resolved = resolvedRemoteUris.get(memoryKey);
  if (resolved !== undefined) return resolved;
  const existingPending = pendingRemoteDownloads.get(key);
  if (existingPending) return existingPending;
  const operation = (async () => {
    await ensureDirectories();
    const index = await loadRemoteCacheIndex();
    const entry = index.entries.find((candidate) => candidate.key === key && candidate.source === source);
    if (entry) {
      const info = await FileSystem.getInfoAsync(entry.uri);
      if (info.exists) {
        resolvedRemoteUris.set(memoryKey, entry.uri);
        void saveRemoteCacheIndex(index.entries.map((candidate) => candidate.key === key ? { ...candidate, lastAccessedAt: new Date().toISOString() } : candidate));
        return entry.uri;
      }
    }
    const filename = `${key.replace(/[^a-zA-Z0-9_-]+/g, '_')}.${cacheFileExtension(source)}`;
    const uri = `${remoteCacheDirectory}${filename}`;
    const result = await FileSystem.downloadAsync(source, uri);
    const contentType = Object.entries(result.headers ?? {}).find(([header]) => header.toLowerCase() === 'content-type')?.[1]?.split(';', 1)[0]?.trim().toLowerCase();
    if (result.status < 200 || result.status >= 300 || (options.requireImageMime && contentType !== 'image/png' && contentType !== 'image/jpeg')) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      throw new Error(`Remote image is unavailable or has an invalid MIME type: ${source}`);
    }
    await saveRemoteCacheIndex([
      ...index.entries.filter((candidate) => candidate.key !== key),
      { key, source, uri: result.uri, lastAccessedAt: new Date().toISOString() },
    ]);
    resolvedRemoteUris.set(memoryKey, result.uri);
    return result.uri;
  })();
  pendingRemoteDownloads.set(key, operation);
  try {
    return await operation;
  } finally {
    pendingRemoteDownloads.delete(key);
  }
};

export type DownloadCacheSummary = Readonly<{ bytes: number; files: number }>;

/**
 * Only files that can be fetched again belong here. Draft JSON, user-imported
 * photos and exported images intentionally remain outside this operation.
 */
export const getDownloadCacheSummary = async (): Promise<DownloadCacheSummary> => {
  const uris: string[] = [];
  const cachedFiles = await FileSystem.readDirectoryAsync(remoteCacheDirectory).catch(() => []);
  uris.push(...cachedFiles.map((name) => `${remoteCacheDirectory}${name}`));
  const rootFiles = await FileSystem.readDirectoryAsync(root).catch(() => []);
  rootFiles.filter((name) => name === 'remote-cache-index.json' || /^home-showcase-manifest-[a-zA-Z0-9_-]+\.json$/.test(name))
    .forEach((name) => uris.push(`${root}${name}`));
  const infos = await Promise.all(uris.map((uri) => FileSystem.getInfoAsync(uri).catch(() => null)));
  const compatibility = infos.reduce<DownloadCacheSummary>((summary, info) => info?.exists
    ? { bytes: summary.bytes + (typeof info.size === 'number' ? info.size : 0), files: summary.files + 1 }
    : summary, { bytes: 0, files: 0 });
  const strict = await getVerifiedRemoteCacheSummary();
  return { bytes: compatibility.bytes + strict.bytes, files: compatibility.files + strict.files };
};

/** Clears the re-downloadable preview/configuration cache, never user work. */
export const clearDownloadCache = async (): Promise<DownloadCacheSummary> => {
  const before = await getDownloadCacheSummary();
  await FileSystem.deleteAsync(remoteCacheDirectory, { idempotent: true });
  await FileSystem.deleteAsync(remoteCacheIndexUri, { idempotent: true });
  const rootFiles = await FileSystem.readDirectoryAsync(root).catch(() => []);
  await Promise.all(rootFiles
    .filter((name) => /^home-showcase-manifest-[a-zA-Z0-9_-]+\.json$/.test(name))
    .map((name) => FileSystem.deleteAsync(`${root}${name}`, { idempotent: true })));
  await clearVerifiedRemoteAssetCache();
  clearResolvedVerifiedProductAssetUris();
  remoteCacheIndex = null;
  resolvedRemoteUris.clear();
  return before;
};

const productReferencesForWorkspace = (workspace: StoredWorkspace): readonly Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>[] =>
  [workspace.draft.canvas.backgroundAsset, ...workspace.draft.layers.flatMap((layer) => 'asset' in layer ? [layer.asset] : [])]
    .map(requiredReference)
    .filter((reference): reference is Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>> => reference !== null);

/** Reclaims only re-downloadable entries. Current and saved-work material references remain protected. */
export const pruneDownloadCache = async (currentWorkspace?: StoredWorkspace): Promise<DownloadCacheSummary> => {
  const saved = await loadSavedDrafts();
  const protectedReferences = [
    ...(currentWorkspace ? productReferencesForWorkspace(currentWorkspace) : []),
    ...saved.flatMap((draft) => productReferencesForWorkspace(draft.workspace)),
  ];
  const protectedReferenceKeys = new Set(protectedReferences.map((reference) => `${reference.id}\u0000${reference.kind}\u0000${reference.revision}`));
  const protectedReferenceIds = new Set(protectedReferences.map((reference) => reference.id));
  const index = await loadRemoteCacheIndex();
  const entries = await Promise.all(index.entries.map(async (entry) => ({ entry, info: await FileSystem.getInfoAsync(entry.uri).catch(() => null) })));
  const cacheEntryBytes = (info: Awaited<ReturnType<typeof FileSystem.getInfoAsync>> | null): number =>
    info?.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  let compatibilityBytes = entries.reduce((sum, candidate) => sum + cacheEntryBytes(candidate.info), 0);
  const strict = await getVerifiedRemoteCacheSummary();
  const removable = entries
    .filter((candidate) => candidate.info?.exists && !protectedReferenceIds.has(candidate.entry.key.startsWith('item-') ? candidate.entry.key.slice('item-'.length) : ''))
    .sort((left, right) => left.entry.lastAccessedAt.localeCompare(right.entry.lastAccessedAt));
  const removedKeys = new Set<string>();
  for (const candidate of removable) {
    if (compatibilityBytes + strict.bytes <= DOWNLOAD_CACHE_LIMIT_BYTES) break;
    await FileSystem.deleteAsync(candidate.entry.uri, { idempotent: true });
    compatibilityBytes -= cacheEntryBytes(candidate.info);
    removedKeys.add(candidate.entry.key);
  }
  await saveRemoteCacheIndex(index.entries.filter((entry) => !removedKeys.has(entry.key)));
  await pruneVerifiedRemoteAssetCache(Math.max(0, DOWNLOAD_CACHE_LIMIT_BYTES - Math.max(0, compatibilityBytes)), protectedReferenceKeys);
  return getDownloadCacheSummary();
};

export const importLocalImage = async (input: { uri: string; width: number; height: number; mimeType: string | null }): Promise<LocalAssetRecord> => {
  await ensureDirectories();
  const id = createStableId('user-image');
  const extension = input.mimeType === 'image/png' ? 'png' : 'jpg';
  const originalUri = `${assetDirectory}${id}.${extension}`;
  await FileSystem.copyAsync({ from: input.uri, to: originalUri });
  return {
    reference: { id: `user://image/${id}`, kind: 'image', revision: '1' },
    originalUri,
    width: input.width,
    height: input.height,
    mimeType: input.mimeType,
    createdAt: new Date().toISOString(),
  };
};

/** Resolves a remote R2 asset to an app-private cache without leaking its URL into Draft. */
export const cacheRemotePackItem = async (item: RemotePackItem, catalog: AssetCatalog, options: Readonly<{ verifiedUri?: string }> = {}): Promise<LocalAssetRecord> => {
  if (item.procedural) {
    const originalUri = item.sticker?.textureSource
      ? await cacheRemoteResource(`texture-${item.reference.id}`, item.sticker.textureSource)
      : item.source;
    return { reference: item.reference, originalUri, width: item.width, height: item.height, mimeType: item.sticker?.textureSource ? 'image/png' : 'image/svg+xml', createdAt: new Date().toISOString() };
  }
  const existing = catalog.assets.find((asset) => asset.reference.id === item.reference.id);
  if (existing) {
    const info = await FileSystem.getInfoAsync(existing.originalUri);
    if (info.exists) return existing;
  }

  const originalUri = options.verifiedUri ?? await cacheRemoteResource(`item-${item.reference.id}`, item.source, { requireImageMime: true });
  return {
    reference: item.reference,
    originalUri,
    width: item.width,
    height: item.height,
    mimeType: 'image/png',
    createdAt: new Date().toISOString(),
  };
};

export type ProductAssetRecoveryFailure = Readonly<{ reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>; reason: string }>;
export type ProductAssetRecoveryResult = Readonly<{ workspace: StoredWorkspace; failures: readonly ProductAssetRecoveryFailure[] }>;

const requiredReference = (reference: AssetReference | undefined): Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>> | null =>
  reference?.revision ? { id: reference.id, kind: reference.kind, revision: reference.revision } : null;

/** Restores only product assets actually used by this saved Draft; it never mutates the Draft itself. */
export const recoverWorkspaceProductAssets = async (workspace: StoredWorkspace): Promise<ProductAssetRecoveryResult> => {
  const references = [workspace.draft.canvas.backgroundAsset, ...workspace.draft.layers.flatMap((layer) => 'asset' in layer ? [layer.asset] : [])]
    .map(requiredReference)
    .filter((reference): reference is Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>> => reference !== null);
  const unique = [...new Map(references.map((reference) => [`${reference.id}\u0000${reference.kind}\u0000${reference.revision}`, reference])).values()]
    .filter((reference) => isShippedProductAssetReference(reference) || isCompatibilityProductAssetReference(reference));
  let catalog = workspace.catalog;
  const failures: ProductAssetRecoveryFailure[] = [];
  for (let start = 0; start < unique.length; start += 3) {
    const batch = await Promise.all(unique.slice(start, start + 3).map(async (reference) => {
      const existing = catalog.assets.find((asset) => asset.reference.id === reference.id && asset.reference.kind === reference.kind && asset.reference.revision === reference.revision);
      if (existing && (await FileSystem.getInfoAsync(existing.originalUri)).exists) return { reference, record: existing };
      try {
        const descriptor = productCatalogAssetForReference(reference);
        if (!descriptor) throw new Error('Material is unavailable in the shipped catalog.');
        const originalUri = isShippedProductAssetReference(reference)
          ? (await shippedProductAssetResolver.resolve(reference)).uri
          : await cacheRemoteResource(`item-${reference.id}`, descriptor.sourceUrl, { requireImageMime: true });
        return { reference, record: { reference, originalUri, width: descriptor.pixelSize.width, height: descriptor.pixelSize.height, mimeType: descriptor.mimeType, createdAt: new Date().toISOString() } satisfies LocalAssetRecord };
      } catch (error) {
        return { reference, failure: error instanceof Error ? error.message : 'Material could not be restored.' };
      }
    }));
    batch.forEach((result) => {
      if ('record' in result && result.record !== undefined) catalog = upsertAsset(catalog, result.record);
      else failures.push({ reference: result.reference, reason: result.failure });
    });
  }
  return { workspace: { ...workspace, catalog }, failures };
};

const existingSavedAt = async (): Promise<string | undefined> => {
  const info = await FileSystem.getInfoAsync(workspaceUri);
  if (!info.exists) return undefined;
  try {
    const payload = JSON.parse(await FileSystem.readAsStringAsync(workspaceUri, { encoding: FileSystem.EncodingType.UTF8 })) as StoredWorkspacePayload;
    return typeof payload.savedAt === 'string' ? payload.savedAt : undefined;
  } catch {
    return undefined;
  }
};

const savedDraftUri = (id: string): string => `${savedDraftDirectory}${id.replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`;
const readSavedDraftIndex = async (): Promise<SavedDraftIndex> => {
  const info = await FileSystem.getInfoAsync(savedDraftIndexUri);
  if (!info.exists) return { version: 1, drafts: [] };
  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(savedDraftIndexUri, { encoding: FileSystem.EncodingType.UTF8 })) as SavedDraftIndex;
    return parsed.version === 1 && Array.isArray(parsed.drafts) ? parsed : { version: 1, drafts: [] };
  } catch {
    return { version: 1, drafts: [] };
  }
};
const writeSavedDraftIndex = async (drafts: SavedDraftIndex['drafts']): Promise<void> => {
  await FileSystem.writeAsStringAsync(savedDraftIndexUri, JSON.stringify({ version: 1, drafts }), { encoding: FileSystem.EncodingType.UTF8 });
};
const parseStoredWorkspace = (raw: string): StoredWorkspace | null => {
  try {
    const parsed = JSON.parse(raw) as StoredWorkspacePayload;
    if (!parsed.draft || !parsed.catalog || parsed.catalog.version !== 1 || !Array.isArray(parsed.catalog.assets)) return null;
    const migration = migrateDraft(parsed.draft);
    return migration.ok ? { draft: migration.draft, catalog: parsed.catalog, ...(typeof parsed.savedAt === 'string' ? { savedAt: parsed.savedAt } : {}) } : null;
  } catch { return null; }
};

const saveExplicitDraft = async (workspace: StoredWorkspace, savedAt: string): Promise<void> => {
  const id = workspace.draft.id;
  await FileSystem.writeAsStringAsync(savedDraftUri(id), JSON.stringify({ draft: workspace.draft, catalog: workspace.catalog, savedAt }), { encoding: FileSystem.EncodingType.UTF8 });
  const index = await readSavedDraftIndex();
  const ordered = [{ id, savedAt }, ...index.drafts.filter((entry) => entry.id !== id)].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const retained = ordered.slice(0, MAX_SAVED_DRAFTS);
  await Promise.all(ordered.slice(MAX_SAVED_DRAFTS).map((entry) => FileSystem.deleteAsync(savedDraftUri(entry.id), { idempotent: true })));
  await writeSavedDraftIndex(retained);
};

/** True only when saving this draft would create entry 21 and prune the oldest one. */
export const wouldPruneOldestSavedDraft = async (draftId: string): Promise<boolean> => {
  const index = await readSavedDraftIndex();
  return !index.drafts.some((entry) => entry.id === draftId) && index.drafts.length >= MAX_SAVED_DRAFTS;
};

/** A checkpoint preserves prior saved status; only an explicit user save marks a recent creation. */
export const saveWorkspace = async (workspace: StoredWorkspace, options: Readonly<{ markAsSaved?: boolean }> = {}): Promise<void> => {
  await ensureDirectories();
  const savedAt = options.markAsSaved ? new Date().toISOString() : workspace.savedAt ?? await existingSavedAt();
  const payload: StoredWorkspace = savedAt === undefined ? { draft: workspace.draft, catalog: workspace.catalog } : { draft: workspace.draft, catalog: workspace.catalog, savedAt };
  await FileSystem.writeAsStringAsync(workspaceUri, JSON.stringify(payload), { encoding: FileSystem.EncodingType.UTF8 });
  if (options.markAsSaved) {
    await saveExplicitDraft(payload, savedAt!);
    void pruneDownloadCache(payload).catch(() => undefined);
  }
};

export const loadWorkspace = async (): Promise<StoredWorkspace | null> => {
  const info = await FileSystem.getInfoAsync(workspaceUri);
  if (!info.exists) return null;
  const raw = await FileSystem.readAsStringAsync(workspaceUri, { encoding: FileSystem.EncodingType.UTF8 });
  return parseStoredWorkspace(raw);
};

/** Returns only explicitly saved works, newest first. Legacy saved workspace is imported once. */
export const loadSavedDrafts = async (): Promise<readonly SavedDraft[]> => {
  await ensureDirectories();
  let index = await readSavedDraftIndex();
  if (index.drafts.length === 0) {
    const legacy = await loadWorkspace();
    if (legacy?.savedAt) {
      await saveExplicitDraft(legacy, legacy.savedAt);
      index = await readSavedDraftIndex();
    }
  }
  const drafts = await Promise.all(index.drafts.map(async (entry) => {
    const info = await FileSystem.getInfoAsync(savedDraftUri(entry.id));
    if (!info.exists) return null;
    const workspace = parseStoredWorkspace(await FileSystem.readAsStringAsync(savedDraftUri(entry.id), { encoding: FileSystem.EncodingType.UTF8 }));
    return workspace === null ? null : { id: entry.id, savedAt: entry.savedAt, workspace };
  }));
  const valid = drafts.filter((draft): draft is SavedDraft => draft !== null);
  if (valid.length !== index.drafts.length) await writeSavedDraftIndex(valid.map((draft) => ({ id: draft.id, savedAt: draft.savedAt })));
  return valid;
};

/**
 * A tiny synchronous read for initial home layout only. `null` means a legacy
 * workspace or corrupt index needs the normal asynchronous migration path.
 */
export const hasSavedDraftsSync = (): boolean | null => {
  try {
    const indexFile = new File(savedDraftIndexUri);
    if (!indexFile.exists) return new File(workspaceUri).exists ? null : false;
    const parsed = JSON.parse(indexFile.textSync()) as { version?: unknown; drafts?: unknown };
    return parsed.version === 1 && Array.isArray(parsed.drafts) ? parsed.drafts.length > 0 : null;
  } catch { return null; }
};

export const loadSavedDraft = async (id: string): Promise<StoredWorkspace | null> => {
  const info = await FileSystem.getInfoAsync(savedDraftUri(id));
  return info.exists ? parseStoredWorkspace(await FileSystem.readAsStringAsync(savedDraftUri(id), { encoding: FileSystem.EncodingType.UTF8 })) : null;
};

export const saveExportPng = async (base64: string): Promise<string> => {
  await ensureDirectories();
  const uri = `${root}${createStableId('export')}.png`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
};

const mimeForRecord = (record: LocalAssetRecord): string => record.mimeType ?? 'image/jpeg';
const extensionForMime = (mimeType: string): string => mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
const ownershipForReference = (reference: PortableAssetReference): PortableOwnership =>
  reference.id.startsWith('user://') ? 'user' : reference.id.startsWith('generated://') ? 'generated' : 'catalog';
const manifestKey = (reference: PortableAssetReference): string => `${reference.id}\u0000${reference.kind}\u0000${reference.revision}`;
const isSafePortableRelativePath = (value: string): boolean => value.startsWith('resources/')
  && value.length > 'resources/'.length
  && !value.includes('..')
  && !value.includes('\\')
  && !value.startsWith('/')
  && !/^[a-z][a-z0-9+.-]*:/i.test(value);

const bytesFromBase64 = (value: string): Uint8Array => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let index = 0; index < clean.length; index += 4) {
    const a = alphabet.indexOf(clean[index]); const b = alphabet.indexOf(clean[index + 1]);
    const c = clean[index + 2] === '=' ? -1 : alphabet.indexOf(clean[index + 2]);
    const d = clean[index + 3] === '=' ? -1 : alphabet.indexOf(clean[index + 3]);
    if (a < 0 || b < 0 || c < -1 || d < -1) throw new Error('Resource is not valid base64.');
    bytes.push((a << 2) | (b >> 4));
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) bytes.push(((c & 3) << 6) | d);
  }
  return new Uint8Array(bytes);
};

const packRequirementFor = (reference: PortableAssetReference): Readonly<{ packId: string; packRevision: string; itemReference: PortableAssetReference }> | null => {
  const match = /^asset:\/\/pack\/([^/]+)\//.exec(reference.id);
  if (!match) return null;
  const pack = shippedProductAssetCatalog.packs.find((candidate) => candidate.id === match[1])
    ?? remoteAssetPacks.find((candidate) => candidate.id === match[1]);
  if (!pack) throw new Error(`Required material pack is unavailable: ${match[1]}`);
  return { packId: pack.id, packRevision: pack.revision, itemReference: reference };
};

const catalogDependenciesFor = (draft: Draft): PortableProjectPayload['catalogDependencies'] => {
  const fonts = new Map<string, Readonly<{ fontId: string; fontVariantId: string; revision: string }>>();
  const brushes = new Map<string, Readonly<{ id: string; revision: string }>>();
  draft.layers.forEach((layer) => {
    if (layer.type === 'text') {
      const font = getTextFont(layer.fontVariantId);
      fonts.set(`${layer.fontId}\u0000${layer.fontVariantId}`, { fontId: layer.fontId, fontVariantId: layer.fontVariantId, revision: font.reference.revision ?? '1' });
    }
    if (layer.type === 'brush') layer.strokes.forEach((stroke) => {
      const revision = brushDefinitionsById[stroke.brushId]?.revision ?? stroke.brushRevision;
      brushes.set(`${stroke.brushId}\u0000${revision}`, { id: stroke.brushId, revision });
    });
  });
  return { fonts: [...fonts.values()], brushes: [...brushes.values()] };
};

/**
 * Serializes one local workspace into a portable directory without copying its
 * AssetCatalog or any device URI. The caller can later package this directory
 * for backup or transfer; this function performs no network I/O.
 */
export const exportPortableProject = async (workspace: StoredWorkspace, parentDirectoryUri = portableProjectDirectory): Promise<PortableProjectExport> => {
  const migration = migrateDraft(workspace.draft);
  if (!migration.ok) throw new Error(`Draft cannot be exported: ${migration.issues[0]?.message ?? 'invalid document'}`);
  const draft = migration.draft;
  await ensurePortableDirectories();
  await FileSystem.makeDirectoryAsync(parentDirectoryUri, { intermediates: true });
  const directoryUri = `${parentDirectoryUri}${draft.id}-${createStableId('portable')}/`;
  const stagingUri = `${directoryUri.slice(0, -1)}.staging/`;
  const resourcesUri = `${stagingUri}resources/`;
  const records = new Map(workspace.catalog.assets.map((record) => [record.reference.id, record]));
  const payloads: PortablePayloadWithBytes[] = [];
  const assetManifest = await Promise.all(portableAssetReferencesForDraft(draft).map(async (reference, index): Promise<PortableManifestEntry> => {
    const ownership = ownershipForReference(reference);
    if (ownership === 'catalog') return { reference, ownership, required: true };
    const record = records.get(reference.id);
    if (!record) throw new Error(`Portable Project is missing local bytes for ${reference.id}`);
    if (!record.originalUri.startsWith('file://')) throw new Error(`Portable Project cannot embed a non-file resource: ${reference.id}`);
    const info = await FileSystem.getInfoAsync(record.originalUri);
    if (!info.exists || typeof info.size !== 'number') throw new Error(`Portable Project source is unavailable: ${reference.id}`);
    const base64 = await FileSystem.readAsStringAsync(record.originalUri, { encoding: FileSystem.EncodingType.Base64 });
    const mimeType = mimeForRecord(record);
    const entry: PortableManifestEntry = {
      reference,
      ownership,
      required: true,
      content: { relativePath: `resources/${index}.${extensionForMime(mimeType)}`, mimeType, byteLength: info.size, sha256: sha256HexForBytes(bytesFromBase64(base64)) },
      pixelSize: { width: record.width, height: record.height },
      source: { type: ownership === 'generated' ? 'generated' : 'imported' },
    };
    payloads.push({ entry, base64 });
    return entry;
  }));
  const requirements = portableAssetReferencesForDraft(draft).map(packRequirementFor).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const requiredPackAssets = requirements.filter((entry, index, all) => all.findIndex((candidate) => manifestKey(candidate.itemReference) === manifestKey(entry.itemReference)) === index);
  const project: PortableProjectPayload = {
    format: PORTABLE_PROJECT_FORMAT,
    formatVersion: PORTABLE_PROJECT_FORMAT_VERSION,
    projectId: draft.id,
    document: draft,
    assetManifest,
    requiredPackAssets,
    catalogDependencies: catalogDependenciesFor(draft),
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    exportedAt: new Date().toISOString(),
  };
  await FileSystem.makeDirectoryAsync(resourcesUri, { intermediates: true });
  try {
    await Promise.all(payloads.map(({ entry, base64 }) => FileSystem.writeAsStringAsync(`${stagingUri}${entry.content!.relativePath}`, base64, { encoding: FileSystem.EncodingType.Base64 })));
    await FileSystem.writeAsStringAsync(`${stagingUri}project.json`, JSON.stringify(project), { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.moveAsync({ from: stagingUri, to: directoryUri });
  } catch (error) {
    await FileSystem.deleteAsync(stagingUri, { idempotent: true }).catch(() => {});
    throw error;
  }
  return { directoryUri, projectUri: `${directoryUri}project.json`, project };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const importError = (code: PortableProjectImportErrorCode, message: string, issues: readonly PortableProjectIssue[] = []): PortableProjectImportError => new PortableProjectImportError(code, message, issues);
const isRfc3339Utc = (value: unknown): value is string => typeof value === 'string' && /Z$/.test(value) && Number.isFinite(Date.parse(value));
const assertClosedObject = (value: unknown, allowed: readonly string[], path: string): Record<string, unknown> => {
  if (!isRecord(value)) throw importError('invalid-schema', `${path} must be an object.`);
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw importError('invalid-schema', `${path}.${unexpected} is not supported.`);
  return value;
};
const validateManifestEntry = (value: unknown): PortableManifestEntry => {
  const entry = assertClosedObject(value, ['reference', 'ownership', 'required', 'content', 'pixelSize', 'source'], 'assetManifest[]');
  const reference = portableAssetReference(assertClosedObject(entry.reference, ['id', 'kind', 'revision'], 'assetManifest[].reference') as PortableAssetReference);
  if (entry.ownership !== 'user' && entry.ownership !== 'generated' && entry.ownership !== 'catalog') throw importError('invalid-schema', `Unsupported asset ownership for ${reference.id}.`);
  if (entry.required !== true) throw importError('invalid-schema', `Asset requirement is invalid for ${reference.id}.`);
  let content: PortableManifestEntry['content'];
  if (entry.content !== undefined) {
    const raw = assertClosedObject(entry.content, ['relativePath', 'mimeType', 'byteLength', 'sha256'], 'assetManifest[].content');
    if (typeof raw.relativePath !== 'string' || !isSafePortableRelativePath(raw.relativePath) || typeof raw.mimeType !== 'string' || typeof raw.byteLength !== 'number' || !Number.isInteger(raw.byteLength) || raw.byteLength < 0 || typeof raw.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(raw.sha256)) throw importError('invalid-schema', `Embedded resource metadata is invalid for ${reference.id}.`);
    content = { relativePath: raw.relativePath, mimeType: raw.mimeType, byteLength: raw.byteLength, sha256: raw.sha256 };
  }
  if ((entry.ownership === 'user' || entry.ownership === 'generated') && !content) throw importError('invalid-schema', `Embedded resource is missing for ${reference.id}.`);
  if (entry.ownership === 'catalog' && content) throw importError('invalid-schema', `Catalog resource must not embed bytes: ${reference.id}.`);
  let pixelSize: PortableManifestEntry['pixelSize'];
  if (entry.pixelSize !== undefined) {
    const raw = assertClosedObject(entry.pixelSize, ['width', 'height'], 'assetManifest[].pixelSize');
    if (typeof raw.width !== 'number' || typeof raw.height !== 'number' || !Number.isFinite(raw.width) || !Number.isFinite(raw.height) || raw.width <= 0 || raw.height <= 0) throw importError('invalid-schema', `Pixel size is invalid for ${reference.id}.`);
    pixelSize = { width: raw.width, height: raw.height };
  }
  return { reference, ownership: entry.ownership, required: true, ...(content ? { content } : {}), ...(pixelSize ? { pixelSize } : {}) };
};
const readPortableProject = async (directoryUri: string): Promise<PortableProjectPayload> => {
  let raw: unknown;
  try {
    raw = JSON.parse(await FileSystem.readAsStringAsync(`${directoryUri}project.json`, { encoding: FileSystem.EncodingType.UTF8 })) as unknown;
  } catch { throw importError('invalid-json', 'Portable Project JSON could not be read.'); }
  const envelope = migratePortableProjectEnvelope(raw);
  if (!envelope.ok) {
    const code = envelope.issues[0]?.code === 'future-version' ? 'future-version' : envelope.issues[0]?.code === 'unsupported-version' ? 'unsupported-version' : 'invalid-schema';
    throw importError(code, envelope.issues[0]?.message ?? 'Portable Project envelope is invalid.', envelope.issues);
  }
  const payload = envelope.payload;
  if (payload.format !== PORTABLE_PROJECT_FORMAT || payload.formatVersion !== PORTABLE_PROJECT_FORMAT_VERSION || typeof payload.projectId !== 'string' || !isRfc3339Utc(payload.createdAt) || !isRfc3339Utc(payload.updatedAt) || !isRfc3339Utc(payload.exportedAt) || !Array.isArray(payload.assetManifest) || !isRecord(payload.catalogDependencies)) throw importError('invalid-schema', 'Portable Project envelope is incomplete.');
  const migration = migrateDraft(payload.document);
  if (!migration.ok || migration.draft.id !== payload.projectId) throw importError('invalid-schema', 'Portable Project document is invalid.');
  const assetManifest = payload.assetManifest.map(validateManifestEntry);
  const expected = new Set(portableAssetReferencesForDraft(migration.draft).map(manifestKey));
  const actual = new Set(assetManifest.map((entry) => manifestKey(portableAssetReference(entry.reference))));
  if (expected.size !== actual.size || [...expected].some((key) => !actual.has(key))) throw importError('invalid-schema', 'Portable Project asset manifest does not match its document.');
  const relativePaths = new Set<string>();
  assetManifest.forEach((entry) => {
    const reference = portableAssetReference(entry.reference);
    const ownership = ownershipForReference(reference);
    if (ownership !== entry.ownership) throw importError('invalid-schema', `Portable Project ownership is invalid for ${reference.id}`);
    if ((ownership === 'user' || ownership === 'generated') && (!entry.content || !isSafePortableRelativePath(entry.content.relativePath) || relativePaths.has(entry.content.relativePath))) throw importError('invalid-schema', `Portable Project content is invalid for ${reference.id}`);
    if (entry.content) relativePaths.add(entry.content.relativePath);
    if (ownership === 'catalog' && entry.content !== undefined) throw importError('invalid-schema', `Catalog asset must not contain embedded bytes: ${reference.id}`);
  });
  return {
    format: PORTABLE_PROJECT_FORMAT,
    formatVersion: PORTABLE_PROJECT_FORMAT_VERSION,
    projectId: payload.projectId,
    document: migration.draft,
    assetManifest,
    requiredPackAssets: Array.isArray(payload.requiredPackAssets) ? payload.requiredPackAssets as PortableProjectPayload['requiredPackAssets'] : [],
    catalogDependencies: payload.catalogDependencies as PortableProjectPayload['catalogDependencies'],
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    exportedAt: payload.exportedAt,
  };
};

/**
 * Rebuilds a workspace whose Catalog URIs point only at a newly-created local
 * directory. It never writes the current workspace; callers choose when to
 * save the returned result.
 */
export const importPortableProject = async (sourceDirectoryUri: string, targetDirectoryUri?: string): Promise<StoredWorkspace> => {
  const project = await readPortableProject(sourceDirectoryUri);
  await ensurePortableDirectories();
  const finalDirectoryUri = targetDirectoryUri ?? `${importedAssetDirectory}${project.projectId}-${createStableId('import')}/`;
  const finalInfo = await FileSystem.getInfoAsync(finalDirectoryUri);
  if (finalInfo.exists) throw importError('destination-exists', 'Portable Project import destination already exists.');
  const stagingUri = `${finalDirectoryUri.slice(0, -1)}.staging/`;
  const assets: LocalAssetRecord[] = [];
  try {
    await FileSystem.makeDirectoryAsync(stagingUri, { intermediates: true });
    for (const entry of project.assetManifest) {
      if (entry.ownership === 'catalog') continue;
      const content = entry.content!;
      const sourceUri = `${sourceDirectoryUri}${content.relativePath}`;
      const info = await FileSystem.getInfoAsync(sourceUri);
      if (!info.exists) throw importError('missing-resource', `Portable Project resource is missing: ${entry.reference.id}`);
      if (info.size !== content.byteLength) throw importError('resource-size-mismatch', `Portable Project resource size does not match: ${entry.reference.id}`);
      const base64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
      if (sha256HexForBytes(bytesFromBase64(base64)) !== content.sha256) throw importError('resource-hash-mismatch', `Portable Project resource hash does not match: ${entry.reference.id}`);
      const filename = `${createStableId('asset')}.${extensionForMime(content.mimeType)}`;
      const targetUri = `${stagingUri}${filename}`;
      await FileSystem.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      assets.push({ reference: entry.reference, originalUri: `${finalDirectoryUri}${filename}`, width: entry.pixelSize?.width ?? 1, height: entry.pixelSize?.height ?? 1, mimeType: content.mimeType, createdAt: project.createdAt });
    }
    await FileSystem.moveAsync({ from: stagingUri, to: finalDirectoryUri });
  } catch (error) {
    await FileSystem.deleteAsync(stagingUri, { idempotent: true }).catch(() => {});
    throw error;
  }
  return { draft: project.document, catalog: { ...emptyAssetCatalog(), assets } };
};
