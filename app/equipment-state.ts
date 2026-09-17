import type { WarpPoint } from "./warp-image";

export type SlotKey = "head" | "torso" | "legs" | "feet" | "accessory";
export type EquippedItem = { drawingId: string; scale: number; scaleX: number; scaleY: number; rotation: number; x: number; y: number; warpPoints: WarpPoint[] };
export type Equipment = Partial<Record<SlotKey, EquippedItem>>;
export type Wardrobe = {
  equipped: Equipment;
  // A drawing can be fitted to more than one slot without overwriting either fit.
  saved: Partial<Record<SlotKey, Record<string, EquippedItem>>>;
};

export function emptyWardrobe(): Wardrobe {
  return { equipped: {}, saved: {} };
}

export function changeEquipment(state: Wardrobe, update: (current: Equipment) => Equipment): Wardrobe {
  const equipped = update(state.equipped);
  if (equipped === state.equipped) return state;
  const saved = { ...state.saved };
  // Capture outgoing items on removal/replacement as well as the latest edits.
  // All snapshots are immutable, so points retain their precise coordinates.
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
    drawingId, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, x: 0, y: 0, warpPoints: [],
  };
  return changeEquipment(state, current => ({ ...current, [slot]: item }));
}
