import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overlayRoot = resolve(process.cwd(), "src", "overlay");

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
  it("keeps legacy WidgetVisualHost selection inside harness mode", () => {
    const source = readFileSync(resolve(overlayRoot, "core", "WidgetVisualHost.tsx"), "utf8");
    expect(source).toContain("else if (harnessMode && snapshot)");
    expect(source.match(/definition\.buildViewModel\(/g)).toHaveLength(1);
  });

  it("does not expose V1 authority in any productive Overlay surface", () => {
    for (const path of sourceFiles(overlayRoot)) {
      const relative = path.slice(overlayRoot.length + 1);
      const source = readFileSync(path, "utf8");
      expect(v1AuthorityViolations(relative, source), relative).toEqual([]);
    }
  });

  it("rejects V1 authority mutants across every productive surface", () => {
    const mutants = [
      ["CompositeNext.tsx", "const snapshot: TelemetrySnapshot = input;"],
      ["runtime/NewFrame.tsx", "const rows = snapshot.scoring;"],
      ["edit/NewFrame.tsx", "adaptOverlayProjectionToSnapshot(input);"],
      ["runtime/NewFrame.tsx", "useRateLimitedTelemetry(coordinator, 10);"],
      ["core/NewHost.tsx", "definition.buildViewModel(snapshot, content);"],
    ] as const;

    for (const [relative, source] of mutants) {
      expect(v1AuthorityViolations(relative, source), relative).not.toHaveLength(0);
    }
  });

  it("excludes only tests, fixtures, harness and shadow sources", () => {
    for (const relative of [
      "runtime/NewFrame.test.tsx",
      "authoring/fixtures/sample.ts",
      "telemetry-cutover-runtime-harness/main.ts",
      "telemetry-shadow/comparator.ts",
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
    normalized.startsWith("telemetry-shadow/") ||
    /\.(?:test|spec)\.(?:ts|tsx)$/.test(normalized)
  ) {
    return [];
  }
  if (normalized === "core/WidgetVisualHost.tsx") return [];
  const productiveSurface = normalized.endsWith(".tsx") ||
    normalized.startsWith("runtime/") || normalized.startsWith("edit/");
  if (!productiveSurface) return [];
  const violations: string[] = [];
  if (/\bTelemetrySnapshot\b/.test(source)) violations.push("TelemetrySnapshot");
  if (/\bsnapshot\.scoring\b/.test(source)) violations.push("snapshot.scoring");
  if (/\badaptOverlayProjectionToSnapshot\s*\(/.test(source)) violations.push("projection adapter");
  if (/\buseRateLimitedTelemetry\s*\(/.test(source)) violations.push("legacy telemetry hook");
  if (/\.buildViewModel\s*\(/.test(source)) violations.push("legacy view-model builder");
  return violations;
}
