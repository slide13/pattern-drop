/** Address the QR code points phones at; falls back to the page's own origin. */
export const CONFIGURED_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
