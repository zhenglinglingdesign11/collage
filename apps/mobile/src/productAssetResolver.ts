import { createProductAssetResolver, type ProductAssetCatalog } from '@journalcollage/asset-system';
import { cacheVerifiedRemoteAsset, findVerifiedBundledAsset, findVerifiedRemoteAsset } from './verifiedRemoteAssetCache';

export type BundledProductAssets = Readonly<Record<string, string>>;

/** Native bridge for P1-A04's ordered resolution policy. Bundle entries are optional. */
export const createMobileProductAssetResolver = (catalog: ProductAssetCatalog, bundledAssets: BundledProductAssets = {}) =>
  createProductAssetResolver(catalog, {
    findVerifiedCachedAsset: findVerifiedRemoteAsset,
    findVerifiedBundledAsset: (descriptor) => findVerifiedBundledAsset(descriptor, bundledAssets[descriptor.reference.id]),
    downloadAndCacheAsset: cacheVerifiedRemoteAsset,
  });
