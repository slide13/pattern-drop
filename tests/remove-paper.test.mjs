import assert from "node:assert/strict";
import test from "node:test";
import { removePaper } from "../app/remove-paper.ts";

function picture(width, height, pixel = () => [245, 245, 245, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}
function paint(image, x, y, color) { image.data.set(color, (y * image.width + x) * 4); }
function rgba(image, x, y) { return [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)]; }
function outline(image, left = 35, top = 30, right = 90, bottom = 100, color = [35, 35, 35, 255]) {
  for (let x = left; x <= right; x++) { paint(image, x, top, color); paint(image, x, bottom, color); }
  for (let y = top; y <= bottom; y++) { paint(image, left, y, color); paint(image, right, y, color); }
}

test("all paper outside a closed outline is transparent, white fabric inside stays opaque", () => {
  const image = picture(128, 128);
  outline(image);
  removePaper(image);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    if (x < 35 || x > 90 || y < 30 || y > 100) assert.equal(rgba(image, x, y)[3], 0, `${x},${y}`);
  }
  assert.deepEqual(rgba(image, 60, 60), [245, 245, 245, 255]);
  assert.equal(rgba(image, 35, 60)[3], 255);
});

test("removes uneven warm paper, a broad shadow and dust outside the drawing", () => {
  const image = picture(240, 240, (x, y) => {
    const light = 245 - 58 * Math.exp(-((x - 90) ** 2 + (y - 110) ** 2) / 9000);
    return [light, light - 6, light - 14, 255];
  });
  outline(image, 90, 70, 155, 185);
  paint(image, 15, 25, [15, 15, 15, 255]);
  removePaper(image);
  let outside = 0;
  for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++) {
    if ((x < 90 || x > 155 || y < 70 || y > 185) && rgba(image, x, y)[3]) outside++;
  }
  assert.equal(outside, 0);
  assert.equal(rgba(image, 120, 120)[3], 255);
});

test("seals a tiny break without draining the white interior", () => {
  const image = picture(128, 128);
  outline(image);
  paint(image, 60, 30, [245, 245, 245, 255]);
  paint(image, 61, 30, [245, 245, 245, 255]);
  removePaper(image);
  assert.equal(rgba(image, 60, 60)[3], 255);
  assert.equal(rgba(image, 60, 20)[3], 0);
});

test("removes open paper between trouser legs and preserves both legs", () => {
  const image = picture(128, 128);
  for (let y = 25; y < 105; y++) for (let x = 30; x < 95; x++) {
    if (y < 50 || x < 50 || x >= 75) paint(image, x, y, [60, 100, 180, 255]);
  }
  removePaper(image);
  assert.equal(rgba(image, 62, 80)[3], 0);
  assert.equal(rgba(image, 40, 80)[3], 255);
  assert.equal(rgba(image, 85, 80)[3], 255);
});

test("keeps multiple separate substantial parts", () => {
  const image = picture(128, 128);
  outline(image, 20, 30, 45, 90);
  outline(image, 75, 30, 100, 90);
  removePaper(image);
  assert.equal(rgba(image, 30, 50)[3], 255);
  assert.equal(rgba(image, 85, 50)[3], 255);
  assert.equal(rgba(image, 60, 50)[3], 0);
});

test("preserves existing PNG transparency, white fill and semitransparent edges", () => {
  const image = picture(32, 32, (x, y) => x > 5 && x < 26 && y > 5 && y < 26 ? [255, 255, 255, 255] : [0, 0, 0, 0]);
  paint(image, 6, 6, [70, 30, 90, 100]);
  const original = image.data.slice();
  removePaper(image);
  assert.deepEqual(image.data, original);
});

test("decontaminates antialiased outer edges instead of leaving gray/white halos", () => {
  const image = picture(128, 128);
  outline(image, 35, 30, 90, 100);
  for (let y = 31; y < 100; y++) paint(image, 34, y, [140, 140, 140, 255]);
  removePaper(image);
  const edge = rgba(image, 34, 60);
  assert.ok(edge[3] > 80 && edge[3] < 200);
  assert.ok(edge[0] < 55);
  assert.equal(rgba(image, 33, 60)[3], 0);
});

test("a gentle setting retains a faint contour while a stronger setting removes it", () => {
  const gentle = picture(128, 128);
  outline(gentle, 35, 30, 90, 100, [225, 225, 225, 255]);
  const strong = { ...gentle, data: gentle.data.slice() };
  removePaper(gentle, 0);
  removePaper(strong, 100);
  assert.equal(rgba(gentle, 60, 60)[3], 255);
  assert.equal(rgba(strong, 60, 60)[3], 0);
});

test("tiny and blank images do not read outside their pixel buffers", () => {
  for (const [width, height] of [[1, 1], [1, 8], [8, 1], [3, 2], [64, 64]]) {
    const image = picture(width, height);
    removePaper(image);
    assert.ok(image.data.every(value => value === 0));
  }
});
