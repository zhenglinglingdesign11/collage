import type { AssetReference, Draft, Effect, Layer } from './document';
import type { Point, Rect, Transform } from './geometry';
import { splitPolygonByLine, splitPolygonByWave, waveCutSidesForFrame } from './straightCut';

/** Every persistent editor mutation is an explicit, serializable command. */
export type EditorCommand =
  | Readonly<{ type: 'layer.add'; layer: Layer }>
  | Readonly<{ type: 'layer.delete'; layerId: string }>
  | Readonly<{ type: 'layer.duplicate'; layerId: string; duplicate: Layer }>
  | Readonly<{ type: 'layer.reorder'; layerId: string; toIndex: number }>
  | Readonly<{ type: 'layer.transform'; layerId: string; transform: Transform }>
  | Readonly<{ type: 'layer.effects.set'; layerId: string; effects: readonly Effect[] }>
  | Readonly<{ type: 'layer.crop.set'; layerId: string; crop: Rect }>
  | Readonly<{ type: 'image.cut.straight'; layerId: string; start: Point; end: Point; firstLayerId: string; secondLayerId: string; operationId: string; gap: number; style: 'straight' | 'wave' }>
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
    case 'image.cut.straight': {
      const layer = draft.layers[layerIndex];
      if (layerIndex < 0 || layer.type !== 'image' || layer.isLocked) return { draft, changed: false };
      if (![command.start.x, command.start.y, command.end.x, command.end.y, command.gap].every(Number.isFinite)) return { draft, changed: false };
      if (command.firstLayerId === command.secondLayerId || draft.layers.some((candidate) => candidate.id !== layer.id && (candidate.id === command.firstLayerId || candidate.id === command.secondLayerId))) return { draft, changed: false };
      const sourcePolygon = layer.clipPath ?? [
        { x: 0, y: 0 }, { x: layer.frame.width, y: 0 },
        { x: layer.frame.width, y: layer.frame.height }, { x: 0, y: layer.frame.height },
      ];
      const stackWaveClip = command.style === 'wave' && (layer.cutFragment?.style === 'wave' || layer.clipPaths !== undefined);
      const pieces = stackWaveClip
        ? waveCutSidesForFrame(layer.frame, command.start, command.end)
        : command.style === 'wave'
          ? splitPolygonByWave(sourcePolygon, command.start, command.end)
          : splitPolygonByLine(sourcePolygon, command.start, command.end);
      if (pieces === null) return { draft, changed: false };
      const sourceLayerId = layer.cutFragment?.sourceLayerId ?? layer.id;
      const gap = Math.max(0, Math.min(80, command.gap));
      const dx = command.end.x - command.start.x;
      const dy = command.end.y - command.start.y;
      const length = Math.hypot(dx, dy);
      const localNormal = { x: -dy / length, y: dx / length };
      const scaledNormal = { x: localNormal.x * layer.transform.scale.x, y: localNormal.y * layer.transform.scale.y };
      const cos = Math.cos(layer.transform.rotation);
      const sin = Math.sin(layer.transform.rotation);
      const canvasNormal = { x: scaledNormal.x * cos - scaledNormal.y * sin, y: scaledNormal.x * sin + scaledNormal.y * cos };
      const offset = { x: canvasNormal.x * gap / 2, y: canvasNormal.y * gap / 2 };
      const first = stackWaveClip
        ? makeStackedWaveFragment(layer, pieces[0], command.firstLayerId, `${layer.name ?? 'Image'} · 1`, sourceLayerId, command.operationId, offset)
        : makeStraightCutFragment(layer, pieces[0], command.firstLayerId, `${layer.name ?? 'Image'} · 1`, sourceLayerId, command.operationId, command.style, offset);
      const second = stackWaveClip
        ? makeStackedWaveFragment(layer, pieces[1], command.secondLayerId, `${layer.name ?? 'Image'} · 2`, sourceLayerId, command.operationId, { x: -offset.x, y: -offset.y })
        : makeStraightCutFragment(layer, pieces[1], command.secondLayerId, `${layer.name ?? 'Image'} · 2`, sourceLayerId, command.operationId, command.style, { x: -offset.x, y: -offset.y });
      return touch({ ...draft, layers: [...draft.layers.slice(0, layerIndex), first, second, ...draft.layers.slice(layerIndex + 1)], selectedLayerId: first.id });
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

const makeStraightCutFragment = (layer: Extract<Layer, { type: 'image' }>, polygon: readonly Point[], id: string, name: string, sourceLayerId: string, operationId: string, style: 'straight' | 'wave', nudge: Point) => {
  const bounds = polygonBounds(polygon);
  const originalCenter = { x: layer.frame.width / 2, y: layer.frame.height / 2 };
  const nextFrame = { width: bounds.width, height: bounds.height };
  const nextCenter = { x: nextFrame.width / 2, y: nextFrame.height / 2 };
  const localOffset = { x: bounds.x - originalCenter.x, y: bounds.y - originalCenter.y };
  const cos = Math.cos(layer.transform.rotation);
  const sin = Math.sin(layer.transform.rotation);
  const mapVector = (point: Point): Point => ({
    x: point.x * layer.transform.scale.x * cos - point.y * layer.transform.scale.y * sin,
    y: point.x * layer.transform.scale.x * sin + point.y * layer.transform.scale.y * cos,
  });
  const mappedOffset = mapVector(localOffset);
  const mappedNewCenter = mapVector(nextCenter);
  const content = layer.contentFrame ?? { x: 0, y: 0, width: layer.frame.width, height: layer.frame.height };
  return {
    ...layer,
    id,
    name,
    frame: nextFrame,
    transform: { ...layer.transform, position: { x: layer.transform.position.x + originalCenter.x + mappedOffset.x - nextCenter.x + mappedNewCenter.x + nudge.x, y: layer.transform.position.y + originalCenter.y + mappedOffset.y - nextCenter.y + mappedNewCenter.y + nudge.y } },
    contentFrame: { ...content, x: content.x - bounds.x, y: content.y - bounds.y },
    clipPath: polygon.map((point) => ({ x: point.x - bounds.x, y: point.y - bounds.y })),
    cutFragment: { sourceLayerId, operationId, style },
  };
};

const makeStackedWaveFragment = (layer: Extract<Layer, { type: 'image' }>, waveSide: readonly Point[], id: string, name: string, sourceLayerId: string, operationId: string, nudge: Point) => {
  const existingPaths = layer.clipPaths ?? (layer.clipPath ? [layer.clipPath] : []);
  return {
    ...layer,
    id,
    name,
    transform: { ...layer.transform, position: { x: layer.transform.position.x + nudge.x, y: layer.transform.position.y + nudge.y } },
    clipPaths: [...existingPaths, waveSide],
    cutFragment: { sourceLayerId, operationId, style: 'wave' as const },
  };
};

const polygonBounds = (polygon: readonly Point[]) => {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(0.001, Math.max(...xs) - x), height: Math.max(0.001, Math.max(...ys) - y) };
};
