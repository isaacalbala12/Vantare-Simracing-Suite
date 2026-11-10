import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
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
    plugins: [tailwindcss()],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    root: "src/renderer",
    build: {
      minify: true,
      rollupOptions: { input: resolve("src/renderer/index.html") },
    },
  },
});
