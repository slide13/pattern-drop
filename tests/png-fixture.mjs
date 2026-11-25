// A complete 10 × 20 RGBA image, including its compressed pixels and checksums.
export function png() {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAUCAYAAAC07qxWAAAAMElEQVR4AY3BAQEAAAiAIPP/52qCMPsIJJJIIokkkkgiiSSSSCKJJJJIIokkkkiiA/0yBCQGUudmAAAAAElFTkSuQmCC",
      "base64",
    ),
  );
}
