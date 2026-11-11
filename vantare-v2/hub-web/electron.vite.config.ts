import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";
import { contractIndex } from "./scripts/contract-index.ts";

const qa = process.env.VANTARE_HUB_QA_BUILD === "1";
const output = qa ? "out-qa" : "out";
contractIndex();
export default defineConfig({
  main: {
    define: { __VANTARE_QA_DRIVER__: JSON.stringify(qa) },
    build: {
      outDir: resolve(output, "main"),
      rollupOptions: { input: resolve("src/main/index.ts") },
    },
  },
  preload: {
    build: {
      outDir: resolve(output, "preload"),
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
      outDir: resolve(output, "renderer"),
      minify: true,
      rollupOptions: { input: resolve("src/renderer/index.html") },
    },
  },
});
