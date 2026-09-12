import type { Point } from './geometry';

const EPSILON = 0.0001;

/**
 * Splits a convex layer-local polygon against an infinite line. Clip paths
 * produced by this module remain convex, so repeated straight cuts are
 * representable without rasterizing the source asset.
 */
export const splitPolygonByLine = (polygon: readonly Point[], start: Point, end: Point): readonly [readonly Point[], readonly Point[]] | null => {
  if (polygon.length < 3) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) < EPSILON) return null;
  const first = clipPolygon(polygon, start, dx, dy, true);
  const second = clipPolygon(polygon, start, dx, dy, false);
  return first.length >= 3 && second.length >= 3 && polygonArea(first) > EPSILON && polygonArea(second) > EPSILON ? [first, second] : null;
};

/** A scalloped split matching the mini-program's sine-wave cut edge. */
export const splitPolygonByWave = (polygon: readonly Point[], start: Point, end: Point): readonly [readonly Point[], readonly Point[]] | null => {
  if (polygon.length < 3 || !isConvex(polygon)) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return null;
  const wavePath = createWavePathPoints(polygon, start, end);
  if (wavePath.length < 2) return null;
  const normal = { x: -dy / length, y: dx / length };
  const bounds = polygonBounds(polygon);
  const offset = Math.hypot(bounds.width, bounds.height) * 2;
  const firstSide = [...wavePath, ...[...wavePath].reverse().map((point) => ({ x: point.x + normal.x * offset, y: point.y + normal.y * offset }))];
  const secondSide = [...[...wavePath].reverse(), ...wavePath.map((point) => ({ x: point.x - normal.x * offset, y: point.y - normal.y * offset }))];
  const first = clipPolygonToConvex(firstSide, polygon);
  const second = clipPolygonToConvex(secondSide, polygon);
  return first.length >= 3 && second.length >= 3 && polygonArea(first) > EPSILON && polygonArea(second) > EPSILON ? [first, second] : null;
};

/** Two in-frame sides of a wave cut, used as composable clip paths. */
export const waveCutSidesForFrame = (frame: { width: number; height: number }, start: Point, end: Point): readonly [readonly Point[], readonly Point[]] | null => {
  const rectangle = [{ x: 0, y: 0 }, { x: frame.width, y: 0 }, { x: frame.width, y: frame.height }, { x: 0, y: frame.height }];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return null;
  const wavePath = createWavePathPoints(rectangle, start, end);
  if (wavePath.length < 2) return null;
  const normal = { x: -dy / length, y: dx / length };
  const offset = Math.hypot(frame.width, frame.height) * 2;
  const first = clipPolygonToConvex([...wavePath, ...[...wavePath].reverse().map((point) => ({ x: point.x + normal.x * offset, y: point.y + normal.y * offset }))], rectangle);
  const second = clipPolygonToConvex([...([...wavePath].reverse()), ...wavePath.map((point) => ({ x: point.x - normal.x * offset, y: point.y - normal.y * offset }))], rectangle);
  return first.length >= 3 && second.length >= 3 && polygonArea(first) > EPSILON && polygonArea(second) > EPSILON ? [first, second] : null;
};

export const createWavePathPoints = (polygon: readonly Point[], start: Point, end: Point): readonly Point[] => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 8) return [];
  const unit = { x: dx / length, y: dy / length };
  const normal = { x: -unit.y, y: unit.x };
  const projections = polygon.map((point) => ({ s: (point.x - start.x) * unit.x + (point.y - start.y) * unit.y }));
  const bounds = polygonBounds(polygon);
  const padding = Math.max(bounds.width, bounds.height, 120);
  const minS = Math.min(...projections.map((item) => item.s)) - padding;
  const maxS = Math.max(...projections.map((item) => item.s)) + padding;
  const amplitude = Math.min(44, Math.max(10, Math.min(bounds.width, bounds.height) * 0.08));
  const wavelength = Math.max(36, Math.min(120, Math.max(36, length * 0.55)));
  const step = Math.max(4, Math.min(18, wavelength / 6));
  const points: Point[] = [];
  for (let s = minS; s <= maxS; s += step) {
    const wave = Math.sin(s / wavelength * Math.PI * 2) * amplitude;
    points.push({ x: start.x + unit.x * s + normal.x * wave, y: start.y + unit.y * s + normal.y * wave });
  }
  return points;
};

const clipPolygon = (polygon: readonly Point[], origin: Point, dx: number, dy: number, keepPositive: boolean): readonly Point[] => {
  const output: Point[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentSide = cross(origin, dx, dy, current);
    const nextSide = cross(origin, dx, dy, next);
    const currentInside = keepPositive ? currentSide >= -EPSILON : currentSide <= EPSILON;
    const nextInside = keepPositive ? nextSide >= -EPSILON : nextSide <= EPSILON;
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) {
      const ratio = currentSide / (currentSide - nextSide);
      output.push({ x: current.x + (next.x - current.x) * ratio, y: current.y + (next.y - current.y) * ratio });
    }
  }
  return output;
};

const cross = (origin: Point, dx: number, dy: number, point: Point): number => dx * (point.y - origin.y) - dy * (point.x - origin.x);

const polygonArea = (polygon: readonly Point[]): number => Math.abs(polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2);

const polygonBounds = (polygon: readonly Point[]) => {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

const isConvex = (polygon: readonly Point[]): boolean => {
  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]; const b = polygon[(index + 1) % polygon.length]; const c = polygon[(index + 2) % polygon.length];
    const value = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(value) < EPSILON) continue;
    if (sign !== 0 && Math.sign(value) !== sign) return false;
    sign = Math.sign(value);
  }
  return true;
};

const clipPolygonToConvex = (subject: readonly Point[], clip: readonly Point[]): readonly Point[] => {
  const winding = polygonSignedArea(clip) >= 0 ? 1 : -1;
  return clip.reduce<readonly Point[]>((output, edgeStart, index) => {
    const edgeEnd = clip[(index + 1) % clip.length];
    const next: Point[] = [];
    for (let pointIndex = 0; pointIndex < output.length; pointIndex += 1) {
      const current = output[pointIndex];
      const following = output[(pointIndex + 1) % output.length];
      const currentSide = winding * ((edgeEnd.x - edgeStart.x) * (current.y - edgeStart.y) - (edgeEnd.y - edgeStart.y) * (current.x - edgeStart.x));
      const followingSide = winding * ((edgeEnd.x - edgeStart.x) * (following.y - edgeStart.y) - (edgeEnd.y - edgeStart.y) * (following.x - edgeStart.x));
      const currentInside = currentSide >= -EPSILON;
      const followingInside = followingSide >= -EPSILON;
      if (currentInside) next.push(current);
      if (currentInside !== followingInside) {
        const ratio = currentSide / (currentSide - followingSide);
        next.push({ x: current.x + (following.x - current.x) * ratio, y: current.y + (following.y - current.y) * ratio });
      }
    }
    return next;
  }, subject);
};

const polygonSignedArea = (polygon: readonly Point[]): number => polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2;
