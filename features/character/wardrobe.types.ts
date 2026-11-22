import type { WarpPoint } from "./warp/warp";

export type SlotKey = "head" | "torso" | "legs" | "feet" | "accessory";
export type EquippedItem = {
  drawingId: string;
  scale: number;
  rotation: number;
  x: number;
  y: number;
  /** Control points that reshape the image to fit the avatar. */
  warp?: WarpPoint[];
};
export type Equipment = Partial<Record<SlotKey, EquippedItem>>;
export type Wardrobe = {
  equipped: Equipment;
  // A drawing can be fitted to more than one slot without overwriting either fit.
  saved: Partial<Record<SlotKey, Record<string, EquippedItem>>>;
};
