/* eslint-disable @next/next/no-img-element -- User-uploaded images are served directly. */
import type { DragEvent } from "react";
import { DRAWING_MIME, EQUIPMENT_SLOTS } from "./constants";
import ItemControls from "./item-controls";
import type { WardrobeActions } from "./use-wardrobe";
import type { Equipment, SlotKey } from "./wardrobe.types";

/** The equipment slots, which accept drawings, and the settings of the selected item. */
export default function EquipmentPanel({
  equipped,
  selectedSlot,
  heldDrawingId,
  drawingSrc,
  onSelect,
  onEquip,
  actions,
}: {
  equipped: Equipment;
  selectedSlot: SlotKey | null;
  heldDrawingId: string | null;
  drawingSrc: (drawingId: string) => string;
  onSelect: (slot: SlotKey) => void;
  onEquip: (slot: SlotKey, drawingId: string) => void;
  actions: WardrobeActions;
}) {
  function handleDrop(event: DragEvent<HTMLButtonElement>, slot: SlotKey) {
    event.preventDefault();
    const drawingId = event.dataTransfer.getData(DRAWING_MIME) || heldDrawingId;
    if (drawingId) onEquip(slot, drawingId);
  }

  return (
    <aside className="equipment-panel">
      <div className="game-panel-label">
        <span>EQUIPMENT</span>
        <b>{EQUIPMENT_SLOTS.length} SLOTS</b>
      </div>
      <div className="equipment-slots">
        {EQUIPMENT_SLOTS.map((slot) => {
          const item = equipped[slot.key];
          return (
            <button
              key={slot.key}
              className={`equipment-slot ${selectedSlot === slot.key ? "active" : ""} ${item ? "filled" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => handleDrop(event, slot.key)}
              onClick={() =>
                heldDrawingId ? onEquip(slot.key, heldDrawingId) : onSelect(slot.key)
              }
            >
              <span className="slot-icon">
                {item ? <img src={drawingSrc(item.drawingId)} alt="" /> : "+"}
              </span>
              <span>
                <b>{slot.label}</b>
                <small>{item ? "item equipped" : slot.hint}</small>
              </span>
            </button>
          );
        })}
      </div>
      <ItemControls
        label={EQUIPMENT_SLOTS.find((slot) => slot.key === selectedSlot)?.label}
        item={selectedSlot ? equipped[selectedSlot] : undefined}
        onChange={(patch) => {
          if (selectedSlot) actions.update(selectedSlot, patch);
        }}
        onUnequip={() => {
          if (selectedSlot) actions.unequip(selectedSlot);
        }}
      />
    </aside>
  );
}
