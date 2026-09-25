export type Drawing = { id: string; width: number; height: number };
export type SessionState = { drawings: Drawing[] };
export type ProcessedImage = { blob: Blob; preview: string };
export type StudioView = "transfer" | "character";
