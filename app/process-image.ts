import type { ProcessedImage } from "./types";
import { MAX_UPLOAD_BYTES } from "../shared/constants";
import { MAX_PROCESSED_IMAGE_SIZE, MAX_SOURCE_PHOTO_BYTES } from "./constants";
import { removePaper } from "./remove-paper";
import { isHeifFile } from "./heic";

const UNSUPPORTED = "This image format is not supported. Choose a JPG, PNG or HEIC photo.";

// Safari decodes HEIC natively; other browsers (Chrome/Android, desktop) do not,
// so HEIC falls back to libheif compiled to WebAssembly. It is loaded on demand
// because it is ~3 MB and most photos never need it.
async function decodePhoto(file: File, onStatus?: (message: string) => void) {
  try {
    return await createImageBitmap(file);
  } catch {
    if (!(await isHeifFile(file))) throw new Error(UNSUPPORTED);
  }
  onStatus?.("Converting the HEIC photo…");
  try {
    const { heicTo } = await import("heic-to");
    return await heicTo({ blob: file, type: "bitmap" });
  } catch (error) {
    console.error("HEIC decoding failed:", error);
    throw new Error("Could not read this HEIC photo. Try another photo or take a new one with the camera.");
  }
}

// Background removal runs entirely on the device, without AI or external APIs.
export async function cutOutPaper(file: File, onStatus?: (message: string) => void): Promise<ProcessedImage> {
  if (file.size > MAX_SOURCE_PHOTO_BYTES) throw new Error(`Photo is larger than ${MAX_SOURCE_PHOTO_BYTES / 1024 / 1024} MB`);
  const bitmap = await decodePhoto(file, onStatus);
  onStatus?.("Removing the background…");
  const scale = Math.min(1, MAX_PROCESSED_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  try {
    if (!context) throw new Error("Could not process the image");
    context.drawImage(bitmap, 0, 0, width, height);
  } finally {
    bitmap.close();
  }

  const image = context.getImageData(0, 0, width, height);
  removePaper(image);

  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (image.data[i + 3] > 28) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  context.putImageData(image, 0, 0);
  if (left > right || top > bottom) { left = 0; top = 0; right = width - 1; bottom = height - 1; }
  const padding = Math.round(Math.min(width, height) * 0.025);
  left = Math.max(0, left - padding); top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding); bottom = Math.min(height - 1, bottom + padding);

  const cropped = document.createElement("canvas");
  cropped.width = right - left + 1; cropped.height = bottom - top + 1;
  const croppedContext = cropped.getContext("2d");
  if (!croppedContext) throw new Error("Could not crop the image");
  croppedContext.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  const blob = await new Promise<Blob>((resolve, reject) => cropped.toBlob(value => value ? resolve(value) : reject(new Error("Export failed")), "image/png"));
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("The processed drawing is too large to send");
  return { blob, preview: URL.createObjectURL(blob) };
}
