import assert from "node:assert/strict";
import test from "node:test";
import { cropBounds, scaledSize } from "../features/image-processing/cutout.ts";

function image(width, height, opaque) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha = 255] of opaque) data[(y * width + x) * 4 + 3] = alpha;
  return { width, height, data };
}

test("crops to the visible drawing with a small margin", () => {
  // 200 × 100: margin is 2.5% of the shorter side, rounded (3px).
  assert.deepEqual(
    cropBounds(
      image(200, 100, [
        [50, 40],
        [120, 60],
      ]),
    ),
    { left: 47, top: 37, right: 123, bottom: 63 },
  );
});

test("the margin never reaches past the image edge", () => {
  assert.deepEqual(
    cropBounds(
      image(100, 100, [
        [0, 1],
        [99, 98],
      ]),
    ),
    { left: 0, top: 0, right: 99, bottom: 99 },
  );
});

test("faint pixels do not count as part of the drawing", () => {
  assert.deepEqual(
    cropBounds(
      image(100, 100, [
        [10, 10, 28],
        [50, 50, 29],
      ]),
    ),
    { left: 47, top: 47, right: 53, bottom: 53 },
  );
});

test("an empty cutout keeps the whole image", () => {
  assert.deepEqual(cropBounds(image(30, 20, [])), { left: 0, top: 0, right: 29, bottom: 19 });
});

test("large photos are scaled so the longer side fits, small ones are kept", () => {
  assert.deepEqual(scaledSize(4032, 3024), { width: 1800, height: 1350 });
  assert.deepEqual(scaledSize(800, 600), { width: 800, height: 600 });
});
