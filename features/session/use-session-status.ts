import { useCallback, useEffect, useState } from "react";
import { SESSION_POLL_INTERVAL_MS } from "./constants";

export type SessionStatus = "checking" | "found" | "missing";

/** Asks the server whether a session exists, retrying until it gets an answer. */
export function useSessionStatus(sessionId: string) {
  const [status, setStatus] = useState<{ sessionId: string; value: SessionStatus } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok || response.status === 404) {
          setStatus({ sessionId, value: response.ok ? "found" : "missing" });
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      // Offline or a server error says nothing about the session: ask again later.
      timer = setTimeout(check, SESSION_POLL_INTERVAL_MS);
    };
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sessionId]);

  // For requests that learn the session is gone after the initial check.
  const markMissing = useCallback(() => setStatus({ sessionId, value: "missing" }), [sessionId]);

  return {
    sessionStatus: status?.sessionId === sessionId ? status.value : ("checking" as SessionStatus),
    markMissing,
  };
}
