"use client";
/* eslint-disable @next/next/no-img-element -- QR data URLs and user-generated blob URLs are intentionally unoptimized. */

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import CharacterMenu from "./character-menu";
import { cutOutPaper } from "./process-image";
import type { Drawing, ProcessedImage, SessionState, StudioView } from "./types";
import { CONFIGURED_SITE_URL, INVENTORY_PLACEHOLDER_COUNT, MAX_SOURCE_PHOTO_BYTES, SESSION_POLL_INTERVAL_MS } from "./constants";

const MAX_SOURCE_PHOTO_MB = MAX_SOURCE_PHOTO_BYTES / 1024 / 1024;
import { SESSION_ID_PATTERN } from "../shared/constants";

// crypto.randomUUID and navigator.clipboard exist only in secure contexts, but the
// desktop page is often opened over plain HTTP on a LAN address.
function makeSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* Fall back below. */ }
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try { return document.execCommand("copy"); } catch { return false; } finally { field.remove(); }
}

async function responseError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch { /* Not JSON. */ }
  return fallback;
}

export default function Studio() {
  const [sessionId, setSessionId] = useState("");
  const [isCamera, setIsCamera] = useState(false);
  const [session, setSession] = useState<SessionState>({ drawings: [] });
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null);
  const [processed, setProcessed] = useState<ProcessedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [activeView, setActiveView] = useState<StudioView>("transfer");
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

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

  const mobileUrl = useMemo(() => {
    if (!sessionId || typeof window === "undefined") return "";
    const siteUrl = CONFIGURED_SITE_URL || window.location.origin;
    return `${siteUrl}${window.location.pathname}?session=${sessionId}&mode=camera`;
  }, [sessionId]);

  useEffect(() => {
    if (!mobileUrl || isCamera) return;
    let active = true;
    QRCode.toDataURL(mobileUrl, { width: 320, margin: 2, color: { dark: "#101111", light: "#ffffff" } })
      .then(data => { if (active) setQr({ url: mobileUrl, data }); })
      .catch(() => { if (active) setQr(null); });
    return () => { active = false; };
  }, [mobileUrl, isCamera]);

  useEffect(() => {
    if (!sessionId || isCamera) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const nextSession: SessionState = await response.json();
          if (!controller.signal.aborted) setSession(nextSession);
        }
      } catch { /* Retry on the next poll. */ }
      finally {
        if (!controller.signal.aborted) timer = setTimeout(check, SESSION_POLL_INTERVAL_MS);
      }
    };
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, isCamera]);

  useEffect(() => {
    if (!selectedDrawing) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedDrawing(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedDrawing]);

  useEffect(() => {
    return () => { if (processed) URL.revokeObjectURL(processed.preview); };
  }, [processed]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setMessage("Removing the background…");
    try {
      const result = await cutOutPaper(file);
      setProcessed(result); setMessage("Ready. Check the result.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not process the photo"); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function sendPhoto() {
    if (!processed) return;
    setBusy(true); setMessage("Sending to the computer…");
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: processed.blob,
      });
      if (!response.ok) throw new Error(await responseError(response, "The server rejected the image"));
      setProcessed(null);
      setMessage("Added to inventory. You can photograph the next drawing ✓");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send the photo"); }
    finally { setBusy(false); }
  }

  function restart() {
    const id = makeSessionId();
    setSessionId(id); setSession({ drawings: [] }); setProcessed(null); setSelectedDrawing(null);
    window.history.replaceState({}, "", `?session=${id}`);
  }

  if (!sessionId) return <main className="loading">Preparing the studio…</main>;

  if (isCamera) return (
    <main className="phone-shell">
      <header className="phone-header">
        <div className="brand"><span className="brand-mark">P</span> PatternDrop</div>
        <span className="secure-pill"><i /> Session found</span>
      </header>
      <section className="capture-card">
        <div className="step">STEP 1 OF 1</div>
        <h1>{processed ? "Review the cutout" : "Photograph your drawing"}</h1>
        <p>{processed ? "The background was removed on your phone. If it looks right, send it." : "Lay the sheet flat, leave some space around the drawing, and photograph it from above—or pick a photo you already took."}</p>
        <button className={`camera-stage ${processed ? "has-preview" : ""}`} onClick={() => inputRef.current?.click()} disabled={busy}>
          {processed ? <img src={processed.preview} alt="Drawing after background removal" /> : <>
            <span className="focus-corner corner-a" /><span className="focus-corner corner-b" /><span className="focus-corner corner-c" /><span className="focus-corner corner-d" />
            <span className="camera-icon">●</span><strong>Open camera</strong><small>JPG, PNG · up to {MAX_SOURCE_PHOTO_MB} MB</small>
          </>}
        </button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={choosePhoto} tabIndex={-1} aria-hidden="true" />
        {/* Without `capture`, phones offer the photo library and files instead of opening the camera. */}
        <input ref={galleryRef} className="visually-hidden" type="file" accept="image/*" onChange={choosePhoto} tabIndex={-1} aria-hidden="true" />
        {!processed && <button className="secondary-button gallery-button" onClick={() => galleryRef.current?.click()} disabled={busy}>Choose from gallery</button>}
        {message && <div className="mobile-message" role="status"><span>{busy ? "↻" : "✓"}</span>{message}</div>}
        {processed && <div className="mobile-actions">
          <button className="secondary-button" onClick={() => inputRef.current?.click()} disabled={busy}>Retake</button>
          <button className="secondary-button" onClick={() => galleryRef.current?.click()} disabled={busy}>Gallery</button>
          <button className="primary-button" onClick={sendPhoto} disabled={busy}>{busy ? "Sending…" : "Send →"}</button>
        </div>}
      </section>
      <p className="privacy-note">No sign-in · photo processing stays on your device</p>
    </main>
  );

  const drawings = session.drawings;
  const emptySlots = Array.from({ length: Math.max(0, INVENTORY_PLACEHOLDER_COUNT - drawings.length) });
  const drawingUrl = (drawing: Drawing) => `/api/sessions/${sessionId}/images/${drawing.id}`;
  return (
    <main className="desktop-shell">
      <nav className="topbar">
        <div className="brand"><span className="brand-mark">P</span> PatternDrop <b>BETA</b></div>
        <div className="desktop-nav" aria-label="Application sections">
          <button className={activeView === "transfer" ? "active" : ""} onClick={() => setActiveView("transfer")}><span>01</span> Transfer</button>
          <button className={activeView === "character" ? "active" : ""} onClick={() => setActiveView("character")}><span>02</span> Character</button>
        </div>
        <div className="session-code">SESSION <span>{sessionId.slice(0, 4).toUpperCase()} · {sessionId.slice(4, 8).toUpperCase()}</span></div>
      </nav>
      <section className={`workspace ${activeView !== "transfer" ? "view-hidden" : ""}`}>
        <div className="intro">
          <div className="eyebrow"><span>01</span> TRANSFER YOUR SKETCH</div>
          <h1>From paper<br /><em>to screen.</em></h1>
          <p>Photograph your clothing drawing with your phone. The background disappears, and the result appears here instantly.</p>
          <div className="promise-list"><span><b>01</b> No sign-in</span><span><b>02</b> Auto-crop</span><span><b>03</b> Instant</span></div>
        </div>
        <div className="transfer-panel">
          {!drawings.length ? <>
            <div className="panel-heading"><div><span className="live-dot" /> WAITING FOR PHOTO</div><span>≈ 30 SEC</span></div>
            <div className="qr-zone">
              <div className="qr-card">{qr?.url === mobileUrl ? <img src={qr.data} alt="QR code to open the camera page on your phone" /> : <div className="qr-placeholder" />}<span className="scan-line" /></div>
              <div className="qr-copy"><span className="number">1</span><h2>Point your phone camera at the QR code</h2><p>This session’s page will open—nothing to install and no sign-in required.</p></div>
            </div>
            <div className="link-row"><span className="link-text">{mobileUrl.replace(/^https?:\/\//, "")}</span><button onClick={async () => { if (await copyText(mobileUrl)) { setCopied(true); window.setTimeout(() => setCopied(false), 1600); } }}>{copied ? "COPIED ✓" : "COPY LINK"}</button></div>
          </> : <div className="result-panel">
            <div className="panel-heading"><div><span className="live-dot ready" /> SESSION INVENTORY</div><span>{drawings.length} {drawings.length === 1 ? "ITEM" : "ITEMS"}</span></div>
            <div className="inventory-wrap">
              <div className="inventory-hint">Select a drawing to view it</div>
              <div className="inventory-grid">
                {drawings.map((drawing, index) => (
                  <button className="inventory-slot filled" key={drawing.id} onClick={() => setSelectedDrawing(drawing)} aria-label={`Open drawing ${drawings.length - index}`}>
                    <img src={drawingUrl(drawing)} alt="" loading="lazy" />
                    <span>{String(drawings.length - index).padStart(2, "0")}</span>
                  </button>
                ))}
                {emptySlots.map((_, index) => <div className="inventory-slot empty" key={`empty-${index}`}><span>+</span></div>)}
              </div>
            </div>
            <div className="result-actions"><span className="inventory-status">Your phone is still connected—add more drawings</span><button className="secondary-button" onClick={restart}>New session</button></div>
          </div>}
        </div>
      </section>
      <div className={activeView !== "character" ? "view-hidden" : ""}><CharacterMenu key={sessionId} sessionId={sessionId} drawings={drawings} /></div>
      <footer><span>PATTERNDROP / 2026</span><span>PHOTO PROCESSING STAYS ON YOUR DEVICE</span></footer>
      {selectedDrawing && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Drawing preview">
          <button className="lightbox-dismiss" onClick={() => setSelectedDrawing(null)} aria-label="Close preview" />
          <div className="lightbox-card">
            <button className="lightbox-close" onClick={() => setSelectedDrawing(null)} aria-label="Close preview">×</button>
            <div className="lightbox-stage"><img src={drawingUrl(selectedDrawing)} alt="Enlarged clothing drawing" /></div>
            <div className="lightbox-meta"><span>{selectedDrawing.width} × {selectedDrawing.height} PX</span><a href={drawingUrl(selectedDrawing)} download={`pattern-${selectedDrawing.id}.png`}>Download PNG ↓</a></div>
          </div>
        </div>
      )}
    </main>
  );
}
