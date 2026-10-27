import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs on :3000; the proxy keeps the browser on one origin,
// exactly like production, where nginx forwards /api to the API container.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
