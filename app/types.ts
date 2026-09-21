export type Drawing = { id: string; width: number; height: number; createdAt: string };
export type SessionState = { status: "waiting" | "uploaded"; updatedAt?: string; drawings?: Drawing[] };
export type ProcessedImage = { blob: Blob; preview: string; width: number; height: number };
export type Avatar = "boy" | "girl";
export type StudioView = "transfer" | "character";
export type ItemMovement = {
  slot: import("./equipment.types").SlotKey;
  pointerId: number;
  startX: number;
  startY: number;
  itemX: number;
  itemY: number;
};
