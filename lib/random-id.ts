// crypto.randomUUID exists only in secure contexts, but the desktop page is often
// opened over plain HTTP on a LAN address.
export function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
