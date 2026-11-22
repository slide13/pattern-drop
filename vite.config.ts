import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  // Listen on the LAN so a phone on the same Wi-Fi can open the camera page.
  server: { host: "0.0.0.0" },
  plugins: [vinext()],
});
