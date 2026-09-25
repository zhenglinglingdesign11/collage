import { useEffect, useState } from 'react';
import { type ImageStyle, type StyleProp } from 'react-native';
import { cacheRemoteResource, resolvedRemoteResourceUri } from '../localWorkspace';
import { isCompatibilityProductAssetReference, isShippedProductAssetReference, shippedProductAssetResolver } from '../shippedProductAssetCatalog';
import { resolvedVerifiedProductAssetUri } from '../productAssetResolver';
import type { AssetReference } from '@journalcollage/editor-core';
import { RemoteImageCard } from './RemoteImageCard';
import type { ProductLocale } from './localization';

const strictPreviewRetryDelaysMs = [1_000, 3_000] as const;

/** Disk-backed image surface for remote material covers and thumbnails. */
export const CachedRemoteImage = ({ cacheKey, locale, onPreviewReadyChange, reference, source, style }: Readonly<{ cacheKey: string; locale?: ProductLocale; onPreviewReadyChange?: (ready: boolean) => void; reference?: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>; source: string; style: StyleProp<ImageStyle> }>) => {
  const cachedUri = resolvedRemoteResourceUri(cacheKey, source);
  const shippedReference = reference && isShippedProductAssetReference(reference) ? reference : undefined;
  const compatibilityReference = reference && isCompatibilityProductAssetReference(reference) ? reference : undefined;
  const resolvedUri = (): string | null => source.startsWith('data:') ? source : (shippedReference ? resolvedVerifiedProductAssetUri(shippedReference) : cachedUri) ?? null;
  const [uri, setUri] = useState<string | null>(resolvedUri);
  const [retryAttempt, setRetryAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    if (shippedReference) {
      // A catalogue URL is safe for a *preview*, while assets inserted into a
      // Draft continue to go through the strict resolver. Keeping it visible
      // avoids a blank material tile when a transient native cache operation
      // fails before the verified local file has been produced.
      setUri(resolvedVerifiedProductAssetUri(shippedReference) ?? source);
      let retryIndex = 0;
      const resolveStrictPreview = () => {
        void shippedProductAssetResolver.resolve(shippedReference).then(({ uri: localUri }) => {
          if (active) setUri(localUri);
        }).catch((error: unknown) => {
          if (!active) return;
          // Keep the CDN preview visible and leave enough context in the dev
          // console to distinguish transport, file-system, and verification
          // failures without exposing the unverified file to the editor.
          if (__DEV__) console.warn('[material-preview] verified cache unavailable', {
            reference: shippedReference.id,
            message: error instanceof Error ? error.message : String(error),
          });
          if (retryIndex < strictPreviewRetryDelaysMs.length) {
            retryTimer = setTimeout(resolveStrictPreview, strictPreviewRetryDelaysMs[retryIndex]);
            retryIndex += 1;
          }
        });
      };
      resolveStrictPreview();
    } else if (compatibilityReference) {
      setUri(resolvedUri());
      // Compatibility packs predate the strict integrity manifest. A cache
      // failure must not make their pack tiles disappear; Image can still load
      // the catalog's HTTPS source while the cache is unavailable.
      void cacheRemoteResource(cacheKey, source, { requireImageMime: true }).then((localUri) => { if (active) setUri(localUri); }).catch(() => { if (active) setUri(source); });
    } else {
      setUri(resolvedUri());
      void cacheRemoteResource(cacheKey, source).then((localUri) => { if (active) setUri(localUri); }).catch(() => { if (active) setUri(source); });
    }
    return () => { active = false; if (retryTimer !== undefined) clearTimeout(retryTimer); };
  }, [cacheKey, compatibilityReference, shippedReference, source, retryAttempt]);
  return <RemoteImageCard source={uri ? { uri } : null} fallbackSource={uri?.startsWith('file:') ? source : undefined} locale={locale} onReadyChange={onPreviewReadyChange} onRetry={() => setRetryAttempt((value) => value + 1)} style={style} />;
};
