/* eslint-disable @next/next/no-img-element -- User-uploaded images are served directly. */
import { INVENTORY_PLACEHOLDER_COUNT } from "../../shared/constants";
import type { Drawing } from "../../shared/types";
import { DRAWING_MIME } from "./constants";

/** Drawings to dress the avatar with: drag one to a slot, or tap it and then a slot. */
export default function InventoryPanel({
  drawings,
  heldDrawingId,
  drawingSrc,
  onHold,
}: {
  drawings: Drawing[];
  heldDrawingId: string | null;
  drawingSrc: (drawingId: string) => string;
  onHold: (drawingId: string | null) => void;
}) {
  const vacant = Math.max(0, INVENTORY_PLACEHOLDER_COUNT - drawings.length);
  return (
    <aside className="game-inventory">
      <div className="game-panel-label">
        <span>INVENTORY</span>
        <b>{drawings.length} ITEMS</b>
      </div>
      <p>Drag an item into a slot on the right. On your phone, select an item, then a slot.</p>
      <div className="game-items">
        {drawings.map((drawing, index) => (
          <button
            key={drawing.id}
            draggable
            className={`game-item ${heldDrawingId === drawing.id ? "held" : ""}`}
            onClick={() => onHold(heldDrawingId === drawing.id ? null : drawing.id)}
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAWING_MIME, drawing.id);
              event.dataTransfer.effectAllowed = "copy";
              onHold(drawing.id);
            }}
            aria-pressed={heldDrawingId === drawing.id}
            aria-label={`Item ${index + 1}`}
          >
            <img src={drawingSrc(drawing.id)} alt="" />
            <span>{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
        {Array.from({ length: vacant }, (_, index) => (
          <div className="game-item vacant" key={index}>
            +
          </div>
        ))}
      </div>
      {!drawings.length && (
        <div className="empty-inventory">Add drawings from the Transfer tab first</div>
      )}
    </aside>
  );
}
