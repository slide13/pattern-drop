"use client";
/* eslint-disable @next/next/no-img-element -- User-uploaded images are served directly. */
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Drawing } from "./types";
import type { Equipment, EquippedItem, SlotKey } from "./equipment.types";
import { changeEquipment, emptyWardrobe, equipSavedItem, isWardrobe } from "./equipment-state";
import { removeStaleEntries, usePersistentState } from "./hooks/use-persistent-state";
import { SESSION_TTL_DAYS } from "../shared/constants";
import { EQUIPMENT_SLOTS, INVENTORY_PLACEHOLDER_COUNT } from "./constants";
import AvatarFigure, { type Avatar } from "./avatar-figure";
import WarpedImage from "./warped-image";
import { addWarpPoint, moveWarpPoint, warpPointPosition, WARP_RADIUS, type Vec, type WarpPoint } from "./warp";

/** Pointer travel, in pixels, below which a press on an item counts as a click. */
const CLICK_SLOP = 4;

type ItemMovement = {
  slot: SlotKey;
  pointerId: number;
  startX: number;
  startY: number;
  itemX: number;
  itemY: number;
  moved: boolean;
  // A click on the already selected item adds a warp point; the first click only selects it.
  wasSelected: boolean;
};

// `grab` keeps the handle from jumping when it is pressed off-center.
const WARDROBE_KEY_PREFIX = "patterndrop:wardrobe:";
const DAY_MS = 24 * 60 * 60 * 1000;

const isAvatar = (value: unknown): value is Avatar => value === "boy" || value === "girl";

type PointDrag = { slot: SlotKey; pointId: string; pointerId: number; grab: Vec };

/** Converts a pointer position to box pixels of a rotated, scaled item. */
function pointerInItem(box: HTMLElement, item: EquippedItem, clientX: number, clientY: number): Vec {
  // Rotation and scale happen around the box center, so the on-screen bounds share it.
  const bounds = box.getBoundingClientRect();
  const dx = clientX - (bounds.left + bounds.width / 2);
  const dy = clientY - (bounds.top + bounds.height / 2);
  const angle = (-item.rotation * Math.PI) / 180;
  const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) / item.scale;
  const y = (dx * Math.sin(angle) + dy * Math.cos(angle)) / item.scale;
  return { x: x + box.offsetWidth / 2, y: y + box.offsetHeight / 2 };
}

function newPointId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function CharacterMenu({ sessionId, drawings }: { sessionId: string; drawings: Drawing[] }) {
  const [avatar, setAvatar] = usePersistentState<Avatar>("patterndrop:avatar", () => "girl", isAvatar);
  // Outfits belong to a session: its drawings are what the items point to.
  const [wardrobe, setWardrobe] = usePersistentState(`${WARDROBE_KEY_PREFIX}${sessionId}`, emptyWardrobe, isWardrobe);
  // Drawings of an expired session are gone from the server; their items are not shown.
  const available = new Set(drawings.map(drawing => drawing.id));
  const equipped: Equipment = Object.fromEntries(
    Object.entries(wardrobe.equipped).filter(([, item]) => item && available.has(item.drawingId)),
  );

  // Outfits of sessions the server has already expired are of no further use.
  useEffect(() => removeStaleEntries(WARDROBE_KEY_PREFIX, SESSION_TTL_DAYS * DAY_MS), []);
  const [selectedSlot, setSelectedSlot] = useState<SlotKey>("torso");
  const [heldDrawingId, setHeldDrawingId] = useState<string | null>(null);
  const moveRef = useRef<ItemMovement | null>(null);
  const pointDragRef = useRef<PointDrag | null>(null);

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

  function updateItem(slot: SlotKey, update: (item: EquippedItem) => Partial<EquippedItem> | null) {
    setEquipped(current => {
      const item = current[slot];
      const patch = item && update(item);
      return item && patch ? { ...current, [slot]: { ...item, ...patch } } : current;
    });
  }

  function updateSelected(patch: Partial<EquippedItem>) {
    updateItem(selectedSlot, () => patch);
  }

  function startMoving(event: ReactPointerEvent<HTMLButtonElement>, slot: SlotKey, item: EquippedItem) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedSlot(slot);
    moveRef.current = {
      slot, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, itemX: item.x, itemY: item.y,
      moved: false, wasSelected: selectedSlot === slot,
    };
  }

  function moveItem(event: ReactPointerEvent<HTMLButtonElement>) {
    const moving = moveRef.current;
    if (!moving || moving.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - moving.startX;
    const deltaY = event.clientY - moving.startY;
    if (!moving.moved && Math.hypot(deltaX, deltaY) < CLICK_SLOP) return;
    moving.moved = true;
    updateItem(moving.slot, () => ({ x: moving.itemX + deltaX, y: moving.itemY + deltaY }));
  }

  function finishMoving(event: ReactPointerEvent<HTMLButtonElement>) {
    const moving = moveRef.current;
    if (moving?.pointerId !== event.pointerId) return;
    moveRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const box = event.currentTarget.parentElement;
    if (event.type !== "pointerup" || moving.moved || !moving.wasSelected || !box) return;
    const { clientX, clientY } = event;
    updateItem(moving.slot, item => {
      const radius = WARP_RADIUS * Math.max(box.offsetWidth, box.offsetHeight);
      const warp = addWarpPoint(item.warp ?? [], pointerInItem(box, item, clientX, clientY), radius, newPointId());
      return warp && { warp };
    });
  }

  function startDraggingPoint(event: ReactPointerEvent<HTMLButtonElement>, slot: SlotKey, item: EquippedItem, point: WarpPoint) {
    const box = event.currentTarget.parentElement;
    if (event.button !== 0 || !box) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pressed = pointerInItem(box, item, event.clientX, event.clientY);
    const shown = warpPointPosition(item.warp ?? [], point);
    const grab = { x: pressed.x - shown.x, y: pressed.y - shown.y };
    pointDragRef.current = { slot, pointId: point.id, pointerId: event.pointerId, grab };
  }

  function dragPoint(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = pointDragRef.current;
    const box = event.currentTarget.parentElement;
    if (!drag || drag.pointerId !== event.pointerId || !box) return;
    const { clientX, clientY } = event;
    updateItem(drag.slot, item => {
      const pointer = pointerInItem(box, item, clientX, clientY);
      const target = { x: pointer.x - drag.grab.x, y: pointer.y - drag.grab.y };
      return { warp: moveWarpPoint(item.warp ?? [], drag.pointId, target) };
    });
  }

  function finishDraggingPoint(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointDragRef.current?.pointerId !== event.pointerId) return;
    pointDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function removePoint(slot: SlotKey, pointId: string) {
    updateItem(slot, item => ({ warp: item.warp?.filter(point => point.id !== pointId) }));
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
              const selected = selectedSlot === slot.key;
              return item ? (
                <div
                  key={slot.key}
                  className={`worn-item worn-${slot.key} ${selected ? "selected" : ""}`}
                  style={{ marginLeft: item.x, marginTop: item.y, transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`, "--item-scale": item.scale } as CSSProperties}
                >
                  <button
                    className="worn-item-body"
                    onClick={() => setSelectedSlot(slot.key)}
                    onPointerDown={event => startMoving(event, slot.key, item)}
                    onPointerMove={moveItem}
                    onPointerUp={finishMoving}
                    onPointerCancel={finishMoving}
                    aria-label={selected ? `Move the ${slot.label} item, or click to add a shape point` : `Select the ${slot.label} item`}
                  ><WarpedImage src={drawingUrl(item.drawingId)} points={item.warp ?? []} /></button>
                  {selected && item.warp?.map((point, index) => {
                    const shown = warpPointPosition(item.warp ?? [], point);
                    return (
                      <button
                        key={point.id}
                        className="warp-handle"
                        style={{ left: shown.x, top: shown.y }}
                        onPointerDown={event => startDraggingPoint(event, slot.key, item, point)}
                        onPointerMove={dragPoint}
                        onPointerUp={finishDraggingPoint}
                        onPointerCancel={finishDraggingPoint}
                        onDoubleClick={() => removePoint(slot.key, point.id)}
                        onKeyDown={event => { if (event.key === "Delete" || event.key === "Backspace") removePoint(slot.key, point.id); }}
                        aria-label={`Shape point ${index + 1}: drag to reshape, double-click or Delete to remove`}
                      />
                    );
                  })}
                </div>
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
            <div className="warp-control">
              <div className="control-value"><span>Shape points</span><output>{selectedItem?.warp?.length ?? 0}</output></div>
              <p>Click the selected item to add a point, then drag the point to bend the drawing to the body. Double-click a point to remove it.</p>
              <button className="center-item" disabled={!selectedItem?.warp?.length} onClick={() => updateSelected({ warp: undefined })}>Reset shape</button>
            </div>
            <button className="remove-item" disabled={!selectedItem} onClick={() => setEquipped(current => ({ ...current, [selectedSlot]: undefined }))}>Unequip item</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
