// Point-based image warp. Each control point is pinned to an image pixel and
// carries only its own drag: the area within the point's radius follows that
// drag, fading out smoothly towards the radius edge, and the contributions of all
// points add up. A freshly added point has no drag, so adding one changes nothing
// until it is moved. All coordinates are pixels of the item's box (before the
// item's own scale and rotation).

export type Vec = { x: number; y: number };
/** A control point: the image pixel it is pinned to, its own drag, and its reach. */
type Drag = { dx: number; dy: number; radius: number };
export type WarpPoint = Drag & {
  id: string;
  x: number;
  y: number;
  // Preserve the existing shape when the radius changes for later edits.
  previousDrags?: Drag[];
};
export type WarpField = (x: number, y: number) => Vec;

/** Reach of a new point, in local pixels. Use the shorter side so narrow items bend locally. */
export function warpRadius(width: number, height: number) {
  return 0.299 * Math.min(width, height);
}
/** Closest two points may be, in pixels, so each stays easy to grab. */
const MIN_POINT_GAP = 8;

export function hasDisplacement(points: readonly WarpPoint[] | undefined) {
  return !!points?.some(
    (point) => point.dx !== 0 || point.dy !== 0 || !!point.previousDrags?.length,
  );
}

/** Smooth falloff: 1 at the point, 0 (with zero slope) at its radius. */
function influence(distanceSquared: number, radius: number) {
  const ratio = distanceSquared / (radius * radius);
  return ratio < 1 ? (1 - ratio) ** 2 : 0;
}

/** Each drag keeps the support radius it had when it was applied. */
export function createWarpField(points: readonly WarpPoint[]): WarpField {
  const drags = points.flatMap((point) =>
    [point, ...(point.previousDrags ?? [])]
      .filter((drag) => drag.dx !== 0 || drag.dy !== 0)
      .map(({ dx, dy, radius }) => ({ x: point.x, y: point.y, dx, dy, radius })),
  );
  return (x, y) => {
    let dx = 0;
    let dy = 0;
    for (const drag of drags) {
      const weight = influence((drag.x - x) ** 2 + (drag.y - y) ** 2, drag.radius);
      dx += weight * drag.dx;
      dy += weight * drag.dy;
    }
    return { x: dx, y: dy };
  };
}

/** Where a point's pixel is currently shown. */
export function warpPointPosition(points: readonly WarpPoint[], point: WarpPoint): Vec {
  const offset = createWarpField(points)(point.x, point.y);
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
export function moveWarpPoint(
  points: readonly WarpPoint[],
  id: string,
  target: Vec,
  maxRadius?: number,
) {
  return points.map((point) => {
    if (point.id !== id) return point;
    let radius = maxRadius ?? point.radius;
    for (const other of points) {
      if (other !== point)
        radius = Math.min(radius, Math.hypot(point.x - other.x, point.y - other.y));
    }
    if (radius <= 0) return point;
    const shown = warpPointPosition(points, point);
    const dx = target.x - shown.x;
    const dy = target.y - shown.y;
    if (dx === 0 && dy === 0) return point;
    if (radius === point.radius) return { ...point, dx: point.dx + dx, dy: point.dy + dy };
    if (point.dx === 0 && point.dy === 0) return { ...point, radius, dx, dy };
    const previous = { dx: point.dx, dy: point.dy, radius: point.radius };
    return { ...point, radius, dx, dy, previousDrags: [...(point.previousDrags ?? []), previous] };
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
