import type { Point, Rect, Size, Transform } from './geometry';

export const DRAFT_SCHEMA_VERSION = 1 as const;

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
}>;

export type TextLayer = LayerBase & Readonly<{
  type: 'text';
  text: string;
  frame: Size;
  font: AssetReference | null;
  fontSize: number;
  color: string;
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
  canvas: Readonly<{ size: Size; background: string }>;
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
