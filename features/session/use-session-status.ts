import { useCallback, useState } from "react";
import { usePolling } from "../../lib/hooks/use-polling";
import { fetchDrawings } from "./api";
import { SESSION_POLL_INTERVAL_MS } from "./constants";

export type SessionStatus = "checking" | "found" | "missing";

/** Asks the server whether a session exists, retrying until it gets an answer. */
export function useSessionStatus(sessionId: string) {
  const [status, setStatus] = useState<{ sessionId: string; value: SessionStatus } | null>(null);

  usePolling(
    sessionId,
    () => async (signal) => {
      const result = await fetchDrawings(sessionId, signal);
      // Offline or a server error says nothing about the session: ask again later.
      if (result.status === "error") return "continue";
      if (!signal.aborted)
        setStatus({ sessionId, value: result.status === "ok" ? "found" : "missing" });
      return "stop";
    },
    { intervalMs: SESSION_POLL_INTERVAL_MS },
  );

  // For requests that learn the session is gone after the initial check.
  const markMissing = useCallback(() => setStatus({ sessionId, value: "missing" }), [sessionId]);

  return {
    sessionStatus: status?.sessionId === sessionId ? status.value : ("checking" as SessionStatus),
    markMissing,
  };
}
