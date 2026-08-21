"use client";
/* eslint-disable @next/next/no-img-element -- QR data URLs and user-generated blob URLs are intentionally unoptimized. */

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

type SessionState = { status: "waiting" | "uploaded"; updatedAt?: string; width?: number; height?: number };
type ProcessedImage = { blob: Blob; preview: string; width: number; height: number };
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

function makeSessionId() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

// Удаление фона работает полностью на устройстве — без AI и внешних API.
async function cutOutPaper(file: File): Promise<ProcessedImage> {
  if (file.size > 12 * 1024 * 1024) throw new Error("Файл больше 12 МБ");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Не удалось обработать изображение");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const image = context.getImageData(0, 0, width, height);
  const corner = Math.max(4, Math.round(Math.min(width, height) * 0.035));
  const starts = [[0, 0], [width - corner, 0], [0, height - corner], [width - corner, height - corner]];
  let red = 0, green = 0, blue = 0, samples = 0;
  for (const [startX, startY] of starts) {
    for (let y = startY; y < startY + corner; y += 2) {
      for (let x = startX; x < startX + corner; x += 2) {
        const i = (y * width + x) * 4;
        red += image.data[i]; green += image.data[i + 1]; blue += image.data[i + 2]; samples++;
      }
    }
  }
  red /= samples; green /= samples; blue /= samples;

  let left = width, top = height, right = 0, bottom = 0;
  const threshold = 46, feather = 24;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const distance = Math.sqrt((image.data[i] - red) ** 2 + (image.data[i + 1] - green) ** 2 + (image.data[i + 2] - blue) ** 2);
      if (distance < threshold) image.data[i + 3] = 0;
      else if (distance < threshold + feather) image.data[i + 3] = Math.round(((distance - threshold) / feather) * 255);
      if (image.data[i + 3] > 28) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  context.putImageData(image, 0, 0);
  if (left > right || top > bottom) { left = 0; top = 0; right = width - 1; bottom = height - 1; }
  const padding = Math.round(Math.min(width, height) * 0.025);
  left = Math.max(0, left - padding); top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding); bottom = Math.min(height - 1, bottom + padding);

  const cropped = document.createElement("canvas");
  cropped.width = right - left + 1; cropped.height = bottom - top + 1;
  cropped.getContext("2d")?.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  const blob = await new Promise<Blob>((resolve, reject) => cropped.toBlob(value => value ? resolve(value) : reject(new Error("Ошибка экспорта")), "image/png"));
  return { blob, preview: URL.createObjectURL(blob), width: cropped.width, height: cropped.height };
}

export default function Studio() {
  const [sessionId, setSessionId] = useState("");
  const [isCamera, setIsCamera] = useState(false);
  const [session, setSession] = useState<SessionState>({ status: "waiting" });
  const [qr, setQr] = useState("");
  const [processed, setProcessed] = useState<ProcessedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const existing = params.get("session");
      const id = existing || makeSessionId();
      setSessionId(id);
      setIsCamera(params.get("mode") === "camera");
      if (!existing) window.history.replaceState({}, "", `?session=${id}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const mobileUrl = useMemo(() => {
    if (!sessionId || typeof window === "undefined") return "";
    const siteUrl = configuredSiteUrl || window.location.origin;
    return `${siteUrl}${window.location.pathname}?session=${sessionId}&mode=camera`;
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) fetch(`/api/sessions/${sessionId}`, { method: "POST" }).catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    if (!mobileUrl || isCamera) return;
    QRCode.toDataURL(mobileUrl, { width: 320, margin: 2, color: { dark: "#101111", light: "#ffffff" } }).then(setQr);
  }, [mobileUrl, isCamera]);

  useEffect(() => {
    if (!sessionId || isCamera) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
        if (response.ok && active) setSession(await response.json());
      } catch { /* следующая проверка повторит запрос */ }
    };
    check();
    const timer = window.setInterval(check, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [sessionId, isCamera]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setMessage("Отделяем рисунок от фона…");
    try {
      const result = await cutOutPaper(file);
      if (processed) URL.revokeObjectURL(processed.preview);
      setProcessed(result); setMessage("Готово. Проверьте результат.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось обработать фото"); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function sendPhoto() {
    if (!processed) return;
    setBusy(true); setMessage("Отправляем на компьютер…");
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "content-type": "image/png", "x-image-width": String(processed.width), "x-image-height": String(processed.height) },
        body: processed.blob,
      });
      if (!response.ok) throw new Error("Сервер не принял изображение");
      setMessage("Рисунок уже на компьютере ✓");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось отправить фото"); }
    finally { setBusy(false); }
  }

  function restart() {
    const id = makeSessionId();
    setSessionId(id); setSession({ status: "waiting" }); setProcessed(null);
    window.history.replaceState({}, "", `?session=${id}`);
  }

  if (!sessionId) return <main className="loading">Подготавливаем студию…</main>;

  if (isCamera) return (
    <main className="phone-shell">
      <header className="phone-header">
        <div className="brand"><span className="brand-mark">P</span> PatternDrop</div>
        <span className="secure-pill"><i /> Сессия найдена</span>
      </header>
      <section className="capture-card">
        <div className="step">ШАГ 1 ИЗ 1</div>
        <h1>{processed ? "Проверьте вырезку" : "Сфотографируйте рисунок"}</h1>
        <p>{processed ? "Фон удалён прямо на телефоне. Если всё хорошо — отправляйте." : "Положите лист ровно, оставьте немного воздуха по краям и снимайте сверху."}</p>
        <button className={`camera-stage ${processed ? "has-preview" : ""}`} onClick={() => inputRef.current?.click()} disabled={busy}>
          {processed ? <img src={processed.preview} alt="Рисунок после удаления фона" /> : <>
            <span className="focus-corner corner-a" /><span className="focus-corner corner-b" /><span className="focus-corner corner-c" /><span className="focus-corner corner-d" />
            <span className="camera-icon">●</span><strong>Открыть камеру</strong><small>JPG, PNG · до 12 МБ</small>
          </>}
        </button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={choosePhoto} />
        {message && <div className="mobile-message" role="status"><span>{busy ? "↻" : "✓"}</span>{message}</div>}
        {processed && <div className="mobile-actions">
          <button className="secondary-button" onClick={() => inputRef.current?.click()} disabled={busy}>Переснять</button>
          <button className="primary-button" onClick={sendPhoto} disabled={busy}>{busy ? "Отправляем…" : "Отправить →"}</button>
        </div>}
      </section>
      <p className="privacy-note">Без входа · обработка фото на устройстве</p>
    </main>
  );

  const imageUrl = session.status === "uploaded" ? `/api/sessions/${sessionId}/image?v=${encodeURIComponent(session.updatedAt || "1")}` : "";
  return (
    <main className="desktop-shell">
      <nav className="topbar">
        <div className="brand"><span className="brand-mark">P</span> PatternDrop <b>BETA</b></div>
        <div className="session-code">СЕССИЯ <span>{sessionId.slice(0, 4).toUpperCase()} · {sessionId.slice(4, 8).toUpperCase()}</span></div>
      </nav>
      <section className="workspace">
        <div className="intro">
          <div className="eyebrow"><span>01</span> ПЕРЕНЕСИТЕ ЭСКИЗ</div>
          <h1>Из бумаги —<br /><em>на экран.</em></h1>
          <p>Сфотографируйте рисунок одежды на телефон. Фон исчезнет, и результат сразу появится здесь.</p>
          <div className="promise-list"><span><b>01</b> Без входа</span><span><b>02</b> Автообрезка</span><span><b>03</b> Мгновенно</span></div>
        </div>
        <div className="transfer-panel">
          {session.status === "waiting" ? <>
            <div className="panel-heading"><div><span className="live-dot" /> ЖДЁМ ФОТО</div><span>≈ 30 СЕК</span></div>
            <div className="qr-zone">
              <div className="qr-card">{qr ? <img src={qr} alt="QR-код для открытия камеры на телефоне" /> : <div className="qr-placeholder" />}<span className="scan-line" /></div>
              <div className="qr-copy"><span className="number">1</span><h2>Наведите камеру телефона на QR-код</h2><p>Откроется страница именно этой сессии — ничего устанавливать и входить не нужно.</p></div>
            </div>
            <div className="link-row"><span className="link-text">{mobileUrl.replace(/^https?:\/\//, "")}</span><button onClick={async () => { await navigator.clipboard.writeText(mobileUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>{copied ? "СКОПИРОВАНО ✓" : "КОПИРОВАТЬ ССЫЛКУ"}</button></div>
          </> : <div className="result-panel">
            <div className="panel-heading"><div><span className="live-dot ready" /> РИСУНОК ПОЛУЧЕН</div><span>{session.width} × {session.height} PX</span></div>
            <div className="result-stage"><img src={imageUrl} alt="Загруженный рисунок одежды без фона" /><span className="result-label">ФОН УДАЛЁН</span></div>
            <div className="result-actions"><a href={imageUrl} download={`pattern-${sessionId}.png`} className="primary-button">Скачать PNG ↓</a><button className="secondary-button" onClick={restart}>Новый рисунок</button></div>
          </div>}
        </div>
      </section>
      <footer><span>PATTERNDROP / 2026</span><span>БЕЗ CHATGPT · ФАЙЛЫ УДАЛЯЮТСЯ ЧЕРЕЗ 24 ЧАСА</span></footer>
    </main>
  );
}
