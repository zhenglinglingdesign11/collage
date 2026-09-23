import {
  BlurMask,
  Circle,
  Canvas,
  DashPathEffect,
  Fill,
  Group,
  Image as SkiaImage,
  ImageShader,
  Mask,
  matchFont,
  Path,
  PathOp,
  Rect,
  RoundedRect,
  Skia,
  Shader,
  StrokeCap,
  StrokeJoin,
  Text,
  useFont,
  useImage,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { useMemo, type ReactNode } from 'react';
import { visibleBoundsForLayer } from '@journalcollage/editor-core';
import type { AlignmentGuide, BrushCutMask, BrushCutStroke, BrushDefinition, BrushStroke, Draft, Effect, EffectStage, Layer, Point, VisibilityMask } from '@journalcollage/editor-core';
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
/** Full-screen crop chrome in layer-local coordinates; never persisted or exported. */
export type CropPreview = Readonly<{ layerId: string; bounds: { x: number; y: number; width: number; height: number } }>;
/** Preview-only mask chrome for a full-screen tool. It never enters a Draft or export. */
export type VisibilityMaskPreview = Readonly<{ layerId: string; mask: VisibilityMask }>;

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

/** Uses the production stroke renderer for catalog UI, preventing preview art
 * from drifting away from the canvas/export implementation. */
export const DecorativeBrushPreview = ({ assetUri, color, definition, previewStyle, size = { width: 42, height: 28 } }: Readonly<{ assetUri?: string; color: string; definition: BrushDefinition; previewStyle?: Pick<BrushStroke['style'], 'jitter' | 'opacity' | 'seed' | 'size' | 'spacing'>; size?: { width: number; height: number } }>) => {
  const isDecorative = !['plain', 'marker', 'crayon'].includes(definition.recipe);
  const sourceStyle = previewStyle ?? { size: definition.defaults.size, spacing: definition.defaults.spacing, jitter: definition.defaults.jitter, seed: 17, opacity: definition.defaults.opacity };
  // A crayon preview is the exact pending brush, scaled as a whole to fit the
  // tile. Scaling the group keeps particle radius, spacing and jitter in the
  // same proportion as the canvas rather than inventing a second recipe.
  const previewScale = isDecorative ? 0.5 : definition.recipe === 'crayon' ? Math.min(1, (size.height - 4) / Math.max(1, sourceStyle.size + sourceStyle.jitter * 2)) : 1;
  const logicalSize = { width: size.width / previewScale, height: size.height / previewScale };
  const center = { x: logicalSize.width / 2, y: logicalSize.height / 2 };
  // Path brushes retain a short stroke. Decorative recipes deliberately show
  // three repeated units, just as a user sees them after laying down a mark.
  const isPathLike = definition.recipe === 'plain' || definition.recipe === 'marker' || definition.recipe === 'crayon';
  const previewSize = ({ plain: 6, crayon: sourceStyle.size, marker: 12, stitch: 12, knit: 12, beads: 16, lace: 14, bow: 8 } as const)[definition.recipe];
  // Offset the logical path so the three samples sit at 1/6, 1/2 and 5/6 of
  // the visible tile; decorative bounds therefore never clip at either edge.
  // Crayon needs a longer real path than ink: its fibres only become legible
  // once the deterministic stamps have room to overlap and drift.
  const pathHalfLength = definition.recipe === 'crayon' ? Math.max(sourceStyle.size * 2.2, sourceStyle.spacing * 7) : 12;
  const startX = isDecorative ? -logicalSize.width / 6 : center.x - pathHalfLength;
  const endX = isDecorative ? logicalSize.width * 5 / 6 : center.x + pathHalfLength;
  const stroke: BrushStroke = {
    id: `preview:${definition.id}`,
    brushId: definition.id,
    brushRevision: definition.revision,
    points: [{ x: startX, y: center.y }, { x: endX, y: center.y }],
    style: { color, size: previewSize, spacing: definition.recipe === 'crayon' ? sourceStyle.spacing : definition.defaults.spacing, jitter: definition.recipe === 'crayon' ? sourceStyle.jitter : definition.defaults.jitter, seed: sourceStyle.seed, opacity: definition.recipe === 'crayon' ? sourceStyle.opacity : definition.defaults.opacity },
  };
  return <Canvas style={{ height: size.height, width: size.width }}><Group transform={isDecorative ? [{ scale: previewScale }] : undefined}><BrushStrokeContent brushAssetUri={assetUri} definition={definition} sampleSpacing={isDecorative ? logicalSize.width / 3 : undefined} stroke={stroke} /></Group></Canvas>;
};

type SkiaEditorSceneProps = Readonly<{
  draft: Draft;
  viewport: CanvasViewport;
  activeLayer: ActiveLayerPresentation;
  assetUris?: Readonly<Record<string, string>>;
  /** Resolved bitmap stamps for catalog brushes; never stored in a Draft. */
  brushAssetUris?: Readonly<Record<string, string>>;
  /** Catalog-owned definitions resolved by the product layer; never persisted in Draft. */
  brushDefinitions?: Readonly<Record<string, BrushDefinition>>;
  proceduralPapers?: Readonly<Record<string, ProceduralPaperPaint>>;
  proceduralStickers?: Readonly<Record<string, ProceduralStickerPaint>>;
  /** Native adapter resolved font files; never stored in a Draft. */
  fontUris?: Readonly<Record<string, string>>;
  fontSupportsCjk?: Readonly<Record<string, boolean>>;
  /** Canvas-owned paper/background input resolved from Draft.canvas.backgroundAsset. */
  canvasBackgroundUri?: string;
  canvasBackgroundPaper?: ProceduralPaperPaint;
  /** Full-screen source tools can deliberately render without composition paper. */
  showCanvasBackground?: boolean;
  /** Product-owned torn-paper scans. The effect contract stays asset-free. */
  tornPaperEdgeAtlasUri?: string;
  tornPaperFiberFringeUri?: string;
  /** Transparent source artwork for the product's lace centre frame. */
  laceFrameUri?: string;
  /** Cached source artwork indexed by the semantic frame preset. */
  laceFrameUris?: Readonly<Record<string, string>>;
  /** False when the product is intentionally waiting for a cached real frame. */
  laceFrameFallback?: boolean;
  showSelection?: boolean;
  /** UI-only movement/rotation reference lines. Omit for export and thumbnails. */
  alignmentGuides?: readonly AlignmentGuide[];
  /** Preview-only stage color. It is deliberately not stored in the Draft. */
  surfaceColor?: string;
  straightCutPreview?: StraightCutPreview | null;
  brushCutPreview?: BrushCutPreview | null;
  cropPreview?: CropPreview | null;
  visibilityMaskPreview?: VisibilityMaskPreview | null;
}>;

/**
 * The A1 scene deliberately renders fixture assets as material placeholders.
 * A later AssetResolver will replace only the content drawing, not its Draft
 * or transform contract.
 */
export const SkiaEditorScene = ({ draft, viewport, activeLayer, assetUris = {}, brushAssetUris = {}, brushDefinitions = {}, proceduralPapers = {}, proceduralStickers = {}, fontUris = {}, fontSupportsCjk = {}, canvasBackgroundUri, canvasBackgroundPaper, showCanvasBackground = true, tornPaperEdgeAtlasUri, tornPaperFiberFringeUri, laceFrameUri, laceFrameUris = {}, laceFrameFallback = true, showSelection = true, alignmentGuides = [], surfaceColor = '#D9D2C7', straightCutPreview = null, brushCutPreview = null, cropPreview = null, visibilityMaskPreview = null }: SkiaEditorSceneProps) => (
  <>
    <Fill color={surfaceColor} />
    <Group transform={[{ translateX: viewport.x }, { translateY: viewport.y }, { scale: viewport.scale }]}>
      {showCanvasBackground && <CanvasBackground frame={draft.canvas.size} color={draft.canvas.background} paper={canvasBackgroundPaper} assetUri={canvasBackgroundUri} />}
      {draft.layers.map((layer) => (
        <SkiaLayer
          key={layer.id}
          layer={layer}
          selected={showSelection && draft.selectedLayerId === layer.id}
          transform={activeLayer.isInteracting === true && activeLayer.layerId === layer.id ? activeLayer.transform : layerTransform(layer)}
          assetUri={layer.type === 'image' ? assetUris[layer.asset.id] : undefined}
          brushAssetUris={brushAssetUris}
          brushDefinitions={brushDefinitions}
          proceduralPaper={layer.type === 'image' ? proceduralPapers[layer.asset.id] : undefined}
          proceduralSticker={layer.type === 'image' ? proceduralStickers[layer.asset.id] : undefined}
          fontUri={layer.type === 'text' ? fontUris[layer.fontVariantId] : undefined}
          fontSupportsCjk={layer.type === 'text' ? fontSupportsCjk[layer.fontVariantId] : undefined}
          tornPaperEdgeAtlasUri={tornPaperEdgeAtlasUri}
          tornPaperFiberFringeUri={tornPaperFiberFringeUri}
          laceFrameUri={laceFrameUri}
          laceFrameUris={laceFrameUris}
          laceFrameFallback={laceFrameFallback}
          straightCutPreview={straightCutPreview?.layerId === layer.id ? straightCutPreview : null}
          brushCutPreview={brushCutPreview?.layerId === layer.id ? brushCutPreview : null}
          cropPreview={cropPreview?.layerId === layer.id ? cropPreview : null}
          visibilityMaskPreview={visibilityMaskPreview?.layerId === layer.id ? visibilityMaskPreview : null}
        />
      ))}
      <CanvasAlignmentGuides guides={alignmentGuides} size={draft.canvas.size} strokeWidth={2 / Math.max(viewport.scale, 0.001)} />
    </Group>
  </>
);

const CanvasAlignmentGuides = ({ guides, size, strokeWidth }: Readonly<{ guides: readonly AlignmentGuide[]; size: { width: number; height: number }; strokeWidth: number }>) => <>
  {guides.map((guide) => guide.axis === 'x'
    ? <Rect color="rgba(217, 74, 56, 0.76)" height={size.height} key={`x:${guide.value}`} width={strokeWidth} x={guide.value - strokeWidth / 2} y={0} />
    : <Rect color="rgba(217, 74, 56, 0.76)" height={strokeWidth} key={`y:${guide.value}`} width={size.width} x={0} y={guide.value - strokeWidth / 2} />)}
</>;

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
  brushAssetUris: Readonly<Record<string, string>>;
  brushDefinitions: Readonly<Record<string, BrushDefinition>>;
  proceduralPaper?: ProceduralPaperPaint;
  proceduralSticker?: ProceduralStickerPaint;
  fontUri?: string;
  fontSupportsCjk?: boolean;
  tornPaperEdgeAtlasUri?: string;
  tornPaperFiberFringeUri?: string;
  laceFrameUri?: string;
  laceFrameUris: Readonly<Record<string, string>>;
  laceFrameFallback: boolean;
  straightCutPreview: StraightCutPreview | null;
  brushCutPreview: BrushCutPreview | null;
  cropPreview: CropPreview | null;
  visibilityMaskPreview: VisibilityMaskPreview | null;
}>;

const SkiaLayer = ({ layer, selected, transform, assetUri, brushAssetUris, brushDefinitions, proceduralPaper, proceduralSticker, fontUri, fontSupportsCjk, tornPaperEdgeAtlasUri, tornPaperFiberFringeUri, laceFrameUri, laceFrameUris, laceFrameFallback, straightCutPreview, brushCutPreview, cropPreview, visibilityMaskPreview }: SkiaLayerProps) => {
  const { frame } = layer;
  const selectionBounds = selected ? visibleBoundsForLayer(layer) : null;
  // Use the Android/iOS shared family name. `System` is not a resolvable
  // Android font family and can produce an empty SkFont there.
  const effectPlan = useMemo(() => compileEffectPlan(layer.effects), [layer.effects]);
  const contentEvaluation = useMemo(() => evaluateContentEffects(effectPlan.content), [effectPlan.content]);
  // New edits make texture recipes exclusive. This also gives old documents
  // with multiple texture instances deterministic single-recipe rendering.
  const activeTextureEffect = useMemo(() => [...layer.effects].reverse().find((effect) => effect.enabled && isTextureRecipe(effect)) ?? null, [layer.effects]);
  const activePrintEffect = activeTextureEffect && isRuntimePrintEffect(activeTextureEffect) ? activeTextureEffect : null;
  const visibilityMask = layer.type === 'image' ? layer.visibilityMask : undefined;
  const tornEdge = effectPlan.geometry.find((effect) => effect.type === 'paper.torn-edge');
  const corners = effectPlan.geometry.find((effect) => effect.type === 'shape.round-corners');
  const shadows = effectPlan.underlay.filter((effect) => effect.type === 'light.shadow');
  const floatingEffects = effectPlan.underlay.filter((effect) => effect.type === 'paper.float');
  const attachments = effectPlan.overlay.filter((effect) => effect.type === 'attachment.tape');
  const centerFrame = effectPlan.overlay.find((effect) => effect.type === 'frame.lace-center' || effect.type === 'frame.foil-center');
  const shapePath = useMemo(
    () => makeLayerPath(frame.width, frame.height, numberParam(tornEdge, 'seed'), numberParam(tornEdge, 'intensity')),
    [frame.height, frame.width, tornEdge],
  );
  const geometryPath = useMemo(() => {
    if (!corners) return shapePath;
    const rounded = Skia.Path.Make();
    rounded.addRRect({ rect: { x: 0, y: 0, width: frame.width, height: frame.height }, rx: numberParam(corners, 'radius'), ry: numberParam(corners, 'radius') });
    return Skia.Path.MakeFromOp(shapePath, rounded, PathOp.Intersect) ?? shapePath;
  }, [corners, frame.height, frame.width, shapePath]);
  const effectivePath = useMemo(() => {
    if (!visibilityMask) return geometryPath;
    return Skia.Path.MakeFromOp(geometryPath, compileVisibilityMaskPath(visibilityMask, frame), PathOp.Intersect) ?? geometryPath;
  }, [frame, geometryPath, visibilityMask]);
  const contentPath = useMemo(() => centerFrame
    ? Skia.Path.MakeFromOp(effectivePath, makeLaceOpeningPath(frame, centerFrame), PathOp.Intersect) ?? effectivePath
    : effectivePath, [centerFrame, effectivePath, frame]);
  const cutPaths = useMemo(() => layer.type !== 'image' ? [] : layer.clipPaths ?? (layer.clipPath ? [layer.clipPath] : []), [layer]);
  const previewPath = useMemo(() => straightCutPreview ? (straightCutPreview.style === 'wave' ? makeWaveCutPath(straightCutPreview.start, straightCutPreview.end, frame) : makeStraightCutPath(straightCutPreview.start, straightCutPreview.end)) : null, [frame, straightCutPreview]);
  const visibilityPreviewPath = useMemo(() => visibilityMaskPreview ? compileVisibilityMaskPath(visibilityMaskPreview.mask, frame) : null, [frame, visibilityMaskPreview]);
  const visibilityPreviewBounds = visibilityMaskPreview?.mask.type === 'shape' ? visibilityMaskPreview.mask.bounds : null;

  return (
    <Group transform={transform} origin={{ x: frame.width / 2, y: frame.height / 2 }} opacity={layer.opacity}>
      {shadows.map((shadow) => <Group key={shadow.instanceId} transform={[{ translateX: numberParam(shadow, 'offset.x') }, { translateY: numberParam(shadow, 'offset.y') }]} opacity={numberParam(shadow, 'opacity')}><Path path={effectivePath} color={stringParam(shadow, 'color')}><BlurMask blur={numberParam(shadow, 'blur')} style="normal" /></Path></Group>)}
      {floatingEffects.map((effect) => <FloatingPaperUnderlay effect={effect} key={effect.instanceId} path={effectivePath} />)}
      {attachments.map((effect) => <TapeContactShadow effect={effect} key={effect.instanceId} path={effectivePath} />)}
      {/* Keep the aperture in layer coordinates; only its content may zoom. */}
      <Group clip={contentPath}>
        <ContentEffectStage evaluation={contentEvaluation}>
          <Group transform={centerFrame ? [{ scale: laceContentZoom(centerFrame) }] : []} origin={{ x: frame.width / 2, y: frame.height / 2 }}>
            {layer.type === 'image' && <ImageLayerContent contentEffects={activePrintEffect ? [activePrintEffect] : []} layer={layer} assetUri={assetUri} clipPaths={cutPaths} proceduralPaper={proceduralPaper} proceduralSticker={proceduralSticker} />}
            {layer.type === 'material' && <MaterialPlaceholder layer={layer} />}
            {layer.type === 'brush' && <BrushLayerContent assetUris={brushAssetUris} definitions={brushDefinitions} layer={layer} />}
            {layer.type === 'text' && <TextLayerContent layer={layer} fontSupportsCjk={fontSupportsCjk} fontUri={fontUri} />}
          </Group>
        </ContentEffectStage>
      </Group>
      {previewPath && <>
        <Path path={previewPath} color="rgba(17,17,17,0.78)" strokeCap="round" style="stroke" strokeWidth={10}><DashPathEffect intervals={[34, 28]} /></Path>
        <Circle cx={straightCutPreview!.start.x} cy={straightCutPreview!.start.y} r={28} color="rgba(255,255,255,0.94)" />
        <Circle cx={straightCutPreview!.start.x} cy={straightCutPreview!.start.y} r={28} color="#111111" style="stroke" strokeWidth={8} />
        <Circle cx={straightCutPreview!.end.x} cy={straightCutPreview!.end.y} r={28} color="rgba(255,255,255,0.94)" />
        <Circle cx={straightCutPreview!.end.x} cy={straightCutPreview!.end.y} r={28} color="#111111" style="stroke" strokeWidth={8} />
      </>}
      {brushCutPreview && <Path path={makeBrushStrokePath({ mode: 'include', strokes: brushCutPreview.strokes })} color="rgba(217,74,56,0.62)" />}
      {cropPreview && <CropPreviewChrome bounds={cropPreview.bounds} frame={frame} />}
      {visibilityPreviewPath && <><Path path={visibilityPreviewPath} color="rgba(217,74,56,0.18)" /><Path path={visibilityPreviewPath} color="#111111" style="stroke" strokeWidth={4} />
        {visibilityPreviewBounds && <><Circle cx={visibilityPreviewBounds.x} cy={visibilityPreviewBounds.y} r={12} color="#FFFFFF" /><Circle cx={visibilityPreviewBounds.x} cy={visibilityPreviewBounds.y} r={10} color="#111111" style="stroke" strokeWidth={3} /><Circle cx={visibilityPreviewBounds.x + visibilityPreviewBounds.width} cy={visibilityPreviewBounds.y} r={12} color="#FFFFFF" /><Circle cx={visibilityPreviewBounds.x + visibilityPreviewBounds.width} cy={visibilityPreviewBounds.y} r={10} color="#111111" style="stroke" strokeWidth={3} /><Circle cx={visibilityPreviewBounds.x + visibilityPreviewBounds.width} cy={visibilityPreviewBounds.y + visibilityPreviewBounds.height} r={12} color="#FFFFFF" /><Circle cx={visibilityPreviewBounds.x + visibilityPreviewBounds.width} cy={visibilityPreviewBounds.y + visibilityPreviewBounds.height} r={10} color="#111111" style="stroke" strokeWidth={3} /><Circle cx={visibilityPreviewBounds.x} cy={visibilityPreviewBounds.y + visibilityPreviewBounds.height} r={12} color="#FFFFFF" /><Circle cx={visibilityPreviewBounds.x} cy={visibilityPreviewBounds.y + visibilityPreviewBounds.height} r={10} color="#111111" style="stroke" strokeWidth={3} /></>}
      </>}
      {effectPlan.overlay.map((effect) => effect.type === 'material.grain' && activeTextureEffect?.instanceId !== effect.instanceId ? null : <OverlayEffect effect={effect} frame={frame} key={effect.instanceId} laceFrameFallback={laceFrameFallback} laceFrameUri={laceFrameUri} laceFrameUris={laceFrameUris} path={effectivePath} />)}
      {floatingEffects.map((effect) => <FloatingPaperRim effect={effect} key={effect.instanceId} path={effectivePath} />)}
      {/* Fibres sit above an optional outline, otherwise that solid stroke hides the scan. */}
      {tornEdge && <TornPaperEdge edgeAtlasUri={tornPaperEdgeAtlasUri} effect={tornEdge} fiberFringeUri={tornPaperFiberFringeUri} frame={frame} path={effectivePath} />}
      {selectionBounds && (
        <>
          <Rect x={selectionBounds.x - 8} y={selectionBounds.y - 8} width={selectionBounds.width + 16} height={selectionBounds.height + 16} color="#111111" style="stroke" strokeWidth={6} />
          <Rect x={selectionBounds.x - 14} y={selectionBounds.y - 14} width={16} height={16} color="#111111" />
          <Rect x={selectionBounds.x + selectionBounds.width - 2} y={selectionBounds.y - 14} width={16} height={16} color="#111111" />
          <Rect x={selectionBounds.x - 14} y={selectionBounds.y + selectionBounds.height - 2} width={16} height={16} color="#111111" />
          <Rect x={selectionBounds.x + selectionBounds.width - 2} y={selectionBounds.y + selectionBounds.height - 2} width={16} height={16} color="#111111" />
        </>
      )}
    </Group>
  );
};

const CropPreviewChrome = ({ bounds, frame }: Readonly<{ bounds: { x: number; y: number; width: number; height: number }; frame: { width: number; height: number } }>) => {
  const line = Math.max(3, Math.min(frame.width, frame.height) * 0.008);
  const handle = line * 3;
  return <>
    <Rect color="rgba(17,17,17,0.28)" height={bounds.y} width={frame.width} x={0} y={0} />
    <Rect color="rgba(17,17,17,0.28)" height={frame.height - bounds.y - bounds.height} width={frame.width} x={0} y={bounds.y + bounds.height} />
    <Rect color="rgba(17,17,17,0.28)" height={bounds.height} width={bounds.x} x={0} y={bounds.y} />
    <Rect color="rgba(17,17,17,0.28)" height={bounds.height} width={frame.width - bounds.x - bounds.width} x={bounds.x + bounds.width} y={bounds.y} />
    <Rect color="#FFFFFF" height={bounds.height} style="stroke" strokeWidth={line} width={bounds.width} x={bounds.x} y={bounds.y} />
    <Rect color="rgba(255,255,255,0.45)" height={line / 2} width={bounds.width} x={bounds.x} y={bounds.y + bounds.height / 3} />
    <Rect color="rgba(255,255,255,0.45)" height={line / 2} width={bounds.width} x={bounds.x} y={bounds.y + bounds.height * 2 / 3} />
    <Rect color="rgba(255,255,255,0.45)" height={bounds.height} width={line / 2} x={bounds.x + bounds.width / 3} y={bounds.y} />
    <Rect color="rgba(255,255,255,0.45)" height={bounds.height} width={line / 2} x={bounds.x + bounds.width * 2 / 3} y={bounds.y} />
    {[[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x + bounds.width, bounds.y + bounds.height], [bounds.x, bounds.y + bounds.height]].map(([x, y], index) => <Rect color="#FFFFFF" height={handle} key={index} width={handle} x={x - handle / 2} y={y - handle / 2} />)}
  </>;
};

const ImageLayerContent = ({ contentEffects, layer, assetUri, clipPaths, proceduralPaper, proceduralSticker }: Readonly<{ contentEffects: readonly Effect[]; layer: Extract<Layer, { type: 'image' }>; assetUri?: string; clipPaths: readonly (readonly Point[])[]; proceduralPaper?: ProceduralPaperPaint; proceduralSticker?: ProceduralStickerPaint }>) => {
  const content = <ImagePlaceholder contentEffects={contentEffects} layer={layer} assetUri={assetUri} proceduralPaper={proceduralPaper} proceduralSticker={proceduralSticker} />;
  const clipped = clipPaths.reduceRight((child, points, index) => <Group key={`${index}-${points.length}`} clip={makePolygonPath(points)}>{child}</Group>, content);
  const contentFrame = layer.contentFrame ?? { x: 0, y: 0 };
  const legacyMasked = layer.brushCutMask ? <BrushCutMaskedContent mask={layer.brushCutMask} offset={layer.brushCutMask.coordinateSpace === 'content' ? contentFrame : undefined}>{clipped}</BrushCutMaskedContent> : clipped;
  // During the compatibility window the old scissors fields and the new
  // generic expression are both active. Nesting the masks makes their
  // intersection explicit, so an emboss cannot reveal legacy-cut pixels.
  return layer.visibilityMask ? <VisibilityMaskedContent mask={layer.visibilityMask} frame={layer.frame}>{legacyMasked}</VisibilityMaskedContent> : legacyMasked;
};

/**
 * Converts a persisted visibility expression to one Skia alpha path. This is
 * intentionally renderer-only: Drafts contain only JSON-friendly semantics.
 */
export const compileVisibilityMaskPath = (mask: VisibilityMask, frame: { width: number; height: number }) => {
  const fullFrame = () => {
    const path = Skia.Path.Make();
    path.addRect({ x: 0, y: 0, width: frame.width, height: frame.height });
    return path;
  };
  const combine = (left: ReturnType<typeof Skia.Path.Make>, right: ReturnType<typeof Skia.Path.Make>, operation: PathOp) =>
    Skia.Path.MakeFromOp(left, right, operation) ?? left;
  const compile = (expression: VisibilityMask): ReturnType<typeof Skia.Path.Make> => {
    switch (expression.type) {
      case 'all': return fullFrame();
      case 'shape': return makeVisibilityShapePath(expression.shape, expression.bounds);
      case 'polygon': return makePolygonPath(expression.points);
      case 'brush': return makeBrushStrokePath({ mode: 'include', strokes: expression.strokes });
      case 'intersect': return expression.masks.slice(1).reduce(
        (path, child) => combine(path, compile(child), PathOp.Intersect),
        compile(expression.masks[0]),
      );
      case 'subtract': return combine(compile(expression.base), compile(expression.cut), PathOp.Difference);
    }
  };
  return compile(mask);
};

const VisibilityMaskedContent = ({ children, frame, mask }: Readonly<{ children: ReactNode; frame: { width: number; height: number }; mask: VisibilityMask }>) => {
  const path = useMemo(() => compileVisibilityMaskPath(mask, frame), [frame.height, frame.width, mask]);
  return <Mask mode="alpha" mask={<Path path={path} color="#FFFFFF" />}>{children}</Mask>;
};

const makeVisibilityShapePath = (shape: Extract<VisibilityMask, { type: 'shape' }>['shape'], bounds: { x: number; y: number; width: number; height: number }) => {
  const path = Skia.Path.Make();
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  if (shape === 'rect') { path.addRect(bounds); return path; }
  if (shape === 'circle') { path.addOval(bounds); return path; }
  if (shape === 'heart') {
    // Mirrors the mini-program heart: matched shoulders, a restrained notch
    // and one centred bottom point. It stays wholly inside `bounds`.
    path.moveTo(cx, y + height * 0.90);
    path.cubicTo(x + width * 0.43, y + height * 0.84, x + width * 0.07, y + height * 0.62, x + width * 0.07, y + height * 0.35);
    path.cubicTo(x + width * 0.07, y + height * 0.20, x + width * 0.19, y + height * 0.14, x + width * 0.32, y + height * 0.14);
    path.cubicTo(x + width * 0.42, y + height * 0.14, x + width * 0.48, y + height * 0.24, cx, y + height * 0.34);
    path.cubicTo(x + width * 0.52, y + height * 0.24, x + width * 0.58, y + height * 0.14, x + width * 0.68, y + height * 0.14);
    path.cubicTo(x + width * 0.81, y + height * 0.14, x + width * 0.93, y + height * 0.20, x + width * 0.93, y + height * 0.35);
    path.cubicTo(x + width * 0.93, y + height * 0.62, x + width * 0.57, y + height * 0.84, cx, y + height * 0.90);
    path.close();
    return path;
  }
  if (shape === 'star') {
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const radius = index % 2 === 0 ? Math.min(width, height) / 2 : Math.min(width, height) * 0.21;
      const point = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
      if (index === 0) path.moveTo(point.x, point.y); else path.lineTo(point.x, point.y);
    }
    path.close();
    return path;
  }
  if (shape === 'tag') {
    path.moveTo(x, y);
    path.lineTo(x + width * 0.82, y);
    path.lineTo(x + width, y + height * 0.18);
    path.lineTo(x + width, y + height);
    path.lineTo(x, y + height);
    path.close();
    return path;
  }
  // The mini-program uses a crisp, alternating postage edge rather than a
  // sinusoidal scallop. Keep those normalized stops exactly in the renderer.
  const stops = [
    [0.07, 0], [0.13, 0.05], [0.20, 0], [0.27, 0.05], [0.34, 0], [0.41, 0.05], [0.48, 0], [0.55, 0.05], [0.62, 0], [0.69, 0.05], [0.76, 0], [0.83, 0.05], [0.93, 0],
    [1, 0.07], [0.95, 0.13], [1, 0.20], [0.95, 0.27], [1, 0.34], [0.95, 0.41], [1, 0.48], [0.95, 0.55], [1, 0.62], [0.95, 0.69], [1, 0.76], [0.95, 0.83], [1, 0.93],
    [0.93, 1], [0.83, 0.95], [0.76, 1], [0.69, 0.95], [0.62, 1], [0.55, 0.95], [0.48, 1], [0.41, 0.95], [0.34, 1], [0.27, 0.95], [0.20, 1], [0.13, 0.95], [0.07, 1],
    [0, 0.93], [0.05, 0.83], [0, 0.76], [0.05, 0.69], [0, 0.62], [0.05, 0.55], [0, 0.48], [0.05, 0.41], [0, 0.34], [0.05, 0.27], [0, 0.20], [0.05, 0.13], [0, 0.07],
  ] as const;
  stops.forEach(([relativeX, relativeY], index) => {
    const point = { x: x + width * relativeX, y: y + height * relativeY };
    if (index === 0) path.moveTo(point.x, point.y); else path.lineTo(point.x, point.y);
  });
  path.close();
  return path;
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

const ImagePlaceholder = ({ contentEffects, layer, assetUri, proceduralPaper, proceduralSticker }: { contentEffects: readonly Effect[]; layer: Extract<Layer, { type: 'image' }>; assetUri?: string; proceduralPaper?: ProceduralPaperPaint; proceduralSticker?: ProceduralStickerPaint }) => {
  const image = useImage(assetUri);
  const contentFrame = layer.contentFrame ?? { x: 0, y: 0, width: layer.frame.width, height: layer.frame.height };
  if (proceduralPaper !== undefined) return <Group transform={[{ translateX: contentFrame.x }, { translateY: contentFrame.y }]}><ProceduralPaperLayer frame={contentFrame} paper={proceduralPaper} patternImageUri={assetUri} /></Group>;
  if (proceduralSticker !== undefined) return <Group transform={[{ translateX: contentFrame.x }, { translateY: contentFrame.y }]}><ProceduralStickerLayer frame={contentFrame} sticker={proceduralSticker} textureUri={assetUri} /></Group>;
  if (layer.asset.id.startsWith('generated://template-photo-slot/')) {
    // Match the home add-photo control: a fixed circular chip with the system
    // light-weight plus glyph. It is UI chrome, not artwork that scales with
    // the photo frame.
    // Photo slots are commonly shown on a scaled-down editor canvas. Use a
    // deliberately prominent affordance so both basic layouts and recipes
    // retain a clear upload target at every canvas ratio.
    const glyphSize = 96;
    const glyphX = contentFrame.x + contentFrame.width / 2;
    const glyphY = contentFrame.y + contentFrame.height / 2;
    const plusFont = matchFont({ fontFamily: 'System', fontSize: 60, fontWeight: '300' });
    const showSlotOutline = layer.visibilityMask === undefined;
    // A calibrated slot may intentionally use non-uniform scale. Counter it
    // only for this UI glyph, so the slot keeps its geometry while the icon
    // remains an undistorted 1:1 circle.
    const iconScale = { x: 1 / Math.max(Math.abs(layer.transform.scale.x), 0.001), y: 1 / Math.max(Math.abs(layer.transform.scale.y), 0.001) };
    const borderInset = 12;
    return <Group><Rect x={contentFrame.x} y={contentFrame.y} width={contentFrame.width} height={contentFrame.height} color="#E6E7E9" />{showSlotOutline && <Rect x={contentFrame.x + borderInset} y={contentFrame.y + borderInset} width={Math.max(0, contentFrame.width - borderInset * 2)} height={Math.max(0, contentFrame.height - borderInset * 2)} color="#9D988E" style="stroke" strokeWidth={5}><DashPathEffect intervals={[22, 16]} /></Rect>}<Group transform={[{ scaleX: iconScale.x }, { scaleY: iconScale.y }]} origin={{ x: glyphX, y: glyphY }}><Circle cx={glyphX} cy={glyphY} r={glyphSize / 2} color="#111111" /><Text x={glyphX - plusFont.measureText('+').width / 2} y={glyphY + 19} text="+" font={plusFont} color="#FFFFFF" /></Group></Group>;
  }
  // A cut produces new fragment keys that remount this component. During the
  // one-frame `useImage` reload, a resolved URI is still a real image—not a
  // missing asset—so never replace it with the fixture artwork.
  if (assetUri !== undefined && image === null) return null;
  if (image && !contentEffects.some(isRuntimePrintEffect)) {
    // `crop` is evaluated against original image pixels. The previous order
    // fitted the full image with `cover` first, permanently hiding its long
    // edge before crop could move there. Draw the full source at one uniform
    // scale, clip the photo frame, and centre the chosen source rectangle.
    const sourceWidth = image.width();
    const sourceHeight = image.height();
    const selectedWidth = sourceWidth * layer.crop.width;
    const selectedHeight = sourceHeight * layer.crop.height;
    const scale = Math.max(contentFrame.width / selectedWidth, contentFrame.height / selectedHeight);
    const x = contentFrame.x + (contentFrame.width - selectedWidth * scale) / 2 - layer.crop.x * sourceWidth * scale;
    const y = contentFrame.y + (contentFrame.height - selectedHeight * scale) / 2 - layer.crop.y * sourceHeight * scale;
    return <Group clip={{ x: contentFrame.x, y: contentFrame.y, width: contentFrame.width, height: contentFrame.height }}><SkiaImage image={image} x={x} y={y} width={sourceWidth * scale} height={sourceHeight * scale} fit="fill" /></Group>;
  }
  return <Group transform={[{ translateX: contentFrame.x }, { translateY: contentFrame.y }]}>
    {image && contentEffects.some(isRuntimePrintEffect)
      ? <PrintEffectImage effects={contentEffects} frame={contentFrame} image={image} />
      // An unresolved asset is loading state, not artwork. Keep this neutral
      // so templates and restored drafts never flash the old scenic fixture.
      : <RoundedRect x={0} y={0} width={contentFrame.width} height={contentFrame.height} r={28} color="#D9D9D7" />}
  </Group>;
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

/**
 * Drafts only carry brush ids and deterministic stroke inputs. The product
 * supplies the catalog definition, while this shared Scene turns both into
 * draw operations for preview, thumbnail, and export alike.
 */
const BrushLayerContent = ({ assetUris, definitions, layer }: Readonly<{ assetUris: Readonly<Record<string, string>>; definitions: Readonly<Record<string, BrushDefinition>>; layer: Extract<Layer, { type: 'brush' }> }>) => (
  // `layer` gives clear-blend strokes an isolated surface. Their ordering is
  // preserved, so a later painted mark can intentionally cover an erase mark.
  <Group layer>{layer.strokes.map((stroke) => stroke.mode === 'erase'
    ? <BrushEraserContent key={stroke.id} stroke={stroke} />
    : <BrushStrokeContent brushAssetUri={definitions[stroke.brushId]?.asset ? assetUris[definitions[stroke.brushId].asset!.id] : undefined} definition={definitions[stroke.brushId]} key={stroke.id} stroke={stroke} />)}</Group>
);

const BrushEraserContent = ({ stroke }: Readonly<{ stroke: BrushStroke }>) => {
  const path = useMemo(() => makeBrushPath(stroke), [stroke]);
  const radius = Math.max(1, stroke.style.size / 2);
  if (stroke.points.length === 1) return <Circle blendMode="clear" cx={stroke.points[0].x} cy={stroke.points[0].y} r={radius} color="#000000" />;
  return <Path blendMode="clear" path={path} color="#000000" strokeCap="round" strokeJoin="round" style="stroke" strokeWidth={stroke.style.size} />;
};

const BrushStrokeContent = ({ brushAssetUri, definition, sampleSpacing, stroke }: Readonly<{ brushAssetUri?: string; definition?: BrushDefinition; sampleSpacing?: number; stroke: BrushStroke }>) => {
  const recipe = definition?.recipe ?? 'plain';
  const path = useMemo(() => makeBrushPath(stroke), [stroke]);
  const crayonFibres = useMemo(() => makeCrayonFibres(stroke), [stroke]);
  const structuralSamples = useMemo(() => sampleBrushPath(stroke.points, sampleSpacing ?? (recipe === 'stitch'
    // A stitch's round caps add half a stroke width at both ends. Enforce a
    // gap beyond that visible footprint, especially for small sizes.
    ? Math.max(stroke.style.spacing, 13, stroke.style.size * 2.5)
    : recipe === 'knit' ? Math.max(14, stroke.style.size * 2.2)
      : recipe === 'beads' ? Math.max(9, stroke.style.size * 1.65)
        : recipe === 'lace' ? Math.max(14, stroke.style.size * 2.05)
          : Math.max(28, stroke.style.size * 3.2))), [recipe, sampleSpacing, stroke.points, stroke.style.size, stroke.style.spacing]);
  const stampImage = useImage(brushAssetUri);
  const color = stroke.style.color ?? '#111111';
  if (recipe === 'plain' || recipe === 'marker') return <Path path={path} color={color} opacity={stroke.style.opacity * (recipe === 'marker' ? 0.55 : 1)} strokeCap="round" strokeJoin="round" style="stroke" strokeWidth={stroke.style.size} />;
  if (recipe === 'stitch') return <>{structuralSamples.map((sample) => <Path key={sample.index} path={makeStitchPath(sample, stroke.style.size)} color={color} opacity={stroke.style.opacity} strokeCap="round" style="stroke" strokeWidth={Math.max(2, stroke.style.size * 0.5)} />)}</>;
  if (recipe === 'knit') return <>{structuralSamples.map((sample) => <Path key={sample.index} path={makeKnitPath(sample, stroke.style.size)} color={color} opacity={stroke.style.opacity} strokeCap="round" strokeJoin="round" style="stroke" strokeWidth={Math.max(1.4, stroke.style.size * 0.34)} />)}</>;
  if (recipe === 'crayon') return <>{crayonFibres.map((fibre, index) => <Path key={index} path={makeCrayonFibrePath(fibre)} color={color} opacity={fibre.opacity} strokeCap="round" style="stroke" strokeWidth={fibre.width} />)}</>;
  if (recipe === 'beads') return <>{structuralSamples.map((sample) => <Group key={sample.index} opacity={stroke.style.opacity}><Circle cx={sample.x} cy={sample.y} r={Math.max(2.5, stroke.style.size * 0.5)} color={color} /><Circle cx={sample.x - stroke.style.size * 0.14} cy={sample.y - stroke.style.size * 0.14} r={Math.max(1.2, stroke.style.size * 0.12)} color="#FFFFFF" opacity={0.62} /></Group>)}</>;
  if (recipe === 'lace') return <>{structuralSamples.map((sample) => <LaceStamp color={color} index={sample.index} key={sample.index} opacity={stroke.style.opacity} sample={sample} size={stroke.style.size} />)}</>;
  return <>{structuralSamples.map((sample) => <BowStamp color={color} image={stampImage} index={sample.index} key={sample.index} opacity={stroke.style.opacity} sample={sample} size={stroke.style.size} />)}</>;
};

export type EffectPlan = Readonly<Record<EffectStage, readonly Effect[]>>;

/**
 * Renderer-only compilation of portable effect instances. Effects retain
 * Draft order within a stage, while stage order is fixed by the scene.
 */
export const compileEffectPlan = (effects: readonly Effect[]): EffectPlan => {
  const plan: Record<EffectStage, Effect[]> = { geometry: [], underlay: [], content: [], overlay: [], 'post-composite': [] };
  effects.forEach((effect) => { if (effect.enabled) plan[effect.stage].push(effect); });
  return plan;
};

export type ContentEffectEvaluation = Readonly<{
  effects: readonly Effect[];
  requiresDerivedAsset: boolean;
  rendererKinds: readonly ('shader' | 'derived')[];
}>;

const contentRendererKind = (effect: Effect): 'shader' | 'derived' | null => {
  if (effect.type === 'print.cyanotype' || effect.type === 'print.screen' || effect.type === 'print.riso') return 'shader';
  if (effect.type === 'art.botanical-plate' || effect.type === 'art.pixel-embroidery' || effect.type === 'art.matisse-cutout') return 'derived';
  return null;
};

/**
 * Content effects are evaluated after source masking/cropping and before every
 * overlay. Recipes consume this stable, ordered plan without ever mutating the
 * source asset in a Draft; unsupported recipes remain transparent pass-throughs.
 */
export const evaluateContentEffects = (effects: readonly Effect[]): ContentEffectEvaluation => {
  const rendererKinds = effects.map(contentRendererKind).filter((kind): kind is 'shader' | 'derived' => kind !== null);
  return { effects, rendererKinds, requiresDerivedAsset: rendererKinds.includes('derived') };
};

const ContentEffectStage = ({ children, evaluation }: Readonly<{ children: ReactNode; evaluation: ContentEffectEvaluation }>) => {
  // The explicit stage is live now, while individual recipes land in separate
  // passes. Keeping the group also preserves its local coordinate system.
  void evaluation;
  return <Group>{children}</Group>;
};

type CyanotypePalette = Readonly<{ ink: string; paper: string }>;

const cyanotypePalettes: Readonly<Record<string, CyanotypePalette>> = {
  prussian: { ink: '#2B3E8C', paper: '#F8F9F6' },
  teal: { ink: '#1C6976', paper: '#F4F7F1' },
  violet: { ink: '#584592', paper: '#F6F2F7' },
  rose: { ink: '#9F4868', paper: '#F8F1EE' },
  mono: { ink: '#363A3E', paper: '#F3F2ED' },
};

const cyanotypePaper = (effect: Effect, palette: CyanotypePalette): string => {
  if (effect.params.paper === 'warm') return '#F4EBD9';
  if (effect.params.paper === 'aged') return '#E4D5B7';
  if (effect.params.paper === 'gray') return '#DCE0DD';
  return palette.paper;
};

const hexChannels = (hex: string): readonly [number, number, number] => {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '000000';
  return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255];
};

/* The source child is sampled directly, so its crop transform remains exactly
 * the same as an unfiltered image layer. Ink coverage is the effect, not a tint. */
const cyanotypeRuntimeEffect = Skia.RuntimeEffect.Make(`
  uniform shader source;
  uniform float3 paper;
  uniform float3 ink;
  uniform float contrast;
  uniform float gamma;
  uniform float depth;
  uniform float grain;
  uniform float seed;
  uniform float2 size;

  float hash(float2 p) { return fract(sin(dot(p + seed, float2(127.1, 311.7))) * 43758.5453123); }
  float noise(float2 p) {
    float2 i = floor(p); float2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), f.x), mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), f.x), f.y) - 0.5;
  }

  half4 main(float2 p) {
    half4 sampled = source.eval(p);
    if (sampled.a <= 0.0) return sampled;
    float3 rgb = sampled.rgb / max(float(sampled.a), 0.0001);
    float luminance = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    float exposed = clamp((luminance - 0.5) * contrast + 0.5, 0.0, 1.0);
    float tone = 1.0 - exposed;
    float cloud = noise(p / 96.0) * 0.08 * grain;
    float pulp = noise(p / float2(23.0, 19.0)) * 0.048 * grain;
    float fibre = (noise(p * float2(0.18, 0.05)) * 0.65 + noise(p * float2(0.04, -0.22)) * 0.35) * 0.052 * grain;
    float sediment = (noise(p / 7.5) + hash(floor(p))) * 0.075 * grain;
    float ordered = (hash(mod(floor(p), 4.0)) - 0.5) * 0.11 * grain;
    float coverage = pow(clamp(tone + ordered + sediment * (0.34 + tone * 0.62) + cloud * 0.28, 0.0, 1.0), gamma) * depth;
    float edge = min(min(p.x, p.y), min(size.x - p.x, size.y - p.y));
    coverage = clamp(coverage - (1.0 - smoothstep(0.0, max(12.0, min(size.x, size.y) * 0.045), edge)) * 0.018 * grain + pulp * tone * 0.24, 0.0, 1.0);
    float3 paperTone = clamp(paper + cloud + pulp + fibre * (1.0 - coverage * 0.48), 0.0, 1.0);
    float3 result = mix(paperTone, ink, coverage);
    return half4(half3(result) * sampled.a, sampled.a);
  }
`);

const screenRuntimeEffect = Skia.RuntimeEffect.Make(`
  uniform shader source; uniform float3 paper; uniform float3 inkA; uniform float3 inkB;
  uniform float contrast; uniform float dotSize; uniform float offset; uniform float strength;
  float tone(half4 c) { float3 rgb = c.rgb / max(float(c.a), 0.0001); return 1.0 - clamp((dot(rgb, float3(0.2126, 0.7152, 0.0722)) - 0.5) * contrast + 0.5, 0.0, 1.0); }
  float dotMask(float2 p, float coverage) { if (dotSize <= 0.0) return coverage; float2 cell = fract(p / dotSize) - 0.5; float r = sqrt(coverage) * 0.46; return length(cell) < r ? 1.0 : 0.0; }
  half4 main(float2 p) {
    half4 sampled = source.eval(p); if (sampled.a <= 0.0) return sampled;
    // Shadow and highlight plates deliberately occupy different tonal bands.
    float shadowTone = tone(source.eval(p - float2(offset, offset * 0.35)));
    float lightTone = tone(source.eval(p + float2(offset, -offset * 0.45)));
    float a = dotMask(p, smoothstep(0.08, 0.9, shadowTone));
    float b = dotMask(p + float2(dotSize * 0.5, dotSize * 0.32), smoothstep(0.12, 0.88, 1.0 - lightTone));
    float3 result = mix(paper, inkA, clamp(a * strength, 0.0, 1.0));
    result = mix(result, inkB, clamp(b * strength * 0.72, 0.0, 1.0));
    return half4(half3(result) * sampled.a, sampled.a);
  }
`);

const risoRuntimeEffect = Skia.RuntimeEffect.Make(`
  uniform shader source; uniform float3 paper; uniform float3 inkA; uniform float3 inkB; uniform float3 inkC;
  uniform float contrast; uniform float offset; uniform float density; uniform float grain; uniform float threeColor; uniform float seed;
  float hash(float2 p) { return fract(sin(dot(p + seed, float2(41.13, 289.91))) * 24634.6345); }
  float tone(half4 c) { float3 rgb = c.rgb / max(float(c.a), 0.0001); return 1.0 - clamp((dot(rgb, float3(0.2126, 0.7152, 0.0722)) - 0.5) * contrast + 0.5, 0.0, 1.0); }
  float inkNoise(float2 p, float salt) { return (hash(floor(p * (1.0 + salt * 0.07)) + salt * 71.0) - 0.5) * 0.18 * grain; }
  half4 main(float2 p) {
    half4 sampled = source.eval(p); if (sampled.a <= 0.0) return sampled;
    // Each stencil is a separate tonal decision and separate ink-noise field.
    float darkTone = tone(source.eval(p - float2(offset, offset * 0.45)));
    float midTone = tone(source.eval(p + float2(offset * 0.7, -offset)));
    float lightTone = tone(source.eval(p + float2(-offset * 0.35, offset * 0.65)));
    float dark = clamp(smoothstep(0.34, 0.93, darkTone) + inkNoise(p, 1.0), 0.0, 1.0) * density;
    float mid = clamp(smoothstep(0.12, 0.52, midTone) * (1.0 - smoothstep(0.62, 0.94, midTone)) + inkNoise(p, 2.0), 0.0, 1.0) * density;
    float light = clamp(smoothstep(0.12, 0.82, 1.0 - lightTone) + inkNoise(p, 3.0), 0.0, 1.0) * density * threeColor;
    float3 result = mix(paper, inkA, clamp(dark, 0.0, 1.0));
    result = mix(result, inkB, clamp(mid * 0.88, 0.0, 1.0));
    result = mix(result, inkC, clamp(light * 0.62, 0.0, 1.0));
    return half4(half3(result) * sampled.a, sampled.a);
  }
`);

const screenPalettes: Readonly<Record<string, readonly [string, string]>> = {
  'red-blue': ['#D94E4A', '#2753A4'], 'orange-blue': ['#E77936', '#2464A2'], 'pink-green': ['#D9558B', '#397D63'], 'black-cream': ['#222222', '#E9D8AF'], 'purple-yellow': ['#70479B', '#D5A832'],
};
const risoPalettes: Readonly<Record<string, readonly [string, string, string]>> = {
  'pink-blue': ['#E65C8E', '#355EAD', '#F3C854'], 'orange-teal': ['#E77638', '#167E81', '#E6C54F'], 'purple-yellow': ['#70469B', '#D9AE35', '#E66C72'], 'red-black': ['#C74642', '#242428', '#E5BE45'], 'green-pink': ['#4E8A66', '#DA628E', '#E8C44B'],
};

const isTextureRecipe = (effect: Effect): boolean => ['material.grain', 'print.cyanotype', 'print.screen', 'print.riso', 'art.botanical-plate', 'art.pixel-embroidery', 'art.matisse-cutout'].includes(effect.type);
const isRuntimePrintEffect = (effect: Effect): boolean => effect.type === 'print.cyanotype' || effect.type === 'print.screen' || effect.type === 'print.riso';
const sourceShader = (frame: { width: number; height: number }, image: NonNullable<ReturnType<typeof useImage>>) => <ImageShader fit="cover" image={image} rect={{ x: 0, y: 0, width: frame.width, height: frame.height }} tx="clamp" ty="clamp" />;

const cyanotypeShader = (effect: Effect, child: ReactNode, frame: { width: number; height: number }) => {
  const palette = cyanotypePalettes[stringParam(effect, 'tone')] ?? cyanotypePalettes.prussian;
  const intensity = effect.params.intensity === 'soft' ? { contrast: 1.12, gamma: 0.96, depth: 0.82 } : effect.params.intensity === 'deep' ? { contrast: 1.42, gamma: 0.76, depth: 1.16 } : { contrast: 1.28, gamma: 0.84, depth: 1 };
  const grain = effect.params.grain === 'low' ? 0.6 : effect.params.grain === 'high' ? 1.65 : 1;
  return cyanotypeRuntimeEffect ? <Shader key={effect.instanceId} source={cyanotypeRuntimeEffect} uniforms={{ paper: hexChannels(cyanotypePaper(effect, palette)), ink: hexChannels(palette.ink), ...intensity, grain, seed: numberParam(effect, 'seed'), size: { x: frame.width, y: frame.height } }}>{child}</Shader> : child;
};

const screenShader = (effect: Effect, child: ReactNode) => {
  const [inkA, inkB] = screenPalettes[stringParam(effect, 'palette')] ?? screenPalettes['red-blue'];
  const strength = effect.params.strength === 'soft' ? { contrast: 1.04, strength: 0.68 } : effect.params.strength === 'bold' ? { contrast: 1.38, strength: 1 } : { contrast: 1.2, strength: 0.84 };
  const dotSize = effect.params.halftone === 'fine' ? 4 : effect.params.halftone === 'medium' ? 7 : effect.params.halftone === 'coarse' ? 12 : 0;
  const offset = effect.params.offset === 'slight' ? 1.8 : effect.params.offset === 'strong' ? 4.2 : 0;
  return screenRuntimeEffect ? <Shader key={effect.instanceId} source={screenRuntimeEffect} uniforms={{ paper: [0.965, 0.95, 0.9], inkA: hexChannels(inkA), inkB: hexChannels(inkB), ...strength, dotSize, offset }}>{child}</Shader> : child;
};

const risoShader = (effect: Effect, child: ReactNode) => {
  const [inkA, inkB, inkC] = risoPalettes[stringParam(effect, 'palette')] ?? risoPalettes['pink-blue'];
  const density = effect.params.ink === 'light' ? 0.72 : effect.params.ink === 'dense' ? 1.13 : 0.92;
  const offset = effect.params.offset === 'slight' ? 2.4 : effect.params.offset === 'strong' ? 5.2 : 0;
  const grain = effect.params.grain === 'low' ? 0.5 : effect.params.grain === 'high' ? 1.5 : 1;
  return risoRuntimeEffect ? <Shader key={effect.instanceId} source={risoRuntimeEffect} uniforms={{ paper: [0.96, 0.93, 0.85], inkA: hexChannels(inkA), inkB: hexChannels(inkB), inkC: hexChannels(inkC), contrast: 1.15, offset, density, grain, threeColor: effect.params.mode === 'three' ? 1 : 0, seed: numberParam(effect, 'seed') }}>{child}</Shader> : child;
};

const PrintEffectImage = ({ effects, frame, image }: Readonly<{ effects: readonly Effect[]; frame: { width: number; height: number }; image: NonNullable<ReturnType<typeof useImage>> }>) => {
  const shader = effects.filter(isRuntimePrintEffect).reduce<ReactNode>((child, effect) => {
    if (effect.type === 'print.cyanotype') return cyanotypeShader(effect, child, frame);
    if (effect.type === 'print.screen') return screenShader(effect, child);
    return risoShader(effect, child);
  }, sourceShader(frame, image));
  return <Rect x={0} y={0} width={frame.width} height={frame.height}>{shader}</Rect>;
};

const effectParam = (effect: Effect | undefined, path: string): unknown => path.split('.').reduce<unknown>((value, key) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined, effect?.params);
const numberParam = (effect: Effect | undefined, path: string): number => {
  const value = effectParam(effect, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};
const stringParam = (effect: Effect | undefined, path: string): string => {
  const value = effectParam(effect, path);
  return typeof value === 'string' ? value : '#000000';
};

const OverlayEffect = ({ effect, frame, laceFrameFallback, laceFrameUri, laceFrameUris, path }: Readonly<{ effect: Effect; frame: { width: number; height: number }; laceFrameFallback: boolean; laceFrameUri?: string; laceFrameUris: Readonly<Record<string, string>>; path: ReturnType<typeof Skia.Path.Make> }>) => {
  if (effect.type === 'edge.outline') return <Path path={path} color={stringParam(effect, 'color')} style="stroke" strokeWidth={numberParam(effect, 'width')} />;
  if (effect.type === 'material.grain') return <GrainOverlay effect={effect} frame={frame} path={path} />;
  if (effect.type === 'attachment.tape') return <TapeOverlay effect={effect} frame={frame} />;
  if (effect.type === 'frame.lace-center') return <LaceOverlay effect={effect} frame={frame} frameFallback={laceFrameFallback} frameUri={laceFrameUris[laceFrameId(effect)] ?? laceFrameUri} path={path} />;
  if (effect.type === 'frame.foil-center') return <LaceOverlay effect={effect} frame={frame} frameFallback={laceFrameFallback} frameUri={laceFrameUris['foil-crumpled']} path={path} />;
  return null;
};

const GrainOverlay = ({ effect, frame, path }: Readonly<{ effect: Effect; frame: { width: number; height: number }; path: ReturnType<typeof Skia.Path.Make> }>) => {
  const grain = useMemo(() => makeGrainPath(frame.width, frame.height, numberParam(effect, 'seed')), [effect, frame.height, frame.width]);
  return <Group clip={path}><Path path={grain} color={stringParam(effect, 'color')} opacity={numberParam(effect, 'intensity')} /></Group>;
};

/** A raised sheet needs three depth cues: occlusion, directional cast, and ambient falloff. */
const FloatingPaperUnderlay = ({ effect, path }: Readonly<{ effect: Effect; path: ReturnType<typeof Skia.Path.Make> }>) => {
  const opacity = numberParam(effect, 'opacity');
  const blur = Math.max(2, numberParam(effect, 'blur'));
  const offsetX = numberParam(effect, 'offset.x');
  const offsetY = numberParam(effect, 'offset.y');
  const color = stringParam(effect, 'color');
  return <>
    {/* The narrow dark gap tells the eye that the cut-out is no longer touching the page. */}
    <Group transform={[{ translateX: offsetX * 0.18 }, { translateY: offsetY * 0.2 }]} opacity={Math.min(0.36, opacity * 1.18 + 0.06)}>
      <Path path={path} color={color}><BlurMask blur={Math.max(2.5, blur * 0.1)} style="normal" /></Path>
    </Group>
    {/* A darker offset mass creates the cast direction and perceived elevation. */}
    <Group transform={[{ translateX: offsetX * 0.78 }, { translateY: offsetY * 0.82 }]} opacity={Math.min(0.3, opacity * 1.05 + 0.05)}>
      <Path path={path} color={color}><BlurMask blur={Math.max(5, blur * 0.38)} style="normal" /></Path>
    </Group>
    {/* The far, soft tail anchors the object in the shared physical surface. */}
    <Group transform={[{ translateX: offsetX * 1.22 }, { translateY: offsetY * 1.28 }]} opacity={Math.min(0.22, opacity * 0.88 + 0.035)}>
      <Path path={path} color={color}><BlurMask blur={Math.max(10, blur * 1.38)} style="normal" /></Path>
    </Group>
  </>;
};

/** A warm, hairline underside makes the lifted rim readable even on a pale canvas. */
const FloatingPaperRim = ({ effect, path }: Readonly<{ effect: Effect; path: ReturnType<typeof Skia.Path.Make> }>) => {
  const opacity = numberParam(effect, 'opacity');
  const offsetX = numberParam(effect, 'offset.x');
  const offsetY = numberParam(effect, 'offset.y');
  return <Group transform={[{ translateX: offsetX * 0.1 }, { translateY: offsetY * 0.12 }]} opacity={Math.min(0.24, opacity * 0.82 + 0.035)}>
    <Path path={path} color="#8A796B" style="stroke" strokeWidth={1.35} />
  </Group>;
};

/** Tape pins the sheet down, so it gets a short, concentrated contact shadow. */
const TapeContactShadow = ({ effect, path }: Readonly<{ effect: Effect; path: ReturnType<typeof Skia.Path.Make> }>) => {
  const opacity = numberParam(effect, 'opacity');
  return <Group transform={[{ translateY: 3.5 }]} opacity={opacity * 0.16}>
    <Path path={path} color="#2D251F"><BlurMask blur={5} style="normal" /></Path>
  </Group>;
};

const TapeOverlay = ({ effect, frame }: Readonly<{ effect: Effect; frame: { width: number; height: number } }>) => {
  const placement = stringParam(effect, 'placement');
  const color = stringParam(effect, 'color'); const opacity = numberParam(effect, 'opacity');
  const tape = (key: string, x: number, y: number, rotation: number) => {
    const width = frame.width * 0.26; const height = Math.max(18, frame.height * 0.09);
    return <Group key={key} origin={{ x: x + width / 2, y: y + height / 2 }} transform={[{ rotate: rotation }]} opacity={opacity}>
      <Rect x={x + 1.2} y={y + 2.2} width={width} height={height} color="#53463B" opacity={0.14}><BlurMask blur={2.2} style="normal" /></Rect>
      <Rect x={x} y={y} width={width} height={height} color={color} opacity={0.74} />
      <Rect x={x + 1} y={y + 1} width={width - 2} height={Math.max(1, height * 0.18)} color="#FFFDF4" opacity={0.38} />
      <Rect x={x} y={y} width={width} height={height} color="#9F8F73" opacity={0.18} style="stroke" strokeWidth={0.8} />
      <Path path={makeTapeFibrePath(x, y, width, height)} color="#796B59" opacity={0.12} strokeCap="round" style="stroke" strokeWidth={0.65} />
    </Group>;
  };
  if (placement === 'top') return tape('top', frame.width * 0.37, -frame.height * 0.025, -0.04);
  if (placement === 'cross') return <>{tape('a', frame.width * 0.08, -frame.height * 0.025, 0.12)}{tape('b', frame.width * 0.08, -frame.height * 0.025, -0.12)}</>;
  return <>{tape('left', frame.width * 0.04, -frame.height * 0.025, -0.12)}{tape('right', frame.width * 0.70, -frame.height * 0.025, 0.12)}</>;
};

const LaceOverlay = ({ effect, frame, frameFallback, frameUri, path }: Readonly<{ effect: Effect; frame: { width: number; height: number }; frameFallback: boolean; frameUri?: string; path: ReturnType<typeof Skia.Path.Make> }>) => {
  const lace = useMemo(() => makeLaceFramePaths(frame, effect), [effect, frame]);
  const frameImage = useImage(frameUri);
  const opacity = numberParam(effect, 'opacity');
  const color = stringParam(effect, 'color');
  if (frameImage) return <>
    {effect.type !== 'frame.foil-center' &&
    <Group transform={[{ translateY: Math.max(5, Math.min(frame.width, frame.height) * 0.016) }]} opacity={opacity * 0.22}>
      <SkiaImage image={frameImage} x={lace.bounds.x} y={lace.bounds.y} width={lace.bounds.size} height={lace.bounds.size} fit="fill"><BlurMask blur={Math.max(8, Math.min(frame.width, frame.height) * 0.035)} style="normal" /></SkiaImage>
    </Group>}
    <Group clip={path} opacity={opacity}><SkiaImage image={frameImage} x={lace.bounds.x} y={lace.bounds.y} width={lace.bounds.size} height={lace.bounds.size} fit="fill" /></Group>
  </>;
  if (!frameFallback) return null;
  return <>
    <Group transform={[{ translateY: Math.max(5, Math.min(frame.width, frame.height) * 0.016) }]} opacity={opacity * 0.24}>
      <Path path={lace.silhouette} color="#372A22"><BlurMask blur={Math.max(8, Math.min(frame.width, frame.height) * 0.035)} style="normal" /></Path>
    </Group>
    <Group clip={path} opacity={opacity}>
      <Path path={lace.ring} color={color} />
      <Path path={lace.scallops} color={color} />
      <Path path={lace.stitch} color="#BFAF9D" opacity={0.34} style="stroke" strokeWidth={Math.max(1.2, Math.min(frame.width, frame.height) * 0.004)} />
    </Group>
  </>;
};

/**
 * A torn edge is more than a clipped zig-zag. The same deterministic seed
 * produces a compressed paper cross-section. Product surfaces can provide
 * scanned paper-edge and fibre atlases; the deterministic paths remain as a
 * compact fallback for hosts that do not bundle those assets.
 */
const TornPaperEdge = ({ edgeAtlasUri, effect, fiberFringeUri, frame, path }: Readonly<{ edgeAtlasUri?: string; effect: Effect; fiberFringeUri?: string; frame: { width: number; height: number }; path: ReturnType<typeof Skia.Path.Make> }>) => {
  const intensity = Math.max(2, numberParam(effect, 'intensity'));
  const paperWidth = Math.max(6, numberParam(effect, 'edgeWidth') || Math.min(36, Math.max(12, intensity * 0.58)));
  const fibres = useMemo(() => makeTornFibrePath(frame.width, frame.height, numberParam(effect, 'seed'), intensity), [effect, frame.height, frame.width, intensity]);
  const paperBand = useMemo(() => makeTornPaperBandPath(frame.width, frame.height, numberParam(effect, 'seed'), intensity, paperWidth, paperWidth * 0.38), [effect, frame.height, frame.width, intensity, paperWidth]);
  const fibreBand = useMemo(() => makeTornPaperBandPath(frame.width, frame.height, numberParam(effect, 'seed'), intensity, paperWidth * 1.34, paperWidth * 0.14), [effect, frame.height, frame.width, intensity, paperWidth]);
  const edgeAtlas = useImage(edgeAtlasUri);
  const fiberFringe = useImage(fiberFringeUri);
  const edgeWidth = Math.max(0.7, Math.min(3, intensity * 0.055));
  const hasScannedMaterial = edgeAtlas !== null || fiberFringe !== null;
  return <>
    {/* A true ring, not a centred stroke: most paper thickness grows outward. */}
    <Path path={paperBand} color="#FFF4E3" opacity={hasScannedMaterial ? 0.8 : 0.68} />
    <Path path={paperBand} color="#DCC8AC" opacity={hasScannedMaterial ? 0.2 : 0.28} style="stroke" strokeWidth={Math.max(0.7, paperWidth * 0.065)} />
    {/* Fine paper-pulp contour remains readable at the inner edge of the ring. */}
    <Path path={path} color="#58483B" opacity={hasScannedMaterial ? 0.1 : 0.18} style="stroke" strokeWidth={edgeWidth} />
    <Path path={path} color="#F5EBDD" opacity={hasScannedMaterial ? 0.2 : 0.52} style="stroke" strokeWidth={edgeWidth * 0.48} />
    {/* Material is confined to the irregular paper ring; fibres get a wider outer allowance. */}
    {edgeAtlas && <TornPaperAtlasBands clipPath={paperBand} image={edgeAtlas} frame={frame} intensity={intensity} opacity={0.5} seed={numberParam(effect, 'seed')} />}
    {fiberFringe && <TornPaperAtlasBands clipPath={fibreBand} image={fiberFringe} frame={frame} intensity={intensity} opacity={0.94} seed={numberParam(effect, 'seed') + 37} />}
    <Group clip={path}>
      {/* Preserve a little deterministic breakup where a host has no bundled scan. */}
      <Path path={fibres.dark} color="#675042" opacity={hasScannedMaterial ? 0.1 : 0.25} strokeCap="round" style="stroke" strokeWidth={Math.max(0.55, edgeWidth * 0.2)} />
      <Path path={fibres.light} color="#FFF9ED" opacity={hasScannedMaterial ? 0.16 : 0.68} strokeCap="round" style="stroke" strokeWidth={Math.max(0.5, edgeWidth * 0.15)} />
      <Path path={fibres.pulp} color="#E7D6BD" opacity={hasScannedMaterial ? 0.2 : 0.62} />
    </Group>
  </>;
};

/**
 * Repeats a transparent scanned atlas as short strips on all four edges.
 * Multiple interrupted strips avoid the regular, printed-border look while
 * letting the bitmap carry real cellulose fibres at editor and export scale.
 */
const TornPaperAtlasBands = ({ clipPath, frame, image, intensity, opacity, seed }: Readonly<{ clipPath?: ReturnType<typeof Skia.Path.Make>; frame: { width: number; height: number }; image: NonNullable<ReturnType<typeof useImage>>; intensity: number; opacity: number; seed: number }>) => {
  const random = useMemo(() => seeded(seed), [seed]);
  const thickness = Math.max(11, Math.min(34, intensity * 1.05));
  const bands = useMemo(() => {
    const horizontal = (edge: 'top' | 'bottom') => Array.from({ length: 3 }, (_, index) => {
      const width = frame.width * (0.27 + random() * 0.16);
      return { edge, height: thickness * (0.72 + random() * 0.42), rotation: (random() - 0.5) * 0.05, width, x: Math.min(frame.width - width, random() * frame.width * 0.84), y: edge === 'top' ? -thickness * 0.52 : frame.height - thickness * 0.48 };
    });
    const vertical = (edge: 'left' | 'right') => Array.from({ length: 3 }, (_, index) => {
      const width = frame.height * (0.25 + random() * 0.17);
      return { edge, height: thickness * (0.72 + random() * 0.42), rotation: Math.PI / 2 + (random() - 0.5) * 0.05, width, x: edge === 'left' ? -width / 2 + thickness * 0.14 : frame.width - width / 2 - thickness * 0.14, y: Math.min(frame.height - width, random() * frame.height * 0.84) + width / 2 - thickness / 2 };
    });
    return [...horizontal('top'), ...horizontal('bottom'), ...vertical('left'), ...vertical('right')];
  }, [frame.height, frame.width, random, thickness]);
  const artwork = <>
    {bands.map((band, index) => <Group key={`${band.edge}-${index}`} opacity={opacity * (0.8 + (index % 3) * 0.08)} origin={{ x: band.x + band.width / 2, y: band.y + band.height / 2 }} transform={[{ rotate: band.rotation }]}>
      <SkiaImage image={image} x={band.x} y={band.y} width={band.width} height={band.height} fit="fill" />
    </Group>)}
  </>;
  return clipPath ? <Group clip={clipPath}>{artwork}</Group> : artwork;
};

/** Stable product parameters become a renderer-specific edge path. */
const makeLayerPath = (width: number, height: number, seed?: number, intensity?: number) => {
  const points = makeTornContourPoints(width, height, seed, intensity);
  return pathFromPoints(points);
};

type TornContourPoint = Readonly<{ x: number; y: number }>;

/** One seeded contour drives clipping, paper thickness, and fibre placement. */
const makeTornContourPoints = (width: number, height: number, seed?: number, intensity?: number): readonly TornContourPoint[] => {
  if (seed === undefined || intensity === undefined) return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const random = seeded(seed);
  const step = Math.max(24, Math.min(width, height) / 14);
  const points: TornContourPoint[] = [{ x: 0, y: 0 }];
  for (let x = step; x < width; x += step) points.push({ x, y: (random() - 0.5) * intensity });
  points.push({ x: width, y: 0 });
  for (let y = step; y < height; y += step) points.push({ x: width + (random() - 0.5) * intensity, y });
  points.push({ x: width, y: height });
  for (let x = width - step; x > 0; x -= step) points.push({ x, y: height + (random() - 0.5) * intensity });
  points.push({ x: 0, y: height });
  for (let y = height - step; y > 0; y -= step) points.push({ x: (random() - 0.5) * intensity, y });
  return points;
};

const pathFromPoints = (points: readonly TornContourPoint[]) => {
  const path = Skia.Path.Make();
  points.forEach((point, index) => index === 0 ? path.moveTo(point.x, point.y) : path.lineTo(point.x, point.y));
  path.close();
  return path;
};

/**
 * Creates the exposed paper itself: an asymmetrical outer expansion minus a
 * smaller inner expansion. It grows mostly outside the artwork, unlike a
 * centred stroke which consumes the photo as it gets wider.
 */
const makeTornPaperBandPath = (width: number, height: number, seed: number, intensity: number, outerWidth: number, innerWidth: number) => {
  const center = { x: width / 2, y: height / 2 };
  const contour = makeTornContourPoints(width, height, seed, intensity);
  const offset = (distance: number) => contour.map((point) => {
    const dx = point.x - center.x; const dy = point.y - center.y;
    const magnitude = Math.max(1, Math.hypot(dx, dy));
    return { x: point.x + dx / magnitude * distance, y: point.y + dy / magnitude * distance };
  });
  const outer = pathFromPoints(offset(outerWidth));
  const inner = pathFromPoints(offset(-innerWidth));
  return Skia.Path.MakeFromOp(outer, inner, PathOp.Difference) ?? outer;
};

const makeTornFibrePath = (width: number, height: number, seed: number, intensity: number) => {
  const random = seeded(seed + 971);
  const dark = Skia.Path.Make();
  const light = Skia.Path.Make();
  const pulp = Skia.Path.Make();
  const inset = Math.max(3, Math.min(28, intensity * 0.82));
  const count = Math.max(20, Math.min(150, Math.round((width + height) / Math.max(20, Math.min(width, height) / 18))));
  const strand = (edge: 'bottom' | 'left' | 'right' | 'top', position: number) => {
    const length = inset * (0.35 + random() * 1.15);
    const wobble = (random() - 0.5) * intensity * 0.55;
    const split = random() > 0.58;
    let startX = position; let startY = inset; let endX = position + wobble; let endY = -inset;
    if (edge === 'bottom') { startY = height - inset; endY = height + inset; }
    if (edge === 'left') { startX = inset; startY = position; endX = -inset; endY = position + wobble; }
    if (edge === 'right') { startX = width - inset; startY = position; endX = width + inset; endY = position + wobble; }
    const dx = endX - startX; const dy = endY - startY;
    const scale = length / Math.max(1, Math.hypot(dx, dy));
    const fibreEndX = startX + dx * scale;
    const fibreEndY = startY + dy * scale;
    dark.moveTo(startX, startY); dark.lineTo(fibreEndX, fibreEndY);
    if (split) {
      const branch = 0.45 + random() * 0.35;
      light.moveTo(startX + dx * branch * scale, startY + dy * branch * scale);
      light.lineTo(fibreEndX + (random() - 0.5) * inset * 0.6, fibreEndY + (random() - 0.5) * inset * 0.6);
    }
    if (random() > 0.62) pulp.addCircle(startX + (random() - 0.5) * 3, startY + (random() - 0.5) * 3, 0.5 + random() * 1.4);
  };
  for (let index = 0; index < count; index += 1) {
    const edge = index % 4;
    if (edge === 0) strand('top', random() * width);
    else if (edge === 1) strand('right', random() * height);
    else if (edge === 2) strand('bottom', random() * width);
    else strand('left', random() * height);
  }
  return { dark, light, pulp };
};

/** Quiet longitudinal strands stop a translucent tape strip from reading as flat plastic. */
const makeTapeFibrePath = (x: number, y: number, width: number, height: number) => {
  const path = Skia.Path.Make();
  const count = Math.max(2, Math.floor(height / 7));
  for (let index = 1; index <= count; index += 1) {
    const baseline = y + height * index / (count + 1);
    path.moveTo(x + width * 0.06, baseline);
    path.lineTo(x + width * 0.94, baseline + (index % 2 === 0 ? 0.6 : -0.6));
  }
  return path;
};

/** Deterministic dots keep grain identical on preview, thumbnail and export. */
const makeGrainPath = (width: number, height: number, seed: number) => {
  const path = Skia.Path.Make();
  const random = seeded(seed);
  const count = Math.max(80, Math.min(900, Math.round(width * height / 2200)));
  for (let index = 0; index < count; index += 1) {
    const radius = 0.35 + random() * 0.95;
    path.addCircle(random() * width, random() * height, radius);
  }
  return path;
};

/** Mirrors the mini-program lace centre semantics, while retaining a circular frame. */
const makeLaceOpeningPath = (frame: { width: number; height: number }, effect: Effect) => {
  const openingScale = Math.max(0.45, Math.min(1, numberParam(effect, 'scale') || 1));
  const bounds = laceFrameBounds(frame);
  const diameter = bounds.size * laceOpeningRatio(effect) * openingScale;
  const path = Skia.Path.Make();
  path.addOval({ x: frame.width / 2 - diameter / 2, y: frame.height / 2 - diameter / 2, width: diameter, height: diameter });
  return path;
};

const laceFrameId = (effect: Effect): 'wide-hole' | 'classic-doily' => effect.params.frameId === 'classic-doily' ? 'classic-doily' : 'wide-hole';
const laceOpeningRatio = (effect: Effect): number => effect.type === 'frame.foil-center' ? 0.72 : laceFrameId(effect) === 'classic-doily' ? 0.54 : 0.73;
const laceContentZoom = (effect: Effect): number => 1 / Math.max(0.65, Math.min(1.8, numberParam(effect, 'contentScale') || 1));

/** The real source PNG is square; keeping this bound square prevents ellipse distortion. */
const laceFrameBounds = (frame: { width: number; height: number }) => {
  const size = Math.min(frame.width, frame.height);
  return { size, x: (frame.width - size) / 2, y: (frame.height - size) / 2 };
};

const makeLaceFramePaths = (frame: { width: number; height: number }, effect: Effect) => {
  const opening = makeLaceOpeningPath(frame, effect);
  const bounds = laceFrameBounds(frame);
  const { size } = bounds;
  const outer = Skia.Path.Make();
  const inset = Math.max(5, size * 0.024);
  outer.addOval({ x: bounds.x + inset, y: bounds.y + inset, width: Math.max(1, size - inset * 2), height: Math.max(1, size - inset * 2) });
  const ring = Skia.Path.MakeFromOp(outer, opening, PathOp.Difference) ?? outer;
  const scallops = Skia.Path.Make();
  const stitch = Skia.Path.Make();
  const radiusX = Math.max(1, size / 2 - inset); const radiusY = radiusX;
  const cx = frame.width / 2; const cy = frame.height / 2;
  const count = Math.max(18, Math.min(42, Math.round((frame.width + frame.height) / Math.max(28, size * 0.065))));
  const petalRadius = Math.max(5, size * 0.027);
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI * 2 * index / count;
    const x = cx + Math.cos(angle) * radiusX;
    const y = cy + Math.sin(angle) * radiusY;
    scallops.addCircle(x, y, petalRadius);
    const innerX = cx + Math.cos(angle) * Math.max(1, radiusX - petalRadius * 1.35);
    const innerY = cy + Math.sin(angle) * Math.max(1, radiusY - petalRadius * 1.35);
    stitch.moveTo(innerX, innerY); stitch.lineTo(x, y);
  }
  const silhouette = Skia.Path.MakeFromOp(ring, scallops, PathOp.Union) ?? ring;
  return { bounds, ring, scallops, silhouette, stitch };
};

const makeBrushPath = (stroke: BrushStroke) => {
  const path = Skia.Path.Make();
  stroke.points.forEach((point, index) => index === 0 ? path.moveTo(point.x, point.y) : path.lineTo(point.x, point.y));
  return path;
};

type BrushSample = Readonly<{ x: number; y: number; angle: number; index: number }>;
type CrayonFibre = Readonly<{ from: Point; opacity: number; to: Point; width: number }>;

/** Carries remaining distance across segments, so a corner never resets spacing. */
const sampleBrushPath = (points: readonly Point[], spacing: number): readonly BrushSample[] => {
  if (points.length < 2) return points.length === 1 ? [{ x: points[0].x, y: points[0].y, angle: 0, index: 0 }] : [];
  const samples: BrushSample[] = [];
  let carry = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]; const end = points[index];
    const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy);
    if (length <= 0.01) continue;
    const angle = Math.atan2(dy, dx); let distance = spacing - carry;
    while (distance <= length) { const progress = distance / length; samples.push({ x: start.x + dx * progress, y: start.y + dy * progress, angle, index: samples.length }); distance += spacing; }
    carry = length - (distance - spacing);
    if (carry >= spacing) carry = 0;
  }
  if (samples.length === 0) { const start = points[0]; const end = points.at(-1)!; samples.push({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, angle: Math.atan2(end.y - start.y, end.x - start.x), index: 0 }); }
  return samples;
};

/**
 * Dry wax has directional, partially overlapping fibres—not opaque circular
 * stamps. Keeping these deterministic makes the canvas, export and catalog
 * preview visually identical at every scale.
 */
const makeCrayonFibres = (stroke: BrushStroke): readonly CrayonFibre[] => {
  const random = seeded(stroke.style.seed);
  const fibres: CrayonFibre[] = [];
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    return Array.from({ length: 7 }, () => {
      const angle = random() * Math.PI;
      const length = stroke.style.size * (0.36 + random() * 0.24);
      const normal = { x: Math.cos(angle), y: Math.sin(angle) };
      const offset = (random() - 0.5) * stroke.style.size * 0.52;
      const center = { x: point.x + normal.y * offset, y: point.y - normal.x * offset };
      return { from: { x: center.x - normal.x * length / 2, y: center.y - normal.y * length / 2 }, to: { x: center.x + normal.x * length / 2, y: center.y + normal.y * length / 2 }, width: Math.max(0.7, stroke.style.size * (0.035 + random() * 0.035)), opacity: stroke.style.opacity * (0.18 + random() * 0.23) };
    });
  }
  for (let index = 1; index < stroke.points.length; index += 1) {
    const from = stroke.points[index - 1];
    const to = stroke.points[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const count = Math.max(1, Math.ceil(distance / Math.max(1, stroke.style.spacing * 0.62)));
    for (let stamp = 0; stamp <= count; stamp += 1) {
      const progress = stamp / count;
      const normal = distance === 0 ? { x: 0, y: 0 } : { x: -dy / distance, y: dx / distance };
      const tangent = distance === 0 ? { x: 1, y: 0 } : { x: dx / distance, y: dy / distance };
      // Several thin wax fibres at each interval preserve the uneven edge and
      // paper-show-through of a real crayon mark.
      for (let fibre = 0; fibre < 4; fibre += 1) {
        const drift = (random() - 0.5) * (stroke.style.size * 0.82 + stroke.style.jitter);
        const length = stroke.style.spacing * (0.72 + random() * 0.72);
        const center = { x: from.x + dx * progress + normal.x * drift, y: from.y + dy * progress + normal.y * drift };
        fibres.push({
          from: { x: center.x - tangent.x * length / 2, y: center.y - tangent.y * length / 2 },
          to: { x: center.x + tangent.x * length / 2, y: center.y + tangent.y * length / 2 },
          width: Math.max(0.7, stroke.style.size * (0.025 + random() * 0.04)),
          opacity: stroke.style.opacity * (0.14 + random() * 0.24),
        });
      }
    }
  }
  return fibres;
};

const makeCrayonFibrePath = (fibre: CrayonFibre) => {
  const path = Skia.Path.Make();
  path.moveTo(fibre.from.x, fibre.from.y); path.lineTo(fibre.to.x, fibre.to.y);
  return path;
};

const pointAt = (sample: BrushSample, horizontal: number, vertical: number) => ({ x: sample.x + horizontal * Math.cos(sample.angle) - vertical * Math.sin(sample.angle), y: sample.y + horizontal * Math.sin(sample.angle) + vertical * Math.cos(sample.angle) });

const makeStitchPath = (sample: BrushSample, size: number) => {
  const path = Skia.Path.Make();
  const length = Math.max(7, size * 1.25); const start = pointAt(sample, -length / 2, 0); const end = pointAt(sample, length / 2, 0);
  path.moveTo(start.x, start.y); path.lineTo(end.x, end.y);
  return path;
};

const makeKnitPath = (sample: BrushSample, size: number) => {
  const path = Skia.Path.Make();
  const length = Math.max(9, size * 1.45); const spread = Math.max(4, size * 0.55); const left = pointAt(sample, -spread, -length / 2); const right = pointAt(sample, spread, -length / 2); const bottom = pointAt(sample, 0, length / 2);
  path.moveTo(left.x, left.y); path.lineTo(bottom.x, bottom.y); path.moveTo(right.x, right.y); path.lineTo(bottom.x, bottom.y);
  return path;
};

const LaceStamp = ({ color, index, opacity, sample, size }: Readonly<{ color: string; index: number; opacity: number; sample: BrushSample; size: number }>) => {
  const radius = Math.max(5, size * 0.9); const path = Skia.Path.Make(); const start = pointAt(sample, -radius, radius * 0.12); const end = pointAt(sample, radius, radius * 0.12); const controlLeft = pointAt(sample, -radius, -radius * 0.44); const controlRight = pointAt(sample, radius, -radius * 0.44);
  path.moveTo(start.x, start.y); path.cubicTo(controlLeft.x, controlLeft.y, controlRight.x, controlRight.y, end.x, end.y);
  const left = pointAt(sample, -radius * 0.46, radius * 0.08); const right = pointAt(sample, radius * 0.46, radius * 0.08); const top = pointAt(sample, 0, -radius * 0.28); const dot = Math.max(1.4, size * 0.16);
  return <Group opacity={opacity}><Path path={path} color={color} style="stroke" strokeCap="round" strokeWidth={Math.max(1.4, size * 0.24)} /><Circle cx={left.x} cy={left.y} r={dot} color={color} /><Circle cx={right.x} cy={right.y} r={dot} color={color} />{index % 2 === 0 && <Circle cx={top.x} cy={top.y} r={Math.max(1.3, size * 0.14)} color={color} />}</Group>;
};

const BowStamp = ({ color, image, index, opacity, sample, size }: Readonly<{ color: string; image: ReturnType<typeof useImage>; index: number; opacity: number; sample: BrushSample; size: number }>) => {
  const stampSize = Math.max(24, size * 3.4); const rotation = sample.angle + (index % 2 === 0 ? -0.16 : 0.16);
  if (image) return <Group opacity={opacity} origin={{ x: sample.x, y: sample.y }} transform={[{ rotate: rotation }]}><SkiaImage image={image} x={sample.x - stampSize / 2} y={sample.y - stampSize / 2} width={stampSize} height={stampSize} fit="contain" /></Group>;
  const rotated = { ...sample, angle: rotation }; const center = { x: sample.x, y: sample.y }; const left = pointAt(rotated, -stampSize * 0.42, 0); const right = pointAt(rotated, stampSize * 0.42, 0); const path = Skia.Path.Make();
  path.moveTo(center.x, center.y); path.cubicTo(left.x, left.y - stampSize * 0.34, left.x - stampSize * 0.15, left.y + stampSize * 0.22, center.x, center.y + stampSize * 0.05); path.cubicTo(right.x + stampSize * 0.15, right.y + stampSize * 0.22, right.x, right.y - stampSize * 0.34, center.x, center.y); path.close();
  return <Group opacity={opacity}><Path path={path} color={color} /><Circle cx={center.x} cy={center.y} r={Math.max(2, stampSize * 0.12)} color={color} /></Group>;
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
  // Keep non-uniform scale in local axes, then rotate the completed rectangle.
  // Reversing these operations shears an otherwise rectangular photo slot.
  { rotate: layer.transform.rotation },
  { scaleX: layer.transform.scale.x },
  { scaleY: layer.transform.scale.y },
];
