/* eslint-disable @next/next/no-img-element -- QR data URLs and session images are intentionally unoptimized. */
import { useCallback, useMemo, useState } from "react";
import CharacterMenu from "./character-menu";
import DrawingLightbox from "./drawing-lightbox";
import { CONFIGURED_SITE_URL, INVENTORY_PLACEHOLDER_COUNT } from "./constants";
import { useCopyToClipboard } from "./hooks/use-copy-to-clipboard";
import { useQrCode } from "./hooks/use-qr-code";
import { useSessionDrawings } from "./hooks/use-session-drawings";
import type { Drawing, StudioView } from "./types";

function mobileUrlFor(sessionId: string) {
  const siteUrl = CONFIGURED_SITE_URL || window.location.origin;
  return `${siteUrl}${window.location.pathname}?session=${sessionId}&mode=camera`;
}

export default function DesktopStudio({
  sessionId,
  onRestart,
}: {
  sessionId: string;
  onRestart: () => void;
}) {
  const drawings = useSessionDrawings(sessionId);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [activeView, setActiveView] = useState<StudioView>("transfer");
  const closeLightbox = useCallback(() => setSelectedDrawing(null), []);
  const drawingUrl = (drawing: Drawing) => `/api/sessions/${sessionId}/images/${drawing.id}`;

  function restart() {
    setSelectedDrawing(null);
    onRestart();
  }

  return (
    <main className="desktop-shell">
      <nav className="topbar">
        <div className="brand">
          <span className="brand-mark">P</span> PatternDrop <b>BETA</b>
        </div>
        <div className="desktop-nav" aria-label="Application sections">
          <button
            className={activeView === "transfer" ? "active" : ""}
            onClick={() => setActiveView("transfer")}
          >
            <span>01</span> Transfer
          </button>
          <button
            className={activeView === "character" ? "active" : ""}
            onClick={() => setActiveView("character")}
          >
            <span>02</span> Character
          </button>
        </div>
        <div className="session-code">
          SESSION{" "}
          <span>
            {sessionId.slice(0, 4).toUpperCase()} · {sessionId.slice(4, 8).toUpperCase()}
          </span>
        </div>
      </nav>
      <section className={`workspace ${activeView !== "transfer" ? "view-hidden" : ""}`}>
        <div className="intro">
          <div className="eyebrow">
            <span>01</span> TRANSFER YOUR SKETCH
          </div>
          <h1>
            From paper
            <br />
            <em>to screen.</em>
          </h1>
          <p>
            Photograph your clothing drawing with your phone. The background disappears, and the
            result appears here instantly.
          </p>
          <div className="promise-list">
            <span>
              <b>01</b> No sign-in
            </span>
            <span>
              <b>02</b> Auto-crop
            </span>
            <span>
              <b>03</b> Instant
            </span>
          </div>
        </div>
        <div className="transfer-panel">
          {drawings.length ? (
            <DrawingInventory
              drawings={drawings}
              drawingUrl={drawingUrl}
              onSelect={setSelectedDrawing}
              onRestart={restart}
            />
          ) : (
            <PhoneHandoff sessionId={sessionId} />
          )}
        </div>
      </section>
      <div className={activeView !== "character" ? "view-hidden" : ""}>
        <CharacterMenu key={sessionId} sessionId={sessionId} drawings={drawings} />
      </div>
      <footer>
        <span>PATTERNDROP / 2026</span>
        <span>PHOTO PROCESSING STAYS ON YOUR DEVICE</span>
      </footer>
      {selectedDrawing && (
        <DrawingLightbox
          drawing={selectedDrawing}
          src={drawingUrl(selectedDrawing)}
          onClose={closeLightbox}
        />
      )}
    </main>
  );
}

function PhoneHandoff({ sessionId }: { sessionId: string }) {
  const mobileUrl = useMemo(() => mobileUrlFor(sessionId), [sessionId]);
  const qr = useQrCode(mobileUrl);
  const { copied, copy } = useCopyToClipboard();

  return (
    <>
      <div className="panel-heading">
        <div>
          <span className="live-dot" /> WAITING FOR PHOTO
        </div>
        <span>≈ 30 SEC</span>
      </div>
      <div className="qr-zone">
        <div className="qr-card">
          {qr ? (
            <img src={qr} alt="QR code to open the camera page on your phone" />
          ) : (
            <div className="qr-placeholder" />
          )}
          <span className="scan-line" />
        </div>
        <div className="qr-copy">
          <span className="number">1</span>
          <h2>Point your phone camera at the QR code</h2>
          <p>This session’s page will open—nothing to install and no sign-in required.</p>
        </div>
      </div>
      <div className="link-row">
        <span className="link-text">{mobileUrl.replace(/^https?:\/\//, "")}</span>
        <button onClick={() => void copy(mobileUrl)}>{copied ? "COPIED ✓" : "COPY LINK"}</button>
      </div>
    </>
  );
}

function DrawingInventory({
  drawings,
  drawingUrl,
  onSelect,
  onRestart,
}: {
  drawings: Drawing[];
  drawingUrl: (drawing: Drawing) => string;
  onSelect: (drawing: Drawing) => void;
  onRestart: () => void;
}) {
  const emptySlots = Math.max(0, INVENTORY_PLACEHOLDER_COUNT - drawings.length);
  return (
    <div className="result-panel">
      <div className="panel-heading">
        <div>
          <span className="live-dot ready" /> SESSION INVENTORY
        </div>
        <span>
          {drawings.length} {drawings.length === 1 ? "ITEM" : "ITEMS"}
        </span>
      </div>
      <div className="inventory-wrap">
        <div className="inventory-hint">Select a drawing to view it</div>
        <div className="inventory-grid">
          {drawings.map((drawing, index) => (
            <button
              className="inventory-slot filled"
              key={drawing.id}
              onClick={() => onSelect(drawing)}
              aria-label={`Open drawing ${drawings.length - index}`}
            >
              <img src={drawingUrl(drawing)} alt="" loading="lazy" />
              <span>{String(drawings.length - index).padStart(2, "0")}</span>
            </button>
          ))}
          {Array.from({ length: emptySlots }, (_, index) => (
            <div className="inventory-slot empty" key={`empty-${index}`}>
              <span>+</span>
            </div>
          ))}
        </div>
      </div>
      <div className="result-actions">
        <span className="inventory-status">Your phone is still connected — add more drawings</span>
        <button className="secondary-button" onClick={onRestart}>
          New session
        </button>
      </div>
    </div>
  );
}
