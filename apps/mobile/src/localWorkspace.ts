import * as FileSystem from 'expo-file-system/legacy';
import type { AssetCatalog, LocalAssetRecord, RemotePackItem } from '@journalcollage/asset-system';
import { migrateDraft, type Draft } from '@journalcollage/editor-core';

const root = `${FileSystem.documentDirectory}journalcollage/`;
const assetDirectory = `${root}assets/`;
const remoteCacheDirectory = `${root}remote-cache/`;
const workspaceUri = `${root}workspace.json`;
const remoteCacheIndexUri = `${root}remote-cache-index.json`;

type RemoteCacheEntry = Readonly<{ key: string; source: string; uri: string; lastAccessedAt: string }>;
type RemoteCacheIndex = Readonly<{ version: 1; entries: readonly RemoteCacheEntry[] }>;
let remoteCacheIndex: RemoteCacheIndex | null = null;
const pendingRemoteDownloads = new Map<string, Promise<string>>();
/** Avoid a disk round-trip (and a blank first frame) when a drawer view remounts. */
const resolvedRemoteUris = new Map<string, string>();

export type StoredWorkspace = Readonly<{ draft: Draft; catalog: AssetCatalog }>;

type StoredWorkspacePayload = Readonly<{ draft: unknown; catalog: AssetCatalog }>;

const ensureDirectories = async (): Promise<void> => {
  await FileSystem.makeDirectoryAsync(assetDirectory, { intermediates: true });
  await FileSystem.makeDirectoryAsync(remoteCacheDirectory, { intermediates: true });
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

export const saveWorkspace = async (workspace: StoredWorkspace): Promise<void> => {
  await ensureDirectories();
  await FileSystem.writeAsStringAsync(workspaceUri, JSON.stringify(workspace), { encoding: FileSystem.EncodingType.UTF8 });
};

export const loadWorkspace = async (): Promise<StoredWorkspace | null> => {
  const info = await FileSystem.getInfoAsync(workspaceUri);
  if (!info.exists) return null;
  const raw = await FileSystem.readAsStringAsync(workspaceUri, { encoding: FileSystem.EncodingType.UTF8 });
  try {
    const parsed = JSON.parse(raw) as StoredWorkspacePayload;
    if (!parsed.draft || !parsed.catalog || parsed.catalog.version !== 1 || !Array.isArray(parsed.catalog.assets)) return null;
    const migration = migrateDraft(parsed.draft);
    return migration.ok ? { draft: migration.draft, catalog: parsed.catalog } : null;
  } catch {
    // A corrupt local draft must never prevent a user from opening the editor.
    return null;
  }
};

export const saveExportPng = async (base64: string): Promise<string> => {
  await ensureDirectories();
  const uri = `${root}exports-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
};
