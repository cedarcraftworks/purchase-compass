import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `vite build --mode pages` produces the static demo for GitHub Pages
// (served under /purchase-compass/, data from public/demo, see .env.pages).
export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "/purchase-compass/" : "/",
  plugins: [react()],
  // In development the API runs on :3000; the proxy keeps the browser on one origin,
  // exactly like production, where nginx forwards /api to the API container.
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
}));
