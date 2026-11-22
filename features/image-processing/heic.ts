// ISO-BMFF brands used by HEIC/HEIF photos (iPhone writes "heic"; bursts and
// edited images can use the others).
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/** True when the first bytes of a file are a HEIC/HEIF `ftyp` box. */
export function isHeifHeader(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (text(4) !== "ftyp") return false;
  if (HEIF_BRANDS.has(text(8))) return true;
  // Compatible brands follow the major brand and minor version.
  const boxSize = Math.min(bytes.length, new DataView(bytes.buffer, bytes.byteOffset).getUint32(0));
  for (let offset = 16; offset + 4 <= boxSize; offset += 4)
    if (HEIF_BRANDS.has(text(offset))) return true;
  return false;
}

/** Sniffs content rather than trusting the name or MIME type, which pickers often leave empty. */
export async function isHeifFile(file: Blob) {
  return isHeifHeader(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
}
