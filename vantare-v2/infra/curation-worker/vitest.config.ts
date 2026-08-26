import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          BUILD_ADMISSION_TOKEN: "unit-test-only-build-token-0123456789",
          HASH_PEPPER: "unit-test-only-hash-pepper-0123456789",
          QUOTA_GLOBAL_DAY_OBJECTS: "3",
        },
      },
    }),
  ],
});
