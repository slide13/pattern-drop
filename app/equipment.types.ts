import type { WarpPoint } from "./image.types";

export type SlotKey = "head" | "torso" | "legs" | "feet" | "accessory";
export type EquippedItem = { drawingId: string; scale: number; scaleX: number; scaleY: number; rotation: number; x: number; y: number; warpPoints: WarpPoint[] };
export type Equipment = Partial<Record<SlotKey, EquippedItem>>;
export type Wardrobe = {
  equipped: Equipment;
  // A drawing can be fitted to more than one slot without overwriting either fit.
  saved: Partial<Record<SlotKey, Record<string, EquippedItem>>>;
};

