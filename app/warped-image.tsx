/* eslint-disable @next/next/no-img-element -- User-uploaded images are served directly. */
import { useEffect, useRef } from "react";
import { createWarpField, hasDisplacement, triangleTransform, type Vec, type WarpPoint } from "./warp";

/** Mesh cells per side; more cells bend more smoothly but cost more per frame. */
const GRID = 20;
/** Room around the item box for parts of the image dragged past its edge (matches the CSS). */
const OVERFLOW = 0.25;
/** Triangles are grown by this many pixels so neighbours overlap and no seams show. */
const SEAM = 0.75;

function grow(triangle: [Vec, Vec, Vec]): [Vec, Vec, Vec] {
  const cx = (triangle[0].x + triangle[1].x + triangle[2].x) / 3;
  const cy = (triangle[0].y + triangle[1].y + triangle[2].y) / 3;
  return triangle.map((p) => {
    const length = Math.hypot(p.x - cx, p.y - cy) || 1;
    return { x: p.x + ((p.x - cx) / length) * SEAM, y: p.y + ((p.y - cy) / length) * SEAM };
  }) as [Vec, Vec, Vec];
}

/** Draws the warped image; returns false when it cannot be drawn yet. */
function drawWarped(canvas: HTMLCanvasElement, image: HTMLImageElement, points: WarpPoint[]) {
  const width = image.offsetWidth;
  const height = image.offsetHeight;
  const { naturalWidth, naturalHeight } = image;
  if (!width || !height || !naturalWidth || !naturalHeight) return false;

  const ratio = window.devicePixelRatio || 1;
  const padX = width * OVERFLOW;
  const padY = height * OVERFLOW;
  canvas.width = Math.round((width + 2 * padX) * ratio);
  canvas.height = Math.round((height + 2 * padY) * ratio);
  const context = canvas.getContext("2d");
  if (!context) return false;

  // Same placement as `object-fit: contain` on the plain <img>.
  const fit = Math.min(width / naturalWidth, height / naturalHeight);
  const fitWidth = naturalWidth * fit;
  const fitHeight = naturalHeight * fit;
  const left = (width - fitWidth) / 2;
  const top = (height - fitHeight) / 2;

  const field = createWarpField(points);
  const source: Vec[][] = [];
  const target: Vec[][] = [];
  for (let row = 0; row <= GRID; row++) {
    source.push([]);
    target.push([]);
    for (let col = 0; col <= GRID; col++) {
      const p = { x: left + (fitWidth * col) / GRID, y: top + (fitHeight * row) / GRID };
      const offset = field(p.x, p.y);
      source[row].push(p);
      target[row].push({ x: p.x + offset.x, y: p.y + offset.y });
    }
  }

  const base = [ratio, 0, 0, ratio, padX * ratio, padY * ratio] as const;
  const cellWidth = naturalWidth / GRID;
  const cellHeight = naturalHeight / GRID;
  const margin = 2 / fit; // Source pixels beyond the cell that the grown triangles may show.
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      // Only the cell's own part of the image is sampled, which keeps every draw small.
      const sx = Math.max(0, col * cellWidth - margin);
      const sy = Math.max(0, row * cellHeight - margin);
      const sw = Math.min(naturalWidth, (col + 1) * cellWidth + margin) - sx;
      const sh = Math.min(naturalHeight, (row + 1) * cellHeight + margin) - sy;
      const corners = [
        [source[row][col], source[row][col + 1], source[row + 1][col]],
        [source[row][col + 1], source[row + 1][col + 1], source[row + 1][col]],
      ] as const;
      const moved = [
        [target[row][col], target[row][col + 1], target[row + 1][col]],
        [target[row][col + 1], target[row + 1][col + 1], target[row + 1][col]],
      ] as const;
      for (let t = 0; t < 2; t++) {
        const [a, b, c] = grow([...moved[t]]);
        context.save();
        context.setTransform(...base);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.lineTo(c.x, c.y);
        context.closePath();
        context.clip();
        context.transform(...triangleTransform([...corners[t]], [...moved[t]]));
        context.drawImage(image, sx, sy, sw, sh, left + sx * fit, top + sy * fit, sw * fit, sh * fit);
        context.restore();
      }
    }
  }
  return true;
}

/** An item image that bends to follow its control points. */
export default function WarpedImage({ src, points }: { src: string; points: WarpPoint[] }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    // The plain <img> stays on screen until the canvas has something to show, so
    // adding the first point never flashes an empty item.
    const render = () => {
      const warped = hasDisplacement(points) && drawWarped(canvas, image, points);
      canvas.hidden = !warped;
      image.style.visibility = warped ? "hidden" : "";
    };
    render();
    image.addEventListener("load", render);
    // The character tab may be hidden (zero size) when the item is first drawn.
    const observer = new ResizeObserver(render);
    observer.observe(image);
    return () => {
      image.removeEventListener("load", render);
      observer.disconnect();
    };
  }, [src, points]);

  return (
    <>
      <img ref={imageRef} src={src} alt="" />
      <canvas ref={canvasRef} className="warped-image" hidden aria-hidden="true" />
    </>
  );
}
