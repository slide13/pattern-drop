import { useEffect, useState } from "react";
import { SESSION_POLL_INTERVAL_MS } from "../constants";
import type { Drawing, SessionState } from "../types";

const NO_DRAWINGS: Drawing[] = [];

/** Polls the server for the drawings uploaded to a session. */
export function useSessionDrawings(sessionId: string) {
  // Tagged with its session so a restart shows an empty inventory immediately.
  const [state, setState] = useState<{ sessionId: string; drawings: Drawing[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
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
