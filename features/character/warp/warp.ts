// Point-based image warp. Each control point is pinned to an image pixel and
// carries only its own drag: the area within the point's radius follows that
// drag, fading out smoothly towards the radius edge, and the contributions of all
// points add up. A freshly added point has no drag, so adding one changes nothing
// until it is moved. All coordinates are pixels of the item's box (before the
// item's own scale and rotation).

export type Vec = { x: number; y: number };
/** A control point: the image pixel it is pinned to, its own drag, and its reach. */
export type WarpPoint = {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
};
export type WarpField = (x: number, y: number) => Vec;

/** Reach of a new point, as a fraction of the item's larger side; nothing beyond it moves. */
export const WARP_RADIUS = 0.35;
/** Closest two points may be, in pixels, so each stays easy to grab. */
const MIN_POINT_GAP = 8;

export function hasDisplacement(points: readonly WarpPoint[] | undefined) {
  return !!points?.some((point) => point.dx !== 0 || point.dy !== 0);
}

/** Smooth falloff: 1 at the point, 0 (with zero slope) at its radius. */
function influence(point: WarpPoint, x: number, y: number) {
  const ratio = ((point.x - x) ** 2 + (point.y - y) ** 2) / point.radius ** 2;
  return ratio < 1 ? (1 - ratio) ** 2 : 0;
}

/** Sum of the drags of `points` at (x, y), skipping the point with id `except`. */
function displacement(points: readonly WarpPoint[], x: number, y: number, except?: string): Vec {
  let dx = 0;
  let dy = 0;
  for (const point of points) {
    if (point.id === except || (point.dx === 0 && point.dy === 0)) continue;
    const weight = influence(point, x, y);
    dx += weight * point.dx;
    dy += weight * point.dy;
  }
  return { x: dx, y: dy };
}

/** The displacement field: how far the image pixel at (x, y) is moved. */
export function createWarpField(points: readonly WarpPoint[]): WarpField {
  const moved = points.filter((point) => point.dx !== 0 || point.dy !== 0);
  return (x, y) => displacement(moved, x, y);
}

/** Where a point's pixel is currently shown. */
export function warpPointPosition(points: readonly WarpPoint[], point: WarpPoint): Vec {
  const offset = displacement(points, point.x, point.y);
  return { x: point.x + offset.x, y: point.y + offset.y };
}

/** Finds the source pixel that the field moves onto `target`. */
export function invertWarp(field: WarpField, target: Vec, iterations = 30): Vec {
  let source = target;
  for (let i = 0; i < iterations; i++) {
    const offset = field(source.x, source.y);
    source = { x: target.x - offset.x, y: target.y - offset.y };
  }
  return source;
}

/**
 * Adds a point under `target`, pinned to the image pixel shown there. The new
 * point has no drag, so the image does not change.
 */
export function addWarpPoint(
  points: readonly WarpPoint[],
  target: Vec,
  radius: number,
  id: string,
): WarpPoint[] | null {
  const shown = points.map((point) => warpPointPosition(points, point));
  if (shown.some((p) => Math.hypot(p.x - target.x, p.y - target.y) < MIN_POINT_GAP)) return null;
  const source = invertWarp(createWarpField(points), target);
  return [...points, { id, x: source.x, y: source.y, dx: 0, dy: 0, radius }];
}

/** Drags one point so its pixel is shown exactly at `target`. */
export function moveWarpPoint(points: readonly WarpPoint[], id: string, target: Vec) {
  return points.map((point) => {
    if (point.id !== id) return point;
    // The point's own influence is 1 at its pixel, so its drag is what the others leave over.
    const others = displacement(points, point.x, point.y, id);
    return { ...point, dx: target.x - point.x - others.x, dy: target.y - point.y - others.y };
  });
}

/** The affine transform [a, b, c, d, e, f] (canvas order) that maps triangle `from` onto `to`. */
export function triangleTransform(from: [Vec, Vec, Vec], to: [Vec, Vec, Vec]) {
  const [s0, s1, s2] = from;
  const [d0, d1, d2] = to;
  const det = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  const row = (v0: number, v1: number, v2: number) => [
    (v0 * (s1.y - s2.y) + v1 * (s2.y - s0.y) + v2 * (s0.y - s1.y)) / det,
    (v0 * (s2.x - s1.x) + v1 * (s0.x - s2.x) + v2 * (s1.x - s0.x)) / det,
    (v0 * (s1.x * s2.y - s2.x * s1.y) +
      v1 * (s2.x * s0.y - s0.x * s2.y) +
      v2 * (s0.x * s1.y - s1.x * s0.y)) /
      det,
  ];
  const [a, c, e] = row(d0.x, d1.x, d2.x);
  const [b, d, f] = row(d0.y, d1.y, d2.y);
  return [a, b, c, d, e, f] as const;
}
