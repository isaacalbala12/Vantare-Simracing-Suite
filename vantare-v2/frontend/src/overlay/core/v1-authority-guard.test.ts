import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overlayRoot = resolve(process.cwd(), "src", "overlay");

const legacyV1Baseline: Readonly<Record<string, readonly string[]>> = {};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("Overlay V1 authority guard", () => {
  it("keeps WidgetVisualHost free of legacy snapshot selection", () => {
    const source = readFileSync(resolve(overlayRoot, "core", "WidgetVisualHost.tsx"), "utf8");
    expect(source).not.toContain("TelemetrySnapshot");
    expect(source).not.toContain("harnessMode && snapshot");
    expect(source).not.toMatch(/definition\.buildViewModel\(/);
  });

  it("does not add V1 authority beyond the frozen cut 2 inventory", () => {
    for (const path of sourceFiles(overlayRoot)) {
      const relative = path.slice(overlayRoot.length + 1).replaceAll("\\", "/");
      const source = readFileSync(path, "utf8");
      expect(v1AuthorityViolations(relative, source), relative).toEqual(legacyV1Baseline[relative] ?? []);
    }
  });

  it("rejects V1 authority mutants across every productive surface", () => {
    const mutants = [
      ["CompositeNext.tsx", "const snapshot: TelemetrySnapshot = input;"],
      ["runtime/NewFrame.tsx", "const rows = snapshot.scoring;"],
      ["edit/NewFrame.tsx", "adaptOverlayProjectionToSnapshot(input);"],
      ["runtime/NewFrame.tsx", "useRateLimitedTelemetry(coordinator, 10);"],
      ["core/NewHost.tsx", "definition.buildViewModel(snapshot, content);"],
      ["core/nuevo-reader.ts", "const rows = snapshot.scoring;"],
      ["core/telemetry-rate-coordinator.ts", "const rows = snapshot.scoring;"],
    ] as const;

    for (const [relative, source] of mutants) {
      expect(v1AuthorityViolations(relative, source), relative).not.toHaveLength(0);
    }
  });

  it("excludes only tests, fixtures and harness sources", () => {
    for (const relative of [
      "runtime/NewFrame.test.tsx",
      "authoring/fixtures/sample.ts",
      "runtime/example-harness/main.ts",
    ]) {
      expect(
        v1AuthorityViolations(relative, "snapshot.scoring; adaptOverlayProjectionToSnapshot(input);"),
        relative,
      ).toEqual([]);
    }
  });
});

function v1AuthorityViolations(relative: string, source: string): string[] {
  const normalized = relative.replaceAll("\\", "/");
  if (
    /(?:^|\/)fixtures(?:\/|$)/.test(normalized) ||
    /(?:^|\/)[^/]*harness[^/]*(?:\/|$)/.test(normalized) ||
    /\.(?:test|spec)\.(?:ts|tsx)$/.test(normalized)
  ) {
    return [];
  }
  if (!/\.(?:ts|tsx)$/.test(normalized)) return [];
  return [
    [/\bTelemetrySnapshot\b/g, "TelemetrySnapshot"],
    [/\bsnapshot\.scoring\b/g, "snapshot.scoring"],
    [/\badaptOverlayProjectionToSnapshot\s*\(/g, "projection adapter"],
    [/\buseRateLimitedTelemetry\s*\(/g, "legacy telemetry hook"],
    [/\.buildViewModel\s*\(/g, "legacy view-model builder"],
  ].flatMap(([pattern, label]) => Array.from(source.matchAll(pattern as RegExp), () => label as string));
}
