import { defineConfig } from "vitest/config";
import { contractIndex } from "./scripts/contract-index.ts";

contractIndex();
export default defineConfig({
  test: { include: ["tests/**/*.test.{ts,tsx}"] },
});
