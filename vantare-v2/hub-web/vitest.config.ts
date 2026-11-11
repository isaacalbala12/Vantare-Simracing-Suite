import { defineConfig } from "vitest/config";
import { contractIndex } from "./scripts/contract-index.ts";

contractIndex();
export default defineConfig({
  define: { __VANTARE_RENDERER_MOCK__: "true" },
  test: { include: ["tests/**/*.test.{ts,tsx}"] },
});
