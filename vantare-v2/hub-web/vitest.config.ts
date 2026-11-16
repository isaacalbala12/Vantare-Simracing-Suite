import os from "node:os";
import { defineConfig } from "vitest/config";
import { contractIndex } from "./scripts/contract-index.ts";

contractIndex();

// Locally Vitest starts availableParallelism() - 1 workers (7 on this 8-CPU
// server) and each one pays the cold import of the test graph and jsdom. With
// 16 GB that cold start reached the hard-coded 60 s worker start timeout
// (#2442). Threads reuse the process (16.9 s vs 26.2 s cold for the heaviest
// file) and the worker cap keeps simultaneous cold starts low. In CI the
// workers stay at Vitest's default.
const localMaxWorkers = Math.max(
  1,
  Math.min(
    os.availableParallelism() - 1,
    Math.round(os.totalmem() / (8 * 1024 ** 3)),
  ),
);
const ci = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  define: { __VANTARE_RENDERER_MOCK__: "true" },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    pool: "threads",
    maxWorkers: ci ? undefined : localMaxWorkers,
  },
});
