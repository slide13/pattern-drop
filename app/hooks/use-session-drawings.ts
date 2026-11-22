import { useEffect, useState } from "react";
import { SESSION_POLL_INTERVAL_MS } from "../constants";
import type { Drawing, SessionState } from "../types";

const NO_DRAWINGS: Drawing[] = [];

/** Registers the session on the server, then polls it for uploaded drawings. */
export function useSessionDrawings(sessionId: string) {
  // Tagged with its session so a restart shows an empty inventory immediately.
  const [state, setState] = useState<{ sessionId: string; drawings: Drawing[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const url = `/api/sessions/${sessionId}`;
    // Phones only accept sessions the server knows, so it is (re)created if missing.
    let registered = false;
    const check = async () => {
      try {
        if (!registered) {
          const created = await fetch(url, { method: "POST", signal: controller.signal });
          registered = created.ok;
          if (!registered) return;
        }
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (response.status === 404) registered = false;
        if (response.ok) {
          const next: SessionState = await response.json();
          if (!controller.signal.aborted) setState({ sessionId, drawings: next.drawings });
        }
      } catch {
        /* Retry on the next poll. */
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(check, SESSION_POLL_INTERVAL_MS);
      }
    };
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sessionId]);

  return state?.sessionId === sessionId ? state.drawings : NO_DRAWINGS;
}
