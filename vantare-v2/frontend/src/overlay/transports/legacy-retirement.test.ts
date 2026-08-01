import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(process.cwd());

describe("telemetry frontend retirement", () => {
  it("keeps retired entrypoints and adapters absent", () => {
    for (const relative of [
      "src/overlay/App.tsx",
      "src/overlay/transports/wails-telemetry-adapter.ts",
      "src/overlay/transports/sse-telemetry-adapter.ts",
      "src/overlay/transports/projection-shadow-adapter.ts",
      "src/telemetry-shadow-runtime-harness/main.ts",
      "telemetry-shadow-runtime-harness.html",
      "scripts/telemetry-shadow-runtimes.playwright.mjs",
    ]) {
      expect(existsSync(path.join(frontendRoot, relative)), relative).toBe(false);
    }
  });

  it("keeps production TypeScript free of legacy selectors and transports", () => {
    const files = productionTypeScriptFiles(path.join(frontendRoot, "src"));
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    for (const forbidden of [
      "telemetry:update",
      "telemetry:source-status",
      "/telemetry/stream",
      "normalizeLegacyTelemetry",
      "createWailsTelemetryAdapter",
      "createSseTelemetryAdapter",
      "createShadowedTelemetryAdapter",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});

function productionTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...productionTypeScriptFiles(absolute));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}
