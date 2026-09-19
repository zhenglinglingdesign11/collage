import type { Draft, Size } from '@journalcollage/editor-core';

/**
 * A content identity resolved outside the Draft. Runtime URIs deliberately do
 * not participate: a Portable Project must render identically after its local
 * resource files move to a different device directory.
 */
export type RenderAssetIdentity = Readonly<{
  referenceId: string;
  revision: string;
  byteHash: string;
  width: number;
  height: number;
  mimeType: string | null;
}>;

export type RenderParitySnapshot = Readonly<{
  target: 'preview' | 'thumbnail' | 'export';
  size: Size;
  /** The scene is independent of output scale, provided the aspect ratio agrees. */
  aspectRatio: number;
  document: Draft;
  assets: readonly RenderAssetIdentity[];
}>;

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/**
 * Captures every persistent input to the production scene while excluding UI
 * state and device-specific URIs. Native snapshot tests can hash their PNG
 * output alongside this record; Node tests use it to ensure a restore has the
 * same renderer inputs before asking Skia to draw them.
 */
export const renderParitySnapshot = (input: Readonly<{
  draft: Draft;
  target: RenderParitySnapshot['target'];
  size: Size;
  assets: readonly RenderAssetIdentity[];
}>): RenderParitySnapshot => ({
  target: input.target,
  size: input.size,
  aspectRatio: input.size.width / input.size.height,
  // Selection is editor chrome and intentionally absent from thumbnail/export.
  document: { ...input.draft, selectedLayerId: null },
  assets: [...input.assets].sort((left, right) => left.referenceId.localeCompare(right.referenceId)),
});

/** Stable comparable representation for original/rebuilt renderer inputs. */
export const renderParityFingerprint = (snapshot: RenderParitySnapshot): string => stableJson(snapshot);

