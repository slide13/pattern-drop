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
  const rotation = item?.rotation || 0;
  const rotate = (value: number) => onChange({ rotation: Math.max(-180, Math.min(180, value)) });
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
      <div className="rotation-control">
        <div className="control-value">
          <span>Rotation</span>
          <output>{rotation}°</output>
        </div>
        <input
          className="rotation-slider"
          type="range"
          min="-180"
          max="180"
          step="1"
          value={rotation}
          disabled={!item}
          onChange={(event) => onChange({ rotation: Number(event.target.value) })}
        />
        <div className="degree-buttons">
          <button disabled={!item} onClick={() => rotate(rotation - 1)}>
            ↶ −1°
          </button>
          <input
            aria-label="Exact rotation angle"
            type="number"
            min="-180"
            max="180"
            step="1"
            value={rotation}
            disabled={!item}
            onChange={(event) => rotate(Number(event.target.value))}
          />
          <button disabled={!item} onClick={() => rotate(rotation + 1)}>
            +1° ↷
          </button>
        </div>
      </div>
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
