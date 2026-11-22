import { useEffect } from "react";

/** Calls `onEscape` when Escape is pressed while the calling component is mounted. */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onEscape]);
}
