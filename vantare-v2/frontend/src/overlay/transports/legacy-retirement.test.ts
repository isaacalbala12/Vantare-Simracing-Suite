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
      "src/overlay/core/telemetry-store.ts",
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
      "mergePatch",
      "applyMergePatch",
      "merge-patch",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps generated telemetry declarations out of handwritten contracts", () => {
    const generatedPath = path.join(
      frontendRoot,
      "src/generated/telemetry.ts",
    );
    const generated = readFileSync(generatedPath, "utf8");
    expect(generated.startsWith("// DO NOT EDIT —")).toBe(true);

    const generatedNames = [
      ...generated.matchAll(/^export (?:interface|type) ([A-Za-z0-9_]+)/gm),
    ].map((match) => match[1]);
    const contracts = readFileSync(
      path.join(frontendRoot, "src/telemetry-transport/contracts.ts"),
      "utf8",
    );
    expect(contracts).toContain('from "../generated/telemetry"');
    for (const name of generatedNames) {
      expect(
        contracts,
        `src/telemetry-transport/contracts.ts redeclares generated ${name}`,
      ).not.toMatch(
        new RegExp(`^export (?:interface|type) ${name}(?:<[^>]+>)?\\s*[={]`, "m"),
      );
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
