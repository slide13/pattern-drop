import { useEffect, useRef } from "react";

export type Poll = (signal: AbortSignal) => Promise<"continue" | "stop">;

/**
 * Runs a poll now and then every `intervalMs` until it answers "stop"; a thrown
 * error just waits for the next round. Starts over whenever `key` changes.
 * `start` is called once per key and returns the poll, so it can keep state for
 * that run. With `pauseWhileHidden` nothing runs while the tab is hidden, and
 * polling resumes immediately when it is shown again.
 */
export function usePolling(
  key: string,
  start: () => Poll,
  { intervalMs, pauseWhileHidden = false }: { intervalMs: number; pauseWhileHidden?: boolean },
) {
  // The latest `start`, without restarting the polling each render.
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    const controller = new AbortController();
    const poll = startRef.current();
    const paused = () => pauseWhileHidden && document.hidden;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let stopped = false;

    const run = async () => {
      // One request chain at a time, so resuming never starts a second loop.
      if (running || stopped || controller.signal.aborted || paused()) return;
      running = true;
      clearTimeout(timer);
      try {
        stopped = (await poll(controller.signal)) === "stop";
      } catch {
        /* Retry on the next round. */
      } finally {
        running = false;
        if (!stopped && !controller.signal.aborted && !paused())
          timer = setTimeout(run, intervalMs);
      }
    };

    const resume = () => void run();
    if (pauseWhileHidden) document.addEventListener("visibilitychange", resume);
    void run();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [key, intervalMs, pauseWhileHidden]);
}
