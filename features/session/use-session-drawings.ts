import { useState } from "react";
import { usePolling } from "../../lib/hooks/use-polling";
import type { Drawing } from "../../shared/types";
import { createSession, fetchDrawings } from "./api";
import { SESSION_POLL_INTERVAL_MS } from "./constants";

const NO_DRAWINGS: Drawing[] = [];

function sameDrawings(a: Drawing[], b: Drawing[]) {
  return (
    a.length === b.length &&
    a.every((drawing, i) => {
      const other = b[i];
      return (
        drawing.id === other.id && drawing.width === other.width && drawing.height === other.height
      );
    })
  );
}

/**
 * Registers the session on the server, then polls it for uploaded drawings.
 * Polling pauses while the tab is hidden and resumes as soon as it is shown again.
 */
export function useSessionDrawings(sessionId: string) {
  // Tagged with its session so a restart shows an empty inventory immediately.
  const [state, setState] = useState<{ sessionId: string; drawings: Drawing[] } | null>(null);

  usePolling(
    sessionId,
    () => {
      // Phones only accept sessions the server knows, so it is (re)created if missing.
      let registered = false;
      return async (signal) => {
        if (!registered) {
          registered = (await createSession(sessionId, signal)).status === "ok";
          if (!registered) return "continue";
        }
        const result = await fetchDrawings(sessionId, signal);
        if (result.status === "missing") {
          registered = false;
          if (!signal.aborted) setState(null);
        }
        if (result.status === "ok" && !signal.aborted) {
          const drawings = result.data;
          // Keep the previous array when nothing changed so the inventory does not re-render.
          setState((current) =>
            current?.sessionId === sessionId && sameDrawings(current.drawings, drawings)
              ? current
              : { sessionId, drawings },
          );
        }
        return "continue";
      };
    },
    { intervalMs: SESSION_POLL_INTERVAL_MS, pauseWhileHidden: true },
  );

  const ready = state?.sessionId === sessionId;
  return { ready, drawings: ready ? state.drawings : NO_DRAWINGS };
}
