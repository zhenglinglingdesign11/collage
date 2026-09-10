import type { AssetReference } from '@journalcollage/editor-core';

export const ASSET_CATALOG_VERSION = 1 as const;

/** Runtime location belongs to the catalog, never to a Draft. */
export type LocalAssetRecord = Readonly<{
  reference: AssetReference;
  originalUri: string;
  width: number;
  height: number;
  mimeType: string | null;
  createdAt: string;
}>;

export type AssetCatalog = Readonly<{
  version: typeof ASSET_CATALOG_VERSION;
  assets: readonly LocalAssetRecord[];
}>;

export const emptyAssetCatalog = (): AssetCatalog => ({ version: ASSET_CATALOG_VERSION, assets: [] });

export const upsertAsset = (catalog: AssetCatalog, record: LocalAssetRecord): AssetCatalog => ({
  ...catalog,
  assets: [...catalog.assets.filter((asset) => asset.reference.id !== record.reference.id), record],
});

export const assetUriMap = (catalog: AssetCatalog): Readonly<Record<string, string>> =>
  Object.fromEntries(catalog.assets.map((asset) => [asset.reference.id, asset.originalUri]));
