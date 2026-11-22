/** A drawing uploaded to a session, as the session API lists it. */
export type Drawing = { id: string; width: number; height: number };
/** Body of `GET /api/sessions/:id`. */
export type SessionState = { drawings: Drawing[] };
