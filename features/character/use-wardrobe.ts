import { useEffect } from "react";
import { removeStaleEntries, usePersistentState } from "../../lib/hooks/use-persistent-state";
import { SESSION_TTL_DAYS } from "../../shared/constants";
import type { Drawing } from "../../shared/types";
import type { Equipment, EquippedItem, SlotKey } from "./wardrobe.types";
import {
  addItemWarpPoint,
  emptyWardrobe,
  equipSavedItem,
  isWardrobe,
  moveItemWarpPoint,
  removeItemWarpPoint,
  unequip,
  updateItem,
} from "./wardrobe";
import type { Vec } from "./warp/warp";

const WARDROBE_KEY_PREFIX = "patterndrop:wardrobe:";
const DAY_MS = 24 * 60 * 60 * 1000;

function newPointId() {
  return Math.random().toString(36).slice(2, 10);
}

/** The session's outfit, saved across reloads, with the actions that change it. */
export function useWardrobe(sessionId: string, drawings: Drawing[]) {
  // Outfits belong to a session: its drawings are what the items point to.
  const [wardrobe, setWardrobe] = usePersistentState(
    `${WARDROBE_KEY_PREFIX}${sessionId}`,
    emptyWardrobe,
    isWardrobe,
  );

  // Outfits of sessions the server has already expired are of no further use.
  useEffect(() => removeStaleEntries(WARDROBE_KEY_PREFIX, SESSION_TTL_DAYS * DAY_MS), []);

  // Drawings of an expired session are gone from the server; their items are not shown.
  const available = new Set(drawings.map((drawing) => drawing.id));
  const equipped: Equipment = Object.fromEntries(
    Object.entries(wardrobe.equipped).filter(([, item]) => item && available.has(item.drawingId)),
  );

  return {
    equipped,
    equip: (slot: SlotKey, drawingId: string) => {
      if (available.has(drawingId)) setWardrobe((state) => equipSavedItem(state, slot, drawingId));
    },
    unequip: (slot: SlotKey) => setWardrobe((state) => unequip(state, slot)),
    update: (slot: SlotKey, patch: Partial<EquippedItem>) =>
      setWardrobe((state) => updateItem(state, slot, () => patch)),
    addPoint: (slot: SlotKey, target: Vec, radius: number) =>
      setWardrobe((state) => addItemWarpPoint(state, slot, target, radius, newPointId())),
    movePoint: (slot: SlotKey, pointId: string, target: Vec) =>
      setWardrobe((state) => moveItemWarpPoint(state, slot, pointId, target)),
    removePoint: (slot: SlotKey, pointId: string) =>
      setWardrobe((state) => removeItemWarpPoint(state, slot, pointId)),
  };
}

export type WardrobeActions = Omit<ReturnType<typeof useWardrobe>, "equipped">;
