import { SESSION_TTL_DAYS } from "../shared/constants.ts";
import type { Storage } from "./storage.ts";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** Deletes every session unused for `days` days; returns how many were removed. */
export async function removeExpiredSessions(storage: Storage, days = SESSION_TTL_DAYS) {
  let removed = 0;
  for (const sessionId of storage.expiredSessions(days)) {
    try {
      await storage.removeSession(sessionId);
      removed++;
    } catch (error) {
      console.error(`Could not remove expired session ${sessionId}:`, error);
    }
  }
  return removed;
}

/** Runs the cleanup now and then hourly, without keeping the process alive. */
export function startSessionCleanup(storage: Storage) {
  const run = () =>
    void removeExpiredSessions(storage).catch((error) =>
      console.error("Session cleanup failed:", error),
    );
  run();
  setInterval(run, CLEANUP_INTERVAL_MS).unref();
}
