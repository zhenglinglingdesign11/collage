import type { Effect, EffectStage, EffectValue, Layer } from './document';

export type EffectDefinition = Readonly<{
  type: string;
  version: number;
  stage: EffectStage;
  category: 'structure' | 'texture';
  /** Where the product exposes this effect. It remains part of the same
   * document/rendering contract regardless of its editing entry point. */
  editorEntry?: 'layer-control' | 'effect-panel';
  label: string;
  supportedLayers: readonly Layer['type'][];
  maxInstances?: number;
  validateParams: (params: Readonly<Record<string, EffectValue>>) => boolean;
}>;

const finite = (value: EffectValue | undefined, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const color = (value: EffectValue | undefined): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64;
const oneOf = (value: EffectValue | undefined, values: readonly string[]): boolean => typeof value === 'string' && values.includes(value);
const point = (value: EffectValue | undefined): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Readonly<Record<string, EffectValue>>;
  return finite(candidate.x, -10000, 10000) && finite(candidate.y, -10000, 10000);
};

/** Catalog definitions are semantic; renderers map them to platform recipes. */
export const EFFECT_CATALOG: Readonly<Record<string, EffectDefinition>> = {
  'light.shadow': {
    type: 'light.shadow', version: 1, stage: 'underlay', category: 'structure', editorEntry: 'layer-control', label: 'Shadow', supportedLayers: ['image', 'text', 'material', 'brush'],
    validateParams: (params) => color(params.color) && finite(params.opacity, 0, 1) && finite(params.blur, 0, 500) && point(params.offset),
  },
  'edge.outline': {
    type: 'edge.outline', version: 1, stage: 'overlay', category: 'structure', editorEntry: 'layer-control', label: 'Outline', supportedLayers: ['image', 'text', 'material', 'brush'],
    validateParams: (params) => color(params.color) && finite(params.width, 0, 500),
  },
  'paper.torn-edge': {
    type: 'paper.torn-edge', version: 1, stage: 'geometry', category: 'structure', label: 'Torn edge', supportedLayers: ['image', 'material'], maxInstances: 1,
    // edgeWidth arrived after v4 launch. Keep it optional so migrated drafts
    // retain their old rendering fallback while new drafts can separate paper
    // thickness from the jaggedness of the tear contour.
    validateParams: (params) => finite(params.seed, -2147483648, 2147483647) && Number.isInteger(params.seed) && finite(params.intensity, 0, 500) && (params.edgeWidth === undefined || finite(params.edgeWidth, 2, 100)),
  },
  'shape.round-corners': {
    type: 'shape.round-corners', version: 1, stage: 'geometry', category: 'structure', editorEntry: 'layer-control', label: 'Corners', supportedLayers: ['image', 'text', 'material'], maxInstances: 1,
    validateParams: (params) => finite(params.radius, 0, 500),
  },
  'attachment.tape': {
    type: 'attachment.tape', version: 1, stage: 'overlay', category: 'structure', label: 'Attached', supportedLayers: ['image', 'text', 'material'], maxInstances: 1,
    validateParams: (params) => ['double-corners', 'top', 'cross'].includes(params.placement as string) && color(params.color) && finite(params.opacity, 0, 1),
  },
  'paper.float': {
    type: 'paper.float', version: 1, stage: 'underlay', category: 'structure', label: 'Floating', supportedLayers: ['image', 'text', 'material'], maxInstances: 1,
    validateParams: (params) => color(params.color) && finite(params.opacity, 0, 1) && finite(params.blur, 0, 500) && point(params.offset),
  },
  'frame.lace-center': {
    type: 'frame.lace-center', version: 1, stage: 'overlay', category: 'structure', label: 'Lace frame', supportedLayers: ['image', 'material'], maxInstances: 1,
    // `scale` is the aperture size. `contentScale` is deliberately the same
    // semantic range as the mini-program: it controls how much of the source
    // is visible inside that aperture, rather than resizing the lace artwork.
    // Keep the newer fields optional so existing v4 drafts remain valid.
    validateParams: (params) => color(params.color) && finite(params.opacity, 0, 1) && finite(params.scale, 0.2, 1)
      && (params.frameId === undefined || params.frameId === 'wide-hole' || params.frameId === 'classic-doily')
      && (params.contentScale === undefined || finite(params.contentScale, 0.65, 1.8)),
  },
  'frame.foil-center': {
    type: 'frame.foil-center', version: 1, stage: 'overlay', category: 'structure', label: 'Foil frame', supportedLayers: ['image', 'material'], maxInstances: 1,
    validateParams: (params) => color(params.color) && finite(params.opacity, 0, 1) && finite(params.scale, 0.2, 1)
      && (params.frameId === undefined || params.frameId === 'foil-crumpled')
      && (params.contentScale === undefined || finite(params.contentScale, 0.65, 1.8)),
  },
  'material.grain': {
    type: 'material.grain', version: 1, stage: 'overlay', category: 'texture', label: 'Paper grain', supportedLayers: ['image', 'text', 'material'], maxInstances: 1,
    validateParams: (params) => color(params.color) && finite(params.intensity, 0, 1) && finite(params.seed, -2147483648, 2147483647) && Number.isInteger(params.seed),
  },
  'print.cyanotype': {
    type: 'print.cyanotype', version: 1, stage: 'content', category: 'texture', label: 'Cyanotype', supportedLayers: ['image'], maxInstances: 1,
    validateParams: (params) => oneOf(params.tone, ['prussian', 'teal', 'violet', 'rose', 'mono']) && oneOf(params.intensity, ['soft', 'standard', 'deep']) && oneOf(params.paper, ['cool', 'warm', 'aged', 'gray']) && oneOf(params.grain, ['low', 'medium', 'high']) && finite(params.seed, -2147483648, 2147483647) && Number.isInteger(params.seed),
  },
  'print.screen': {
    type: 'print.screen', version: 1, stage: 'content', category: 'texture', label: 'Screen print', supportedLayers: ['image'], maxInstances: 1,
    validateParams: (params) => oneOf(params.palette, ['red-blue', 'orange-blue', 'pink-green', 'black-cream', 'purple-yellow']) && oneOf(params.strength, ['soft', 'standard', 'bold']) && oneOf(params.halftone, ['none', 'fine', 'medium', 'coarse']) && oneOf(params.offset, ['none', 'slight', 'strong']) && finite(params.seed, -2147483648, 2147483647) && Number.isInteger(params.seed),
  },
  'print.riso': {
    type: 'print.riso', version: 1, stage: 'content', category: 'texture', label: 'Riso print', supportedLayers: ['image'], maxInstances: 1,
    validateParams: (params) => oneOf(params.palette, ['pink-blue', 'orange-teal', 'purple-yellow', 'red-black', 'green-pink']) && oneOf(params.mode, ['duo', 'three']) && oneOf(params.ink, ['light', 'standard', 'dense']) && oneOf(params.offset, ['none', 'slight', 'strong']) && oneOf(params.grain, ['low', 'medium', 'high']) && finite(params.seed, -2147483648, 2147483647) && Number.isInteger(params.seed),
  },
  'art.botanical-plate': {
    type: 'art.botanical-plate', version: 1, stage: 'content', category: 'texture', label: 'Botanical plate', supportedLayers: ['image'], maxInstances: 1,
    validateParams: (params) => oneOf(params.tone, ['blueprint', 'sage', 'sepia']) && oneOf(params.detail, ['soft', 'medium', 'etched']) && oneOf(params.frame, ['on', 'off']) && finite(params.seed, -2147483648, 2147483647) && Number.isInteger(params.seed),
  },
  'art.pixel-embroidery': {
    type: 'art.pixel-embroidery', version: 1, stage: 'content', category: 'texture', label: 'Pixel embroidery', supportedLayers: ['image'], maxInstances: 1,
    validateParams: (params) => finite(params.grid, 24, 140) && Number.isInteger(params.grid) && finite(params.colors, 2, 32) && Number.isInteger(params.colors) && oneOf(params.style, ['pixel', 'stitch', 'mixed']) && finite(params.seed, -2147483648, 2147483647) && Number.isInteger(params.seed),
  },
  'art.matisse-cutout': {
    type: 'art.matisse-cutout', version: 1, stage: 'content', category: 'texture', label: 'Matisse cutout', supportedLayers: ['image'], maxInstances: 1,
    validateParams: (params) => finite(params.detail, 32, 100) && oneOf(params.palette, ['vivid', 'earth', 'soft']) && finite(params.seed, -2147483648, 2147483647) && Number.isInteger(params.seed),
  },
};

export const effectDefinitionFor = (type: string): EffectDefinition | undefined => EFFECT_CATALOG[type];

export const isEffectSupportedByLayer = (effect: Effect, layer: Layer): boolean => {
  const definition = effectDefinitionFor(effect.type);
  return definition !== undefined && definition.version === effect.version && definition.stage === effect.stage && definition.supportedLayers.includes(layer.type);
};

export const effectValueDepth = (value: EffectValue, depth = 0): number => {
  if (value === null || typeof value !== 'object') return depth;
  if (Array.isArray(value)) return value.reduce<number>((maximum, child) => Math.max(maximum, effectValueDepth(child, depth + 1)), depth + 1);
  return Object.values(value as Readonly<Record<string, EffectValue>>).reduce<number>((maximum, child) => Math.max(maximum, effectValueDepth(child, depth + 1)), depth + 1);
};
