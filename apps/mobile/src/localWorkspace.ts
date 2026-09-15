import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import type { AssetCatalog, LocalAssetRecord, RemotePackItem } from '@journalcollage/asset-system';
import { migrateDraft, type Draft } from '@journalcollage/editor-core';

const root = `${FileSystem.documentDirectory}journalcollage/`;
const assetDirectory = `${root}assets/`;
const remoteCacheDirectory = `${root}remote-cache/`;
const workspaceUri = `${root}workspace.json`;
const remoteCacheIndexUri = `${root}remote-cache-index.json`;
const savedDraftDirectory = `${root}saved-drafts/`;
const savedDraftIndexUri = `${root}saved-drafts-index.json`;
const homeShowcaseManifestUri = (market: string): string => `${root}home-showcase-manifest-${market.replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`;
const MAX_SAVED_DRAFTS = 20;

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

const ensureDirectories = async (): Promise<void> => {
  await FileSystem.makeDirectoryAsync(assetDirectory, { intermediates: true });
  await FileSystem.makeDirectoryAsync(remoteCacheDirectory, { intermediates: true });
  await FileSystem.makeDirectoryAsync(savedDraftDirectory, { intermediates: true });
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
export const cacheRemoteResource = async (key: string, source: string): Promise<string> => {
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
  return infos.reduce<DownloadCacheSummary>((summary, info) => info?.exists
    ? { bytes: summary.bytes + (typeof info.size === 'number' ? info.size : 0), files: summary.files + 1 }
    : summary, { bytes: 0, files: 0 });
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
  remoteCacheIndex = null;
  resolvedRemoteUris.clear();
  return before;
};

export const importLocalImage = async (input: { uri: string; width: number; height: number; mimeType: string | null }): Promise<LocalAssetRecord> => {
  await ensureDirectories();
  const id = `local-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const extension = input.mimeType === 'image/png' ? 'png' : 'jpg';
  const originalUri = `${assetDirectory}${id}.${extension}`;
  await FileSystem.copyAsync({ from: input.uri, to: originalUri });
  return {
    reference: { id: `user://image/${id}`, kind: 'image' },
    originalUri,
    width: input.width,
    height: input.height,
    mimeType: input.mimeType,
    createdAt: new Date().toISOString(),
  };
};

/** Resolves a remote R2 asset to an app-private cache without leaking its URL into Draft. */
export const cacheRemotePackItem = async (item: RemotePackItem, catalog: AssetCatalog): Promise<LocalAssetRecord> => {
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

  const originalUri = await cacheRemoteResource(`item-${item.reference.id}`, item.source);
  return {
    reference: item.reference,
    originalUri,
    width: item.width,
    height: item.height,
    mimeType: 'image/png',
    createdAt: new Date().toISOString(),
  };
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
  if (options.markAsSaved) await saveExplicitDraft(payload, savedAt!);
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
  const uri = `${root}exports-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
};
