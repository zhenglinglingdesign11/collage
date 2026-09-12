import {
  BlurMask,
  Circle,
  Canvas,
  DashPathEffect,
  Fill,
  Group,
  Image as SkiaImage,
  Mask,
  matchFont,
  Path,
  Rect,
  RoundedRect,
  Skia,
  StrokeCap,
  StrokeJoin,
  Text,
  useFont,
  useImage,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { useMemo, type ReactNode } from 'react';
import type { BrushCutMask, BrushCutStroke, Draft, Effect, Layer, Point } from '@journalcollage/editor-core';
import type { SharedValue } from 'react-native-reanimated';

export type CanvasViewport = Readonly<{
  x: number;
  y: number;
  scale: number;
}>;

export type ActiveLayerPresentation = Readonly<{
  layerId: string | null;
  transform: SharedValue<Transforms3d>;
  /** Shared values are only authoritative while a gesture is in progress. */
  isInteracting?: boolean;
}>;

/** Ephemeral interaction state. It is intentionally not persisted in Draft. */
export type StraightCutPreview = Readonly<{ layerId: string; start: Point; end: Point; style: 'straight' | 'wave' }>;
export type BrushCutPreview = Readonly<{ layerId: string; strokes: readonly BrushCutStroke[] }>;

/** Product asset metadata supplied at render time; never persisted in a Draft. */
export type ProceduralPaperPaint = Readonly<{
  background: string;
  pattern: 'solid' | 'dot' | 'line' | 'square' | 'polka';
  foreground?: string;
  shape?: 'circle' | 'heart' | 'square' | 'diamond' | 'star' | 'cross' | 'image';
  opacity?: number;
  radius?: number;
  gap?: number;
  style?: 'solid' | 'soft' | 'outline';
  offset?: 'grid' | 'staggered';
  imageAsset?: '24' | '7' | '1';
}>;

export type ProceduralStickerPaint = Readonly<{
  shape: 'circle' | 'square' | 'triangle' | 'heart' | 'star' | 'sparkle' | 'flower' | 'raindrop' | 'diamond' | 'rounded' | 'cross' | 'tag';
  fillColor: string;
  strokeColor?: string;
  strokeWidth?: number;
  opacity: number;
  count: 1 | 3 | 6 | 9;
  layout: 'single' | 'row' | 'grid' | 'scatter';
  textureSource?: string;
}>;

/** A lightweight product-surface preview that uses the exact canvas paper renderer. */
export const ProceduralPaperPreview = ({ paper, patternImageUri, size }: Readonly<{ paper: ProceduralPaperPaint; patternImageUri?: string; size: { width: number; height: number } }>) => (
  <Canvas style={{ height: size.height, width: size.width }}>
    <Group transform={[{ scaleX: size.width / 580 }, { scaleY: size.height / 760 }]}><ProceduralPaperLayer frame={{ width: 580, height: 760 }} paper={paper} patternImageUri={patternImageUri} /></Group>
  </Canvas>
);

/** Uses the same compositing code as an editor layer, so drawer artwork cannot drift from the canvas. */
export const ProceduralStickerPreview = ({ sticker, size, textureUri }: Readonly<{ sticker: ProceduralStickerPaint; size: { width: number; height: number }; textureUri?: string | null }>) => (
  <Canvas style={{ height: size.height, width: size.width }}>
    <ProceduralStickerLayer frame={size} sticker={sticker} textureUri={textureUri} />
  </Canvas>
);

type SkiaEditorSceneProps = Readonly<{
  draft: Draft;
  viewport: CanvasViewport;
  activeLayer: ActiveLayerPresentation;
  assetUris?: Readonly<Record<string, string>>;
  proceduralPapers?: Readonly<Record<string, ProceduralPaperPaint>>;
  proceduralStickers?: Readonly<Record<string, ProceduralStickerPaint>>;
  /** Native adapter resolved font files; never stored in a Draft. */
  fontUris?: Readonly<Record<string, string>>;
  fontSupportsCjk?: Readonly<Record<string, boolean>>;
  /** Canvas-owned paper/background input resolved from Draft.canvas.backgroundAsset. */
  canvasBackgroundUri?: string;
  canvasBackgroundPaper?: ProceduralPaperPaint;
  showSelection?: boolean;
  /** Preview-only stage color. It is deliberately not stored in the Draft. */
  surfaceColor?: string;
  straightCutPreview?: StraightCutPreview | null;
  brushCutPreview?: BrushCutPreview | null;
}>;

/**
 * The A1 scene deliberately renders fixture assets as material placeholders.
 * A later AssetResolver will replace only the content drawing, not its Draft
 * or transform contract.
 */
export const SkiaEditorScene = ({ draft, viewport, activeLayer, assetUris = {}, proceduralPapers = {}, proceduralStickers = {}, fontUris = {}, fontSupportsCjk = {}, canvasBackgroundUri, canvasBackgroundPaper, showSelection = true, surfaceColor = '#D9D2C7', straightCutPreview = null, brushCutPreview = null }: SkiaEditorSceneProps) => (
  <>
    <Fill color={surfaceColor} />
    <Group transform={[{ translateX: viewport.x }, { translateY: viewport.y }, { scale: viewport.scale }]}>
      <CanvasBackground frame={draft.canvas.size} color={draft.canvas.background} paper={canvasBackgroundPaper} assetUri={canvasBackgroundUri} />
      {draft.layers.map((layer) => (
        <SkiaLayer
          key={layer.id}
          layer={layer}
          selected={showSelection && draft.selectedLayerId === layer.id}
          transform={activeLayer.isInteracting === true && activeLayer.layerId === layer.id ? activeLayer.transform : layerTransform(layer)}
          assetUri={layer.type === 'image' ? assetUris[layer.asset.id] : undefined}
          proceduralPaper={layer.type === 'image' ? proceduralPapers[layer.asset.id] : undefined}
          proceduralSticker={layer.type === 'image' ? proceduralStickers[layer.asset.id] : undefined}
          fontUri={layer.type === 'text' ? fontUris[layer.fontVariantId] : undefined}
          fontSupportsCjk={layer.type === 'text' ? fontSupportsCjk[layer.fontVariantId] : undefined}
          straightCutPreview={straightCutPreview?.layerId === layer.id ? straightCutPreview : null}
          brushCutPreview={brushCutPreview?.layerId === layer.id ? brushCutPreview : null}
        />
      ))}
    </Group>
  </>
);

/**
 * Canvas backgrounds intentionally bypass the layer renderer: they cannot be
 * selected, reordered, or accidentally exported with layer transforms.
 */
const CanvasBackground = ({ frame, color, paper, assetUri }: Readonly<{ frame: { width: number; height: number }; color: string; paper?: ProceduralPaperPaint; assetUri?: string }>) => {
  const image = useImage(paper === undefined ? assetUri : undefined);
  if (paper !== undefined) return <ProceduralPaperLayer frame={frame} paper={paper} patternImageUri={assetUri} />;
  return <>
    <RoundedRect x={0} y={0} width={frame.width} height={frame.height} r={4} color={color} />
    {image && <SkiaImage image={image} x={0} y={0} width={frame.width} height={frame.height} fit="cover" />}
  </>;
};

type SkiaLayerProps = Readonly<{
  layer: Layer;
  selected: boolean;
  transform: Transforms3d | SharedValue<Transforms3d>;
  assetUri?: string;
  proceduralPaper?: ProceduralPaperPaint;
  proceduralSticker?: ProceduralStickerPaint;
  fontUri?: string;
  fontSupportsCjk?: boolean;
  straightCutPreview: StraightCutPreview | null;
  brushCutPreview: BrushCutPreview | null;
}>;

const SkiaLayer = ({ layer, selected, transform, assetUri, proceduralPaper, proceduralSticker, fontUri, fontSupportsCjk, straightCutPreview, brushCutPreview }: SkiaLayerProps) => {
  const { frame } = layer;
  // Use the Android/iOS shared family name. `System` is not a resolvable
  // Android font family and can produce an empty SkFont there.
  const tornEdge = effectFor(layer.effects, 'torn-edge');
  const shadow = effectFor(layer.effects, 'shadow');
  const outline = effectFor(layer.effects, 'outline');
  const shapePath = useMemo(
    () => makeLayerPath(frame.width, frame.height, tornEdge?.seed, tornEdge?.intensity),
    [frame.height, frame.width, tornEdge?.intensity, tornEdge?.seed],
  );
  const cutPaths = useMemo(() => layer.type !== 'image' ? [] : layer.clipPaths ?? (layer.clipPath ? [layer.clipPath] : []), [layer]);
  const previewPath = useMemo(() => straightCutPreview ? (straightCutPreview.style === 'wave' ? makeWaveCutPath(straightCutPreview.start, straightCutPreview.end, frame) : makeStraightCutPath(straightCutPreview.start, straightCutPreview.end)) : null, [frame, straightCutPreview]);

  return (
    <Group transform={transform} origin={{ x: frame.width / 2, y: frame.height / 2 }} opacity={layer.opacity}>
      {shadow && <Group transform={[{ translateX: shadow.offset.x }, { translateY: shadow.offset.y }]} opacity={shadow.opacity}><Path path={shapePath} color={shadow.color}><BlurMask blur={shadow.blur} style="normal" /></Path></Group>}
      <Group clip={shapePath}>
        {layer.type === 'image' && <ImageLayerContent layer={layer} assetUri={assetUri} clipPaths={cutPaths} proceduralPaper={proceduralPaper} proceduralSticker={proceduralSticker} />}
        {layer.type === 'material' && <MaterialPlaceholder layer={layer} />}
        {layer.type === 'brush' && <BrushPlaceholder layer={layer} />}
        {layer.type === 'text' && <TextLayerContent layer={layer} fontSupportsCjk={fontSupportsCjk} fontUri={fontUri} />}
      </Group>
      {previewPath && <>
        <Path path={previewPath} color="rgba(17,17,17,0.78)" strokeCap="round" style="stroke" strokeWidth={10}><DashPathEffect intervals={[34, 28]} /></Path>
        <Circle cx={straightCutPreview!.start.x} cy={straightCutPreview!.start.y} r={28} color="rgba(255,255,255,0.94)" />
        <Circle cx={straightCutPreview!.start.x} cy={straightCutPreview!.start.y} r={28} color="#111111" style="stroke" strokeWidth={8} />
        <Circle cx={straightCutPreview!.end.x} cy={straightCutPreview!.end.y} r={28} color="rgba(255,255,255,0.94)" />
        <Circle cx={straightCutPreview!.end.x} cy={straightCutPreview!.end.y} r={28} color="#111111" style="stroke" strokeWidth={8} />
      </>}
      {brushCutPreview && <Path path={makeBrushStrokePath({ mode: 'include', strokes: brushCutPreview.strokes })} color="rgba(217,74,56,0.62)" />}
      {outline && <Path path={shapePath} color={outline.color} style="stroke" strokeWidth={outline.width} />}
      {selected && (
        <>
          <Rect x={-8} y={-8} width={frame.width + 16} height={frame.height + 16} color="#111111" style="stroke" strokeWidth={6} />
          <Rect x={-14} y={-14} width={16} height={16} color="#111111" />
          <Rect x={frame.width - 2} y={-14} width={16} height={16} color="#111111" />
          <Rect x={-14} y={frame.height - 2} width={16} height={16} color="#111111" />
          <Rect x={frame.width - 2} y={frame.height - 2} width={16} height={16} color="#111111" />
        </>
      )}
    </Group>
  );
};

const ImageLayerContent = ({ layer, assetUri, clipPaths, proceduralPaper, proceduralSticker }: Readonly<{ layer: Extract<Layer, { type: 'image' }>; assetUri?: string; clipPaths: readonly (readonly Point[])[]; proceduralPaper?: ProceduralPaperPaint; proceduralSticker?: ProceduralStickerPaint }>) => {
  const content = <ImagePlaceholder layer={layer} assetUri={assetUri} proceduralPaper={proceduralPaper} proceduralSticker={proceduralSticker} />;
  const clipped = clipPaths.reduceRight((child, points, index) => <Group key={`${index}-${points.length}`} clip={makePolygonPath(points)}>{child}</Group>, content);
  const contentFrame = layer.contentFrame ?? { x: 0, y: 0 };
  return layer.brushCutMask ? <BrushCutMaskedContent mask={layer.brushCutMask} offset={layer.brushCutMask.coordinateSpace === 'content' ? contentFrame : undefined}>{clipped}</BrushCutMaskedContent> : clipped;
};

const BrushCutMaskedContent = ({ children, mask, offset }: Readonly<{ children: ReactNode; mask: BrushCutMask; offset?: Point }>) => {
  const strokePath = useMemo(() => makeBrushStrokePath(mask, offset), [mask, offset]);
  const excludedPath = useMemo(() => makeBrushStrokePath({ mode: 'exclude', strokes: mask.excludeStrokes ?? [] }, offset), [mask.excludeStrokes, offset]);
  if (mask.mode === 'include') {
    // Build b − d in the alpha mask itself. Clearing the image content inside
    // a nested offscreen layer can leave an opaque white surface on iOS.
    const alphaMask = mask.excludeStrokes?.length
      ? <Group layer><Path path={strokePath} color="#FFFFFF" /><Path blendMode="clear" path={excludedPath} color="#000000" /></Group>
      : <Path path={strokePath} color="#FFFFFF" />;
    return <Mask mode="alpha" mask={alphaMask}><>{children}</></Mask>;
  }
  return <Group layer><>{children}</><Path blendMode="clear" path={strokePath} color="#000000" /></Group>;
};

const makePolygonPath = (points: readonly Point[]) => {
  const path = Skia.Path.Make();
  points.forEach((point, index) => index === 0 ? path.moveTo(point.x, point.y) : path.lineTo(point.x, point.y));
  path.close();
  return path;
};

const makeBrushStrokePath = (mask: BrushCutMask, offset: Point = { x: 0, y: 0 }) => {
  const output = Skia.Path.Make();
  mask.strokes.forEach((stroke) => {
    const path = Skia.Path.Make();
    stroke.points.forEach((point, index) => index === 0 ? path.moveTo(point.x + offset.x, point.y + offset.y) : path.lineTo(point.x + offset.x, point.y + offset.y));
    if (stroke.points.length === 1) path.lineTo(stroke.points[0].x + offset.x + 0.01, stroke.points[0].y + offset.y + 0.01);
    const stroked = path.stroke({ width: stroke.size, cap: StrokeCap.Round, join: StrokeJoin.Round });
    if (stroked) output.addPath(stroked);
  });
  return output;
};

const makeStraightCutPath = (start: Point, end: Point) => {
  const path = Skia.Path.Make();
  path.moveTo(start.x, start.y);
  path.lineTo(end.x, end.y);
  return path;
};

const makeWaveCutPath = (start: Point, end: Point, frame: { width: number; height: number }) => {
  const path = Skia.Path.Make();
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return path;
  const unit = { x: dx / length, y: dy / length };
  const normal = { x: -unit.y, y: unit.x };
  const amplitude = Math.min(44, Math.max(10, Math.min(frame.width, frame.height) * 0.08));
  const wavelength = Math.max(36, Math.min(120, Math.max(36, length * 0.55)));
  const steps = Math.max(18, Math.ceil(length / 8));
  for (let index = 0; index <= steps; index += 1) {
    const distance = length * index / steps;
    const wave = Math.sin(distance / wavelength * Math.PI * 2) * amplitude;
    const x = start.x + unit.x * distance + normal.x * wave;
    const y = start.y + unit.y * distance + normal.y * wave;
    if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  return path;
};

const TextLayerContent = ({ layer, fontSupportsCjk = false, fontUri }: Readonly<{ layer: Extract<Layer, { type: 'text' }>; fontSupportsCjk?: boolean; fontUri?: string }>) => {
  const downloadedFont = useFont(fontUri, layer.fontSize);
  // PingFang SC is the iOS system CJK face. matchFont falls back to the
  // platform default on other targets, so the document stays cross-platform.
  const systemFont = matchFont({ fontFamily: 'PingFang SC', fontSize: layer.fontSize });
  const decorativeFont = downloadedFont ?? systemFont;
  const runs = splitTextRuns(layer.text, fontSupportsCjk ? decorativeFont : systemFont, decorativeFont);
  const padding = 34;
  const width = runs.reduce((total, run) => total + run.font.measureText(run.text).width, 0);
  const x = layer.textAlign === 'right' ? layer.frame.width - padding - width : layer.textAlign === 'center' ? (layer.frame.width - width) / 2 : padding;
  let cursor = x;
  return <>
    {layer.backgroundColor !== null && <RoundedRect x={0} y={0} width={layer.frame.width} height={layer.frame.height} r={20} color={layer.backgroundColor} />}
    {runs.map((run, index) => { const runX = cursor; cursor += run.font.measureText(run.text).width; return <Text key={`${index}-${run.text}`} x={runX} y={layer.frame.height / 2 + layer.fontSize / 3} text={run.text} font={run.font} color={layer.color} />; })}
  </>;
};

const splitTextRuns = (text: string, cjkFont: ReturnType<typeof matchFont>, latinFont: ReturnType<typeof matchFont>) => {
  const isCjk = (character: string) => /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/.test(character);
  return Array.from(text).reduce<{ text: string; font: ReturnType<typeof matchFont>; cjk: boolean }[]>((runs, character) => {
    const cjk = isCjk(character);
    const previous = runs[runs.length - 1];
    if (previous && previous.cjk === cjk) previous.text += character;
    else runs.push({ text: character, font: cjk ? cjkFont : latinFont, cjk });
    return runs;
  }, []);
};

const ImagePlaceholder = ({ layer, assetUri, proceduralPaper, proceduralSticker }: { layer: Extract<Layer, { type: 'image' }>; assetUri?: string; proceduralPaper?: ProceduralPaperPaint; proceduralSticker?: ProceduralStickerPaint }) => {
  const image = useImage(assetUri);
  const contentFrame = layer.contentFrame ?? { x: 0, y: 0, width: layer.frame.width, height: layer.frame.height };
  if (proceduralPaper !== undefined) return <Group transform={[{ translateX: contentFrame.x }, { translateY: contentFrame.y }]}><ProceduralPaperLayer frame={contentFrame} paper={proceduralPaper} patternImageUri={assetUri} /></Group>;
  if (proceduralSticker !== undefined) return <Group transform={[{ translateX: contentFrame.x }, { translateY: contentFrame.y }]}><ProceduralStickerLayer frame={contentFrame} sticker={proceduralSticker} textureUri={assetUri} /></Group>;
  // A cut produces new fragment keys that remount this component. During the
  // one-frame `useImage` reload, a resolved URI is still a real image—not a
  // missing asset—so never replace it with the fixture artwork.
  if (assetUri !== undefined && image === null) return null;
  return (
  <Group transform={[{ translateX: contentFrame.x }, { translateY: contentFrame.y }, { translateX: -layer.crop.x * contentFrame.width / layer.crop.width }, { translateY: -layer.crop.y * contentFrame.height / layer.crop.height }, { scaleX: 1 / layer.crop.width }, { scaleY: 1 / layer.crop.height }]}>
    {image ? <SkiaImage image={image} x={0} y={0} width={contentFrame.width} height={contentFrame.height} fit="cover" /> : <><RoundedRect x={0} y={0} width={contentFrame.width} height={contentFrame.height} r={28} color="#5E7D79" /><Circle cx={contentFrame.width * 0.76} cy={contentFrame.height * 0.24} r={contentFrame.width * 0.1} color="#F8D88B" /><Rect x={0} y={contentFrame.height * 0.55} width={contentFrame.width} height={contentFrame.height * 0.45} color="#355C58" /><Rect x={0} y={contentFrame.height * 0.7} width={contentFrame.width} height={contentFrame.height * 0.3} color="#284A47" /></>}
  </Group>
  );
};

const ProceduralStickerLayer = ({ frame, sticker, textureUri }: { frame: { width: number; height: number }; sticker: ProceduralStickerPaint; textureUri?: string | null }) => {
  const texture = useImage(textureUri === undefined ? sticker.textureSource : textureUri);
  const placements = useMemo(() => makeStickerPlacements(sticker), [sticker]);
  const scale = Math.min(frame.width, frame.height) / 128;
  const offsetX = (frame.width - 128 * scale) / 2;
  const offsetY = (frame.height - 128 * scale) / 2;
  return <>{placements.map((placement, index) => {
    const cx = offsetX + placement.x * scale;
    const cy = offsetY + placement.y * scale;
    const path = makeStickerPath(sticker.shape, cx, cy, placement.size * scale);
    return <Group key={index} transform={[{ rotate: placement.rotation * Math.PI / 180 }]} origin={{ x: cx, y: cy }}>
      {texture ? <Group clip={path} opacity={sticker.opacity}><SkiaImage image={texture} x={0} y={0} width={frame.width} height={frame.height} fit="cover" /></Group> : <Path path={path} color={sticker.fillColor} opacity={sticker.opacity} />}
      {sticker.strokeColor && (sticker.strokeWidth ?? 0) > 0 && <Path path={path} color={sticker.strokeColor} style="stroke" strokeWidth={(sticker.strokeWidth ?? 0) * scale} opacity={sticker.opacity} />}
    </Group>;
  })}</>;
};

const makeStickerPlacements = (sticker: ProceduralStickerPaint): readonly Readonly<{ x: number; y: number; size: number; rotation: number }>[] => {
  if (sticker.layout === 'single') return [{ x: 64, y: 64, size: 42, rotation: 0 }];
  // Hearts are optically wider than a circle at the same nominal size. Keep
  // the row airy, while scaling down a six/nine item row to stay in bounds.
  if (sticker.layout === 'row') {
    if (sticker.count === 1) return [{ x: 64, y: 64, size: 24, rotation: 0 }];
    const size = sticker.count === 3 ? 14 : sticker.count === 6 ? 9 : 7;
    // Leave 20 logical pixels at each side after accounting for the widest
    // silhouette. This keeps texture-clipped shapes intact at the row edges.
    const start = 32;
    const spacing = 64 / (sticker.count - 1);
    return Array.from({ length: sticker.count }, (_, index) => ({ x: start + index * spacing, y: 64, size, rotation: 0 }));
  }
  if (sticker.layout === 'grid') return Array.from({ length: sticker.count }, (_, index) => ({ x: 32 + index % 3 * 32, y: 34 + Math.floor(index / 3) * 32, size: 14, rotation: 0 }));
  return Array.from({ length: sticker.count }, (_, index) => ({ x: 24 + Math.abs(Math.sin(index * 2.1)) * 72, y: 24 + Math.abs(Math.cos(index * 1.7)) * 72, size: 11 + index % 3 * 2, rotation: -18 + index % 5 * 9 }));
};

const makeStickerPath = (shape: ProceduralStickerPaint['shape'], cx: number, cy: number, size: number) => {
  const path = Skia.Path.Make();
  const addPolygon = (points: readonly Readonly<{ x: number; y: number }>[]) => {
    points.forEach((point, index) => index === 0 ? path.moveTo(point.x, point.y) : path.lineTo(point.x, point.y));
    path.close();
  };
  if (shape === 'circle') { path.addCircle(cx, cy, size); return path; }
  if (shape === 'square') { path.addRect({ x: cx - size, y: cy - size, width: size * 2, height: size * 2 }); return path; }
  if (shape === 'rounded') {
    const r = size * 0.3; const left = cx - size; const top = cy - size; const right = cx + size; const bottom = cy + size;
    path.moveTo(left + r, top); path.lineTo(right - r, top); path.quadTo(right, top, right, top + r); path.lineTo(right, bottom - r); path.quadTo(right, bottom, right - r, bottom); path.lineTo(left + r, bottom); path.quadTo(left, bottom, left, bottom - r); path.lineTo(left, top + r); path.quadTo(left, top, left + r, top); path.close(); return path;
  }
  if (shape === 'triangle') { addPolygon([{ x: cx, y: cy - size }, { x: cx + size, y: cy + size }, { x: cx - size, y: cy + size }]); return path; }
  if (shape === 'diamond') { addPolygon([{ x: cx, y: cy - size }, { x: cx + size, y: cy }, { x: cx, y: cy + size }, { x: cx - size, y: cy }]); return path; }
  if (shape === 'cross') { const arm = size * 0.3; addPolygon([{ x: cx - arm, y: cy - size }, { x: cx + arm, y: cy - size }, { x: cx + arm, y: cy - arm }, { x: cx + size, y: cy - arm }, { x: cx + size, y: cy + arm }, { x: cx + arm, y: cy + arm }, { x: cx + arm, y: cy + size }, { x: cx - arm, y: cy + size }, { x: cx - arm, y: cy + arm }, { x: cx - size, y: cy + arm }, { x: cx - size, y: cy - arm }, { x: cx - arm, y: cy - arm }]); return path; }
  if (shape === 'tag') { addPolygon([{ x: cx - size, y: cy - size * 0.65 }, { x: cx + size * 0.42, y: cy - size * 0.65 }, { x: cx + size, y: cy }, { x: cx + size * 0.42, y: cy + size * 0.65 }, { x: cx - size, y: cy + size * 0.65 }]); return path; }
  if (shape === 'heart') {
    path.moveTo(cx, cy + size * 0.84); path.cubicTo(cx - size * 1.5, cy - size * 0.05, cx - size, cy - size * 1.25, cx, cy - size * 0.35); path.cubicTo(cx + size, cy - size * 1.25, cx + size * 1.5, cy - size * 0.05, cx, cy + size * 0.84); path.close(); return path;
  }
  if (shape === 'raindrop') { path.moveTo(cx, cy - size); path.cubicTo(cx + size * 1.1, cy + size * 0.1, cx + size * 0.75, cy + size, cx, cy + size); path.cubicTo(cx - size * 0.75, cy + size, cx - size * 1.1, cy + size * 0.1, cx, cy - size); path.close(); return path; }
  if (shape === 'flower') {
    // One continuous four-lobed contour: unlike four overlapping circles it
    // has no internal stroke seams when a custom outline is enabled.
    for (let index = 0; index <= 72; index += 1) {
      const angle = -Math.PI / 2 + index / 72 * Math.PI * 2;
      const distance = size * (0.56 + 0.32 * Math.cos(4 * angle));
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;
      if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.close();
    return path;
  }
  const points = shape === 'sparkle' ? 4 : 5;
  for (let index = 0; index < points * 2; index += 1) { const angle = -Math.PI / 2 + index * Math.PI / points; const distance = index % 2 === 0 ? size : size * (shape === 'sparkle' ? 0.25 : 0.43); const x = cx + Math.cos(angle) * distance; const y = cy + Math.sin(angle) * distance; if (index === 0) path.moveTo(x, y); else path.lineTo(x, y); }
  path.close(); return path;
};

const ProceduralPaperLayer = ({ frame, paper, patternImageUri }: { frame: { width: number; height: number }; paper: ProceduralPaperPaint; patternImageUri?: string }) => {
  const marks = useMemo(() => makePaperMarks(frame.width, frame.height, paper), [frame.height, frame.width, paper]);
  const patternImage = useImage(paper.shape === 'image' ? patternImageUri : undefined);
  const foreground = paper.foreground ?? '#111111';
  const opacity = paper.style === 'soft' ? (paper.opacity ?? 0.64) * 0.58 : paper.opacity ?? (paper.pattern === 'solid' ? 1 : 0.16);
  return <>
    <Rect x={0} y={0} width={frame.width} height={frame.height} color={paper.background} />
    {paper.pattern === 'line' && marks.map((mark, index) => <Rect key={index} x={0} y={mark.y} width={frame.width} height={2} color={foreground} opacity={opacity} />)}
    {paper.pattern === 'square' && marks.map((mark, index) => <Group key={`square-${index}`}><Rect x={0} y={mark.y} width={frame.width} height={2} color={foreground} opacity={opacity} />{mark.x !== undefined && <Rect x={mark.x} y={0} width={2} height={frame.height} color={foreground} opacity={opacity} />}</Group>)}
    {(paper.pattern === 'dot' || paper.pattern === 'polka') && marks.map((mark, index) => <PaperMark key={index} cx={mark.x ?? 0} cy={mark.y} color={foreground} image={patternImage} opacity={opacity} outline={paper.style === 'outline'} radius={paper.pattern === 'polka' ? (paper.radius ?? 9) * 1.45 : 4} shape={paper.shape ?? 'circle'} />)}
  </>;
};

const PaperMark = ({ color, cx, cy, image, opacity, outline, radius, shape }: Readonly<{ color: string; cx: number; cy: number; image: ReturnType<typeof useImage>; opacity: number; outline: boolean; radius: number; shape: NonNullable<ProceduralPaperPaint['shape']> }>) => {
  const style = outline ? 'stroke' as const : 'fill' as const;
  const strokeWidth = outline ? Math.max(2, radius * 0.28) : undefined;
  if (shape === 'image' && image) return <SkiaImage image={image} x={cx - radius * 2.4} y={cy - radius * 2.4} width={radius * 4.8} height={radius * 4.8} fit="contain" opacity={opacity} />;
  if (shape === 'circle' || shape === 'image') return <Circle cx={cx} cy={cy} r={radius} color={color} opacity={opacity} style={style} strokeWidth={strokeWidth} />;
  if (shape === 'square') return <Rect x={cx - radius} y={cy - radius} width={radius * 2} height={radius * 2} color={color} opacity={opacity} style={style} strokeWidth={strokeWidth} />;
  if (shape === 'cross') return <Group opacity={opacity}><Rect x={cx - radius * 0.28} y={cy - radius} width={radius * 0.56} height={radius * 2} color={color} /><Rect x={cx - radius} y={cy - radius * 0.28} width={radius * 2} height={radius * 0.56} color={color} /></Group>;
  const path = makePaperMarkPath(shape, cx, cy, radius);
  return <Path path={path} color={color} opacity={opacity} style={style} strokeWidth={strokeWidth} />;
};

const makePaperMarkPath = (shape: 'diamond' | 'heart' | 'star', cx: number, cy: number, radius: number) => {
  const path = Skia.Path.Make();
  if (shape === 'diamond') {
    path.moveTo(cx, cy - radius); path.lineTo(cx + radius, cy); path.lineTo(cx, cy + radius); path.lineTo(cx - radius, cy); path.close();
    return path;
  }
  if (shape === 'heart') {
    path.moveTo(cx, cy + radius * 0.8); path.cubicTo(cx - radius * 1.5, cy - radius * 0.05, cx - radius, cy - radius * 1.25, cx, cy - radius * 0.38); path.cubicTo(cx + radius, cy - radius * 1.25, cx + radius * 1.5, cy - radius * 0.05, cx, cy + radius * 0.8); path.close();
    return path;
  }
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const distance = index % 2 === 0 ? radius : radius * 0.43;
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance;
    if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.close();
  return path;
};

const makePaperMarks = (width: number, height: number, paper: ProceduralPaperPaint): readonly Readonly<{ x?: number; y: number }>[] => {
  const { pattern } = paper;
  const spacing = pattern === 'polka' ? Math.max(40, (paper.gap ?? 48) * 1.5) : pattern === 'dot' ? 38 : 64;
  if (pattern === 'line') return Array.from({ length: Math.ceil(height / spacing) }, (_, index) => ({ y: (index + 1) * spacing }));
  if (pattern === 'square') return Array.from({ length: Math.ceil(Math.max(width, height) / spacing) }, (_, index) => ({ x: (index + 1) * spacing, y: (index + 1) * spacing }));
  if (pattern === 'dot' || pattern === 'polka') {
    const columns = Math.ceil(width / spacing);
    return Array.from({ length: columns * Math.ceil(height / spacing) }, (_, index) => {
      const row = Math.floor(index / columns);
      return { x: (index % columns) * spacing + spacing / 2 + (paper.offset === 'staggered' && row % 2 === 1 ? spacing / 2 : 0), y: row * spacing + spacing / 2 };
    });
  }
  return [];
};

const MaterialPlaceholder = ({ layer }: { layer: Extract<Layer, { type: 'material' }> }) => (
  <>
    <RoundedRect x={0} y={0} width={layer.frame.width} height={layer.frame.height} r={42} color="#E5AFA1" />
    <RoundedRect x={30} y={30} width={layer.frame.width - 60} height={layer.frame.height - 60} r={30} color="#F6D1C6" />
    <Circle cx={layer.frame.width * 0.22} cy={layer.frame.height * 0.28} r={24} color="#C67775" />
    <Circle cx={layer.frame.width * 0.72} cy={layer.frame.height * 0.66} r={36} color="#C67775" />
  </>
);

const BrushPlaceholder = ({ layer }: { layer: Extract<Layer, { type: 'brush' }> }) => {
  const stamps = useMemo(() => makeBrushStamps(layer), [layer]);
  return <>{stamps.map((stamp, index) => <Circle key={`${stamp.x}-${stamp.y}-${index}`} cx={stamp.x} cy={stamp.y} r={stamp.radius} color={layer.color} opacity={stamp.opacity} />)}</>;
};

const effectFor = <Id extends Effect['id']>(effects: readonly Effect[], id: Id): Extract<Effect, { id: Id }> | undefined => effects.find((effect): effect is Extract<Effect, { id: Id }> => effect.id === id);

/** Stable product parameters become a renderer-specific edge path. */
const makeLayerPath = (width: number, height: number, seed?: number, intensity?: number) => {
  const path = Skia.Path.Make();
  if (seed === undefined || intensity === undefined) {
    path.addRect({ x: 0, y: 0, width, height });
    return path;
  }
  const random = seeded(seed);
  const step = Math.max(24, Math.min(width, height) / 14);
  path.moveTo(0, 0);
  for (let x = step; x < width; x += step) path.lineTo(x, (random() - 0.5) * intensity);
  path.lineTo(width, 0);
  for (let y = step; y < height; y += step) path.lineTo(width + (random() - 0.5) * intensity, y);
  path.lineTo(width, height);
  for (let x = width - step; x > 0; x -= step) path.lineTo(x, height + (random() - 0.5) * intensity);
  path.lineTo(0, height);
  for (let y = height - step; y > 0; y -= step) path.lineTo((random() - 0.5) * intensity, y);
  path.close();
  return path;
};

const makeBrushStamps = (layer: Extract<Layer, { type: 'brush' }>) => {
  const random = seeded(layer.seed);
  const stamps: Array<{ x: number; y: number; radius: number; opacity: number }> = [];
  for (let index = 1; index < layer.points.length; index += 1) {
    const from = layer.points[index - 1];
    const to = layer.points[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const count = Math.max(1, Math.ceil(distance / layer.spacing));
    for (let stamp = 0; stamp <= count; stamp += 1) {
      const progress = stamp / count;
      const normal = distance === 0 ? { x: 0, y: 0 } : { x: -dy / distance, y: dx / distance };
      const drift = (random() - 0.5) * layer.jitter;
      stamps.push({ x: from.x + dx * progress + normal.x * drift, y: from.y + dy * progress + normal.y * drift, radius: layer.size * (0.28 + random() * 0.22), opacity: 0.35 + random() * 0.35 });
    }
  }
  return stamps;
};

const seeded = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
};

const layerTransform = (layer: Layer): Transforms3d => [
  { translateX: layer.transform.position.x },
  { translateY: layer.transform.position.y },
  { scaleX: layer.transform.scale.x },
  { scaleY: layer.transform.scale.y },
  { rotate: layer.transform.rotation },
];
