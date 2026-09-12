import type { AssetReference, Draft, Effect, Layer } from './document';
import type { Rect, Transform } from './geometry';

/** Every persistent editor mutation is an explicit, serializable command. */
export type EditorCommand =
  | Readonly<{ type: 'layer.add'; layer: Layer }>
  | Readonly<{ type: 'layer.delete'; layerId: string }>
  | Readonly<{ type: 'layer.duplicate'; layerId: string; duplicate: Layer }>
  | Readonly<{ type: 'layer.reorder'; layerId: string; toIndex: number }>
  | Readonly<{ type: 'layer.transform'; layerId: string; transform: Transform }>
  | Readonly<{ type: 'layer.effects.set'; layerId: string; effects: readonly Effect[] }>
  | Readonly<{ type: 'layer.crop.set'; layerId: string; crop: Rect }>
  | Readonly<{ type: 'layer.opacity.set'; layerId: string; opacity: number }>
  | Readonly<{ type: 'text.content.set'; layerId: string; text: string }>
  | Readonly<{ type: 'text.style.set'; layerId: string; fontId?: string; fontVariantId?: string; fontSize?: number; color?: string; textAlign?: 'left' | 'center' | 'right'; backgroundColor?: string | null }>
  | Readonly<{ type: 'layer.lock.set'; layerId: string; isLocked: boolean }>
  | Readonly<{ type: 'image.asset.replace'; layerId: string; asset: AssetReference }>
  | Readonly<{ type: 'canvas.background.set'; background: string; asset: AssetReference | null }>
  | Readonly<{ type: 'layer.select'; layerId: string | null }>;

export type CommandResult = Readonly<{ draft: Draft; changed: boolean }>;

export const applyCommand = (draft: Draft, command: EditorCommand, now: string): CommandResult => {
  const touch = (next: Draft): CommandResult => ({ draft: { ...next, updatedAt: now }, changed: true });
  const layerIndex = 'layerId' in command ? draft.layers.findIndex((layer) => layer.id === command.layerId) : -1;

  switch (command.type) {
    case 'layer.add':
      if (draft.layers.some((layer) => layer.id === command.layer.id)) return { draft, changed: false };
      return touch({ ...draft, layers: [...draft.layers, command.layer], selectedLayerId: command.layer.id });
    case 'layer.delete':
      if (layerIndex < 0) return { draft, changed: false };
      return touch({
        ...draft,
        layers: draft.layers.filter((layer) => layer.id !== command.layerId),
        selectedLayerId: draft.selectedLayerId === command.layerId ? null : draft.selectedLayerId,
      });
    case 'layer.duplicate':
      if (layerIndex < 0 || draft.layers.some((layer) => layer.id === command.duplicate.id)) return { draft, changed: false };
      return touch({
        ...draft,
        layers: [...draft.layers.slice(0, layerIndex + 1), command.duplicate, ...draft.layers.slice(layerIndex + 1)],
        selectedLayerId: command.duplicate.id,
      });
    case 'layer.reorder': {
      if (layerIndex < 0) return { draft, changed: false };
      const target = Math.max(0, Math.min(command.toIndex, draft.layers.length - 1));
      if (target === layerIndex) return { draft, changed: false };
      const layers = [...draft.layers];
      const [layer] = layers.splice(layerIndex, 1);
      layers.splice(target, 0, layer);
      return touch({ ...draft, layers });
    }
    case 'layer.transform':
      if (layerIndex < 0) return { draft, changed: false };
      return touch({ ...draft, layers: draft.layers.map((layer) => layer.id === command.layerId ? { ...layer, transform: command.transform } : layer) });
    case 'layer.effects.set':
      if (layerIndex < 0) return { draft, changed: false };
      if (JSON.stringify(draft.layers[layerIndex].effects) === JSON.stringify(command.effects)) return { draft, changed: false };
      return touch({ ...draft, layers: draft.layers.map((layer) => layer.id === command.layerId ? { ...layer, effects: command.effects } : layer) });
    case 'layer.crop.set': {
      const layer = draft.layers[layerIndex];
      if (layerIndex < 0 || layer.type !== 'image') return { draft, changed: false };
      if (command.crop.width <= 0 || command.crop.height <= 0 || command.crop.x < 0 || command.crop.y < 0 || command.crop.x + command.crop.width > 1 || command.crop.y + command.crop.height > 1) return { draft, changed: false };
      if (JSON.stringify(layer.crop) === JSON.stringify(command.crop)) return { draft, changed: false };
      return touch({ ...draft, layers: draft.layers.map((candidate) => candidate.id === command.layerId ? { ...candidate, crop: command.crop } : candidate) });
    }
    case 'layer.lock.set':
      if (layerIndex < 0 || draft.layers[layerIndex].isLocked === command.isLocked) return { draft, changed: false };
      return touch({ ...draft, layers: draft.layers.map((layer) => layer.id === command.layerId ? { ...layer, isLocked: command.isLocked } : layer) });
    case 'layer.opacity.set':
      if (layerIndex < 0 || command.opacity < 0 || command.opacity > 1 || draft.layers[layerIndex].opacity === command.opacity) return { draft, changed: false };
      return touch({ ...draft, layers: draft.layers.map((layer) => layer.id === command.layerId ? { ...layer, opacity: command.opacity } : layer) });
    case 'text.content.set': {
      const layer = draft.layers[layerIndex];
      if (layerIndex < 0 || layer.type !== 'text' || layer.text === command.text) return { draft, changed: false };
      return touch({ ...draft, layers: draft.layers.map((candidate) => candidate.id === command.layerId && candidate.type === 'text' ? { ...candidate, text: command.text } : candidate) });
    }
    case 'text.style.set': {
      const layer = draft.layers[layerIndex];
      if (layerIndex < 0 || layer.type !== 'text') return { draft, changed: false };
      if (command.fontSize !== undefined && (!Number.isFinite(command.fontSize) || command.fontSize < 12 || command.fontSize > 320)) return { draft, changed: false };
      const next = {
        ...layer,
        ...(command.fontId !== undefined ? { fontId: command.fontId } : {}),
        ...(command.fontVariantId !== undefined ? { fontVariantId: command.fontVariantId } : {}),
        ...(command.fontSize !== undefined ? { fontSize: command.fontSize } : {}),
        ...(command.color !== undefined ? { color: command.color } : {}),
        ...(command.textAlign !== undefined ? { textAlign: command.textAlign } : {}),
        ...(command.backgroundColor !== undefined ? { backgroundColor: command.backgroundColor } : {}),
      };
      if (JSON.stringify(layer) === JSON.stringify(next)) return { draft, changed: false };
      return touch({ ...draft, layers: draft.layers.map((candidate) => candidate.id === command.layerId && candidate.type === 'text' ? next : candidate) });
    }
    case 'image.asset.replace': {
      const layer = draft.layers[layerIndex];
      if (layerIndex < 0 || layer.type !== 'image' || layer.asset.id === command.asset.id) return { draft, changed: false };
      return touch({ ...draft, layers: draft.layers.map((candidate) => candidate.id === command.layerId && candidate.type === 'image' ? { ...candidate, asset: command.asset, crop: { x: 0, y: 0, width: 1, height: 1 } } : candidate) });
    }
    case 'canvas.background.set': {
      const currentAsset = draft.canvas.backgroundAsset;
      if (draft.canvas.background === command.background && currentAsset?.id === command.asset?.id) return { draft, changed: false };
      const { backgroundAsset: _backgroundAsset, ...canvas } = draft.canvas;
      return touch({
        ...draft,
        canvas: command.asset === null
          ? { ...canvas, background: command.background }
          : { ...canvas, background: command.background, backgroundAsset: command.asset },
      });
    }
    case 'layer.select':
      if (command.layerId !== null && !draft.layers.some((layer) => layer.id === command.layerId)) return { draft, changed: false };
      if (command.layerId === draft.selectedLayerId) return { draft, changed: false };
      return { draft: { ...draft, selectedLayerId: command.layerId }, changed: true };
  }
};
