import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
export default defineConfig({
  main: { build: { rollupOptions: { input: resolve("src/main/index.ts") } } },
  preload: {
    build: {
      rollupOptions: {
        input: resolve("src/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
