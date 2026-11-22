import type { EquippedItem } from "./wardrobe.types";
import type { Vec } from "./warp/warp";

/** Converts a pointer position to box pixels of a rotated, scaled worn item. */
export function pointerInItem(
  box: HTMLElement,
  item: EquippedItem,
  clientX: number,
  clientY: number,
): Vec {
  // Rotation and scale happen around the box center, so the on-screen bounds share it.
  const bounds = box.getBoundingClientRect();
  const dx = clientX - (bounds.left + bounds.width / 2);
  const dy = clientY - (bounds.top + bounds.height / 2);
  const angle = (-item.rotation * Math.PI) / 180;
  const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) / item.scale;
  const y = (dx * Math.sin(angle) + dy * Math.cos(angle)) / item.scale;
  return { x: x + box.offsetWidth / 2, y: y + box.offsetHeight / 2 };
}
