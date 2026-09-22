import * as FileSystem from 'expo-file-system/legacy';
import { createStableId, identityTransform, type Draft, type ImageLayer } from '@journalcollage/editor-core';
import type { AssetCatalog } from '@journalcollage/asset-system';

/**
 * Development-only authoring data. This is intentionally not a TemplateDefinition:
 * unpublished `user://` assets remain usable for visual composition, but can never
 * accidentally be shipped as a production template dependency.
 */
export const TEMPLATE_STUDIO_FORMAT = 'journalcollage.template-studio' as const;
export const TEMPLATE_STUDIO_FORMAT_VERSION = 1 as const;
const PHOTO_SLOT_PREFIX = 'asset://template-studio/photo-slot/';
const templateStudioDirectory = `${FileSystem.documentDirectory}journalcollage/template-studio/`;

export const isTemplateStudioPhotoSlot = (layer: Draft['layers'][number]): boolean =>
  layer.type === 'image' && layer.asset.id.startsWith(PHOTO_SLOT_PREFIX);

/** Replaces a temporary composition photo once its geometry is calibrated. */
export const templateStudioPhotoSlotAsset = (layerId: string): ImageLayer['asset'] => ({
  id: `${PHOTO_SLOT_PREFIX}${layerId}`,
  kind: 'image',
  revision: '1',
});

/** A normal Draft image layer gives the existing editor all transform/select tooling for free. */
export const createTemplateStudioPhotoSlot = (canvas: Draft['canvas']['size']): ImageLayer => {
  const id = createStableId('template-photo-slot');
  const frame = { width: Math.round(canvas.width * 0.62), height: Math.round(canvas.height * 0.62) };
  return {
    id,
    name: 'Photo slot',
    type: 'image',
    asset: templateStudioPhotoSlotAsset(id),
    frame,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    transform: { ...identityTransform(), position: { x: (canvas.width - frame.width) / 2, y: (canvas.height - frame.height) / 2 } },
    opacity: 1,
    isLocked: false,
    effects: [],
  };
};

export type TemplateStudioPayload = Readonly<{
  format: typeof TEMPLATE_STUDIO_FORMAT;
  formatVersion: typeof TEMPLATE_STUDIO_FORMAT_VERSION;
  exportedAt: string;
  /** Draft semantics are retained only so the existing editor can stay lightweight. */
  document: Draft;
  /** These layers compile to photoSlots later; every other layer is authoring fixed content. */
  photoSlotLayerIds: readonly string[];
  /** Metadata only: local URIs never leave the simulator in this JSON. */
  localAssets: readonly Readonly<{
    reference: Readonly<{ id: string; kind: string; revision?: string }>;
    mimeType: string | null;
    pixelSize: Readonly<{ width: number; height: number }>;
  }>[];
}>;

export const templateStudioPayload = (draft: Draft, catalog: AssetCatalog): TemplateStudioPayload => ({
  format: TEMPLATE_STUDIO_FORMAT,
  formatVersion: TEMPLATE_STUDIO_FORMAT_VERSION,
  exportedAt: new Date().toISOString(),
  document: { ...draft, selectedLayerId: null },
  photoSlotLayerIds: draft.layers.filter(isTemplateStudioPhotoSlot).map((layer) => layer.id),
  localAssets: catalog.assets
    .filter((record) => record.reference.id.startsWith('user://'))
    .map((record) => ({
      reference: record.reference,
      mimeType: record.mimeType,
      pixelSize: { width: record.width, height: record.height },
    })),
});

export const exportTemplateStudioJson = async (draft: Draft, catalog: AssetCatalog): Promise<string> => {
  await FileSystem.makeDirectoryAsync(templateStudioDirectory, { intermediates: true });
  const uri = `${templateStudioDirectory}${createStableId('template-studio')}.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(templateStudioPayload(draft, catalog), null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
};
