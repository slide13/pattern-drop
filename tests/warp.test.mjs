import assert from "node:assert/strict";
import test from "node:test";
import {
  addWarpPoint,
  createWarpField,
  invertWarp,
  moveWarpPoint,
  triangleTransform,
  warpPointPosition,
  warpRadius,
} from "../features/character/warp/warp.ts";

const radius = 80;
const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);
const samples = () => {
  const out = [];
  for (let y = 0; y <= 225; y += 15) for (let x = 0; x <= 200; x += 10) out.push([x, y]);
  return out;
};

test("adding a point leaves an already warped image exactly as it was", () => {
  let points = addWarpPoint([], { x: 40, y: 60 }, radius, "a");
  points = moveWarpPoint(points, "a", { x: 10, y: 35 });
  const before = createWarpField(points);
  const added = addWarpPoint(points, { x: 70, y: 90 }, radius, "b");
  assert.ok(added);
  const after = createWarpField(added);
  for (const [x, y] of samples()) assert.deepEqual(after(x, y), before(x, y));
  // The new point sits under the cursor that placed it.
  const shown = warpPointPosition(added, added[1]);
  close(shown.x, 70, 0.01);
  close(shown.y, 90, 0.01);
});

test("a dragged point lands exactly where it was moved, even among other points", () => {
  let points = addWarpPoint([], { x: 40, y: 60 }, radius, "a");
  points = moveWarpPoint(points, "a", { x: 20, y: 50 });
  points = addWarpPoint(points, { x: 70, y: 80 }, radius, "b");
  points = moveWarpPoint(points, "b", { x: 95, y: 70 });
  const shown = warpPointPosition(points, points[1]);
  close(shown.x, 95);
  close(shown.y, 70);
});

test("pulling a point never pushes any part of the image the other way", () => {
  let points = addWarpPoint([], { x: 30, y: 70 }, radius, "a");
  points = addWarpPoint(points, { x: 100, y: 110 }, radius, "pin");
  points = moveWarpPoint(points, "a", { x: -10, y: 40 });
  const field = createWarpField(points);
  for (const [x, y] of samples()) {
    const offset = field(x, y);
    assert.ok(offset.x <= 0 && offset.y <= 0, `(${x}, ${y}) moved by ${offset.x}, ${offset.y}`);
  }
});

test("nothing moves beyond a point's radius", () => {
  const points = moveWarpPoint(addWarpPoint([], { x: 20, y: 100 }, radius, "a"), "a", {
    x: 0,
    y: 100,
  });
  assert.deepEqual(createWarpField(points)(20 + radius + 1, 100), { x: 0, y: 0 });
});

test("a point too close to another one is not added", () => {
  const points = addWarpPoint([], { x: 100, y: 100 }, radius, "a");
  assert.equal(addWarpPoint(points, { x: 103, y: 101 }, radius, "b"), null);
});

test("inverting the warp finds the source pixel shown at a position", () => {
  const points = moveWarpPoint(addWarpPoint([], { x: 80, y: 90 }, radius, "a"), "a", {
    x: 90,
    y: 108,
  });
  const field = createWarpField(points);
  const target = { x: 95, y: 110 };
  const source = invertWarp(field, target);
  const moved = field(source.x, source.y);
  close(source.x + moved.x, target.x, 0.01);
  close(source.y + moved.y, target.y, 0.01);
});

test("triangle transform maps each source corner onto its destination", () => {
  const from = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];
  const to = [
    { x: 5, y: 7 },
    { x: 25, y: 9 },
    { x: 3, y: 30 },
  ];
  const [a, b, c, d, e, f] = triangleTransform(from, to);
  from.forEach((p, i) => {
    close(a * p.x + c * p.y + e, to[i].x, 1e-9);
    close(b * p.x + d * p.y + f, to[i].y, 1e-9);
  });
});

test("a drag on the 170 × 300 leg slot stays local and leaves an overlapping pin fixed", () => {
  const reach = warpRadius(170, 300);
  let points = addWarpPoint([], { x: 60, y: 100 }, reach, "hem");
  points = addWarpPoint(points, { x: 80, y: 100 }, reach, "seam");
  points = moveWarpPoint(points, "hem", { x: 70, y: 100 });
  const field = createWarpField(points);
  close(field(60, 100).x, 10);
  assert.ok(field(65, 100).x > 0);
  close(field(80, 100).x, 0);
  close(field(110, 100).x, 0);
  assert.deepEqual(warpPointPosition(points, points[1]), { x: 80, y: 100 });
});

test("a local edit to a saved wide warp preserves the rest of the existing fit", () => {
  const old = [{ id: "hem", x: 60, y: 100, dx: 10, dy: -2, radius: 105 }];
  const points = addWarpPoint(old, { x: 85, y: 100 }, 34, "seam");
  const pinned = warpPointPosition(points, points[1]);
  const before = createWarpField(points);
  const edited = moveWarpPoint(points, "hem", { x: 75, y: 99 }, 34);
  const field = createWarpField(JSON.parse(JSON.stringify(edited)));
  assert.deepEqual(field(110, 100), before(110, 100));
  assert.deepEqual(warpPointPosition(edited, edited[1]), pinned);
  assert.deepEqual(warpPointPosition(edited, edited[0]), { x: 75, y: 99 });
});
