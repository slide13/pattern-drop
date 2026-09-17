import assert from "node:assert/strict";
import test from "node:test";
import { createWarpMesh, drawWarpCanvas, isSafeMesh, moveWarpPin, rasterizeWarp, screenToItem, unwarpPosition } from "../app/warp-image.ts";

const pin = (id, x, y, dx = 0, dy = 0) => ({ id, x, y, dx, dy });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

function texture(width, height, rgba) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(rgba(x, y), (y * width + x) * 4);
  return { width, height, data };
}

test("coordinates round-trip after changing width/height independently and rotating", () => {
  for (const [scaleX, scaleY, degrees] of [[0.25, 2.5, 0], [2.5, 0.25, 90], [0.4, 2.2, -135], [1.7, 0.65, 37]]) {
    const angle = degrees * Math.PI / 180;
    const matrix = { a: Math.cos(angle) * scaleX, b: Math.sin(angle) * scaleX, c: -Math.sin(angle) * scaleY, d: Math.cos(angle) * scaleY };
    for (const point of [{ x: 0.1, y: 0.85 }, { x: 0.75, y: 0.2 }, { x: 0.5, y: 0.5 }]) {
      const x = (point.x - 0.5) * 180, y = (point.y - 0.5) * 235;
      const result = screenToItem(matrix.a * x + matrix.c * y, matrix.b * x + matrix.d * y, 180, 235, matrix);
      close(result.x, point.x); close(result.y, point.y);
    }
  }
  assert.equal(screenToItem(0, 0, 0, 0, { a: 0, b: 0, c: 0, d: 0 }), null);
});

test("an unchanged image is pixel-exact and has no cracks along triangle seams", () => {
  const source = texture(73, 61, (x, y) => [x * 3, y * 4, 123, 255]);
  const result = rasterizeWarp(source, createWarpMesh([]), source.width, source.height);
  assert.equal(result.width, source.width);
  assert.equal(result.height, source.height);
  assert.deepEqual(result.data, source.data);
});

test("multiple points follow their handles exactly and unmoved pins stay anchored", () => {
  const points = [pin("left", 0.3, 0.7, 0.08, -0.02), pin("right", 0.7, 0.7, -0.06, 0), pin("waist", 0.5, 0.2)];
  const mesh = createWarpMesh(points);
  assert.ok(isSafeMesh(mesh));
  for (const point of points) {
    const vertex = mesh.flatMap(t => t.source.map((s, i) => ({ source: s, target: t.target[i] }))).find(v => v.source.x === point.x && v.source.y === point.y);
    close(vertex.target.x, point.x + point.dx); close(vertex.target.y, point.y + point.dy);
    const restored = unwarpPosition(mesh, { x: point.x + point.dx, y: point.y + point.dy });
    close(restored.x, point.x); close(restored.y, point.y);
  }
});

test("large repeated drags cannot invert the mesh or collapse the picture", () => {
  let points = [pin("drag", 0.3, 0.7), pin("anchor", 0.7, 0.7), pin("waist", 0.5, 0.2)];
  for (const destination of [{ x: 1.4, y: -0.5 }, { x: -2, y: 3 }, { x: 0.71, y: 0.7 }, { x: 0.35, y: 0.72 }]) {
    points = moveWarpPin(points, "drag", destination);
    assert.ok(isSafeMesh(createWarpMesh(points)));
    assert.equal(points[1].dx, 0); assert.equal(points[1].dy, 0);
  }
  assert.deepEqual(moveWarpPin(points, "drag", { x: NaN, y: 0 }), points);
});

test("deformed pixels beyond the original frame are retained instead of clipped", () => {
  const points = [pin("edge", 0.05, 0.5, -0.08, 0)];
  const mesh = createWarpMesh(points);
  assert.ok(isSafeMesh(mesh));
  const source = texture(64, 64, () => [30, 80, 180, 255]);
  const result = rasterizeWarp(source, mesh, 64, 64);
  assert.ok(result.left < 0);
  assert.ok(result.width > 64);
  const originalLeftPixel = Math.floor(-result.left / result.spanX * result.width);
  let visibleBeyondFrame = false;
  for (let y = 0; y < result.height; y++) for (let x = 0; x < originalLeftPixel; x++) if (result.data[(y * result.width + x) * 4 + 3]) visibleBeyondFrame = true;
  assert.ok(visibleBeyondFrame);
});

test("resampling transparent cutouts does not introduce white fringes", () => {
  const source = texture(8, 8, x => x < 4 ? [255, 255, 255, 0] : [10, 30, 50, 255]);
  const result = rasterizeWarp(source, createWarpMesh([]), 33, 33);
  let edgePixels = 0;
  for (let i = 0; i < result.data.length; i += 4) {
    if (result.data[i + 3] > 0 && result.data[i + 3] < 255) {
      edgePixels++;
      assert.deepEqual([...result.data.subarray(i, i + 3)], [10, 30, 50]);
    }
  }
  assert.ok(edgePixels > 0);
});

test("repeated deformation frames do not compound changes or mutate the original", () => {
  const source = texture(60, 70, (x, y) => [x * 4, y * 3, 90, 255]);
  const original = source.data.slice();
  const points = [pin("leg", 0.25, 0.75, 0.06, 0.01)];
  const first = rasterizeWarp(source, createWarpMesh(points), 120, 140);
  for (let i = 0; i < 4; i++) {
    const result = rasterizeWarp(source, createWarpMesh(points), 120, 140);
    assert.deepEqual(result.data, first.data);
    assert.equal(result.width, first.width); assert.equal(result.height, first.height);
  }
  assert.deepEqual(source.data, original);
  assert.deepEqual(rasterizeWarp(source, createWarpMesh([]), 60, 70).data, original);
});

test("invalid or coincident constraints fail safely", () => {
  assert.equal(createWarpMesh([pin("a", 0.5, 0.5), pin("b", 0.5, 0.5, 0.1)]), null);
  assert.equal(createWarpMesh([pin("a", NaN, 0.5)]), null);
  assert.equal(createWarpMesh([pin("a", 0.5, 0.5, Infinity)]), null);
});

test("canvas frames use stable wrapper dimensions after CSS stretching, not growing screen bounds", () => {
  let frames = 0;
  const context = {
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    putImageData: () => { frames++; },
  };
  const canvas = { width: 300, height: 150, style: {}, getContext: () => context, getBoundingClientRect: () => { throw new Error("Transformed bounds must not size the bitmap"); } };
  const surface = { clientWidth: 90, clientHeight: 120, getBoundingClientRect: canvas.getBoundingClientRect };
  const source = texture(32, 32, () => [30, 80, 180, 255]);
  const points = [pin("edge", 0.05, 0.5, -0.08, 0)];
  drawWarpCanvas(canvas, surface, source, points, 2);
  const width = canvas.width, height = canvas.height;
  for (let i = 0; i < 5; i++) {
    drawWarpCanvas(canvas, surface, source, points, 2);
    assert.equal(canvas.width, width); assert.equal(canvas.height, height);
  }
  assert.equal(frames, 6);
  // Switching to the other tab must not overwrite the image with a 1px frame.
  drawWarpCanvas(canvas, { clientWidth: 0, clientHeight: 0 }, source, points, 2);
  assert.equal(frames, 6); assert.equal(canvas.width, width);
  drawWarpCanvas(canvas, surface, source, [], 2);
  assert.equal(canvas.width, 180); assert.equal(canvas.height, 240);
  assert.equal(canvas.style.left, "0%"); assert.equal(canvas.style.width, "100%");
});
