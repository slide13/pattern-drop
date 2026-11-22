import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders `text` as a QR code data URL; null until it is ready for the current text. */
export function useQrCode(text: string) {
  const [qr, setQr] = useState<{ text: string; data: string } | null>(null);

  useEffect(() => {
    if (!text) return;
    let active = true;
    QRCode.toDataURL(text, {
      width: 320,
      margin: 2,
      color: { dark: "#101111", light: "#ffffff" },
    })
      .then((data) => {
        if (active) setQr({ text, data });
      })
      .catch(() => {
        if (active) setQr(null);
      });
    return () => {
      active = false;
    };
  }, [text]);

  return qr?.text === text ? qr.data : null;
}
