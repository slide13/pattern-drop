import type { SlotKey } from "./equipment.types";

export const EQUIPMENT_SLOTS: { key: SlotKey; label: string; hint: string }[] = [
  { key: "head", label: "Head", hint: "headwear" },
  { key: "torso", label: "Torso", hint: "tops" },
  { key: "legs", label: "Legs", hint: "bottoms" },
  { key: "feet", label: "Feet", hint: "footwear" },
  { key: "accessory", label: "Accessory", hint: "extra item" },
];

export const CONFIGURED_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
export const SESSION_POLL_INTERVAL_MS = 1500;
export const INVENTORY_PLACEHOLDER_COUNT = 12;
export const MAX_PROCESSED_IMAGE_SIZE = 1800;
export const DEFAULT_REMOVAL_STRENGTH = 45;
