import type { Equipment, SlotKey, Wardrobe } from "./equipment.types";

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
