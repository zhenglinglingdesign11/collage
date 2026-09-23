import * as FileSystem from 'expo-file-system/legacy';
import { createStableId, identityTransform, instantiateTemplateDefinition, migrateDraft, parseTemplateDefinition, type Draft, type ImageLayer } from '@journalcollage/editor-core';
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

export type TemplateStudioJsonFile = Readonly<{ name: string; uri: string }>;

/** Files saved by Studio live in the app sandbox, outside the system Files picker. */
export const listTemplateStudioJsonFiles = async (): Promise<readonly TemplateStudioJsonFile[]> => {
  const directory = await FileSystem.getInfoAsync(templateStudioDirectory);
  if (!directory.exists || !directory.isDirectory) return [];
  const names = await FileSystem.readDirectoryAsync(templateStudioDirectory);
  return names
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ name, uri: `${templateStudioDirectory}${name}` }));
};

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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Imports only the authoring envelope produced above. Local user assets are
 * intentionally metadata-only on export, so accepting them here would create
 * invisible or wrong layers on another device.
 */
export const parseTemplateStudioJson = (raw: unknown): Draft => {
  if (isRecord(raw) && raw.format === TEMPLATE_STUDIO_FORMAT && raw.formatVersion === TEMPLATE_STUDIO_FORMAT_VERSION) {
    if (!Array.isArray(raw.photoSlotLayerIds) || raw.photoSlotLayerIds.some((id) => typeof id !== 'string')) {
      throw new Error('JSON 缺少有效的照片槽信息。');
    }
    const migration = migrateDraft(raw.document);
    if (!migration.ok) {
      const summary = migration.issues.slice(0, 3).map((issue) => `${issue.path}: ${issue.message}`).join('\n');
      throw new Error(`JSON 画布数据无效。\n${summary}`);
    }
    const draft = { ...migration.draft, selectedLayerId: null };
    const photoSlotIds = new Set(raw.photoSlotLayerIds);
    const actualPhotoSlotIds = new Set(draft.layers.filter(isTemplateStudioPhotoSlot).map((layer) => layer.id));
    if (photoSlotIds.size !== raw.photoSlotLayerIds.length || photoSlotIds.size !== actualPhotoSlotIds.size || [...photoSlotIds].some((id) => !actualPhotoSlotIds.has(id))) {
      throw new Error('JSON 的照片槽与画布图层不一致。');
    }
    const localAssetReference = draft.canvas.backgroundAsset?.id.startsWith('user://') === true
      || draft.layers.some((layer) => (layer.type === 'image' || layer.type === 'material') && layer.asset.id.startsWith('user://'));
    if (localAssetReference) {
      throw new Error('该 JSON 包含仅存在于原设备的本地素材，无法安全导入。请先将这些素材替换为素材库资源后再导出。');
    }
    return draft;
  }

  // A compiled TemplateDefinition can also be reopened for calibration. Convert
  // its generated photo placeholders to Studio slots so a subsequent export is
  // again an editable Studio document, not a user-facing project draft.
  const parsedTemplate = parseTemplateDefinition(raw);
  if (!parsedTemplate.ok) {
    const summary = parsedTemplate.issues.slice(0, 3).map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`请选择 Template Studio 导出或已编译的模板 JSON。\n${summary}`);
  }
  const instantiated = instantiateTemplateDefinition(parsedTemplate.template, { now: new Date().toISOString(), projectId: createStableId('template-studio') });
  const slotLayerIds = new Set(Object.values(instantiated.photoSlotLayerIds));
  return {
    ...instantiated.draft,
    selectedLayerId: null,
    layers: instantiated.draft.layers.map((layer) => layer.type === 'image' && slotLayerIds.has(layer.id)
      ? { ...layer, asset: templateStudioPhotoSlotAsset(layer.id) }
      : layer),
  };
};

export const importTemplateStudioJson = async (uri: string): Promise<Draft> => {
  let raw: unknown;
  try {
    raw = JSON.parse(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 }));
  } catch {
    throw new Error('无法读取 JSON 文件，请确认文件没有损坏。');
  }
  return parseTemplateStudioJson(raw);
};
