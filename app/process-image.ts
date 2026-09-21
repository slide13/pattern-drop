import type { ProcessedImage } from "./types";
import { MAX_UPLOAD_BYTES } from "../shared/constants";
import { MAX_PROCESSED_IMAGE_SIZE } from "./constants";
import { removePaper } from "./remove-paper";

// Background removal runs entirely on the device, without AI or external APIs.
export async function cutOutPaper(file: File): Promise<ProcessedImage> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 12 MB");
  const bitmap = await createImageBitmap(file);
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
  return { blob, preview: URL.createObjectURL(blob), width: cropped.width, height: cropped.height };
}

