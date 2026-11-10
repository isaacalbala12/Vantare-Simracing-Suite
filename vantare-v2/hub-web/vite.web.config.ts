import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [tailwindcss()],
  root: "src/renderer",
  server: { host: "127.0.0.1" },
});
