/// <reference lib="webworker" />
// Runs the cut-out off the main thread so the phone stays responsive while the
// paper is removed. Receives a transferred ImageBitmap, answers with a PNG blob.
import { cutOutBitmap } from "./cutout.ts";

export type CutoutRequest = { bitmap: ImageBitmap };
export type CutoutResponse = { blob: Blob } | { error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async ({ data }: MessageEvent<CutoutRequest>) => {
  let response: CutoutResponse;
  try {
    const blob = await cutOutBitmap(
      data.bitmap,
      (width, height) => new OffscreenCanvas(width, height),
      (canvas) => canvas.convertToBlob({ type: "image/png" }),
    );
    response = { blob };
  } catch (error) {
    response = { error: error instanceof Error ? error.message : "Could not process the image" };
  }
  scope.postMessage(response);
};
