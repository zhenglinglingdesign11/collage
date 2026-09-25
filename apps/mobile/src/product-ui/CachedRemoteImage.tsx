import { useEffect, useRef, useState } from 'react';
import { type ImageStyle, type StyleProp } from 'react-native';
import { cacheRemoteResource, findCachedRemoteResourceUri, resolvedRemoteResourceUri } from '../localWorkspace';
import { isCompatibilityProductAssetReference, isShippedProductAssetReference, shippedProductAssetResolver } from '../shippedProductAssetCatalog';
import { resolvedVerifiedProductAssetUri } from '../productAssetResolver';
import { findCachedVerifiedPreviewUri } from '../verifiedRemoteAssetCache';
import type { AssetReference } from '@journalcollage/editor-core';
import { RemoteImageCard } from './RemoteImageCard';
import type { ProductLocale } from './localization';

/** Material previews display immediately; Draft insertion resolves and verifies separately. */
export const CachedRemoteImage = ({ cacheKey, locale, onPreviewReadyChange, reference, source, style }: Readonly<{ cacheKey: string; locale?: ProductLocale; onPreviewReadyChange?: (ready: boolean) => void; reference?: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>; source: string; style: StyleProp<ImageStyle> }>) => {
  const cachedUri = resolvedRemoteResourceUri(cacheKey, source);
  const shippedReference = reference && isShippedProductAssetReference(reference) ? reference : undefined;
  const compatibilityReference = reference && isCompatibilityProductAssetReference(reference) ? reference : undefined;
  const catalogPreview = shippedReference !== undefined || compatibilityReference !== undefined;
  const [uri, setUri] = useState<string | null>(() => catalogPreview ? (shippedReference ? resolvedVerifiedProductAssetUri(shippedReference) : undefined) ?? cachedUri ?? source : cachedUri ?? null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const previewReady = useRef(false);
  useEffect(() => {
    let active = true;
    let localSwitchTimer: ReturnType<typeof setTimeout> | undefined;
    previewReady.current = false;
    if (catalogPreview) {
      // Show the CDN immediately while checking the previous session's files.
      // This lookup performs no download and no full hash of the image bytes.
      setUri((shippedReference ? resolvedVerifiedProductAssetUri(shippedReference) : undefined) ?? resolvedRemoteResourceUri(cacheKey, source) ?? source);
      const lookupTimer = setTimeout(() => {
        if (!active || previewReady.current) return;
        const lookup = shippedReference
          ? findCachedVerifiedPreviewUri(shippedProductAssetResolver.descriptorFor(shippedReference))
          : findCachedRemoteResourceUri(cacheKey, source);
        void lookup.then((localUri) => {
          if (!active || !localUri || previewReady.current) return;
          // An immediate URI swap restarts Image loading and delays the first frame.
          localSwitchTimer = setTimeout(() => { if (active && !previewReady.current) setUri(localUri); }, 500);
        });
      }, 150);
      return () => { active = false; clearTimeout(lookupTimer); if (localSwitchTimer !== undefined) clearTimeout(localSwitchTimer); };
    }
    setUri(resolvedRemoteResourceUri(cacheKey, source) ?? null);
    void cacheRemoteResource(cacheKey, source).then((localUri) => { if (active) setUri(localUri); }).catch(() => { if (active) setUri(source); });
    return () => { active = false; };
  }, [cacheKey, catalogPreview, shippedReference, source, retryAttempt]);
  const previewUri = uri;
  return <RemoteImageCard source={previewUri ? { uri: previewUri } : null} fallbackSource={previewUri?.startsWith('file:') ? source : undefined} locale={locale} onReadyChange={(ready) => { previewReady.current = ready; onPreviewReadyChange?.(ready); }} onRetry={() => setRetryAttempt((value) => value + 1)} style={style} />;
};
