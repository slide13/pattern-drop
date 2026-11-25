// The only place that knows the session API's URLs and response shapes.
import type { Drawing, SessionState } from "../../shared/types";

export const sessionUrl = (sessionId: string) => `/api/sessions/${sessionId}`;
export const drawingUrl = (sessionId: string, drawingId: string) =>
  `${sessionUrl(sessionId)}/images/${drawingId}`;

/** A definite answer about the session, or a failure (offline, server error) worth retrying. */
export type SessionResult<T> =
  | { status: "ok"; data: T }
  | { status: "missing" }
  | { status: "error"; message: string };

async function errorMessage(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string")
      return body.error;
  } catch {
    /* Not JSON. */
  }
  return fallback;
}

async function request<T>(
  send: () => Promise<Response>,
  read: (response: Response) => Promise<T>,
  fallback: string,
): Promise<SessionResult<T>> {
  let response: Response;
  try {
    response = await send();
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : fallback };
  }
  if (response.status === 404) return { status: "missing" };
  if (!response.ok) return { status: "error", message: await errorMessage(response, fallback) };
  return { status: "ok", data: await read(response) };
}

/** Registers the session (or renews an existing one). */
export function createSession(sessionId: string, signal?: AbortSignal) {
  return request(
    () => fetch(sessionUrl(sessionId), { method: "POST", signal }),
    async () => undefined,
    "Could not create the session",
  );
}

export function fetchDrawings(sessionId: string, signal?: AbortSignal) {
  return request(
    () => fetch(sessionUrl(sessionId), { cache: "no-store", signal }),
    async (response) => ((await response.json()) as SessionState).drawings as Drawing[],
    "Could not load the session",
  );
}

export function uploadDrawing(sessionId: string, png: Blob, uploadKey: string) {
  return request(
    () =>
      fetch(sessionUrl(sessionId), {
        method: "PUT",
        headers: { "content-type": "image/png", "Idempotency-Key": uploadKey },
        body: png,
      }),
    async () => undefined,
    "The server rejected the image",
  );
}
