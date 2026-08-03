import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: "manifest.json",
      additionalInputs: ["screenshot-viewer.html", "screenshot-viewer.js", "src/content/index.tsx"],
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
