import * as Font from 'expo-font';
import { cacheRemoteResource } from '../localWorkspace';
import { getTextFont, type TextFont } from '@journalcollage/asset-system';

export type RemoteFontStatus = 'ready' | 'loading' | 'failed';

const states = new Map<string, RemoteFontStatus>();
const pending = new Map<string, Promise<RemoteFontStatus>>();
const cachedUris = new Map<string, string>();

export const fontStatus = (variantId: string): RemoteFontStatus => states.get(variantId) ?? 'ready';

/**
 * Loads only the requested variant.  Cached file URIs and CDN URLs are kept in
 * this adapter; persisted TextLayer values are always catalog IDs.
 */
export const ensureTextFont = async (variantId: string): Promise<RemoteFontStatus> => {
  const font = getTextFont(variantId);
  if (!font.remoteSource || font.variantId === 'system') return 'ready';
  if (Font.isLoaded(font.family)) return 'ready';
  const existing = pending.get(font.variantId);
  if (existing) return existing;
  states.set(font.variantId, 'loading');
  const operation = (async () => {
    try {
      const uri = await cacheRemoteResource(`font-${font.variantId}`, font.remoteSource!);
      cachedUris.set(font.variantId, uri);
      await Font.loadAsync(font.family, uri);
      states.set(font.variantId, 'ready');
      return 'ready' as const;
    } catch {
      states.set(font.variantId, 'failed');
      return 'failed' as const;
    } finally {
      pending.delete(font.variantId);
    }
  })();
  pending.set(font.variantId, operation);
  return operation;
};

/** Local URI for Skia's Typeface resolver; it is intentionally never persisted. */
export const resolvedTextFontUri = (variantId: string): string | undefined => cachedUris.get(variantId);

export const resolvedFontFamily = (variantId: string): string => {
  const font: TextFont = getTextFont(variantId);
  return !font.remoteSource || Font.isLoaded(font.family) ? font.family : font.fallbackFamily;
};
