/* eslint-disable @next/next/no-img-element -- Session images are served as-is from the API. */
import { useEscapeKey } from "../../lib/hooks/use-escape-key";
import type { Drawing } from "../../shared/types";

export default function DrawingLightbox({
  drawing,
  src,
  onClose,
}: {
  drawing: Drawing;
  src: string;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Drawing preview">
      <button className="lightbox-dismiss" onClick={onClose} aria-label="Close preview" />
      <div className="lightbox-card">
        <button className="lightbox-close" onClick={onClose} aria-label="Close preview">
          ×
        </button>
        <div className="lightbox-stage">
          <img src={src} alt="Enlarged clothing drawing" />
        </div>
        <div className="lightbox-meta">
          <span>
            {drawing.width} × {drawing.height} PX
          </span>
          <a href={src} download={`pattern-${drawing.id}.png`}>
            Download PNG ↓
          </a>
        </div>
      </div>
    </div>
  );
}
