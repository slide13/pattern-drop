import type { Equipment, EquippedItem, SlotKey, Wardrobe } from "./equipment.types";
import type { WarpPoint } from "./warp";

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
