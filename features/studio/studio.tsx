"use client";

import DesktopStudio from "../transfer/desktop-studio";
import PhoneCapture from "../capture/phone-capture";
import { useStudioSession } from "../session/use-studio-session";

export default function Studio() {
  const { sessionId, isCamera, restart } = useStudioSession();

  if (!sessionId) return <main className="loading">Preparing the studio…</main>;
  if (isCamera) return <PhoneCapture sessionId={sessionId} />;
  return <DesktopStudio sessionId={sessionId} onRestart={restart} />;
}
