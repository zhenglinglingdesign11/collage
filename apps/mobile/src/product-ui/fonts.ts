import * as Font from 'expo-font';
import * as FileSystem from 'expo-file-system/legacy';
import { cacheRemoteResource } from '../localWorkspace';
import { getTextFont, type TextFont } from '@journalcollage/asset-system';

export type RemoteFontStatus = 'idle' | 'ready' | 'loading' | 'failed';

const states = new Map<string, RemoteFontStatus>();
const pending = new Map<string, Promise<RemoteFontStatus>>();
const cachedUris = new Map<string, string>();
const listeners = new Set<() => void>();

export const fontStatus = (variantId: string): RemoteFontStatus => {
  const font = getTextFont(variantId);
  return !font.remoteSource || font.variantId === 'system' ? 'ready' : states.get(font.variantId) ?? 'idle';
};
export const subscribeFontStatus = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const setFontStatus = (variantId: string, status: RemoteFontStatus): void => {
  if (states.get(variantId) === status) return;
  states.set(variantId, status);
  listeners.forEach((listener) => listener());
};
export const invalidateCachedTextFonts = (): void => {
  cachedUris.clear();
  states.clear();
  listeners.forEach((listener) => listener());
};

/**
 * Loads only the requested variant.  Cached file URIs and CDN URLs are kept in
 * this adapter; persisted TextLayer values are always catalog IDs.
 */
export const ensureTextFont = async (variantId: string): Promise<RemoteFontStatus> => {
  const font = getTextFont(variantId);
  if (!font.remoteSource || font.variantId === 'system') return 'ready';
  const cachedUri = cachedUris.get(font.variantId);
  if (cachedUri && Font.isLoaded(font.family)) {
    try {
      if ((await FileSystem.getInfoAsync(cachedUri)).exists) {
        setFontStatus(font.variantId, 'ready');
        return 'ready';
      }
    } catch {
      // An inaccessible cache file should enter the normal retry path.
    }
  }
  const existing = pending.get(font.variantId);
  if (existing) return existing;
  setFontStatus(font.variantId, 'loading');
  const operation = (async () => {
    try {
      const uri = await cacheRemoteResource(`font-${font.variantId}`, font.remoteSource!);
      cachedUris.set(font.variantId, uri);
      if (!Font.isLoaded(font.family)) await Font.loadAsync(font.family, uri);
      setFontStatus(font.variantId, 'ready');
      return 'ready' as const;
    } catch {
      setFontStatus(font.variantId, 'failed');
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
