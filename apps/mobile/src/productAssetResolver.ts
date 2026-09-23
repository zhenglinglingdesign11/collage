import { createProductAssetResolver, type ProductAssetCatalog } from '@journalcollage/asset-system';
import type { AssetReference } from '@journalcollage/editor-core';
import { Asset } from 'expo-asset';
import { cacheVerifiedRemoteAsset, findVerifiedBundledAsset, findVerifiedRemoteAsset } from './verifiedRemoteAssetCache';

/** Metro module IDs keep static assets bundle-addressable in both dev and release builds. */
export type BundledProductAssets = Readonly<Record<string, number>>;
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
    findVerifiedBundledAsset: async (descriptor) => {
      const moduleId = bundledAssets[descriptor.reference.id];
      if (moduleId === undefined) return null;
      // Expo copies a static Metro module to a local URI in development as
      // well as release builds. The strict verifier must read those bytes,
      // never the development server URI exposed by Image.resolveAssetSource.
      try {
        const asset = await Asset.fromModule(moduleId).downloadAsync();
        return findVerifiedBundledAsset(descriptor, asset.localUri ?? undefined);
      } catch {
        // A development server can disappear while resolving an asset. Keep
        // the resolver's specified cache → bundle → CDN fallback order.
        return null;
      }
    },
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
