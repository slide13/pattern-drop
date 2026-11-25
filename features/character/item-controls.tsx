import { useId } from "react";
import type { EquippedItem } from "./wardrobe.types";

/** Fine-tuning for the selected item: scale, rotation, position, shape and removal. */
export default function ItemControls({
  label,
  item,
  onChange,
  onUnequip,
}: {
  label: string | undefined;
  item: EquippedItem | undefined;
  onChange: (patch: Partial<EquippedItem>) => void;
  onUnequip: () => void;
}) {
  const rotationId = useId();
  const rotation = item?.rotation || 0;
  return (
    <div className={`item-controls ${item ? "enabled" : ""}`}>
      <div className="controls-title">
        <span>ITEM SETTINGS</span>
        <b>{label}</b>
      </div>
      <label>
        <span>Scale</span>
        <output>{item ? Math.round(item.scale * 100) : 100}%</output>
        <input
          type="range"
          min="40"
          max="220"
          value={item ? item.scale * 100 : 100}
          disabled={!item}
          onChange={(event) => onChange({ scale: Number(event.target.value) / 100 })}
        />
      </label>
      <label className="rotation-control" htmlFor={rotationId}>
        <span>Rotation</span>
        <output>{rotation}°</output>
        <input
          id={rotationId}
          aria-valuetext={`${rotation}°`}
          type="range"
          min="-180"
          max="180"
          step="1"
          value={rotation}
          disabled={!item}
          onChange={(event) => onChange({ rotation: event.target.valueAsNumber })}
        />
      </label>
      <button className="center-item" disabled={!item} onClick={() => onChange({ x: 0, y: 0 })}>
        Center in slot
      </button>
      <div className="warp-control">
        <div className="control-value">
          <span>Shape points</span>
          <output>{item?.warp?.length ?? 0}</output>
        </div>
        <p>
          Click the selected item to add a point, then drag the point to bend the drawing to the
          body. Double-click a point to remove it.
        </p>
        <button
          className="center-item"
          disabled={!item?.warp?.length}
          onClick={() => onChange({ warp: undefined })}
        >
          Reset shape
        </button>
      </div>
      <button className="remove-item" disabled={!item} onClick={onUnequip}>
        Unequip item
      </button>
    </div>
  );
}
