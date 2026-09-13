import type { BrushDefinition } from '@journalcollage/editor-core';

/**
 * Product catalog data only. A Draft captures the id and revision from this
 * table; rendering receives the definition at runtime and never stores a
 * bundle URI, texture atlas, or platform paint object in the document.
 */
export const brushDefinitions: readonly BrushDefinition[] = [
  { id: 'brush://builtin/plain', revision: '1', renderer: 'path', recipe: 'plain', supports: { color: true, pressure: true, rotation: 'tangent', animation: false }, defaults: { size: 16, spacing: 4, jitter: 0, opacity: 1 }, constraints: { minSize: 1, maxSize: 96, minSpacing: 1, maxSpacing: 48 } },
  { id: 'brush://builtin/crayon', revision: '1', renderer: 'procedural', recipe: 'crayon', supports: { color: true, pressure: true, rotation: 'tangent', animation: false }, defaults: { size: 20, spacing: 5, jitter: 5, opacity: 0.8 }, constraints: { minSize: 2, maxSize: 96, minSpacing: 1, maxSpacing: 48 } },
  { id: 'brush://builtin/marker', revision: '1', renderer: 'path', recipe: 'marker', supports: { color: true, pressure: true, rotation: 'tangent', animation: false }, defaults: { size: 24, spacing: 3, jitter: 0, opacity: 0.55 }, constraints: { minSize: 2, maxSize: 120, minSpacing: 1, maxSpacing: 48 } },
  { id: 'brush://builtin/stitch', revision: '1', renderer: 'procedural', recipe: 'stitch', supports: { color: true, pressure: false, rotation: 'tangent', animation: false }, defaults: { size: 8, spacing: 18, jitter: 0, opacity: 1 }, constraints: { minSize: 2, maxSize: 40, minSpacing: 4, maxSpacing: 64 } },
  { id: 'brush://builtin/knit', revision: '1', renderer: 'procedural', recipe: 'knit', supports: { color: true, pressure: false, rotation: 'tangent', animation: false }, defaults: { size: 12, spacing: 26, jitter: 0, opacity: 1 }, constraints: { minSize: 3, maxSize: 56, minSpacing: 6, maxSpacing: 96 } },
  { id: 'brush://builtin/beads', revision: '1', renderer: 'stamps', recipe: 'beads', supports: { color: true, pressure: false, rotation: 'tangent', animation: false }, defaults: { size: 20, spacing: 22, jitter: 0, opacity: 1 }, constraints: { minSize: 4, maxSize: 80, minSpacing: 4, maxSpacing: 100 } },
  { id: 'brush://builtin/lace', revision: '1', renderer: 'procedural', recipe: 'lace', supports: { color: true, pressure: false, rotation: 'tangent', animation: false }, defaults: { size: 22, spacing: 22, jitter: 0, opacity: 1 }, constraints: { minSize: 4, maxSize: 100, minSpacing: 4, maxSpacing: 100 } },
  { id: 'brush://builtin/bow', revision: '1', renderer: 'stamps', recipe: 'bow', asset: { id: 'asset://brush/bow/standard', kind: 'brush', revision: '1' }, supports: { color: true, pressure: false, rotation: 'tangent', animation: false }, defaults: { size: 30, spacing: 42, jitter: 0, opacity: 1 }, constraints: { minSize: 8, maxSize: 120, minSpacing: 12, maxSpacing: 140 } },
];

export const brushDefinitionsById: Readonly<Record<string, BrushDefinition>> = Object.fromEntries(
  brushDefinitions.map((definition) => [definition.id, definition]),
);
