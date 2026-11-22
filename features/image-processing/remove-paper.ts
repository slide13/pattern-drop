import { DEFAULT_REMOVAL_STRENGTH } from "./constants.ts";

type Pixels = { width: number; height: number; data: Uint8ClampedArray };

// A small closing seals 1–2 pixel breaks in pencil outlines before the outside
// is filled. It does not dilate the final cutout or shrink enclosed white areas.
function closeOutline(mask: Uint8Array, width: number, height: number) {
  const expanded = new Uint8Array(mask.length);
  const closed = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = 0;
      for (let dy = -1; dy <= 1 && !value; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx]) {
            value = 1;
            break;
          }
        }
      expanded[y * width + x] = value;
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = 1;
      for (let dy = -1; dy <= 1 && value; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && !expanded[ny * width + nx]) {
            value = 0;
            break;
          }
        }
      closed[y * width + x] = value;
    }
  return closed;
}

/** Remove exterior paper in-place; strength 0–100, higher removes more faint marks. */
export function removePaper(image: Pixels, strength = DEFAULT_REMOVAL_STRENGTH) {
  const { width, height, data } = image;
  if (width < 1 || height < 1 || data.length !== width * height * 4)
    throw new Error("Invalid image");
  const count = width * height;

  // Already-cut-out PNGs must retain their alpha, white fabric and edge colors.
  let transparentBorder = 0,
    borderCount = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (x && y && x !== width - 1 && y !== height - 1) continue;
      borderCount++;
      if (data[(y * width + x) * 4 + 3] === 0) transparentBorder++;
    }
  if (transparentBorder > borderCount * 0.1) return;

  // Estimate paper locally from the bright part of each tile, not four corners.
  // Chromaticity separates colored strokes from gray/warm shadows on the sheet.
  const tileSize = Math.max(12, Math.ceil(Math.max(width, height) / 20));
  const cols = Math.ceil(width / tileSize),
    rows = Math.ceil(height / tileSize);
  const paper = new Float32Array(cols * rows * 3);
  const histogram = new Uint32Array(256);
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      histogram.fill(0);
      const left = tx * tileSize,
        right = Math.min(width, left + tileSize);
      const top = ty * tileSize,
        bottom = Math.min(height, top + tileSize);
      let samples = 0;
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] < 128) continue;
          histogram[Math.round((data[i] + data[i + 1] + data[i + 2]) / 3)]++;
          samples++;
        }
      let percentile = 255,
        seen = 0;
      for (let value = 0; value < 256; value++) {
        seen += histogram[value];
        if (seen >= samples * 0.8) {
          percentile = value;
          break;
        }
      }
      let red = 0,
        green = 0,
        blue = 0,
        selected = 0;
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] < 128 || (data[i] + data[i + 1] + data[i + 2]) / 3 < percentile - 0.5)
            continue;
          red += data[i];
          green += data[i + 1];
          blue += data[i + 2];
          selected++;
        }
      const i = (ty * cols + tx) * 3;
      paper[i] = selected ? red / selected : 255;
      paper[i + 1] = selected ? green / selected : 255;
      paper[i + 2] = selected ? blue / selected : 255;
    }

  // Borrow the brightest neighboring tile beneath solid fills. A tile entirely
  // covered by ink must not become its own background reference.
  const reference = paper.slice();
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      let best = (ty * cols + tx) * 3;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx,
            ny = ty + dy;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          const i = (ny * cols + nx) * 3;
          if (
            paper[i] + paper[i + 1] + paper[i + 2] >
            paper[best] + paper[best + 1] + paper[best + 2]
          )
            best = i;
        }
      reference.set(paper.subarray(best, best + 3), (ty * cols + tx) * 3);
    }

  const backgrounds = new Uint8ClampedArray(count * 3);
  const score = new Float32Array(count);
  const ink = new Uint8Array(count);
  const threshold = 0.045 + Math.max(0, Math.min(100, strength)) * 0.001;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const gx = Math.max(0, Math.min(cols - 1, x / tileSize - 0.5));
      const gy = Math.max(0, Math.min(rows - 1, y / tileSize - 0.5));
      const x0 = Math.floor(gx),
        y0 = Math.floor(gy),
        x1 = Math.min(cols - 1, x0 + 1),
        y1 = Math.min(rows - 1, y0 + 1);
      const fx = gx - x0,
        fy = gy - y0,
        p = y * width + x;
      for (let c = 0; c < 3; c++) {
        backgrounds[p * 3 + c] =
          reference[(y0 * cols + x0) * 3 + c] * (1 - fx) * (1 - fy) +
          reference[(y0 * cols + x1) * 3 + c] * fx * (1 - fy) +
          reference[(y1 * cols + x0) * 3 + c] * (1 - fx) * fy +
          reference[(y1 * cols + x1) * 3 + c] * fx * fy;
      }
      const r = data[p * 4],
        g = data[p * 4 + 1],
        b = data[p * 4 + 2];
      const br = backgrounds[p * 3],
        bg = backgrounds[p * 3 + 1],
        bb = backgrounds[p * 3 + 2];
      const light = Math.max(1, r + g + b),
        paperLight = Math.max(1, br + bg + bb);
      const darkness = 1 - light / paperLight;
      const color = Math.max(
        Math.abs(r / light - br / paperLight),
        Math.abs(g / light - bg / paperLight),
        Math.abs(b / light - bb / paperLight),
      );
      score[p] = Math.max(darkness, color * 2.5);
      ink[p] = data[p * 4 + 3] && score[p] >= threshold ? 1 : 0;
    }

  const barrier = closeOutline(ink, width, height);
  const outside = new Uint8Array(count);
  const queue = new Int32Array(count);
  let start = 0,
    end = 0;
  const enqueue = (p: number) => {
    if (outside[p] || (barrier[p] && data[p * 4 + 3])) return;
    outside[p] = 1;
    queue[end++] = p;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (start < end) {
    const p = queue[start++],
      x = p % width;
    if (x > 0) enqueue(p - 1);
    if (x < width - 1) enqueue(p + 1);
    if (p >= width) enqueue(p - width);
    if (p < count - width) enqueue(p + width);
  }

  // Remove disconnected dust/specks, retaining separate substantial parts.
  const labels = new Int32Array(count);
  const sizes = [0];
  let largest = 0;
  for (let seed = 0; seed < count; seed++) {
    if (outside[seed] || labels[seed] || !data[seed * 4 + 3]) continue;
    const label = sizes.length;
    start = 0;
    end = 1;
    queue[0] = seed;
    labels[seed] = label;
    while (start < end) {
      const p = queue[start++],
        x = p % width,
        y = Math.floor(p / width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            next = ny * width + nx;
          if (
            nx < 0 ||
            nx >= width ||
            ny < 0 ||
            ny >= height ||
            outside[next] ||
            labels[next] ||
            !data[next * 4 + 3]
          )
            continue;
          labels[next] = label;
          queue[end++] = next;
        }
    }
    sizes.push(end);
    largest = Math.max(largest, end);
  }
  const minimumPart = Math.max(3, Math.round(largest * 0.0005));
  const removed = new Uint8Array(count);
  for (let p = 0; p < count; p++) removed[p] = outside[p] || sizes[labels[p]] < minimumPart ? 1 : 0;

  for (let p = 0; p < count; p++) {
    const i = p * 4;
    if (removed[p]) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      continue;
    }
    const x = p % width,
      y = Math.floor(p / width);
    let touchesOutside = false,
      neighborScore = score[p];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (removed[next]) touchesOutside = true;
        neighborScore = Math.max(neighborScore, score[next]);
      }
    if (!touchesOutside) continue;
    // Closing must not leave opaque paper outside the actual pencil stroke.
    if (!ink[p]) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      continue;
    }
    // Unmix paper from antialiased boundary pixels to avoid a white fringe on
    // dark clothes/avatars. Only the outermost pixel is feathered.
    const alpha = Math.max(0.15, Math.min(1, score[p] / Math.max(threshold, neighborScore)));
    for (let c = 0; c < 3; c++)
      data[i + c] = (data[i + c] - (1 - alpha) * backgrounds[p * 3 + c]) / alpha;
    data[i + 3] = Math.round(data[i + 3] * alpha);
  }
}
