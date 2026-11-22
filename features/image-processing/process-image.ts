import { MAX_UPLOAD_BYTES } from "../../shared/constants";
import { MAX_SOURCE_PHOTO_BYTES } from "./constants";
import { cutOutBitmap } from "./cutout";
import type { CutoutRequest, CutoutResponse } from "./cutout.worker";
import { isHeifFile } from "./heic";

/** A cut-out drawing ready to send, with an object URL for previewing it. */
export type ProcessedImage = { blob: Blob; preview: string };

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
    throw new Error(
      "Could not read this HEIC photo. Try another photo or take a new one with the camera.",
    );
  }
}

function canUseWorker() {
  try {
    return typeof Worker !== "undefined" && !!new OffscreenCanvas(1, 1).getContext("2d");
  } catch {
    // No OffscreenCanvas (Safari before 16.4) or no 2D context on it.
    return false;
  }
}

function cutOutInWorker(bitmap: ImageBitmap) {
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL("./cutout.worker.ts", import.meta.url), { type: "module" });
    const finish = () => worker.terminate();
    worker.onmessage = ({ data }: MessageEvent<CutoutResponse>) => {
      finish();
      if ("blob" in data) resolve(data.blob);
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      finish();
      event.preventDefault();
      reject(new Error("Could not process the image"));
    };
    const request: CutoutRequest = { bitmap };
    // Transferred, not copied: the bitmap is unusable here afterwards.
    worker.postMessage(request, [bitmap]);
  });
}

function cutOutOnMainThread(bitmap: ImageBitmap) {
  return cutOutBitmap(
    bitmap,
    (width, height) => Object.assign(document.createElement("canvas"), { width, height }),
    (canvas) =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
          "image/png",
        ),
      ),
  );
}

// Background removal runs entirely on the device, without AI or external APIs.
export async function cutOutPaper(
  file: File,
  onStatus?: (message: string) => void,
): Promise<ProcessedImage> {
  if (file.size > MAX_SOURCE_PHOTO_BYTES)
    throw new Error(`Photo is larger than ${MAX_SOURCE_PHOTO_BYTES / 1024 / 1024} MB`);
  const bitmap = await decodePhoto(file, onStatus);
  onStatus?.("Removing the background…");
  const blob = canUseWorker() ? await cutOutInWorker(bitmap) : await cutOutOnMainThread(bitmap);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("The processed drawing is too large to send");
  return { blob, preview: URL.createObjectURL(blob) };
}
