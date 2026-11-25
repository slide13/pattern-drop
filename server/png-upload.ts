import { crc32 } from "node:zlib";
import { MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES } from "../shared/constants.ts";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

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

/** Check chunk boundaries and checksums without expanding the pixel buffer. */
function readPngDimensions(body: Uint8Array) {
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  const invalid = () => new UploadError("Invalid PNG image", 400);
  if (
    !matches(bytes, PNG_SIGNATURE, 0) ||
    bytes.length < 33 ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("latin1", 12, 16) !== "IHDR"
  )
    throw invalid();
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (![width, height].every((value) => value >= 1 && value <= MAX_IMAGE_DIMENSION)) {
    throw new UploadError("Invalid image dimensions", 400);
  }
  let hasPixels = false;
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const end = offset + 8 + length;
    if (
      end + 4 > bytes.length ||
      crc32(bytes.subarray(offset + 4, end)) !== bytes.readUInt32BE(end)
    )
      throw invalid();
    if (type === "IHDR" && offset !== PNG_SIGNATURE.length) throw invalid();
    if (type === "IDAT" && length > 0) hasPixels = true;
    offset = end + 4;
    if (type === "IEND") {
      if (length !== 0 || !hasPixels || offset !== bytes.length) throw invalid();
      return { width, height };
    }
  }
  throw invalid();
}

export async function readPngUpload(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "image/png") throw new UploadError("Expected a PNG image", 415);

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredSize = Number(contentLength);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0)
      throw new UploadError("Invalid Content-Length", 400);
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
  return { body, ...readPngDimensions(body) };
}
