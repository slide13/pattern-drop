"use client";
import { useState } from "react";
import { usePersistentState } from "../../lib/hooks/use-persistent-state";
import type { Drawing } from "../../shared/types";
import { drawingUrl } from "../session/api";
import type { Avatar } from "./avatar-figure";
import AvatarBoard from "./avatar-board";
import EquipmentPanel from "./equipment-panel";
import InventoryPanel from "./inventory-panel";
import { useWardrobe } from "./use-wardrobe";
import type { SlotKey } from "./wardrobe.types";

const isAvatar = (value: unknown): value is Avatar => value === "boy" || value === "girl";

/** Dress an avatar in the session's drawings. */
export default function CharacterMenu({
  sessionId,
  drawings,
}: {
  sessionId: string;
  drawings: Drawing[];
}) {
  const [avatar, setAvatar] = usePersistentState<Avatar>(
    "patterndrop:avatar",
    () => "girl",
    isAvatar,
  );
  const { equipped, ...actions } = useWardrobe(sessionId, drawings);
  const [selectedSlot, setSelectedSlot] = useState<SlotKey>("torso");
  const [heldDrawingId, setHeldDrawingId] = useState<string | null>(null);
  const drawingSrc = (drawingId: string) => drawingUrl(sessionId, drawingId);

  function equip(slot: SlotKey, drawingId: string) {
    actions.equip(slot, drawingId);
    setSelectedSlot(slot);
    setHeldDrawingId(null);
  }

  return (
    <section className="character-screen">
      <div className="character-titlebar">
        <div>
          <span>02</span>
          <div>
            <b>CHARACTER</b>
            <small>Create an outfit from your drawings</small>
          </div>
        </div>
        <div className="avatar-switch" aria-label="Choose a character">
          <button className={avatar === "boy" ? "active" : ""} onClick={() => setAvatar("boy")}>
            Boy
          </button>
          <button className={avatar === "girl" ? "active" : ""} onClick={() => setAvatar("girl")}>
            Girl
          </button>
        </div>
      </div>

      <div className="character-layout">
        <InventoryPanel
          drawings={drawings}
          heldDrawingId={heldDrawingId}
          drawingSrc={drawingSrc}
          onHold={setHeldDrawingId}
        />
        <AvatarBoard
          avatar={avatar}
          equipped={equipped}
          selectedSlot={selectedSlot}
          drawingSrc={drawingSrc}
          onSelect={setSelectedSlot}
          actions={actions}
        />
        <EquipmentPanel
          equipped={equipped}
          selectedSlot={selectedSlot}
          heldDrawingId={heldDrawingId}
          drawingSrc={drawingSrc}
          onSelect={setSelectedSlot}
          onEquip={equip}
          actions={actions}
        />
      </div>
    </section>
  );
}
