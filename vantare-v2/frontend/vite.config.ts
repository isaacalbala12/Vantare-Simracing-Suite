/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { strictPort: true, port: 5173 },
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    setupFiles: ["./src/test-setup.ts"],
    environment: "happy-dom",
  },
});
