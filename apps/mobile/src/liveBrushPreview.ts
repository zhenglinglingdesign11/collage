import { Skia, type SkPath } from '@shopify/react-native-skia';
import type { BrushDefinition, Point } from '@journalcollage/editor-core';

type Recipe = BrushDefinition['recipe'];

/** Lightweight UI-thread preview; the document renderer remains authoritative. */
export const makeLiveBrushPreview = (
  points: readonly Point[],
  recipe: Recipe,
  size: number,
  spacing: number,
  unit: number,
): { stroke: SkPath; fill: SkPath } => {
  'worklet';
  const stroke = Skia.PathBuilder.Make();
  const fill = Skia.PathBuilder.Make();
  if (points.length === 0) return { stroke: stroke.build(), fill: fill.build() };

  if (recipe === 'plain' || recipe === 'marker') {
    stroke.moveTo(points[0].x, points[0].y);
    if (points.length === 1) stroke.lineTo(points[0].x + 0.01, points[0].y);
    else for (let index = 1; index < points.length; index += 1) stroke.lineTo(points[index].x, points[index].y);
    return { stroke: stroke.build(), fill: fill.build() };
  }

  const sampleSpacing = recipe === 'stitch' ? Math.max(spacing, 13 * unit, size * 2.5)
    : recipe === 'knit' ? Math.max(14 * unit, size * 2.2)
      : recipe === 'beads' ? Math.max(9 * unit, size * 1.65)
        : recipe === 'lace' ? Math.max(14 * unit, size * 2.05)
          : recipe === 'bow' ? Math.max(28 * unit, size * 3.2)
            : Math.max(2 * unit, spacing * 0.75);
  let sampleIndex = 0;
  const stamp = (x: number, y: number, angle: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const at = (horizontal: number, vertical: number) => ({ x: x + horizontal * cos - vertical * sin, y: y + horizontal * sin + vertical * cos });
    if (recipe === 'stitch') {
      const length = Math.max(7 * unit, size * 1.25);
      const start = at(-length / 2, 0); const end = at(length / 2, 0);
      stroke.moveTo(start.x, start.y).lineTo(end.x, end.y);
    } else if (recipe === 'knit') {
      const length = Math.max(9 * unit, size * 1.45); const spread = Math.max(4 * unit, size * 0.55);
      const left = at(-spread, -length / 2); const right = at(spread, -length / 2); const bottom = at(0, length / 2);
      stroke.moveTo(left.x, left.y).lineTo(bottom.x, bottom.y).moveTo(right.x, right.y).lineTo(bottom.x, bottom.y);
    } else if (recipe === 'beads') {
      fill.addCircle(x, y, Math.max(2.5 * unit, size * 0.5));
    } else if (recipe === 'lace') {
      const radius = Math.max(5 * unit, size * 0.9);
      const start = at(-radius, radius * 0.12); const end = at(radius, radius * 0.12);
      const controlLeft = at(-radius, -radius * 0.44); const controlRight = at(radius, -radius * 0.44);
      stroke.moveTo(start.x, start.y).cubicTo(controlLeft.x, controlLeft.y, controlRight.x, controlRight.y, end.x, end.y);
      const left = at(-radius * 0.46, radius * 0.08); const right = at(radius * 0.46, radius * 0.08);
      fill.addCircle(left.x, left.y, Math.max(1.4 * unit, size * 0.16)).addCircle(right.x, right.y, Math.max(1.4 * unit, size * 0.16));
      if (sampleIndex % 2 === 0) { const top = at(0, -radius * 0.28); fill.addCircle(top.x, top.y, Math.max(1.3 * unit, size * 0.14)); }
    } else if (recipe === 'bow') {
      const radius = Math.max(12 * unit, size * 1.5);
      const left = at(-radius, 0); const right = at(radius, 0);
      const upperLeft = at(-radius * 0.65, -radius * 0.65); const lowerLeft = at(-radius * 0.65, radius * 0.65);
      const upperRight = at(radius * 0.65, -radius * 0.65); const lowerRight = at(radius * 0.65, radius * 0.65);
      fill.moveTo(x, y).cubicTo(upperLeft.x, upperLeft.y, left.x, left.y, lowerLeft.x, lowerLeft.y)
        .lineTo(x, y).cubicTo(upperRight.x, upperRight.y, right.x, right.y, lowerRight.x, lowerRight.y).close()
        .addCircle(x, y, Math.max(2 * unit, size * 0.16));
    } else if (recipe === 'crayon') {
      // Scatter short fibres across the wax band. Stable per-sample offsets
      // avoid the three parallel rails that looked like a different brush.
      for (let fibre = 0; fibre < 4; fibre += 1) {
        const drift = (((sampleIndex * 37 + fibre * 53) % 97) / 97 - 0.5) * size * 0.82;
        const shift = (((sampleIndex * 19 + fibre * 31) % 83) / 83 - 0.5) * spacing * 0.45;
        const length = spacing * (0.62 + ((sampleIndex * 29 + fibre * 17) % 71) / 71 * 0.62);
        const tilt = (((sampleIndex * 11 + fibre * 41) % 67) / 67 - 0.5) * size * 0.14;
        const start = at(shift - length / 2, drift); const end = at(shift + length / 2, drift + tilt);
        stroke.moveTo(start.x, start.y).lineTo(end.x, end.y);
      }
    }
    sampleIndex += 1;
  };

  if (points.length === 1) stamp(points[0].x, points[0].y, 0);
  else {
    let carry = 0;
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1]; const end = points[index];
      const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy);
      if (length <= 0.01) continue;
      const angle = Math.atan2(dy, dx);
      let distance = sampleSpacing - carry;
      while (distance <= length) {
        const progress = distance / length;
        stamp(start.x + dx * progress, start.y + dy * progress, angle);
        distance += sampleSpacing;
      }
      carry = length - (distance - sampleSpacing);
      if (carry >= sampleSpacing) carry = 0;
    }
    if (sampleIndex === 0) {
      const start = points[0]; const end = points[points.length - 1];
      stamp((start.x + end.x) / 2, (start.y + end.y) / 2, Math.atan2(end.y - start.y, end.x - start.x));
    }
  }
  return { stroke: stroke.build(), fill: fill.build() };
};
