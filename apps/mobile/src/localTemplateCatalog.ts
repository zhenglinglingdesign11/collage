import { parseTemplateDefinition, type TemplateDefinition } from '@journalcollage/editor-core';

declare const require: (path: string) => unknown;

const parseBundledTemplate = (raw: unknown, label: string): TemplateDefinition => {
  const result = parseTemplateDefinition(raw);
  if (!result.ok) throw new Error(`Invalid bundled template ${label}: ${result.issues.map((issue) => issue.path).join(', ')}`);
  return result.template;
};

const targetCanvas = { width: 1800, height: 2400 };

/**
 * Brings portrait source artboards onto the product's 3:4 canvas by scaling
 * to cover and cropping equal amounts from the top and bottom. Canvas-owned
 * background images already use `fit="cover"` in the renderer, so retaining
 * their source reference produces the same centred crop as the foreground.
 */
const centerCropToThreeByFour = (template: TemplateDefinition): TemplateDefinition => {
  const { width: sourceWidth, height: sourceHeight } = template.canvas.size;
  if (sourceWidth * 4 === sourceHeight * 3) return template;
  const scale = Math.max(targetCanvas.width / sourceWidth, targetCanvas.height / sourceHeight);
  const cropX = (sourceWidth * scale - targetCanvas.width) / 2;
  const cropY = (sourceHeight * scale - targetCanvas.height) / 2;
  const frame = (value: { width: number; height: number }) => ({ width: value.width * scale, height: value.height * scale });
  const transform = (value: { position: { x: number; y: number }; scale: { x: number; y: number }; rotation: number }) => ({
    ...value,
    position: { x: value.position.x * scale - cropX, y: value.position.y * scale - cropY },
  });
  const mask = (value: typeof template.photoSlots[number]['visibilityMask']) => value === undefined ? undefined : {
    ...value,
    bounds: { x: value.bounds.x * scale, y: value.bounds.y * scale, width: value.bounds.width * scale, height: value.bounds.height * scale },
  };
  return {
    ...template,
    canvas: { ...template.canvas, size: targetCanvas },
    photoSlots: template.photoSlots.map((slot) => ({ ...slot, frame: frame(slot.frame), transform: transform(slot.transform), ...(slot.visibilityMask === undefined ? {} : { visibilityMask: mask(slot.visibilityMask) }) })),
    textSlots: template.textSlots.map((slot) => ({ ...slot, frame: frame(slot.frame), fontSize: slot.fontSize * scale, transform: transform(slot.transform) })),
    materialSlots: template.materialSlots.map((slot) => ({ ...slot, frame: frame(slot.frame), transform: transform(slot.transform) })),
    fixedLayers: template.fixedLayers.map((layer) => ({
      ...layer,
      frame: frame(layer.frame),
      transform: transform(layer.transform),
      ...(layer.type === 'brush' ? {
        strokes: layer.strokes.map((stroke) => ({
          ...stroke,
          points: stroke.points.map((point) => ({ x: point.x * scale, y: point.y * scale })),
          style: { ...stroke.style, size: stroke.style.size * scale, spacing: stroke.style.spacing * scale },
        })),
      } : {}),
    })),
  };
};

const playPopPhotoFrameAssetId = 'asset://pack/template-assets/play-pop-photo-frame';
const playPopBlueWaveAssetId = 'asset://pack/playful-doodles/11';

/**
 * Rebalance Play Pop after the shorter 3:4 crop. The photo and its blue frame
 * remain a single, scaled composition; surrounding stickers become a little
 * smaller and move upward, with the bottom row lifted further into view.
 */
const softenPlayPopDecorations = (template: TemplateDefinition): TemplateDefinition => {
  const frameRatio = 0.9;
  const decorationRatio = 0.84;
  const transformAroundCentre = (frame: { width: number; height: number }, value: { position: { x: number; y: number }; scale: { x: number; y: number }; rotation: number }, ratio: number, lift = 0) => {
    const nextScale = { x: value.scale.x * ratio, y: value.scale.y * ratio };
    return {
      ...value,
      position: {
        x: value.position.x + frame.width * (value.scale.x - nextScale.x) / 2,
        y: value.position.y + frame.height * (value.scale.y - nextScale.y) / 2 - lift,
      },
      scale: nextScale,
    };
  };
  const photoFrame = template.fixedLayers.find((layer) => layer.type === 'image' && layer.asset.id === playPopPhotoFrameAssetId);
  // The frame PNG has transparent padding above its visible blue edge. Leave
  // visual, rather than file-boundary, headroom when positioning the paired
  // photo/frame region on the shorter artboard.
  const heroLift = photoFrame === undefined ? 0 : Math.max(0, photoFrame.transform.position.y + photoFrame.frame.height * photoFrame.transform.scale.y / 2 - targetCanvas.height / 2 - 150);
  const centreY = (layer: typeof template.fixedLayers[number]) => layer.transform.position.y + layer.frame.height * layer.transform.scale.y / 2;
  return {
    ...template,
    photoSlots: template.photoSlots.map((slot) => ({ ...slot, transform: transformAroundCentre(slot.frame, slot.transform, frameRatio, heroLift) })),
    fixedLayers: template.fixedLayers.map((layer) => {
      if (layer.type !== 'image') return layer;
      // The frame tracks the photo slot exactly, preserving their alignment.
      if (layer.asset.id === playPopPhotoFrameAssetId) return { ...layer, transform: transformAroundCentre(layer.frame, layer.transform, frameRatio, heroLift) };
      const bottomRow = layer.transform.position.y > targetCanvas.height * 0.72;
      const centralDecoration = !bottomRow && centreY(layer) > targetCanvas.height * 0.3 && centreY(layer) < targetCanvas.height * 0.8;
      // The horizontal blue wave belongs to the lower row. Let it sit below
      // the newly centred frame instead of being pulled upward with it.
      const waveDrop = layer.asset.id === playPopBlueWaveAssetId ? 165 : 0;
      return {
        ...layer,
        // Middle stickers follow only part of the hero offset. Moving them by
        // the entire amount collapses their intended breathing room into the
        // blue frame after the canvas crop.
        transform: transformAroundCentre(layer.frame, layer.transform, decorationRatio, 42 + (bottomRow ? 210 : 0) + (centralDecoration ? heroLift * 0.45 : 0) - waveDrop),
      };
    }),
  };
};

/** P1-T05's app-bundled catalog. Recipe and Studio data never reach this list. */
export const localTemplateCatalog: readonly TemplateDefinition[] = [
  parseBundledTemplate(require('../../../generated/template-recipes/romantic-deco.template.json'), 'romantic-deco'),
  centerCropToThreeByFour(parseBundledTemplate(require('../../../generated/template-recipes/romantic-deco-two-photo.template.json'), 'romantic-deco-two-photo')),
  parseBundledTemplate(require('../../../generated/template-recipes/soft-archive.template.json'), 'soft-archive'),
  parseBundledTemplate(require('../../../generated/template-recipes/soft-archive-multi.template.json'), 'soft-archive-multi'),
  parseBundledTemplate(require('../../../generated/template-recipes/digital-y2k-ascii.template.json'), 'digital-y2k-ascii'),
  parseBundledTemplate(require('../../../generated/template-recipes/digital-y2k-multi.template.json'), 'digital-y2k-multi'),
  softenPlayPopDecorations(centerCropToThreeByFour(parseBundledTemplate(require('../../../generated/template-recipes/play-pop.template.json'), 'play-pop'))),
  parseBundledTemplate(require('../../../generated/template-recipes/play-pop-multi.template.json'), 'play-pop-multi'),
  parseBundledTemplate(require('../../../generated/template-recipes/fan-moodboard.template.json'), 'fan-moodboard'),
  parseBundledTemplate(require('../../../generated/template-recipes/material-remix.template.json'), 'material-remix'),
];
