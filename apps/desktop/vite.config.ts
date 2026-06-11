import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron";
import path from "path";

const workspaceAliases = {
  "@shared": path.resolve(__dirname, "../../shared"),
  "@vantare/ui-core": path.resolve(__dirname, "../../packages/ui-core/src"),
  "@vantare/sim-core": path.resolve(__dirname, "../../packages/sim-core/src"),
  "@vantare/auth": path.resolve(__dirname, "../../packages/auth/src"),
  "@vantare/auth/feature-gate": path.resolve(__dirname, "../../packages/auth/src/feature-gate.ts"),
  "@vantare/auth/types": path.resolve(__dirname, "../../packages/auth/src/types.ts"),
  "@vantare/types": path.resolve(__dirname, "../../packages/types/src"),
};

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: path.resolve(__dirname, "src/main/index.ts"),
        onstart(args) {
          args.startup([".", "--no-sandbox"], { cwd: __dirname });
        },
        vite: {
          resolve: { alias: workspaceAliases },
          build: {
            outDir: path.resolve(__dirname, "dist/main"),
            emptyOutDir: true,
            rollupOptions: {
              external: ["electron", "electron-store", "electron-log", "electron-updater"],
            },
          },
        },
      },
      {
        entry: path.resolve(__dirname, "src/preload/index.ts"),
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, "dist/preload"),
            emptyOutDir: true,
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
    ]),
  ],
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: false,
  },
  resolve: {
    alias: workspaceAliases,
  },
  server: {
    port: 3000,
  },
});
