import { sha256HexForBytes, type AssetReference } from '@journalcollage/editor-core';

export type RemoteAssetIntegrityDescriptor = Readonly<{
  reference: Required<Pick<AssetReference, 'id' | 'kind' | 'revision'>>;
  packRevision: string;
  mimeType: 'image/png' | 'image/jpeg';
  byteLength: number;
  sha256: string;
  pixelSize: Readonly<{ width: number; height: number }>;
  sourceUrl: string;
}>;

export type RemoteAssetDownload = Readonly<{ bytes: Uint8Array; mimeType: string | null }>;

export type RemoteAssetIntegrityErrorCode =
  | 'asset-reference-invalid'
  | 'asset-download-cancelled'
  | 'asset-download-failed'
  | 'asset-content-type-invalid'
  | 'asset-size-mismatch'
  | 'asset-hash-mismatch'
  | 'asset-cache-record-invalid';

export class RemoteAssetIntegrityError extends Error {
  readonly code: RemoteAssetIntegrityErrorCode;
  constructor(code: RemoteAssetIntegrityErrorCode, message: string) {
    super(message);
    this.name = 'RemoteAssetIntegrityError';
    this.code = code;
  }
}

const fail = (code: RemoteAssetIntegrityErrorCode, message: string): never => { throw new RemoteAssetIntegrityError(code, message); };
const decimalRevision = (value: string): boolean => /^[1-9][0-9]*$/.test(value);
const assetId = (value: string): boolean => /^asset:\/\/pack\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const mime = (value: string | null): string | null => value?.split(';', 1)[0]?.trim().toLowerCase() ?? null;

export const validateRemoteAssetDescriptor = (descriptor: RemoteAssetIntegrityDescriptor): void => {
  const { reference, packRevision, byteLength, sha256, pixelSize, sourceUrl } = descriptor;
  let source: URL | null = null;
  try { source = new URL(sourceUrl); } catch { fail('asset-reference-invalid', 'Remote asset URL is invalid.'); }
  if (reference.kind !== 'image' || !assetId(reference.id) || !decimalRevision(reference.revision)
    || !decimalRevision(packRevision) || !Number.isSafeInteger(byteLength) || byteLength <= 0
    || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(pixelSize.width) || pixelSize.width <= 0
    || !Number.isSafeInteger(pixelSize.height) || pixelSize.height <= 0
    || source?.protocol !== 'https:' || !source?.hostname) {
    fail('asset-reference-invalid', 'Remote asset descriptor violates the stable asset contract.');
  }
};

const pngSize = (bytes: Uint8Array): { width: number; height: number } | null => {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
    || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const jpegSize = (bytes: Uint8Array): { width: number; height: number } | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (marker >= 0xc0 && marker <= 0xc3) return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    offset += 2 + length;
  }
  return null;
};

/** Validates raw response bytes without introducing a platform file-system dependency. */
export const validateRemoteAssetDownload = (descriptor: RemoteAssetIntegrityDescriptor, download: RemoteAssetDownload): void => {
  validateRemoteAssetDescriptor(descriptor);
  if (mime(download.mimeType) !== descriptor.mimeType) fail('asset-content-type-invalid', 'Remote asset response MIME type does not match its descriptor.');
  if (download.bytes.byteLength !== descriptor.byteLength) fail('asset-size-mismatch', 'Remote asset byte length does not match its descriptor.');
  if (sha256HexForBytes(download.bytes) !== descriptor.sha256) fail('asset-hash-mismatch', 'Remote asset hash does not match its descriptor.');
  const size = descriptor.mimeType === 'image/png' ? pngSize(download.bytes) : jpegSize(download.bytes);
  if (!size || size.width !== descriptor.pixelSize.width || size.height !== descriptor.pixelSize.height) {
    fail('asset-size-mismatch', 'Remote asset pixel size does not match its descriptor.');
  }
};

export const remoteAssetCacheKey = (descriptor: RemoteAssetIntegrityDescriptor): string =>
  `${descriptor.reference.id}\u0000${descriptor.reference.kind}\u0000${descriptor.reference.revision}\u0000${descriptor.sha256}`;

/** Shares an in-flight request but never persists platform state itself. */
export class RemoteAssetDownloadCoordinator<T> {
  private readonly pending = new Map<string, Promise<T>>();

  run(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const result = operation();
    this.pending.set(key, result);
    void result.finally(() => {
      if (this.pending.get(key) === result) this.pending.delete(key);
    }).catch(() => {});
    return result;
  }
}

export const throwIfRemoteAssetDownloadCancelled = (signal?: AbortSignal): void => {
  if (signal?.aborted) fail('asset-download-cancelled', 'Remote asset download was cancelled.');
};
