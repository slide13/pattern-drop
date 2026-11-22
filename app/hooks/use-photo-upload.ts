import { useEffect, useState } from "react";
import { cutOutPaper } from "../process-image";
import type { ProcessedImage } from "../types";

export type UploadStatus = {
  phase: "idle" | "busy" | "done" | "error";
  message: string;
};

async function responseError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string")
      return body.error;
  } catch {
    /* Not JSON. */
  }
  return fallback;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Phone-side flow: cut the drawing out of a photo, then send it to the session.
 * Does nothing unless `enabled`, so photos are only taken for a session the server knows.
 */
export function usePhotoUpload(
  sessionId: string,
  { enabled, onSessionMissing }: { enabled: boolean; onSessionMissing: () => void },
) {
  const [processed, setProcessed] = useState<ProcessedImage | null>(null);
  const [status, setStatus] = useState<UploadStatus>({ phase: "idle", message: "" });

  useEffect(() => {
    return () => {
      if (processed) URL.revokeObjectURL(processed.preview);
    };
  }, [processed]);

  async function processPhoto(file: File) {
    if (!enabled) return;
    const progress = (message: string) => setStatus({ phase: "busy", message });
    progress("Removing the background…");
    try {
      setProcessed(await cutOutPaper(file, progress));
      setStatus({ phase: "done", message: "Ready. Check the result." });
    } catch (error) {
      setStatus({ phase: "error", message: errorMessage(error, "Could not process the photo") });
    }
  }

  async function sendPhoto() {
    if (!processed || !enabled) return;
    setStatus({ phase: "busy", message: "Sending to the computer…" });
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: processed.blob,
      });
      if (response.status === 404) {
        setProcessed(null);
        setStatus({ phase: "idle", message: "" });
        onSessionMissing();
        return;
      }
      if (!response.ok)
        throw new Error(await responseError(response, "The server rejected the image"));
      setProcessed(null);
      setStatus({
        phase: "done",
        message: "Added to inventory. You can photograph the next drawing.",
      });
    } catch (error) {
      setStatus({ phase: "error", message: errorMessage(error, "Could not send the photo") });
    }
  }

  return { processed, status, busy: status.phase === "busy", processPhoto, sendPhoto };
}
