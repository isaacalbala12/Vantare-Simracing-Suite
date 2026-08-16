/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  mode: "escala-harness",
  plugins: [react(), tailwindcss()],
  server: { strictPort: true, port: 5191 },
  resolve: {
    alias: {
      "@wailsio/runtime": path.resolve(__dirname, "src/lib/wails-runtime-mock.ts"),
    },
  },
});
