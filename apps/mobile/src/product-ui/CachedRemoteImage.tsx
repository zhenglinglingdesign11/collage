import { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { cacheRemoteResource, resolvedRemoteResourceUri } from '../localWorkspace';
import { isCompatibilityProductAssetReference, isShippedProductAssetReference, shippedProductAssetResolver } from '../shippedProductAssetCatalog';
import { resolvedVerifiedProductAssetUri } from '../productAssetResolver';
import type { AssetReference } from '@journalcollage/editor-core';

/** Disk-backed image surface for remote material covers and thumbnails. */
export const CachedRemoteImage = ({ cacheKey, reference, source, style }: Readonly<{ cacheKey: string; reference?: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>; source: string; style: StyleProp<ImageStyle> }>) => {
  const cachedUri = resolvedRemoteResourceUri(cacheKey, source);
  const shippedReference = reference && isShippedProductAssetReference(reference) ? reference : undefined;
  const compatibilityReference = reference && isCompatibilityProductAssetReference(reference) ? reference : undefined;
  const resolvedUri = (): string | null => source.startsWith('data:') ? source : (shippedReference ? resolvedVerifiedProductAssetUri(shippedReference) : cachedUri) ?? null;
  const [uri, setUri] = useState<string | null>(resolvedUri);
  useEffect(() => {
    let active = true;
    setUri(resolvedUri());
    if (shippedReference) {
      void shippedProductAssetResolver.resolve(shippedReference).then(({ uri: localUri }) => { if (active) setUri(localUri); }).catch(() => { if (active) setUri(null); });
    } else if (compatibilityReference) {
      void cacheRemoteResource(cacheKey, source, { requireImageMime: true }).then((localUri) => { if (active) setUri(localUri); }).catch(() => { if (active) setUri(null); });
    } else {
      void cacheRemoteResource(cacheKey, source).then((localUri) => { if (active) setUri(localUri); }).catch(() => { if (active) setUri(source); });
    }
    return () => { active = false; };
  }, [cacheKey, compatibilityReference, shippedReference, source]);
  return uri === null ? <View style={style as StyleProp<ViewStyle>} /> : <Image source={{ uri }} style={style} />;
};
