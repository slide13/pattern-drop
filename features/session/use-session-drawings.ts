import { useEffect, useState } from "react";
import { SESSION_POLL_INTERVAL_MS } from "./constants";
import type { Drawing, SessionState } from "../../shared/types";

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

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const url = `/api/sessions/${sessionId}`;
    // Phones only accept sessions the server knows, so it is (re)created if missing.
    let registered = false;

    const check = async () => {
      // One request chain at a time, and none while nobody can see the inventory.
      if (running || document.hidden || controller.signal.aborted) return;
      running = true;
      clearTimeout(timer);
      try {
        if (!registered) {
          const created = await fetch(url, { method: "POST", signal: controller.signal });
          registered = created.ok;
          if (!registered) return;
        }
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (response.status === 404) registered = false;
        if (response.ok) {
          const { drawings }: SessionState = await response.json();
          if (controller.signal.aborted) return;
          // Keep the previous array when nothing changed so the inventory does not re-render.
          setState((current) =>
            current?.sessionId === sessionId && sameDrawings(current.drawings, drawings)
              ? current
              : { sessionId, drawings },
          );
        }
      } catch {
        /* Retry on the next poll. */
      } finally {
        running = false;
        if (!controller.signal.aborted && !document.hidden)
          timer = setTimeout(check, SESSION_POLL_INTERVAL_MS);
      }
    };

    const resume = () => void check();
    document.addEventListener("visibilitychange", resume);
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [sessionId]);

  return state?.sessionId === sessionId ? state.drawings : NO_DRAWINGS;
}
