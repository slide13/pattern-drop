"use client";
/* eslint-disable @next/next/no-img-element -- User-uploaded images are served directly. */
import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Drawing } from "./types";
import type { Equipment, EquippedItem, SlotKey } from "./equipment.types";
import { changeEquipment, emptyWardrobe, equipSavedItem } from "./equipment-state";
import { EQUIPMENT_SLOTS, INVENTORY_PLACEHOLDER_COUNT } from "./constants";
import AvatarFigure, { type Avatar } from "./avatar-figure";

type ItemMovement = {
  slot: SlotKey;
  pointerId: number;
  startX: number;
  startY: number;
  itemX: number;
  itemY: number;
};

export default function CharacterMenu({ sessionId, drawings }: { sessionId: string; drawings: Drawing[] }) {
  const [avatar, setAvatar] = useState<Avatar>("girl");
  const [wardrobe, setWardrobe] = useState(emptyWardrobe);
  const equipped = wardrobe.equipped;
  const [selectedSlot, setSelectedSlot] = useState<SlotKey>("torso");
  const [heldDrawingId, setHeldDrawingId] = useState<string | null>(null);
  const moveRef = useRef<ItemMovement | null>(null);

  const drawingUrl = (drawingId: string) => `/api/sessions/${sessionId}/images/${drawingId}`;
  const selectedItem = equipped[selectedSlot];

  function setEquipped(update: (current: Equipment) => Equipment) {
    setWardrobe(current => changeEquipment(current, update));
  }

  function equip(slot: SlotKey, drawingId: string) {
    if (!drawings.some(drawing => drawing.id === drawingId)) return;
    setWardrobe(current => equipSavedItem(current, slot, drawingId));
    setSelectedSlot(slot);
    setHeldDrawingId(null);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, slot: SlotKey) {
    event.preventDefault();
    const drawingId = event.dataTransfer.getData("text/patterndrop") || heldDrawingId;
    if (drawingId) equip(slot, drawingId);
  }

  function updateSelected(patch: Partial<EquippedItem>) {
    setEquipped(current => {
      const item = current[selectedSlot];
      return item ? { ...current, [selectedSlot]: { ...item, ...patch } } : current;
    });
  }

  function startMoving(event: ReactPointerEvent<HTMLButtonElement>, slot: SlotKey, item: EquippedItem) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedSlot(slot);
    moveRef.current = { slot, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, itemX: item.x, itemY: item.y };
  }

  function moveItem(event: ReactPointerEvent<HTMLButtonElement>) {
    const moving = moveRef.current;
    if (!moving || moving.pointerId !== event.pointerId) return;
    const x = moving.itemX + event.clientX - moving.startX;
    const y = moving.itemY + event.clientY - moving.startY;
    setEquipped(current => {
      const item = current[moving.slot];
      return item ? { ...current, [moving.slot]: { ...item, x, y } } : current;
    });
  }

  function finishMoving(event: ReactPointerEvent<HTMLButtonElement>) {
    if (moveRef.current?.pointerId !== event.pointerId) return;
    moveRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section className="character-screen">
      <div className="character-titlebar">
        <div><span>02</span><div><b>CHARACTER</b><small>Create an outfit from your drawings</small></div></div>
        <div className="avatar-switch" aria-label="Choose a character">
          <button className={avatar === "boy" ? "active" : ""} onClick={() => setAvatar("boy")}>Boy</button>
          <button className={avatar === "girl" ? "active" : ""} onClick={() => setAvatar("girl")}>Girl</button>
        </div>
      </div>

      <div className="character-layout">
        <aside className="game-inventory">
          <div className="game-panel-label"><span>INVENTORY</span><b>{drawings.length} ITEMS</b></div>
          <p>Drag an item into a slot on the right. On your phone, select an item, then a slot.</p>
          <div className="game-items">
            {drawings.map((drawing, index) => (
              <button
                key={drawing.id}
                draggable
                className={`game-item ${heldDrawingId === drawing.id ? "held" : ""}`}
                onClick={() => setHeldDrawingId(current => current === drawing.id ? null : drawing.id)}
                onDragStart={event => {
                  event.dataTransfer.setData("text/patterndrop", drawing.id);
                  event.dataTransfer.effectAllowed = "copy";
                  setHeldDrawingId(drawing.id);
                }}
                aria-pressed={heldDrawingId === drawing.id}
                aria-label={`Item ${index + 1}`}
              >
                <img src={drawingUrl(drawing.id)} alt="" />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
            {Array.from({ length: Math.max(0, INVENTORY_PLACEHOLDER_COUNT - drawings.length) }).map((_, index) => <div className="game-item vacant" key={index}>+</div>)}
          </div>
          {!drawings.length && <div className="empty-inventory">Add drawings from the Transfer tab first</div>}
        </aside>

        <div className="avatar-board">
          <div className="avatar-caption"><span>DRAG ITEMS TO POSITION</span><span>{avatar === "boy" ? "MODEL 01 / M" : "MODEL 02 / F"}</span></div>
          <div className={`paper-doll ${avatar}`}>
            <AvatarFigure avatar={avatar} />
            {EQUIPMENT_SLOTS.map(slot => {
              const item = equipped[slot.key];
              return item ? (
                <button
                  key={slot.key}
                  className={`worn-item worn-${slot.key} ${selectedSlot === slot.key ? "selected" : ""}`}
                  style={{ marginLeft: item.x, marginTop: item.y, transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})` }}
                  onClick={() => setSelectedSlot(slot.key)}
                  onPointerDown={event => startMoving(event, slot.key, item)}
                  onPointerMove={moveItem}
                  onPointerUp={finishMoving}
                  onPointerCancel={finishMoving}
                  aria-label={`Adjust item in the ${slot.label} slot`}
                ><img src={drawingUrl(item.drawingId)} alt="" /></button>
              ) : null;
            })}
          </div>
          <div className="avatar-floor" />
        </div>

        <aside className="equipment-panel">
          <div className="game-panel-label"><span>EQUIPMENT</span><b>5 SLOTS</b></div>
          <div className="equipment-slots">
            {EQUIPMENT_SLOTS.map(slot => {
              const item = equipped[slot.key];
              return (
                <button
                  key={slot.key}
                  className={`equipment-slot ${selectedSlot === slot.key ? "active" : ""} ${item ? "filled" : ""}`}
                  onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                  onDrop={event => handleDrop(event, slot.key)}
                  onClick={() => heldDrawingId ? equip(slot.key, heldDrawingId) : setSelectedSlot(slot.key)}
                >
                  <span className="slot-icon">{item ? <img src={drawingUrl(item.drawingId)} alt="" /> : "+"}</span>
                  <span><b>{slot.label}</b><small>{item ? "item equipped" : slot.hint}</small></span>
                </button>
              );
            })}
          </div>

          <div className={`item-controls ${selectedItem ? "enabled" : ""}`}>
            <div className="controls-title"><span>ITEM SETTINGS</span><b>{EQUIPMENT_SLOTS.find(slot => slot.key === selectedSlot)?.label}</b></div>
            <label>
              <span>Scale</span><output>{selectedItem ? Math.round(selectedItem.scale * 100) : 100}%</output>
              <input type="range" min="40" max="220" value={selectedItem ? selectedItem.scale * 100 : 100} disabled={!selectedItem} onChange={event => updateSelected({ scale: Number(event.target.value) / 100 })} />
            </label>
            <div className="rotation-control">
              <div className="control-value"><span>Rotation</span><output>{selectedItem?.rotation || 0}°</output></div>
              <input className="rotation-slider" type="range" min="-180" max="180" step="1" value={selectedItem?.rotation || 0} disabled={!selectedItem} onChange={event => updateSelected({ rotation: Number(event.target.value) })} />
              <div className="degree-buttons"><button disabled={!selectedItem} onClick={() => updateSelected({ rotation: Math.max(-180, (selectedItem?.rotation || 0) - 1) })}>↶ −1°</button><input aria-label="Exact rotation angle" type="number" min="-180" max="180" step="1" value={selectedItem?.rotation || 0} disabled={!selectedItem} onChange={event => updateSelected({ rotation: Math.max(-180, Math.min(180, Number(event.target.value))) })} /><button disabled={!selectedItem} onClick={() => updateSelected({ rotation: Math.min(180, (selectedItem?.rotation || 0) + 1) })}>+1° ↷</button></div>
            </div>
            <button className="center-item" disabled={!selectedItem} onClick={() => updateSelected({ x: 0, y: 0 })}>Center in slot</button>
            <button className="remove-item" disabled={!selectedItem} onClick={() => setEquipped(current => ({ ...current, [selectedSlot]: undefined }))}>Unequip item</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
