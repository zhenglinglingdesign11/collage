import type { Draft, Layer } from './document';
import type { Transform } from './geometry';

/** A non-persistent canvas axis shown only while a layer is being transformed. */
export type AlignmentGuide = Readonly<{ axis: 'x' | 'y'; value: number }>;

/** UI callers retain this small value for the lifetime of one gesture only. */
export type AlignmentGuideState = Readonly<{ key: string; moves: number }> | null;

const TAU = Math.PI * 2;

const anchorsForLayer = (layer: Layer, transform: Transform): readonly AlignmentGuide[] => {
  const width = layer.frame.width * transform.scale.x;
  const height = layer.frame.height * transform.scale.y;
  return [
    { axis: 'x', value: transform.position.x },
    { axis: 'x', value: transform.position.x + width / 2 },
    { axis: 'x', value: transform.position.x + width },
    { axis: 'y', value: transform.position.y },
    { axis: 'y', value: transform.position.y + height / 2 },
    { axis: 'y', value: transform.position.y + height },
  ];
};

const canvasAnchors = (draft: Draft): readonly AlignmentGuide[] => [
  { axis: 'x', value: 0 },
  { axis: 'x', value: draft.canvas.size.width / 2 },
  { axis: 'x', value: draft.canvas.size.width },
  { axis: 'y', value: 0 },
  { axis: 'y', value: draft.canvas.size.height / 2 },
  { axis: 'y', value: draft.canvas.size.height },
];

const nearestGuide = (moving: readonly AlignmentGuide[], references: readonly AlignmentGuide[], threshold: number): AlignmentGuide | null => {
  let nearest: (AlignmentGuide & { distance: number }) | null = null;
  for (const movingAnchor of moving) {
    for (const reference of references) {
      if (movingAnchor.axis !== reference.axis) continue;
      const distance = Math.abs(movingAnchor.value - reference.value);
      if (distance > threshold || (nearest !== null && distance >= nearest.distance)) continue;
      nearest = { ...reference, distance };
    }
  }
  return nearest === null ? null : { axis: nearest.axis, value: nearest.value };
};

/**
 * Finds the mini-program's left/centre/right and top/middle/bottom matches.
 * Rotated bounds deliberately do not participate: the source product aligns
 * the unrotated transform frame, while rotation has its own right-angle cue.
 */
export const movementAlignmentGuides = (draft: Draft, layerId: string, transform: Transform, threshold: number): readonly AlignmentGuide[] => {
  const layer = draft.layers.find((candidate) => candidate.id === layerId);
  if (layer === undefined || !Number.isFinite(threshold) || threshold < 0) return [];
  const references = [
    ...canvasAnchors(draft),
    ...draft.layers.filter((candidate) => candidate.id !== layerId).flatMap((candidate) => anchorsForLayer(candidate, candidate.transform)),
  ];
  const anchors = anchorsForLayer(layer, transform);
  return [
    nearestGuide(anchors.filter((anchor) => anchor.axis === 'x'), references, threshold),
    nearestGuide(anchors.filter((anchor) => anchor.axis === 'y'), references, threshold),
  ].filter((guide): guide is AlignmentGuide => guide !== null);
};

/** Right-angle guides mirror the small-program's 0°/90°/180°/270° cue. */
export const rotationAlignmentGuides = (draft: Draft, layerId: string, transform: Transform, angleThreshold: number): readonly AlignmentGuide[] => {
  const layer = draft.layers.find((candidate) => candidate.id === layerId);
  if (layer === undefined || !Number.isFinite(angleThreshold) || angleThreshold < 0) return [];
  const normalized = ((transform.rotation % TAU) + TAU) % TAU;
  const nearestDistance = Math.min(normalized, Math.abs(normalized - Math.PI / 2), Math.abs(normalized - Math.PI), Math.abs(normalized - Math.PI * 1.5), Math.abs(normalized - TAU));
  if (nearestDistance > angleThreshold) return [];
  return [
    { axis: 'x', value: transform.position.x + layer.frame.width * transform.scale.x / 2 },
    { axis: 'y', value: transform.position.y + layer.frame.height * transform.scale.y / 2 },
  ];
};

export const alignmentGuideKey = (guides: readonly AlignmentGuide[]): string => guides
  .map((guide) => `${guide.axis}:${Math.round(guide.value)}`)
  .sort()
  .join('|');

/** Debounces guide appearance without putting gesture state into a Draft. */
export const stabilizeAlignmentGuides = (previous: AlignmentGuideState, guides: readonly AlignmentGuide[], stableMoves: number): Readonly<{ guides: readonly AlignmentGuide[]; state: AlignmentGuideState }> => {
  const key = alignmentGuideKey(guides);
  if (!key) return { guides: [], state: null };
  const moves = previous?.key === key ? previous.moves + 1 : 1;
  const state = { key, moves };
  return { guides: moves >= Math.max(1, stableMoves) ? guides : [], state };
};
