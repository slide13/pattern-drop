import type { SlotKey } from "./wardrobe.types";

export const EQUIPMENT_SLOTS: { key: SlotKey; label: string; hint: string }[] = [
  { key: "head", label: "Head", hint: "headwear" },
  { key: "torso", label: "Torso", hint: "tops" },
  { key: "legs", label: "Legs", hint: "bottoms" },
  { key: "feet", label: "Feet", hint: "footwear" },
  { key: "accessory", label: "Accessory", hint: "extra item" },
];
