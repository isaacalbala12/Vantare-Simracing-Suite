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

export default defineConfig(({ mode }) => {
  const runtimeMock = process.env.VITE_RUNTIME_MOCK;
  const useTopbarMock = runtimeMock === "topbar";
  const useWailsMock = runtimeMock === "mock" || runtimeMock === "calendar";
  const isProduction = mode === "production";
  const alias: Record<string, string> = {};
  // Only harnesses opt into the mock runtime. wails3 dev must use the real
  // @wailsio/runtime package so license:validate hits the Go backend.
  if (!isProduction && (useTopbarMock || useWailsMock)) {
    alias["@wailsio/runtime"] = useTopbarMock ? topbarMockPath : wailsMockPath;
  }
  return {
    plugins: [react(), tailwindcss()],
    server: { strictPort: true, port: 5173 },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: path.resolve(fileURLToPath(import.meta.url), "../index.html"),
          overlay: path.resolve(fileURLToPath(import.meta.url), "../overlay.html"),
        },
      },
    },
    resolve: { alias },
    test: {
      setupFiles: ["./src/test-setup.ts"],
      environment: "happy-dom",
      // A test must outlast the waits inside it. Suites that render the Studio
      // raise Testing Library's asyncUtilTimeout to 5s for the async profile
      // load, which is exactly Vitest's default test budget: the test was
      // killed at the same instant its wait ran out, so a slow CI runner
      // aborted a different test on every pass instead of either passing or
      // reporting which element never appeared.
      testTimeout: 20000,
      hookTimeout: 20000,
    },
  };
});
