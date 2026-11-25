import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { pointerInItem } from "./item-geometry";
import type { EquippedItem } from "./wardrobe.types";
import { warpRadius, warpPointPosition, type Vec, type WarpPoint } from "./warp/warp";

/** Pointer travel, in pixels, below which a press on an item counts as a click. */
const CLICK_SLOP = 4;

type ButtonPointerEvent = ReactPointerEvent<HTMLButtonElement>;

function capture(event: ButtonPointerEvent) {
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
}

function release(event: ButtonPointerEvent) {
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId);
}

/** The worn item's box: the parent of the image button and of the point handles. */
const itemBox = (event: ButtonPointerEvent) => event.currentTarget.parentElement;

/**
 * Dragging a worn item moves it; a click on the already selected item adds a warp
 * point there (the first click only selects it).
 */
export function useItemDrag({
  item,
  selected,
  onSelect,
  onMove,
  onAddPoint,
}: {
  item: EquippedItem;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onAddPoint: (target: Vec, radius: number) => void;
}) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    itemX: number;
    itemY: number;
    moved: boolean;
    wasSelected: boolean;
  } | null>(null);

  const finish = (event: ButtonPointerEvent) => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = null;
    release(event);
    const box = itemBox(event);
    if (event.type !== "pointerup" || current.moved || !current.wasSelected || !box) return;
    const radius = warpRadius(box.offsetWidth, box.offsetHeight);
    onAddPoint(pointerInItem(box, item, event.clientX, event.clientY), radius);
  };

  return {
    onPointerDown: (event: ButtonPointerEvent) => {
      if (event.button !== 0) return;
      capture(event);
      onSelect();
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        itemX: item.x,
        itemY: item.y,
        moved: false,
        wasSelected: selected,
      };
    },
    onPointerMove: (event: ButtonPointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - current.startX;
      const deltaY = event.clientY - current.startY;
      if (!current.moved && Math.hypot(deltaX, deltaY) < CLICK_SLOP) return;
      current.moved = true;
      onMove(current.itemX + deltaX, current.itemY + deltaY);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
  };
}

/** Dragging a warp point handle reshapes the item. */
export function usePointDrag({
  item,
  onMovePoint,
}: {
  item: EquippedItem;
  onMovePoint: (pointId: string, target: Vec, maxRadius: number) => void;
}) {
  // `grab` keeps the handle from jumping when it is pressed off-center.
  const drag = useRef<{ pointId: string; pointerId: number; grab: Vec } | null>(null);

  const finish = (event: ButtonPointerEvent) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    release(event);
  };

  return (point: WarpPoint) => ({
    onPointerDown: (event: ButtonPointerEvent) => {
      const box = itemBox(event);
      if (event.button !== 0 || !box) return;
      capture(event);
      const pressed = pointerInItem(box, item, event.clientX, event.clientY);
      const shown = warpPointPosition(item.warp ?? [], point);
      const grab = { x: pressed.x - shown.x, y: pressed.y - shown.y };
      drag.current = { pointId: point.id, pointerId: event.pointerId, grab };
    },
    onPointerMove: (event: ButtonPointerEvent) => {
      const current = drag.current;
      const box = itemBox(event);
      if (!current || current.pointerId !== event.pointerId || !box) return;
      const pointer = pointerInItem(box, item, event.clientX, event.clientY);
      onMovePoint(
        current.pointId,
        {
          x: pointer.x - current.grab.x,
          y: pointer.y - current.grab.y,
        },
        warpRadius(box.offsetWidth, box.offsetHeight),
      );
    },
    onPointerUp: finish,
    onPointerCancel: finish,
  });
}
