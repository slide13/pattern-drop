import { useEffect, useRef, useState } from "react";

/** Writes are delayed so dragging, which changes state on every pointer move, stays cheap. */
const SAVE_DELAY_MS = 300;

function read<T>(key: string, isValid: (value: unknown) => value is T): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : undefined;
  } catch {
    // Storage can be blocked (private mode, site settings) or hold an old format.
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Full or blocked storage only loses persistence, not the current state. */
  }
}

/**
 * `useState` that survives reloads via localStorage. Only for client-only components:
 * the stored value is read during the first render.
 */
export function usePersistentState<T>(
  key: string,
  initial: () => T,
  isValid: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(() => read(key, isValid) ?? initial());
  const pending = useRef<{ key: string; value: T } | null>(null);

  useEffect(() => {
    pending.current = { key, value };
    const flush = () => {
      if (pending.current) write(pending.current.key, pending.current.value);
      pending.current = null;
    };
    const timer = window.setTimeout(flush, SAVE_DELAY_MS);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [key, value]);

  // Save whatever is still pending when the component goes away (e.g. a new session).
  useEffect(
    () => () => {
      if (pending.current) write(pending.current.key, pending.current.value);
    },
    [],
  );

  return [value, setValue] as const;
}
