import type { AssetReference } from '@journalcollage/editor-core';
import { RemoteAssetIntegrityError, type RemoteAssetIntegrityDescriptor, validateRemoteAssetDescriptor } from './remoteAssetIntegrity';

export type ProductCatalogAsset = Readonly<{
  role: 'cover' | 'item';
  itemId: string;
  reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>;
  packRevision: string;
  mimeType: 'image/png' | 'image/jpeg';
  byteLength: number;
  sha256: string;
  pixelSize: Readonly<{ width: number; height: number }>;
  sourceUrl: string;
}>;

export type ProductAssetCatalog = Readonly<{
  releaseState: 'staged' | 'shipped';
  packs: readonly Readonly<{
    id: string;
    revision: string;
    status: 'staged' | 'shipped';
    name: string;
    category: 'sticker' | 'tape' | 'note' | 'mixed' | 'frame' | 'paper';
    visibility?: 'visible' | 'internal';
    resolverMode?: 'strict' | 'compatibility';
    cover: ProductCatalogAsset;
    items: readonly ProductCatalogAsset[];
  }> [];
}>;

export type ResolvedProductAsset = Readonly<{ uri: string; source: 'verified-cache' | 'bundle' | 'cdn' }>;

export type ProductAssetResolverAdapter = Readonly<{
  findVerifiedCachedAsset: (descriptor: RemoteAssetIntegrityDescriptor) => Promise<string | null>;
  findVerifiedBundledAsset: (descriptor: RemoteAssetIntegrityDescriptor) => Promise<string | null>;
  downloadAndCacheAsset: (descriptor: RemoteAssetIntegrityDescriptor, options?: Readonly<{ signal?: AbortSignal }>) => Promise<string>;
}>;

const keyFor = (reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>): string =>
  `${reference.id}\u0000${reference.kind}\u0000${reference.revision}`;

/** Catalog-only resolver: it never exposes URLs to Draft and only returns verified local URIs. */
export const createProductAssetResolver = (catalog: ProductAssetCatalog, adapter: ProductAssetResolverAdapter) => {
  if (catalog.releaseState !== 'shipped' || catalog.packs.some((pack) => pack.status !== 'shipped')) {
    throw new RemoteAssetIntegrityError('asset-reference-invalid', 'Product asset resolver requires a shipped catalog.');
  }
  const descriptors = new Map<string, RemoteAssetIntegrityDescriptor>();
  catalog.packs.filter((pack) => pack.resolverMode !== 'compatibility').forEach((pack) => [pack.cover, ...pack.items].forEach((asset) => {
    const descriptor: RemoteAssetIntegrityDescriptor = { ...asset, packRevision: pack.revision };
    validateRemoteAssetDescriptor(descriptor);
    const key = keyFor(asset.reference);
    if (descriptors.has(key)) throw new RemoteAssetIntegrityError('asset-reference-invalid', `Catalog repeats ${asset.reference.id}.`);
    descriptors.set(key, descriptor);
  }));

  const descriptorFor = (reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>): RemoteAssetIntegrityDescriptor => {
    const descriptor = descriptors.get(keyFor(reference));
    if (!descriptor) throw new RemoteAssetIntegrityError('asset-reference-invalid', `No shipped product asset matches ${reference.id}@${reference.revision}.`);
    return descriptor;
  };

  return {
    descriptorFor,
    async resolve(reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>, options: Readonly<{ signal?: AbortSignal }> = {}): Promise<ResolvedProductAsset> {
      const descriptor = descriptorFor(reference);
      const cached = await adapter.findVerifiedCachedAsset(descriptor);
      if (cached) return { uri: cached, source: 'verified-cache' };
      const bundled = await adapter.findVerifiedBundledAsset(descriptor);
      if (bundled) return { uri: bundled, source: 'bundle' };
      return { uri: await adapter.downloadAndCacheAsset(descriptor, options), source: 'cdn' };
    },
  };
};
