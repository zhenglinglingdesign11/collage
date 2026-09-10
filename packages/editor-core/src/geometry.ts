/** Platform-neutral geometry. All persisted values are in logical canvas units. */
export type Point = Readonly<{ x: number; y: number }>;

export type Size = Readonly<{ width: number; height: number }>;

export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type Transform = Readonly<{
  position: Point;
  scale: Point;
  rotation: number;
}>;

export const identityTransform = (): Transform => ({
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
});

export const normalizeRotation = (rotation: number): number => {
  const fullTurn = Math.PI * 2;
  const normalized = rotation % fullTurn;
  return normalized < 0 ? normalized + fullTurn : normalized;
};

export const isFinitePoint = (point: Point): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y);

export const isFiniteSize = (size: Size): boolean =>
  Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
