import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-wails-redline-custody-assets",
      closeBundle() {
        const output = fileURLToPath(
          new URL("../tools/benchmarks/isa760-wails-redline/host/bundle", import.meta.url),
        );
        mkdirSync(`${output}/fonts`, { recursive: true });
        cpSync(
          fileURLToPath(new URL("./public/fonts", import.meta.url)),
          `${output}/fonts`,
          { recursive: true },
        );
        cpSync(
          fileURLToPath(
            new URL("../tools/benchmarks/isa760-wails-redline/replay", import.meta.url),
          ),
          output,
          { recursive: true },
        );
        cpSync(`${output}/wails-redline-benchmark.html`, `${output}/index.html`);
        writeFileSync(`${output}/.gitkeep`, "\n");
      },
    },
  ],
  publicDir: false,
  build: {
    outDir: fileURLToPath(
      new URL("../tools/benchmarks/isa760-wails-redline/host/bundle", import.meta.url),
    ),
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./wails-redline-benchmark.html", import.meta.url)),
    },
  },
});
