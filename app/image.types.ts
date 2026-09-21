export type Vec2 = { x: number; y: number };
export type WarpPoint = Vec2 & { id: string; dx: number; dy: number };
export type Triangle = { source: [Vec2, Vec2, Vec2]; target: [Vec2, Vec2, Vec2] };
export type Pixels = { width: number; height: number; data: Uint8ClampedArray };
