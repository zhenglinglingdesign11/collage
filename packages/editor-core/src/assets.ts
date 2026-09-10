import type { AssetKind, AssetReference } from './document';

/** Metadata is portable; fetching and caching are implemented by an adapter. */
export type AssetDescriptor = Readonly<{
  reference: AssetReference;
  mimeType: string;
  pixelSize?: Readonly<{ width: number; height: number }>;
  contentHash?: string;
}>;

export type AssetLookup = Readonly<{
  reference: AssetReference;
  purpose: 'preview' | 'export' | 'thumbnail';
}>;

/**
 * The app / native implementation returns a currently usable URI. It never
 * becomes part of a Draft and may point to cache, bundle, cloud, or sandbox.
 */
export interface AssetResolver {
  resolve(lookup: AssetLookup): Promise<{ uri: string; kind: AssetKind }>;
}
