import { remoteAssetPacks, type ProductAssetCatalog, type RemoteAssetPack } from '@journalcollage/asset-system';
import type { AssetReference } from '@journalcollage/editor-core';
import { createMobileProductAssetResolver } from './productAssetResolver';

declare const require: (path: string) => unknown;

/** The only product-material catalog eligible for runtime resolution in 1.0. */
export const shippedProductAssetCatalog = require('../../../generated/first-release-product-catalog.v1.json') as ProductAssetCatalog;
export const shippedProductAssetResolver = createMobileProductAssetResolver(shippedProductAssetCatalog);
const referenceKey = (reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>): string => `${reference.id}\u0000${reference.kind}\u0000${reference.revision}`;
const compatibilityProductAssetReferences = new Set(
  shippedProductAssetCatalog.packs
    .filter((pack) => pack.resolverMode === 'compatibility')
    .flatMap((pack) => [pack.cover, ...pack.items])
    .map((asset) => referenceKey(asset.reference)),
);
const productCatalogAssets = new Map(
  shippedProductAssetCatalog.packs.flatMap((pack) => [pack.cover, ...pack.items]).map((asset) => [referenceKey(asset.reference), asset]),
);

/**
 * The browseable first-release material inventory. Product assets always come
 * from the frozen catalog; only local procedural controls remain alongside it.
 */
export const shippedProductMaterialPacks: readonly RemoteAssetPack[] = [
  ...shippedProductAssetCatalog.packs
    .filter((pack) => pack.visibility !== 'internal')
    .map((pack): RemoteAssetPack => ({
      id: pack.id,
      revision: pack.revision,
      name: pack.name,
      category: pack.category,
      cover: pack.cover.sourceUrl,
      coverReference: pack.cover.reference,
      items: pack.items.map((asset) => ({
        id: `${pack.id}-${asset.itemId}`,
        reference: asset.reference,
        source: asset.sourceUrl,
        width: asset.pixelSize.width,
        height: asset.pixelSize.height,
      })),
    })),
  ...remoteAssetPacks.filter((pack) => pack.proceduralPreview !== undefined),
];

export const isShippedProductAssetReference = (reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>): boolean => {
  try { shippedProductAssetResolver.descriptorFor(reference); return true; } catch { return false; }
};
export const isCompatibilityProductAssetReference = (reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>): boolean =>
  compatibilityProductAssetReferences.has(referenceKey(reference));
export const productCatalogAssetForReference = (reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>) =>
  productCatalogAssets.get(referenceKey(reference));
