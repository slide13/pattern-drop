import type { CSSProperties } from "react";
import { useItemDrag, usePointDrag } from "./use-item-gestures";
import type { EquippedItem, SlotKey } from "./wardrobe.types";
import WarpedImage from "./warp/warped-image";
import { warpPointPosition, type Vec } from "./warp/warp";

/** A drawing worn on the avatar: draggable, and reshapeable by its warp points when selected. */
export default function WornItem({
  slot,
  label,
  item,
  src,
  selected,
  onSelect,
  onMove,
  onAddPoint,
  onMovePoint,
  onRemovePoint,
}: {
  slot: SlotKey;
  label: string;
  item: EquippedItem;
  src: string;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onAddPoint: (target: Vec, radius: number) => void;
  onMovePoint: (pointId: string, target: Vec) => void;
  onRemovePoint: (pointId: string) => void;
}) {
  const itemDrag = useItemDrag({ item, selected, onSelect, onMove, onAddPoint });
  const pointDrag = usePointDrag({ item, onMovePoint });
  const points = item.warp ?? [];
  const style = {
    marginLeft: item.x,
    marginTop: item.y,
    transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`,
    "--item-scale": item.scale,
  } as CSSProperties;

  return (
    <div className={`worn-item worn-${slot} ${selected ? "selected" : ""}`} style={style}>
      <button
        className="worn-item-body"
        onClick={onSelect}
        {...itemDrag}
        aria-label={
          selected
            ? `Move the ${label} item, or click to add a shape point`
            : `Select the ${label} item`
        }
      >
        <WarpedImage src={src} points={points} />
      </button>
      {selected &&
        points.map((point, index) => {
          const shown = warpPointPosition(points, point);
          return (
            <button
              key={point.id}
              className="warp-handle"
              style={{ left: shown.x, top: shown.y }}
              {...pointDrag(point)}
              onDoubleClick={() => onRemovePoint(point.id)}
              onKeyDown={(event) => {
                if (event.key === "Delete" || event.key === "Backspace") onRemovePoint(point.id);
              }}
              aria-label={`Shape point ${index + 1}: drag to reshape, double-click or Delete to remove`}
            />
          );
        })}
    </div>
  );
}
