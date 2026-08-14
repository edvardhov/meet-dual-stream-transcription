import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
        input: {
          offscreen: resolve(__dirname, "offscreen.html"),
          permission: resolve(__dirname, "src/permission/index.html"),
          "meet-observer": resolve(__dirname, "src/content/meet-observer.ts"),
        },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "meet-observer") return "assets/meet-observer.js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
  test: {
    environment: "node",
  },
});
