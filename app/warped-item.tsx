"use client";

import { useEffect, useRef } from "react";
import { drawWarpCanvas, type WarpPoint } from "./warp-image";

export default function WarpedItem({ src, points }: { src: string; points: WarpPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef(points);
  const scheduleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    pointsRef.current = points;
    scheduleRef.current?.();
  }, [points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = canvas?.parentElement;
    if (!canvas || !surface) return;
    let disposed = false;
    let frame = 0;
    let source: ImageData | null = null;
    const draw = () => {
      frame = 0;
      if (disposed || !source) return;
      drawWarpCanvas(canvas, surface, source, pointsRef.current, window.devicePixelRatio);
    };
    const schedule = () => {
      if (!disposed && !frame) frame = window.requestAnimationFrame(draw);
    };
    scheduleRef.current = schedule;

    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      const texture = document.createElement("canvas");
      const ratio = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
      texture.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      texture.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const textureContext = texture.getContext("2d", { willReadFrequently: true });
      if (!textureContext) return;
      textureContext.drawImage(image, 0, 0, texture.width, texture.height);
      source = textureContext.getImageData(0, 0, texture.width, texture.height);
      schedule();
    };
    image.src = src;
    // Observe only the wrapper; changing bitmap dimensions cannot trigger a
    // resize loop. Load/decode the original once, never on each pointer move.
    const observer = new ResizeObserver(schedule);
    observer.observe(surface);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      image.onload = null;
      scheduleRef.current = null;
    };
  }, [src]);

  return <canvas ref={canvasRef} className="warped-canvas" aria-hidden="true" />;
}
