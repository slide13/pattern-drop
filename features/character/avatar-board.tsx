import AvatarFigure, { type Avatar } from "./avatar-figure";
import { EQUIPMENT_SLOTS } from "./constants";
import type { WardrobeActions } from "./use-wardrobe";
import type { Equipment, SlotKey } from "./wardrobe.types";
import WornItem from "./worn-item";

/** The avatar with everything it wears. */
export default function AvatarBoard({
  avatar,
  equipped,
  selectedSlot,
  drawingSrc,
  onSelect,
  actions,
}: {
  avatar: Avatar;
  equipped: Equipment;
  selectedSlot: SlotKey;
  drawingSrc: (drawingId: string) => string;
  onSelect: (slot: SlotKey) => void;
  actions: WardrobeActions;
}) {
  return (
    <div className="avatar-board">
      <div className="avatar-caption">
        <span>DRAG ITEMS TO POSITION</span>
        <span>{avatar === "boy" ? "MODEL 01 / M" : "MODEL 02 / F"}</span>
      </div>
      <div className={`paper-doll ${avatar}`}>
        <AvatarFigure avatar={avatar} />
        {EQUIPMENT_SLOTS.map(({ key, label }) => {
          const item = equipped[key];
          if (!item) return null;
          return (
            <WornItem
              key={key}
              slot={key}
              label={label}
              item={item}
              src={drawingSrc(item.drawingId)}
              selected={selectedSlot === key}
              onSelect={() => onSelect(key)}
              onMove={(x, y) => actions.update(key, { x, y })}
              onAddPoint={(target, radius) => actions.addPoint(key, target, radius)}
              onMovePoint={(pointId, target, radius) =>
                actions.movePoint(key, pointId, target, radius)
              }
              onRemovePoint={(pointId) => actions.removePoint(key, pointId)}
            />
          );
        })}
      </div>
      <div className="avatar-floor" />
    </div>
  );
}
