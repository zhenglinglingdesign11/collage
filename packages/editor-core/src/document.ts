import type { Point, Rect, Size, Transform } from './geometry';

export const DRAFT_SCHEMA_VERSION = 2 as const;

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

export type Effect =
  | Readonly<{ id: 'shadow'; opacity: number; blur: number; offset: { x: number; y: number }; color: string }>
  | Readonly<{ id: 'outline'; width: number; color: string }>
  | Readonly<{ id: 'torn-edge'; seed: number; intensity: number }>;

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

/** Persisted brush geometry; renderer caches any paths or texture atlases separately. */
export type BrushLayer = LayerBase & Readonly<{
  type: 'brush';
  brush: AssetReference;
  frame: Size;
  points: readonly Point[];
  size: number;
  spacing: number;
  jitter: number;
  seed: number;
  color: string;
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
