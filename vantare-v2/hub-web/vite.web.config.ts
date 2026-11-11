import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { contractIndex } from "./scripts/contract-index.ts";

contractIndex();
export default defineConfig({
  define: { __VANTARE_RENDERER_MOCK__: "true" },
  plugins: [tailwindcss()],
  root: "src/renderer",
  server: { host: "127.0.0.1" },
});
