import * as FileSystem from 'expo-file-system/legacy';
import { RemoteAssetDownloadCoordinator, RemoteAssetIntegrityError, remoteAssetCacheKey, throwIfRemoteAssetDownloadCancelled, validateRemoteAssetDescriptor, validateRemoteAssetDownload, type RemoteAssetIntegrityDescriptor } from '@journalcollage/asset-system';
import { sha256HexForBytes } from '@journalcollage/editor-core';

type VerifiedRemoteAssetRecord = Readonly<{
  version: 1;
  descriptor: RemoteAssetIntegrityDescriptor;
  relativePath: string;
  verifiedAt: string;
}>;

const root = `${FileSystem.documentDirectory}journalcollage/verified-remote-assets/v1/`;
const downloads = new RemoteAssetDownloadCoordinator<string>();
const maximumDownloadAttempts = 2;
const retryDelayMs = 200;
const downloadTimeoutMs = 8_000;

const bytesFromBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const extensionFor = (mimeType: RemoteAssetIntegrityDescriptor['mimeType']): string => mimeType === 'image/png' ? 'png' : 'jpg';
const readBytes = async (uri: string): Promise<Uint8Array> => bytesFromBase64(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }));
const identity = (descriptor: RemoteAssetIntegrityDescriptor): string => sha256HexForBytes(new TextEncoder().encode(remoteAssetCacheKey(descriptor)));

const location = (descriptor: RemoteAssetIntegrityDescriptor) => {
  const directory = `${root}${identity(descriptor)}/`;
  const relativePath = `${identity(descriptor)}/asset.${extensionFor(descriptor.mimeType)}`;
  return { directory, assetUri: `${directory}asset.${extensionFor(descriptor.mimeType)}`, recordUri: `${directory}record.json`, relativePath };
};

const sameDescriptor = (left: RemoteAssetIntegrityDescriptor, right: RemoteAssetIntegrityDescriptor): boolean =>
  left.reference.id === right.reference.id && left.reference.kind === right.reference.kind && left.reference.revision === right.reference.revision
  && left.packRevision === right.packRevision && left.mimeType === right.mimeType && left.byteLength === right.byteLength
  && left.sha256 === right.sha256 && left.pixelSize.width === right.pixelSize.width && left.pixelSize.height === right.pixelSize.height
  && left.sourceUrl === right.sourceUrl;

const deleteLocation = async (directory: string): Promise<void> => { await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => {}); };
const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
const retryableDownloadFailure = (error: unknown): boolean =>
  !(error instanceof RemoteAssetIntegrityError) || (error.code === 'asset-download-failed' && /HTTP 5\d\d\./.test(error.message));
const downloadWithTimeout = async (sourceUrl: string, destination: string): Promise<Awaited<ReturnType<typeof FileSystem.downloadAsync>>> => {
  const task = FileSystem.createDownloadResumable(sourceUrl, destination);
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void) => { if (!settled) { settled = true; clearTimeout(timer); action(); } };
    const timer = setTimeout(() => {
      void task.cancelAsync().catch(() => undefined).finally(() => settle(() => reject(new Error(`Remote asset download timed out after ${downloadTimeoutMs}ms.`))));
    }, downloadTimeoutMs);
    void task.downloadAsync().then((result) => settle(() => result ? resolve(result) : reject(new Error('Remote asset download was cancelled.'))), (error) => settle(() => reject(error)));
  });
};

const cachedAssetUri = async (descriptor: RemoteAssetIntegrityDescriptor): Promise<string | null> => {
  const current = location(descriptor);
  const [asset, record] = await Promise.all([FileSystem.getInfoAsync(current.assetUri), FileSystem.getInfoAsync(current.recordUri)]);
  if (!asset.exists || !record.exists) return null;
  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(current.recordUri, { encoding: FileSystem.EncodingType.UTF8 })) as VerifiedRemoteAssetRecord;
    if (parsed.version !== 1 || parsed.relativePath !== current.relativePath || !sameDescriptor(parsed.descriptor, descriptor)) throw new Error('record mismatch');
    validateRemoteAssetDownload(descriptor, { bytes: await readBytes(current.assetUri), mimeType: descriptor.mimeType });
    return current.assetUri;
  } catch {
    await deleteLocation(current.directory);
    return null;
  }
};

const cancelled = <T>(signal: AbortSignal | undefined, promise: Promise<T>): Promise<T> => {
  throwIfRemoteAssetDownloadCancelled(signal);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new RemoteAssetIntegrityError('asset-download-cancelled', 'Remote asset download was cancelled.'));
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
};

/**
 * P1-A02's Expo adapter. It validates a complete descriptor before making a
 * cache entry; callers may cancel their wait without cancelling a shared download.
 */
export const cacheVerifiedRemoteAsset = async (
  descriptor: RemoteAssetIntegrityDescriptor,
  options: Readonly<{ signal?: AbortSignal }> = {},
): Promise<string> => {
  validateRemoteAssetDescriptor(descriptor);
  const cached = await cachedAssetUri(descriptor);
  if (cached) return cached;

  const key = remoteAssetCacheKey(descriptor);
  const operation = downloads.run(key, async () => {
    const current = location(descriptor);
    const secondCacheCheck = await cachedAssetUri(descriptor);
    if (secondCacheCheck) return secondCacheCheck;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maximumDownloadAttempts; attempt += 1) {
      const staging = `${root}.${identity(descriptor)}-${Date.now()}-${Math.random().toString(36).slice(2)}.staging/`;
      const stagingAsset = `${staging}asset.${extensionFor(descriptor.mimeType)}`;
      const stagingRecord = `${staging}record.json`;
      try {
        await FileSystem.makeDirectoryAsync(staging, { intermediates: true });
        const result = await downloadWithTimeout(descriptor.sourceUrl, stagingAsset);
        if (result.status < 200 || result.status >= 300) throw new RemoteAssetIntegrityError('asset-download-failed', `Remote asset returned HTTP ${result.status}.`);
        const headerMime = result.headers['content-type'] ?? result.headers['Content-Type'] ?? null;
        validateRemoteAssetDownload(descriptor, { bytes: await readBytes(stagingAsset), mimeType: headerMime });
        const record: VerifiedRemoteAssetRecord = { version: 1, descriptor, relativePath: current.relativePath, verifiedAt: new Date().toISOString() };
        await FileSystem.writeAsStringAsync(stagingRecord, JSON.stringify(record), { encoding: FileSystem.EncodingType.UTF8 });
        await deleteLocation(current.directory);
        await FileSystem.moveAsync({ from: staging, to: current.directory });
        return current.assetUri;
      } catch (error) {
        lastError = error;
        await deleteLocation(staging);
        if (attempt < maximumDownloadAttempts && retryableDownloadFailure(error)) {
          await wait(retryDelayMs);
          continue;
        }
        if (error instanceof RemoteAssetIntegrityError) throw error;
        throw new RemoteAssetIntegrityError('asset-download-failed', 'Remote asset could not be downloaded.');
      }
    }
    throw new RemoteAssetIntegrityError('asset-download-failed', lastError instanceof Error ? lastError.message : 'Remote asset could not be downloaded.');
  });
  return cancelled(options.signal, operation);
};
