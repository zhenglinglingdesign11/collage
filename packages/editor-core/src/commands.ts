import type { AssetReference, BrushCutStroke, Draft, Effect, Layer } from './document';
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
  | Readonly<{ type: 'image.cut.brush'; layerId: string; cutLayerId: string; operationId: string; strokes: readonly BrushCutStroke[]; hollowOriginal: boolean }>
  | Readonly<{ type: 'image.cut.brush.update'; layerId: string; strokes: readonly BrushCutStroke[] }>
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
    case 'image.cut.brush': {
      const layer = draft.layers[layerIndex];
      if (layerIndex < 0 || layer.type !== 'image' || layer.isLocked || draft.layers.some((candidate) => candidate.id !== layer.id && candidate.id === command.cutLayerId)) return { draft, changed: false };
      if (!validBrushStrokes(command.strokes, layer.frame, layer.contentFrame)) return { draft, changed: false };
      const sourceLayerId = layer.cutFragment?.sourceLayerId ?? layer.id;
      // A freshly extracted region cannot remain exactly over the new hole:
      // the two layers then visually reconstruct the source and make every
      // later cut look like a no-op. Give each result a deterministic, small
      // canvas-space separation while retaining its source-space mask.
      const cutLayer = makeBrushCutFragment(
        layer,
        command.cutLayerId,
        `${layer.name ?? 'Image'} · cut`,
        sourceLayerId,
        command.operationId,
        command.strokes,
        undefined,
        brushCutResultOffset(draft.layers, sourceLayerId),
      );
      if (!command.hollowOriginal) return touch({ ...draft, layers: [...draft.layers.slice(0, layerIndex + 1), cutLayer, ...draft.layers.slice(layerIndex + 1)], selectedLayerId: cutLayer.id });
      // Splitting an already extracted fragment (b) must hollow b itself,
      // rather than merely placing a new d above it. Preserve its primary
      // include mask and accumulate an inner exclusion for every later cut.
      if (layer.brushCutMask?.mode === 'include') {
        const existingExcludes = toContentStrokes(
          layer.brushCutMask.excludeStrokes ?? [],
          layer.brushCutMask.coordinateSpace,
          layer.contentFrame,
        );
        const remainder = {
          ...layer,
          brushCutMask: {
            ...layer.brushCutMask,
            strokes: toContentStrokes(layer.brushCutMask.strokes, layer.brushCutMask.coordinateSpace, layer.contentFrame),
            excludeStrokes: [...existingExcludes, ...command.strokes],
            coordinateSpace: 'content' as const,
          },
        };
        return touch({ ...draft, layers: [...draft.layers.slice(0, layerIndex), remainder, cutLayer, ...draft.layers.slice(layerIndex + 1)], selectedLayerId: cutLayer.id });
      }
      // Each brush invocation owns only its new cut layer. The selected source
      // keeps an exclude union so prior independent cut results remain holes.
      const existingExclude = layer.brushCutMask?.mode === 'exclude'
        ? toContentStrokes(layer.brushCutMask.strokes, layer.brushCutMask.coordinateSpace, layer.contentFrame)
        : [];
      const remainder = { ...layer, brushCutMask: { mode: 'exclude' as const, strokes: [...existingExclude, ...command.strokes], coordinateSpace: 'content' as const }, cutFragment: { sourceLayerId, operationId: command.operationId, style: 'straight' as const } };
      return touch({ ...draft, layers: [...draft.layers.slice(0, layerIndex), remainder, cutLayer, ...draft.layers.slice(layerIndex + 1)], selectedLayerId: cutLayer.id });
    }
    case 'image.cut.brush.update': {
      const layer = draft.layers[layerIndex];
      if (layerIndex < 0 || layer.type !== 'image' || layer.isLocked || layer.brushCutMask?.mode !== 'include') return { draft, changed: false };
      if (JSON.stringify(layer.brushCutMask.strokes) === JSON.stringify(command.strokes)) return { draft, changed: false };
      const sourceLayerId = layer.cutFragment?.sourceLayerId ?? layer.id;
      const operationId = layer.cutFragment?.operationId ?? `brush-cut-${layer.id}`;
      const remainder = draft.layers.find((candidate): candidate is Extract<Layer, { type: 'image' }> => candidate.id !== layer.id && candidate.type === 'image' && candidate.brushCutMask?.mode === 'exclude' && (candidate.cutFragment?.operationId === operationId || candidate.id === sourceLayerId))
        ?? draft.layers.find((candidate): candidate is Extract<Layer, { type: 'image' }> => candidate.id !== layer.id && candidate.type === 'image' && candidate.asset.id === layer.asset.id && candidate.brushCutMask?.mode === 'exclude');
      // Both siblings persist exactly the same content-space strokes. The
      // renderer applies each layer's content-frame offset at draw time.
      const sourceFrame = remainder ?? layer;
      if (!validBrushStrokes(command.strokes, sourceFrame.frame, sourceFrame.contentFrame)) return { draft, changed: false };
      const sourceBounds = contentBoundsFor(sourceFrame);
      const updated = makeBrushCutFragment(layer, layer.id, layer.name ?? 'Image', sourceLayerId, operationId, command.strokes, sourceBounds);
      return touch({ ...draft, layers: draft.layers.map((candidate) => {
        if (candidate.id === layer.id) return updated;
        if (remainder !== undefined && candidate.id === remainder.id) return { ...candidate, brushCutMask: { mode: 'exclude' as const, strokes: command.strokes, coordinateSpace: 'content' as const } };
        return candidate;
      }), selectedLayerId: layer.id });
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

/** Creates a tight, still non-destructive fragment around the visible brush strokes. */
const makeBrushCutFragment = (layer: Extract<Layer, { type: 'image' }>, id: string, name: string, sourceLayerId: string, operationId: string, strokes: readonly BrushCutStroke[], contentBounds?: Rect, nudge: Point = { x: 0, y: 0 }) => {
  const bounds = brushStrokeBounds(strokes, layer.frame, layer.contentFrame, contentBounds);
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
  const translatePoint = (point: Point): Point => ({ x: point.x - bounds.x, y: point.y - bounds.y });
  return {
    ...layer,
    id,
    name,
    frame: nextFrame,
    transform: { ...layer.transform, position: { x: layer.transform.position.x + originalCenter.x + mappedOffset.x - nextCenter.x + mappedNewCenter.x + nudge.x, y: layer.transform.position.y + originalCenter.y + mappedOffset.y - nextCenter.y + mappedNewCenter.y + nudge.y } },
    contentFrame: { ...content, x: content.x - bounds.x, y: content.y - bounds.y },
    ...(layer.clipPath ? { clipPath: layer.clipPath.map(translatePoint) } : {}),
    ...(layer.clipPaths ? { clipPaths: layer.clipPaths.map((path) => path.map(translatePoint)) } : {}),
    brushCutMask: { mode: 'include' as const, strokes, coordinateSpace: 'content' as const },
    cutFragment: { sourceLayerId, operationId, style: 'straight' as const },
  };
};

/**
 * Keep successive freehand results visibly separate from their remainder and
 * from one another. This is presentation geometry only; all masks remain in
 * their shared original content coordinate system.
 */
const brushCutResultOffset = (layers: readonly Layer[], sourceLayerId: string): Point => {
  const priorResults = layers.filter((candidate) => candidate.type === 'image'
    && candidate.brushCutMask?.mode === 'include'
    && candidate.cutFragment?.sourceLayerId === sourceLayerId).length;
  const step = priorResults + 1;
  return { x: 36 * step, y: 48 * step };
};

const contentBoundsFor = (layer: Extract<Layer, { type: 'image' }>): Rect => {
  const contentFrame = layer.contentFrame ?? { x: 0, y: 0 };
  return { x: -contentFrame.x, y: -contentFrame.y, width: layer.frame.width, height: layer.frame.height };
};

const toContentStrokes = (strokes: readonly BrushCutStroke[], coordinateSpace: 'content' | undefined, contentFrame?: Rect): readonly BrushCutStroke[] => {
  if (coordinateSpace === 'content') return strokes;
  const offset = contentFrame ?? { x: 0, y: 0 };
  return strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ x: point.x - offset.x, y: point.y - offset.y })) }));
};

const brushStrokeBounds = (strokes: readonly BrushCutStroke[], frame: { width: number; height: number }, contentFrame?: Rect, contentBounds?: Rect): Rect => {
  const offset = contentFrame ?? { x: 0, y: 0 };
  const bounds = contentBounds ?? { x: -offset.x, y: -offset.y, width: frame.width, height: frame.height };
  const minX = bounds.x + offset.x;
  const minY = bounds.y + offset.y;
  const maxX = minX + bounds.width;
  const maxY = minY + bounds.height;
  const extents = strokes.flatMap((stroke) => stroke.points.map((point) => ({
    left: Math.max(minX, point.x + offset.x - stroke.size / 2),
    top: Math.max(minY, point.y + offset.y - stroke.size / 2),
    right: Math.min(maxX, point.x + offset.x + stroke.size / 2),
    bottom: Math.min(maxY, point.y + offset.y + stroke.size / 2),
  })));
  const left = Math.min(...extents.map((extent) => extent.left));
  const top = Math.min(...extents.map((extent) => extent.top));
  const right = Math.max(...extents.map((extent) => extent.right));
  const bottom = Math.max(...extents.map((extent) => extent.bottom));
  return { x: left, y: top, width: Math.max(0.001, right - left), height: Math.max(0.001, bottom - top) };
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

const validBrushStrokes = (strokes: readonly BrushCutStroke[], frame: { width: number; height: number }, contentFrame?: Rect): boolean => {
  const offset = contentFrame ?? { x: 0, y: 0 };
  return strokes.length > 0 && strokes.every((stroke) => Number.isFinite(stroke.size) && stroke.size > 0 && stroke.points.length > 0 && stroke.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x + offset.x >= 0 && point.y + offset.y >= 0 && point.x + offset.x <= frame.width && point.y + offset.y <= frame.height));
};
