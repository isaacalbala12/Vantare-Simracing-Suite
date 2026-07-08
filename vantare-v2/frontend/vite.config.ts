/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const wailsMockPath = path.resolve(
  fileURLToPath(import.meta.url),
  "../src/lib/wails-runtime-mock.ts",
);
const topbarMockPath = path.resolve(
  fileURLToPath(import.meta.url),
  "../src/lib/wails-runtime-topbar-mock.ts",
);

export default defineConfig(() => {
  const useTopbarMock = process.env.VITE_RUNTIME_MOCK === "topbar";
  return {
    plugins: [react(), tailwindcss()],
    server: { strictPort: true, port: 5173 },
    build: { outDir: "dist", emptyOutDir: true },
    resolve: {
      alias: {
        "@wailsio/runtime": useTopbarMock ? topbarMockPath : wailsMockPath,
      },
    },
    test: {
      setupFiles: ["./src/test-setup.ts"],
      environment: "happy-dom",
    },
  };
});
