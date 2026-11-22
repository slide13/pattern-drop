import assert from "node:assert/strict";
import test from "node:test";
import { isHeifFile, isHeifHeader } from "../features/image-processing/heic.ts";

function ftyp(major, compatible = []) {
  const brands = [major, "\0\0\0\0", ...compatible].join("");
  const size = 8 + brands.length;
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, size);
  bytes.set([..."ftyp"].map(c => c.charCodeAt(0)), 4);
  bytes.set([...brands].map(c => c.charCodeAt(0)), 8);
  return bytes;
}

test("recognises iPhone HEIC and generic HEIF headers", () => {
  assert.equal(isHeifHeader(ftyp("heic", ["mif1", "heic"])), true);
  assert.equal(isHeifHeader(ftyp("mif1", ["heic"])), true);
  assert.equal(isHeifHeader(ftyp("isom", ["mif1"])), true);
});

test("rejects other files and short or malformed input", () => {
  assert.equal(isHeifHeader(ftyp("isom", ["mp41", "avc1"])), false);
  assert.equal(isHeifHeader(ftyp("avif", ["avif"])), false);
  assert.equal(isHeifHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])), false);
  assert.equal(isHeifHeader(new Uint8Array([0, 0, 0, 24, 102, 116])), false);
  const huge = ftyp("isom");
  new DataView(huge.buffer).setUint32(0, 0xffffffff);
  assert.equal(isHeifHeader(huge), false);
});

test("sniffs content regardless of file name or MIME type", async () => {
  assert.equal(await isHeifFile(new Blob([ftyp("heic")], { type: "" })), true);
  assert.equal(await isHeifFile(new Blob([new Uint8Array(100)], { type: "image/heic" })), false);
});
