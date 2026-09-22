import type { Size, TemplateDefinition, TemplatePhotoSlot } from '@journalcollage/editor-core';

export type BasicLayoutId = 'two-up' | 'stacked' | 'four-grid' | 'full-frame' | 'wide-split' | 'three-columns' | 'hero-top' | 'hero-left' | 'six-grid' | 'nine-grid' | 'three-stack' | 'heart-frame' | 'circle-frame' | 'star-frame' | 'heart-mosaic';

export type BasicLayout = Readonly<{
  id: BasicLayoutId;
  name: string;
  photoSlots: number;
}>;

/**
 * These are intentionally plain, local composition presets, matching the
 * mini-program's two-up, stacked, and four-grid entry points. They use the
 * same TemplateDefinition → Draft path as designed templates, but have no
 * fixed art or network dependency.
 */
export const basicLayouts: readonly BasicLayout[] = [
  { id: 'two-up', name: 'Two-up', photoSlots: 2 },
  { id: 'stacked', name: 'Stacked', photoSlots: 2 },
  { id: 'four-grid', name: 'Four-grid', photoSlots: 4 },
  { id: 'full-frame', name: 'Full frame', photoSlots: 1 },
  { id: 'wide-split', name: 'Wide split', photoSlots: 2 },
  { id: 'three-columns', name: 'Three columns', photoSlots: 3 },
  { id: 'hero-top', name: 'Hero top', photoSlots: 4 },
  { id: 'hero-left', name: 'Hero left', photoSlots: 4 },
  { id: 'six-grid', name: 'Six-grid', photoSlots: 6 },
  { id: 'nine-grid', name: 'Nine-grid', photoSlots: 9 },
  { id: 'three-stack', name: 'Three stack', photoSlots: 3 },
  { id: 'heart-frame', name: 'Heart frame', photoSlots: 1 },
  { id: 'circle-frame', name: 'Circle frame', photoSlots: 1 },
  { id: 'star-frame', name: 'Star frame', photoSlots: 1 },
  { id: 'heart-mosaic', name: 'Heart mosaic', photoSlots: 16 },
];

// Basic layouts open as ordinary creations, whose product default is 3:4.
// Production templates retain their own source artboard dimensions instead.
const canvas = { width: 1800, height: 2400 };
const crop = { x: 0, y: 0, width: 1, height: 1 };
const slot = (id: string, name: string, width: number, height: number, x: number, y: number, visibilityMask?: TemplatePhotoSlot['visibilityMask']): TemplatePhotoSlot => ({
  id,
  name,
  type: 'photo',
  required: true,
  frame: { width, height },
  crop,
  transform: { position: { x, y }, scale: { x: 1, y: 1 }, rotation: 0 },
  opacity: 1,
  isLocked: false,
  effects: [],
  ...(visibilityMask ? { visibilityMask } : {}),
});

const slotsFor = (layout: BasicLayoutId, size: Size): readonly TemplatePhotoSlot[] => {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const thirdWidth = size.width / 3;
  const thirdHeight = size.height / 3;
  const shapedFrame = Math.min(size.width * 0.78, size.height * 0.58);
  const shapedX = (size.width - shapedFrame) / 2;
  const shapedY = (size.height - shapedFrame) / 2;
  const shapedSlot = (shape: 'heart' | 'circle' | 'star') => slot('photo-1', `${shape} photo`, shapedFrame, shapedFrame, shapedX, shapedY, { type: 'shape', shape, bounds: { x: 0, y: 0, width: shapedFrame, height: shapedFrame } });
  if (layout === 'full-frame') return [slot('photo-1', 'Photo', size.width, size.height, 0, 0)];
  if (layout === 'heart-frame') return [shapedSlot('heart')];
  if (layout === 'circle-frame') return [shapedSlot('circle')];
  if (layout === 'star-frame') return [shapedSlot('star')];
  if (layout === 'two-up') return [
    slot('photo-1', 'Left photo', halfWidth, size.height, 0, 0),
    slot('photo-2', 'Right photo', halfWidth, size.height, halfWidth, 0),
  ];
  if (layout === 'stacked') return [
    slot('photo-1', 'Top photo', size.width, halfHeight, 0, 0),
    slot('photo-2', 'Bottom photo', size.width, halfHeight, 0, halfHeight),
  ];
  if (layout === 'wide-split') return [
    slot('photo-1', 'Primary photo', size.width * 0.62, size.height, 0, 0),
    slot('photo-2', 'Secondary photo', size.width * 0.38, size.height, size.width * 0.62, 0),
  ];
  if (layout === 'three-columns') return [
    slot('photo-1', 'Left photo', thirdWidth, size.height, 0, 0),
    slot('photo-2', 'Centre photo', thirdWidth, size.height, thirdWidth, 0),
    slot('photo-3', 'Right photo', thirdWidth, size.height, thirdWidth * 2, 0),
  ];
  if (layout === 'hero-top') return [
    slot('photo-1', 'Hero photo', size.width, size.height * 0.56, 0, 0),
    ...[0, 1, 2].map((index) => slot(`photo-${index + 2}`, `Bottom photo ${index + 1}`, thirdWidth, size.height * 0.44, thirdWidth * index, size.height * 0.56)),
  ];
  if (layout === 'hero-left') return [
    slot('photo-1', 'Hero photo', size.width * 0.56, size.height, 0, 0),
    ...[0, 1, 2].map((index) => slot(`photo-${index + 2}`, `Right photo ${index + 1}`, size.width * 0.44, thirdHeight, size.width * 0.56, thirdHeight * index)),
  ];
  if (layout === 'six-grid') return Array.from({ length: 6 }, (_, index) => slot(`photo-${index + 1}`, `Photo ${index + 1}`, halfWidth, thirdHeight, halfWidth * (index % 2), thirdHeight * Math.floor(index / 2)));
  if (layout === 'nine-grid') return Array.from({ length: 9 }, (_, index) => slot(`photo-${index + 1}`, `Photo ${index + 1}`, thirdWidth, thirdHeight, thirdWidth * (index % 3), thirdHeight * Math.floor(index / 3)));
  if (layout === 'three-stack') return Array.from({ length: 3 }, (_, index) => slot(`photo-${index + 1}`, `Photo ${index + 1}`, size.width, thirdHeight, 0, thirdHeight * index));
  if (layout === 'heart-mosaic') {
    // A centered 5×5 pixel heart: 2 + 5 + 5 + 3 + 1 photos. Square cells
    // keep the silhouette recognizable as the canvas ratio changes.
    const cell = size.width / 5;
    const top = (size.height - cell * 5) / 2;
    const cells: readonly (readonly [number, number])[] = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]];
    return cells.map(([column, row], index) => slot(`photo-${index + 1}`, `Heart photo ${index + 1}`, cell, cell, cell * column, top + cell * row));
  }
  return [
    slot('photo-1', 'Top left photo', halfWidth, halfHeight, 0, 0),
    slot('photo-2', 'Top right photo', halfWidth, halfHeight, halfWidth, 0),
    slot('photo-3', 'Bottom left photo', halfWidth, halfHeight, 0, halfHeight),
    slot('photo-4', 'Bottom right photo', halfWidth, halfHeight, halfWidth, halfHeight),
  ];
};

/**
 * The preview is a schema-required stable reference. Basic-layout cards render
 * their geometry locally below; this reference is not used as their artwork.
 * P1-T07 will replace it with dedicated, bundled preview records.
 */
const preview = { id: 'asset://pack/template-previews/romantic-deco', kind: 'image' as const, revision: '1' };

export const basicLayoutTemplate = (layout: BasicLayout, size: Size = canvas): TemplateDefinition => {
  const photoSlots = slotsFor(layout.id, size);
  return {
    schemaVersion: 1,
    id: `template://journalcollage/layout-${layout.id}`,
    revision: '1',
    status: 'ready',
    name: layout.name,
    canvas: { size, background: '#FDFDFB' },
    preview,
    photoSlots,
    textSlots: [],
    materialSlots: [],
    fixedLayers: [],
    layerStack: photoSlots.map((item) => `photo:${item.id}`),
    dependencies: [{ reference: preview, availability: 'bundled' }],
    requiredCapabilities: ['image.replace', 'image.crop', ...(photoSlots.some((slot) => slot.visibilityMask !== undefined) ? ['image.mask' as const] : [])],
  };
};
