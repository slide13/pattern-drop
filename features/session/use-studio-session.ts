import { useCallback, useEffect, useState } from "react";
import { SESSION_ID_PATTERN } from "../../shared/constants";

// crypto.randomUUID exists only in secure contexts, but the desktop page is often
// opened over plain HTTP on a LAN address.
function makeSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Reads the session id and mode from the URL, creating a session when there is none. */
export function useStudioSession() {
  const [sessionId, setSessionId] = useState("");
  const [isCamera, setIsCamera] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const candidate = params.get("session");
      const existing = candidate && SESSION_ID_PATTERN.test(candidate) ? candidate : null;
      const id = existing || makeSessionId();
      setSessionId(id);
      setIsCamera(params.get("mode") === "camera");
      if (!existing) {
        params.set("session", id);
        window.history.replaceState({}, "", `?${params}`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const restart = useCallback(() => {
    const id = makeSessionId();
    setSessionId(id);
    window.history.replaceState({}, "", `?session=${id}`);
  }, []);

  return { sessionId, isCamera, restart };
}
