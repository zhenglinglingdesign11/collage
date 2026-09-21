import { createProductAssetResolver, type ProductAssetCatalog } from '@journalcollage/asset-system';
import type { AssetReference } from '@journalcollage/editor-core';
import { cacheVerifiedRemoteAsset, findVerifiedBundledAsset, findVerifiedRemoteAsset } from './verifiedRemoteAssetCache';

export type BundledProductAssets = Readonly<Record<string, string>>;
type ProductAssetReference = Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>;

const resolvedSessionUris = new Map<string, string>();
const referenceKey = (reference: ProductAssetReference): string => `${reference.id}\u0000${reference.kind}\u0000${reference.revision}`;

/**
 * Only URIs already accepted by the strict resolver during this app session.
 * This avoids a blank remount frame without trusting a disk file after launch.
 */
export const resolvedVerifiedProductAssetUri = (reference: ProductAssetReference): string | undefined => resolvedSessionUris.get(referenceKey(reference));
export const clearResolvedVerifiedProductAssetUris = (): void => resolvedSessionUris.clear();

/** Native bridge for P1-A04's ordered resolution policy. Bundle entries are optional. */
export const createMobileProductAssetResolver = (catalog: ProductAssetCatalog, bundledAssets: BundledProductAssets = {}) => {
  const resolver = createProductAssetResolver(catalog, {
    findVerifiedCachedAsset: findVerifiedRemoteAsset,
    findVerifiedBundledAsset: (descriptor) => findVerifiedBundledAsset(descriptor, bundledAssets[descriptor.reference.id]),
    downloadAndCacheAsset: cacheVerifiedRemoteAsset,
  });
  return {
    ...resolver,
    async resolve(reference: ProductAssetReference, options: Readonly<{ signal?: AbortSignal }> = {}) {
      const resolved = await resolver.resolve(reference, options);
      resolvedSessionUris.set(referenceKey(reference), resolved.uri);
      return resolved;
    },
  };
};
