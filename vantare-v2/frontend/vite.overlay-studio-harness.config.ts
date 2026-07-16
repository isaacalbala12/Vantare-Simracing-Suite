import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { overlayStudioHarnessBrowserViewPlugin } from "./overlay-studio-harness-vite-plugin";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  mode: "overlay-studio-harness",
  plugins: [react(), tailwindcss(), overlayStudioHarnessBrowserViewPlugin()],
  server: { strictPort: true, port: 5176 },
  resolve: {
    alias: {
      "@wailsio/runtime": path.resolve(rootDir, "src/lib/wails-runtime-mock.ts"),
    },
  },
});