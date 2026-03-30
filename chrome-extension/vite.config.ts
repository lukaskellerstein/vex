import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: "manifest.json",
      additionalInputs: ["screenshot-viewer.html", "screenshot-viewer.js"],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
  esbuild: {
    charset: "ascii",
  },
});
