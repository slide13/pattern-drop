import type { Equipment, EquippedItem, SlotKey, Wardrobe } from "./wardrobe.types";
import { addWarpPoint, moveWarpPoint, type Vec, type WarpPoint } from "./warp/warp.ts";

export function emptyWardrobe(): Wardrobe {
  return { equipped: {}, saved: {} };
}

export function changeEquipment(state: Wardrobe, update: (current: Equipment) => Equipment): Wardrobe {
  const equipped = update(state.equipped);
  if (equipped === state.equipped) return state;
  const saved = { ...state.saved };
  // Capture outgoing items on removal/replacement as well as the latest edits.
  for (const items of [state.equipped, equipped]) {
    for (const [key, item] of Object.entries(items)) {
      if (!item) continue;
      const slot = key as SlotKey;
      saved[slot] = { ...saved[slot], [item.drawingId]: item };
    }
  }
  return { equipped, saved };
}

export function equipSavedItem(state: Wardrobe, slot: SlotKey, drawingId: string): Wardrobe {
  const current = state.equipped[slot];
  if (current?.drawingId === drawingId) return state;
  const item = state.saved[slot]?.[drawingId] ?? {
    drawingId, scale: 1, rotation: 0, x: 0, y: 0,
  };
  return changeEquipment(state, current => ({ ...current, [slot]: item }));
}

/** Applies `update` to the item in `slot`; `null` (or an empty slot) leaves the state as is. */
export function updateItem(
  state: Wardrobe,
  slot: SlotKey,
  update: (item: EquippedItem) => Partial<EquippedItem> | null,
): Wardrobe {
  return changeEquipment(state, current => {
    const item = current[slot];
    const patch = item && update(item);
    return item && patch ? { ...current, [slot]: { ...item, ...patch } } : current;
  });
}

export function unequip(state: Wardrobe, slot: SlotKey): Wardrobe {
  return changeEquipment(state, current => (current[slot] ? { ...current, [slot]: undefined } : current));
}

/** Adds a warp point under `target` (item box pixels); nothing happens when it would crowd another. */
export function addItemWarpPoint(state: Wardrobe, slot: SlotKey, target: Vec, radius: number, id: string) {
  return updateItem(state, slot, item => {
    const warp = addWarpPoint(item.warp ?? [], target, radius, id);
    return warp && { warp };
  });
}

export function moveItemWarpPoint(state: Wardrobe, slot: SlotKey, pointId: string, target: Vec) {
  return updateItem(state, slot, item => ({ warp: moveWarpPoint(item.warp ?? [], pointId, target) }));
}

export function removeItemWarpPoint(state: Wardrobe, slot: SlotKey, pointId: string) {
  return updateItem(state, slot, item => ({ warp: item.warp?.filter(point => point.id !== pointId) }));
}

// Kept here rather than imported from constants so the module stays runnable in plain Node tests.
const SLOT_KEYS: readonly string[] = ["head", "torso", "legs", "feet", "accessory"] satisfies SlotKey[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

function isWarpPoint(value: unknown): value is WarpPoint {
  return isRecord(value) && typeof value.id === "string" &&
    ["x", "y", "dx", "dy", "radius"].every(key => isNumber(value[key])) && (value.radius as number) > 0;
}

function isEquippedItem(value: unknown): value is EquippedItem {
  return isRecord(value) && typeof value.drawingId === "string" &&
    ["scale", "rotation", "x", "y"].every(key => isNumber(value[key])) &&
    (value.warp === undefined || (Array.isArray(value.warp) && value.warp.every(isWarpPoint)));
}

/** Checks a wardrobe read back from storage, which may be stale or hand-edited. */
export function isWardrobe(value: unknown): value is Wardrobe {
  if (!isRecord(value) || !isRecord(value.equipped) || !isRecord(value.saved)) return false;
  const { equipped, saved } = value;
  return Object.entries(equipped).every(([slot, item]) => SLOT_KEYS.includes(slot) && isEquippedItem(item)) &&
    Object.entries(saved).every(([slot, items]) => SLOT_KEYS.includes(slot) && isRecord(items) && Object.values(items).every(isEquippedItem));
}
