import { MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES } from "../shared/constants.ts";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const IHDR = new Uint8Array([73, 72, 68, 82]);

export class UploadError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function matches(bytes: Uint8Array, expected: Uint8Array, offset: number) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

export async function readPngUpload(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "image/png") throw new UploadError("Expected a PNG image", 415);

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredSize = Number(contentLength);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) throw new UploadError("Invalid Content-Length", 400);
    if (declaredSize > MAX_UPLOAD_BYTES) throw new UploadError("Image is too large", 413);
  }
  if (!request.body) throw new UploadError("Expected an image body", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new UploadError("Image is too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (body.byteLength < 24 || !matches(body, PNG_SIGNATURE, 0) || !matches(body, IHDR, 12)) {
    throw new UploadError("Invalid PNG image", 400);
  }

  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (![width, height].every(value => value >= 1 && value <= MAX_IMAGE_DIMENSION)) {
    throw new UploadError("Invalid image dimensions", 400);
  }
  return { body, width, height };
}
