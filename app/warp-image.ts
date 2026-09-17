export type Vec2 = { x: number; y: number };
export type WarpPoint = Vec2 & { id: string; dx: number; dy: number };
export type Triangle = { source: [Vec2, Vec2, Vec2]; target: [Vec2, Vec2, Vec2] };
export type Pixels = { width: number; height: number; data: Uint8ClampedArray };
export const MAX_WARP_POINTS = 12;
const divisions = 24;
const radiusSquared = 0.055;

function area(a: Vec2, b: Vec2, c: Vec2) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function influence(a: Vec2, b: Vec2) {
  return Math.exp(-((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / radiusSquared);
}

/** Interpolate pin constraints rather than summing displacements. Every pin,
 * including an unmoved anchor, must stay at its requested destination. */
function displacementField(points: WarpPoint[]) {
  const rows = points.map(point => [...points.map(other => influence(point, other)), point.dx, point.dy]);
  for (let col = 0; col < points.length; col++) {
    let pivot = col;
    for (let row = col + 1; row < points.length; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (Math.abs(rows[pivot][col]) < 1e-8) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let c = col; c < points.length + 2; c++) rows[col][c] /= divisor;
    for (let row = 0; row < points.length; row++) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let c = col; c < points.length + 2; c++) rows[row][c] -= factor * rows[col][c];
    }
  }
  return (position: Vec2) => {
    let x = position.x, y = position.y;
    for (let i = 0; i < points.length; i++) {
      const weight = influence(position, points[i]);
      x += rows[i][points.length] * weight;
      y += rows[i][points.length + 1] * weight;
    }
    return { x, y };
  };
}

export function createWarpMesh(points: WarpPoint[]): Triangle[] | null {
  if (points.length > MAX_WARP_POINTS || points.some(p => ![p.x, p.y, p.dx, p.dy].every(Number.isFinite) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return null;
  const field = displacementField(points);
  if (!field) return null;
  // Pins are actual mesh vertices, so interpolation/rendering/handles agree.
  const axis = (values: number[]) => [...new Set([...Array.from({ length: divisions + 1 }, (_, i) => i / divisions), ...values])].sort((a, b) => a - b);
  const xs = axis(points.map(p => p.x)), ys = axis(points.map(p => p.y));
  const source = ys.map(y => xs.map(x => ({ x, y })));
  const target = source.map(row => row.map(field));
  const mesh: Triangle[] = [];
  for (let y = 0; y < ys.length - 1; y++) for (let x = 0; x < xs.length - 1; x++) {
    mesh.push(
      { source: [source[y][x], source[y][x + 1], source[y + 1][x + 1]], target: [target[y][x], target[y][x + 1], target[y + 1][x + 1]] },
      { source: [source[y][x], source[y + 1][x + 1], source[y + 1][x]], target: [target[y][x], target[y + 1][x + 1], target[y + 1][x]] },
    );
  }
  return mesh;
}

export function isSafeMesh(mesh: Triangle[] | null): mesh is Triangle[] {
  return !!mesh && mesh.every(({ source, target }) =>
    area(...target) >= area(...source) * 0.08 &&
    target.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -0.5 && p.x <= 1.5 && p.y >= -0.5 && p.y <= 1.5),
  );
}

function barycentric(point: Vec2, triangle: [Vec2, Vec2, Vec2]) {
  const denominator = area(...triangle);
  if (Math.abs(denominator) < 1e-14) return null;
  const a = area(point, triangle[1], triangle[2]) / denominator;
  const b = area(triangle[0], point, triangle[2]) / denominator;
  const c = 1 - a - b;
  return a >= -1e-8 && b >= -1e-8 && c >= -1e-8 ? [a, b, c] : null;
}

/** Find the original pixel under a click on the already deformed image. */
export function unwarpPosition(mesh: Triangle[], position: Vec2): Vec2 | null {
  for (const triangle of mesh) {
    const weights = barycentric(position, triangle.target);
    if (weights) return {
      x: Math.max(0, Math.min(1, weights.reduce((value, weight, i) => value + weight * triangle.source[i].x, 0))),
      y: Math.max(0, Math.min(1, weights.reduce((value, weight, i) => value + weight * triangle.source[i].y, 0))),
    };
  }
  return null;
}

/** Limit a drag at the last valid shape, instead of folding/inverting triangles. */
export function moveWarpPin(points: WarpPoint[], id: string, destination: Vec2): WarpPoint[] {
  const pin = points.find(point => point.id === id);
  if (!pin || !Number.isFinite(destination.x) || !Number.isFinite(destination.y)) return points;
  const dx = Math.max(-0.5, Math.min(1.5, destination.x)) - pin.x;
  const dy = Math.max(-0.5, Math.min(1.5, destination.y)) - pin.y;
  const candidate = (amount: number) => points.map(point => point.id === id ? { ...point, dx: pin.dx + (dx - pin.dx) * amount, dy: pin.dy + (dy - pin.dy) * amount } : point);
  const wanted = candidate(1);
  if (isSafeMesh(createWarpMesh(wanted))) return wanted;
  let low = 0, high = 1;
  for (let i = 0; i < 10; i++) {
    const middle = (low + high) / 2;
    if (isSafeMesh(createWarpMesh(candidate(middle)))) low = middle;
    else high = middle;
  }
  return low > 0 ? candidate(low) : points;
}

/** Invert only the linear CSS transform; layout translation is accounted for
 * by the bounding-box center. Buffer resolution never enters this calculation. */
export function screenToItem(dx: number, dy: number, width: number, height: number, matrix: { a: number; b: number; c: number; d: number }): Vec2 | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (width <= 0 || height <= 0 || !Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return null;
  return { x: 0.5 + (matrix.d * dx - matrix.c * dy) / determinant / width, y: 0.5 + (matrix.a * dy - matrix.b * dx) / determinant / height };
}

/** Rasterize once per pixel with premultiplied-alpha bilinear sampling. Canvas
 * triangle clips antialias each shared edge separately, leaving visible cracks. */
export function rasterizeWarp(source: Pixels, mesh: Triangle[], localWidth: number, localHeight: number) {
  let left = 0, top = 0, right = 1, bottom = 1;
  for (const triangle of mesh) for (const p of triangle.target) {
    left = Math.min(left, p.x); top = Math.min(top, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y);
  }
  const width = Math.max(1, Math.ceil((right - left) * localWidth));
  const height = Math.max(1, Math.ceil((bottom - top) * localHeight));
  const data = new Uint8ClampedArray(width * height * 4);
  const unitX = width / (right - left), unitY = height / (bottom - top);
  for (const triangle of mesh) {
    const dest = triangle.target.map(p => ({ x: (p.x - left) * unitX, y: (p.y - top) * unitY })) as [Vec2, Vec2, Vec2];
    const denominator = area(...dest);
    if (denominator <= 1e-10) continue;
    const minX = Math.max(0, Math.floor(Math.min(...dest.map(p => p.x))));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...dest.map(p => p.x))));
    const minY = Math.max(0, Math.floor(Math.min(...dest.map(p => p.y))));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...dest.map(p => p.y))));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const weights = barycentric({ x: x + 0.5, y: y + 0.5 }, dest);
      if (!weights) continue;
      const u = Math.max(0, Math.min(source.width - 1, weights.reduce((v, w, i) => v + w * triangle.source[i].x, 0) * source.width - 0.5));
      const v = Math.max(0, Math.min(source.height - 1, weights.reduce((v, w, i) => v + w * triangle.source[i].y, 0) * source.height - 0.5));
      const sx = Math.floor(u), sy = Math.floor(v), fx = u - sx, fy = v - sy;
      const samples = [
        [(sy * source.width + sx) * 4, (1 - fx) * (1 - fy)],
        [(sy * source.width + Math.min(source.width - 1, sx + 1)) * 4, fx * (1 - fy)],
        [((Math.min(source.height - 1, sy + 1)) * source.width + sx) * 4, (1 - fx) * fy],
        [((Math.min(source.height - 1, sy + 1)) * source.width + Math.min(source.width - 1, sx + 1)) * 4, fx * fy],
      ];
      let alpha = 0, red = 0, green = 0, blue = 0;
      for (const [index, weight] of samples) {
        const a = source.data[index + 3] * weight;
        alpha += a; red += source.data[index] * a; green += source.data[index + 1] * a; blue += source.data[index + 2] * a;
      }
      const index = (y * width + x) * 4;
      if (alpha > 0) { data[index] = red / alpha; data[index + 1] = green / alpha; data[index + 2] = blue / alpha; }
      data[index + 3] = alpha;
    }
  }
  return { data, width, height, left, top, spanX: right - left, spanY: bottom - top };
}

/** The wrapper owns geometry; the canvas owns pixels only. In particular, a
 * changed CSS scale or expanded warp canvas must never change the next frame's
 * base resolution. Keeping this boundary explicit prevents resize feedback. */
export function drawWarpCanvas(canvas: HTMLCanvasElement, surface: Pick<HTMLElement, "clientWidth" | "clientHeight">, source: Pixels, points: WarpPoint[], pixelRatio: number) {
  const width = surface.clientWidth, height = surface.clientHeight;
  if (!width || !height) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = Math.max(1, Math.min(pixelRatio || 1, 2));
  const candidate = createWarpMesh(points);
  const mesh = isSafeMesh(candidate) ? candidate : createWarpMesh([])!;
  const result = rasterizeWarp(source, mesh, width * dpr, height * dpr);
  canvas.width = result.width; canvas.height = result.height;
  canvas.style.left = `${result.left * 100}%`;
  canvas.style.top = `${result.top * 100}%`;
  canvas.style.width = `${result.spanX * 100}%`;
  canvas.style.height = `${result.spanY * 100}%`;
  const frame = context.createImageData(result.width, result.height);
  frame.data.set(result.data);
  context.putImageData(frame, 0, 0);
}
