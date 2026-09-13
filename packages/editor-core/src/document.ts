import type { Point, Rect, Size, Transform } from './geometry';

export const DRAFT_SCHEMA_VERSION = 4 as const;

export type AssetKind = 'image' | 'font' | 'texture' | 'brush';

/**
 * A stable logical asset identity. Renderers resolve this through a platform
 * asset repository; local paths, cache keys, and URLs are deliberately absent.
 */
export type AssetReference = Readonly<{
  id: string;
  kind: AssetKind;
  revision?: string;
}>;

/**
 * A catalog-owned brush description.  It is deliberately separate from a
 * Draft: the catalog may map this stable identity to a bundled, cached, or
 * remote material without leaking an implementation URI into a work.
 */
export type BrushDefinition = Readonly<{
  id: string;
  revision: string;
  renderer: 'path' | 'stamps' | 'texture-stamps' | 'procedural' | 'animated';
  /** Stable renderer recipe; asset art may evolve without changing document semantics. */
  recipe: 'plain' | 'crayon' | 'marker' | 'stitch' | 'knit' | 'beads' | 'lace' | 'bow';
  supports: Readonly<{
    color: boolean;
    pressure: boolean;
    rotation: 'fixed' | 'tangent';
    animation: boolean;
  }>;
  defaults: Readonly<{ size: number; spacing: number; jitter: number; opacity: number }>;
  constraints: Readonly<{ minSize: number; maxSize: number; minSpacing: number; maxSpacing: number }>;
  asset?: AssetReference;
}>;

/** Optional input attributes keep stylus and time-based brushes forward-compatible. */
export type BrushPoint = Point & Readonly<{
  pressure?: number;
  timestamp?: number;
  tiltX?: number;
  tiltY?: number;
}>;

export type BrushStroke = Readonly<{
  id: string;
  /** Omitted legacy values are paint marks. Erase marks clear prior marks in this layer only. */
  mode?: 'paint' | 'erase';
  brushId: string;
  brushRevision: string;
  points: readonly BrushPoint[];
  style: Readonly<{
    /** Null means the selected material owns its color. */
    color: string | null;
    size: number;
    spacing: number;
    jitter: number;
    seed: number;
    opacity: number;
  }>;
}>;

/**
 * Effects remain portable data. Their catalog supplies UI, parameter schemas
 * and renderer recipes; a Draft never owns a Skia object, URI or cache key.
 */
export type EffectStage = 'geometry' | 'underlay' | 'content' | 'overlay' | 'post-composite';
export type EffectPrimitive = string | number | boolean | null;
export interface EffectValueObject { readonly [key: string]: EffectValue; }
export type EffectValue = EffectPrimitive | readonly EffectValue[] | EffectValueObject;

export type EffectTrack = Readonly<{
  interpolation: 'step' | 'linear' | 'cubic-bezier';
  keyframes: readonly Readonly<{ timeMs: number; value: EffectValue; easing?: readonly [number, number, number, number] }>[];
}>;

export type Effect = Readonly<{
  /** Instance identity, separate from effect type so effects can be stacked. */
  instanceId: string;
  type: string;
  version: number;
  enabled: boolean;
  stage: EffectStage;
  params: Readonly<Record<string, EffectValue>>;
  inputs?: Readonly<Record<string, AssetReference>>;
  animation?: Readonly<Record<string, EffectTrack>>;
}>;

export type BrushCutStroke = Readonly<{ size: number; points: readonly Point[] }>;

export type BrushCutMask = Readonly<{
  mode: 'include' | 'exclude';
  /** Strokes are stored in original content coordinates so result and remainder share one mask. */
  strokes: readonly BrushCutStroke[];
  /**
   * Holes within an include mask. This lets an already extracted fragment be
   * split again without restoring pixels outside that fragment.
   */
  excludeStrokes?: readonly BrushCutStroke[];
  coordinateSpace?: 'content';
}>;

/**
 * Stable shape identifiers for masks that are part of a document. Renderer
 * implementations own the actual paths; a Draft never contains a Skia path
 * or a platform-specific clipping object.
 */
export type MaskShapeId = 'circle' | 'rect' | 'heart' | 'star' | 'tag' | 'stamp';

/**
 * A platform-neutral expression describing the visible pixels of an image
 * layer. Coordinates are layer-content coordinates (the same coordinates used
 * by clip paths and brush-cut masks), never screen coordinates.
 *
 * Legacy `clipPath`, `clipPaths`, and `brushCutMask` remain readable while
 * they are migrated. Renderers must intersect those legacy masks with this
 * expression when both are present.
 */
export type VisibilityMask =
  | Readonly<{ type: 'all' }>
  | Readonly<{ type: 'shape'; shape: MaskShapeId; bounds: Rect }>
  | Readonly<{ type: 'polygon'; points: readonly Point[] }>
  | Readonly<{ type: 'brush'; strokes: readonly BrushCutStroke[] }>
  | Readonly<{ type: 'intersect'; masks: readonly VisibilityMask[] }>
  | Readonly<{ type: 'subtract'; base: VisibilityMask; cut: VisibilityMask }>;

type LayerBase = Readonly<{
  id: string;
  name?: string;
  transform: Transform;
  opacity: number;
  isLocked: boolean;
  effects: readonly Effect[];
}>;

export type ImageLayer = LayerBase & Readonly<{
  type: 'image';
  asset: AssetReference;
  frame: Size;
  crop: Rect;
  /**
   * Position of the original image content within a tight fragment frame.
   * Absent means the content exactly fills `frame`.
   */
  contentFrame?: Rect;
  /**
   * A layer-local polygon used for non-destructive cut fragments. The image
   * asset remains immutable and can be shared by both sides of a cut.
   */
  clipPath?: readonly Point[];
  /** Intersected clip paths for repeated cuts of concave fragments. */
  clipPaths?: readonly (readonly Point[])[];
  /** Semantic alpha-mask strokes used by the freehand scissors tool. */
  brushCutMask?: BrushCutMask;
  /**
   * General, non-destructive visible-area expression used by tools such as
   * emboss. It deliberately coexists with legacy scissors fields until their
   * migration is complete.
   */
  visibilityMask?: VisibilityMask;
  /** Stable lineage for repeated cuts; never contains a platform file path. */
  cutFragment?: Readonly<{ sourceLayerId: string; operationId: string; style: 'straight' | 'wave' | 'mask' }>;
}>;

export type TextLayer = LayerBase & Readonly<{
  type: 'text';
  text: string;
  frame: Size;
  /** Stable catalog identities only; platform family names stay in the resolver. */
  fontId: string;
  fontVariantId: string;
  fontSize: number;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  backgroundColor: string | null;
}>;

export type MaterialLayer = LayerBase & Readonly<{
  type: 'material';
  asset: AssetReference;
  frame: Size;
}>;

/** Persisted brush geometry; renderer caches paths, Pictures, and atlases separately. */
export type BrushLayer = LayerBase & Readonly<{
  type: 'brush';
  frame: Size;
  strokes: readonly BrushStroke[];
}>;

export type Layer = ImageLayer | TextLayer | MaterialLayer | BrushLayer;

export type Draft = Readonly<{
  schemaVersion: typeof DRAFT_SCHEMA_VERSION;
  id: string;
  /**
   * Background assets are canvas-owned, rather than image layers.  The draft
   * keeps only the stable asset reference; platform URLs and cache locations
   * remain resolver data.
   */
  canvas: Readonly<{ size: Size; background: string; backgroundAsset?: AssetReference }>;
  layers: readonly Layer[];
  selectedLayerId: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export const createDraft = (input: {
  id: string;
  size: Size;
  background?: string;
  now: string;
}): Draft => ({
  schemaVersion: DRAFT_SCHEMA_VERSION,
  id: input.id,
  canvas: { size: input.size, background: input.background ?? '#F7F3ED' },
  layers: [],
  selectedLayerId: null,
  createdAt: input.now,
  updatedAt: input.now,
});
