/* eslint-disable @next/next/no-img-element -- The preview is a user-generated blob URL. */
import { type ChangeEvent, useRef } from "react";
import { MAX_SOURCE_PHOTO_BYTES } from "./constants";
import { usePhotoUpload } from "./hooks/use-photo-upload";

const MAX_SOURCE_PHOTO_MB = MAX_SOURCE_PHOTO_BYTES / 1024 / 1024;

export default function PhoneCapture({ sessionId }: { sessionId: string }) {
  const { processed, status, busy, processPhoto, sendPhoto } = usePhotoUpload(sessionId);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const openCamera = () => cameraRef.current?.click();
  const openGallery = () => galleryRef.current?.click();
  const failed = status.phase === "error";

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Reset so picking the same file again still fires `change`.
    input.value = "";
    if (file) void processPhoto(file);
  }

  return (
    <main className="phone-shell">
      <header className="phone-header">
        <div className="brand">
          <span className="brand-mark">P</span> PatternDrop
        </div>
        <span className="secure-pill">
          <i /> Session found
        </span>
      </header>
      <section className="capture-card">
        <div className="step">STEP 1 OF 1</div>
        <h1>{processed ? "Review the cutout" : "Photograph your drawing"}</h1>
        <p>
          {processed
            ? "The background was removed on your phone. If it looks right, send it."
            : "Lay the sheet flat, leave some space around the drawing, and photograph it from above - or pick a photo you already took."}
        </p>
        <button
          className={`camera-stage ${processed ? "has-preview" : ""}`}
          onClick={openCamera}
          disabled={busy}
        >
          {processed ? (
            <img src={processed.preview} alt="Drawing after background removal" />
          ) : (
            <>
              <span className="focus-corner corner-a" />
              <span className="focus-corner corner-b" />
              <span className="focus-corner corner-c" />
              <span className="focus-corner corner-d" />
              <span className="camera-icon">●</span>
              <strong>Open camera</strong>
              <small>JPG, PNG, HEIC · up to {MAX_SOURCE_PHOTO_MB} MB</small>
            </>
          )}
        </button>
        <input
          ref={cameraRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={choosePhoto}
          tabIndex={-1}
          aria-hidden="true"
        />
        {/* Without `capture`, phones offer the photo library and files instead of opening the camera. */}
        <input
          ref={galleryRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={choosePhoto}
          tabIndex={-1}
          aria-hidden="true"
        />
        {!processed && (
          <button className="secondary-button gallery-button" onClick={openGallery} disabled={busy}>
            Choose from gallery
          </button>
        )}
        {status.message && (
          <div
            className={`mobile-message ${failed ? "error" : ""}`}
            role={failed ? "alert" : "status"}
          >
            <span aria-hidden="true">{busy ? "↻" : failed ? "!" : "✓"}</span>
            {status.message}
          </div>
        )}
        {processed && (
          <div className="mobile-actions">
            <button className="secondary-button" onClick={openCamera} disabled={busy}>
              Retake
            </button>
            <button className="secondary-button" onClick={openGallery} disabled={busy}>
              Gallery
            </button>
            <button className="primary-button" onClick={sendPhoto} disabled={busy}>
              {busy ? "Sending…" : "Send →"}
            </button>
          </div>
        )}
      </section>
      <p className="privacy-note">No sign-in · photo processing stays on your device</p>
    </main>
  );
}
