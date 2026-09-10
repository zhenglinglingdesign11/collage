import type { Draft, Size } from '@journalcollage/editor-core';

export * from './SkiaEditorScene';

/** A renderer is replaceable; its input and output intent are not. */
export type RenderTarget = 'preview' | 'export' | 'thumbnail';

export type RenderRequest = Readonly<{
  draft: Draft;
  target: RenderTarget;
  size: Size;
  time?: number;
}>;

export interface EditorRenderer<Output> {
  render(request: RenderRequest): Output | Promise<Output>;
}
