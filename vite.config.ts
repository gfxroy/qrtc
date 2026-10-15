/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves the build from /qrtc/ (set via VITE_BASE in build:pages).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: { environment: "node", globals: true, include: ["src/**/*.test.ts"] },
});
