import * as FileSystem from 'expo-file-system/legacy';
import type { AssetCatalog, LocalAssetRecord } from '@journalcollage/asset-system';
import { migrateDraft, type Draft } from '@journalcollage/editor-core';

const root = `${FileSystem.documentDirectory}journalcollage/`;
const assetDirectory = `${root}assets/`;
const workspaceUri = `${root}workspace.json`;

export type StoredWorkspace = Readonly<{ draft: Draft; catalog: AssetCatalog }>;

type StoredWorkspacePayload = Readonly<{ draft: unknown; catalog: AssetCatalog }>;

const ensureDirectories = async (): Promise<void> => {
  await FileSystem.makeDirectoryAsync(assetDirectory, { intermediates: true });
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
