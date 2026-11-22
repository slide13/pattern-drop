import { useEffect, useRef, useState } from "react";

/** Writes are delayed so dragging, which changes state on every pointer move, stays cheap. */
const SAVE_DELAY_MS = 300;

/** Stored alongside the value so old entries can be cleaned up. */
type Entry = { savedAt: number; value: unknown };

function parseEntry(raw: string): Entry {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === "object" && parsed !== null && "savedAt" in parsed && "value" in parsed) {
    if (typeof parsed.savedAt === "number") return { savedAt: parsed.savedAt, value: parsed.value };
  }
  // Written before entries carried a timestamp: keep it until it is saved again.
  return { savedAt: Date.now(), value: parsed };
}

function read<T>(key: string, isValid: (value: unknown) => value is T): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const { value } = parseEntry(raw);
    return isValid(value) ? value : undefined;
  } catch {
    // Storage can be blocked (private mode, site settings) or hold an old format.
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    const entry: Entry = { savedAt: Date.now(), value };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* Full or blocked storage only loses persistence, not the current state. */
  }
}

/** Deletes stored entries under `prefix` that were last saved more than `maxAgeMs` ago. */
export function removeStaleEntries(prefix: string, maxAgeMs: number) {
  try {
    const storage = window.localStorage;
    const cutoff = Date.now() - maxAgeMs;
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    for (const key of keys) {
      if (!key?.startsWith(prefix)) continue;
      const raw = storage.getItem(key);
      let stale: boolean;
      try {
        stale = raw === null || parseEntry(raw).savedAt < cutoff;
      } catch {
        stale = true; // Unreadable JSON is of no use to anyone.
      }
      if (stale) storage.removeItem(key);
    }
  } catch {
    /* Blocked storage holds nothing to clean. */
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
