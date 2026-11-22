// The cut-out pipeline shared by the worker and the main-thread fallback: scale
// the photo down, remove the paper, crop to the drawing and export a PNG. It only
// needs a 2D canvas, so it runs on OffscreenCanvas in a worker and on a regular
// <canvas> elsewhere.
import { MAX_PROCESSED_IMAGE_SIZE } from "./image-constants.ts";
import { removePaper } from "./remove-paper.ts";

type Pixels = { width: number; height: number; data: Uint8ClampedArray };
export type Bounds = { left: number; top: number; right: number; bottom: number };
type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Pixels at least this opaque count as part of the drawing when cropping. */
const VISIBLE_ALPHA = 28;
/** Margin kept around the drawing, as a fraction of the shorter side. */
const CROP_PADDING = 0.025;

/** Box around the visible pixels, padded; the whole image when nothing is visible. */
export function cropBounds({ width, height, data }: Pixels): Bounds {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= VISIBLE_ALPHA) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return { left: 0, top: 0, right: width - 1, bottom: height - 1 };
  const padding = Math.round(Math.min(width, height) * CROP_PADDING);
  return {
    left: Math.max(0, left - padding),
    top: Math.max(0, top - padding),
    right: Math.min(width - 1, right + padding),
    bottom: Math.min(height - 1, bottom + padding),
  };
}

export function scaledSize(width: number, height: number) {
  const scale = Math.min(1, MAX_PROCESSED_IMAGE_SIZE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Cuts the drawing out of a decoded photo. `createCanvas` returns a canvas of the
 * given size and `exportPng` turns one into a PNG blob. Closes the bitmap.
 */
export async function cutOutBitmap<C extends OffscreenCanvas | HTMLCanvasElement>(
  bitmap: ImageBitmap,
  createCanvas: (width: number, height: number) => C,
  exportPng: (canvas: C) => Promise<Blob>,
) {
  const { width, height } = scaledSize(bitmap.width, bitmap.height);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true }) as Canvas2D | null;
  try {
    if (!context) throw new Error("Could not process the image");
    context.drawImage(bitmap, 0, 0, width, height);
  } finally {
    bitmap.close();
  }

  const image = context.getImageData(0, 0, width, height);
  removePaper(image);
  context.putImageData(image, 0, 0);

  const { left, top, right, bottom } = cropBounds(image);
  const cropped = createCanvas(right - left + 1, bottom - top + 1);
  const croppedContext = cropped.getContext("2d") as Canvas2D | null;
  if (!croppedContext) throw new Error("Could not crop the image");
  croppedContext.drawImage(
    canvas,
    left,
    top,
    cropped.width,
    cropped.height,
    0,
    0,
    cropped.width,
    cropped.height,
  );
  return exportPng(cropped);
}
