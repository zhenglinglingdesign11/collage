import {
  BlurMask,
  Circle,
  Fill,
  Group,
  Image as SkiaImage,
  matchFont,
  Path,
  Rect,
  RoundedRect,
  Skia,
  Text,
  useImage,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import type { Draft, Effect, Layer } from '@journalcollage/editor-core';
import type { SharedValue } from 'react-native-reanimated';

export type CanvasViewport = Readonly<{
  x: number;
  y: number;
  scale: number;
}>;

export type ActiveLayerPresentation = Readonly<{
  layerId: string | null;
  transform: SharedValue<Transforms3d>;
}>;

type SkiaEditorSceneProps = Readonly<{
  draft: Draft;
  viewport: CanvasViewport;
  activeLayer: ActiveLayerPresentation;
  assetUris?: Readonly<Record<string, string>>;
  showSelection?: boolean;
}>;

/**
 * The A1 scene deliberately renders fixture assets as material placeholders.
 * A later AssetResolver will replace only the content drawing, not its Draft
 * or transform contract.
 */
export const SkiaEditorScene = ({ draft, viewport, activeLayer, assetUris = {}, showSelection = true }: SkiaEditorSceneProps) => (
  <>
    <Fill color="#D9D2C7" />
    <Group transform={[{ translateX: viewport.x }, { translateY: viewport.y }, { scale: viewport.scale }]}>
      <RoundedRect
        x={0}
        y={0}
        width={draft.canvas.size.width}
        height={draft.canvas.size.height}
        r={4}
        color={draft.canvas.background}
      />
      {draft.layers.map((layer) => (
        <SkiaLayer
          key={layer.id}
          layer={layer}
          selected={showSelection && draft.selectedLayerId === layer.id}
          transform={activeLayer.layerId === layer.id ? activeLayer.transform : layerTransform(layer)}
          assetUri={layer.type === 'image' ? assetUris[layer.asset.id] : undefined}
        />
      ))}
    </Group>
  </>
);

type SkiaLayerProps = Readonly<{
  layer: Layer;
  selected: boolean;
  transform: Transforms3d | SharedValue<Transforms3d>;
  assetUri?: string;
}>;

const SkiaLayer = ({ layer, selected, transform, assetUri }: SkiaLayerProps) => {
  const { frame } = layer;
  // Use the Android/iOS shared family name. `System` is not a resolvable
  // Android font family and can produce an empty SkFont there.
  const font = layer.type === 'text' ? matchFont({ fontFamily: 'sans-serif', fontSize: layer.fontSize }) : null;
  const tornEdge = effectFor(layer.effects, 'torn-edge');
  const shadow = effectFor(layer.effects, 'shadow');
  const outline = effectFor(layer.effects, 'outline');
  const shapePath = useMemo(
    () => makeLayerPath(frame.width, frame.height, tornEdge?.seed, tornEdge?.intensity),
    [frame.height, frame.width, tornEdge?.intensity, tornEdge?.seed],
  );

  return (
    <Group transform={transform} origin={{ x: frame.width / 2, y: frame.height / 2 }} opacity={layer.opacity}>
      {shadow && <Group transform={[{ translateX: shadow.offset.x }, { translateY: shadow.offset.y }]} opacity={shadow.opacity}><Path path={shapePath} color={shadow.color}><BlurMask blur={shadow.blur} style="normal" /></Path></Group>}
      <Group clip={shapePath}>
        {layer.type === 'image' && <ImagePlaceholder layer={layer} assetUri={assetUri} />}
        {layer.type === 'material' && <MaterialPlaceholder layer={layer} />}
        {layer.type === 'brush' && <BrushPlaceholder layer={layer} />}
        {layer.type === 'text' && <><RoundedRect x={0} y={0} width={frame.width} height={frame.height} r={20} color="#FFFDF9" /><Text x={34} y={frame.height / 2 + layer.fontSize / 3} text={layer.text} font={font} color={layer.color} /></>}
      </Group>
      {outline && <Path path={shapePath} color={outline.color} style="stroke" strokeWidth={outline.width} />}
      {selected && (
        <>
          <Rect x={-12} y={-12} width={frame.width + 24} height={frame.height + 24} color="#4A6F9A" style="stroke" strokeWidth={8} />
          <Circle cx={frame.width / 2} cy={-12} r={13} color="#4A6F9A" />
        </>
      )}
    </Group>
  );
};

const ImagePlaceholder = ({ layer, assetUri }: { layer: Extract<Layer, { type: 'image' }>; assetUri?: string }) => {
  const image = useImage(assetUri);
  return (
  <Group transform={[{ translateX: -layer.crop.x * layer.frame.width / layer.crop.width }, { translateY: -layer.crop.y * layer.frame.height / layer.crop.height }, { scaleX: 1 / layer.crop.width }, { scaleY: 1 / layer.crop.height }]}>
    {image ? <SkiaImage image={image} x={0} y={0} width={layer.frame.width} height={layer.frame.height} fit="cover" /> : <><RoundedRect x={0} y={0} width={layer.frame.width} height={layer.frame.height} r={28} color="#5E7D79" /><Circle cx={layer.frame.width * 0.76} cy={layer.frame.height * 0.24} r={layer.frame.width * 0.1} color="#F8D88B" /><Rect x={0} y={layer.frame.height * 0.55} width={layer.frame.width} height={layer.frame.height * 0.45} color="#355C58" /><Rect x={0} y={layer.frame.height * 0.7} width={layer.frame.width} height={layer.frame.height * 0.3} color="#284A47" /></>}
  </Group>
  );
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
