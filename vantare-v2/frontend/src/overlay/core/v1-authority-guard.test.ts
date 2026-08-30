import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overlayRoot = resolve(process.cwd(), "src", "overlay");

// Corte 2 no está autorizado: este inventario exacto conserva los artefactos
// legacy ya existentes, pero cualquier referencia o fichero adicional falla.
const legacyV1Baseline: Readonly<Record<string, readonly string[]>> = {
  "core/derived-telemetry-store.ts": ["TelemetrySnapshot", "TelemetrySnapshot", "TelemetrySnapshot"],
  "core/mock-scenarios.ts": ["TelemetrySnapshot", "TelemetrySnapshot", "TelemetrySnapshot"],
  "core/overlay-v2-view-models.ts": ["TelemetrySnapshot"],
  "core/telemetry-adapter.ts": Array(7).fill("TelemetrySnapshot"),
  "core/telemetry-rate-coordinator.ts": Array(4).fill("TelemetrySnapshot"),
  "core/telemetry-snapshot.ts": ["TelemetrySnapshot"],
  "core/widget-definition.ts": Array(4).fill("TelemetrySnapshot"),
  "core/WidgetVisualHost.tsx": ["TelemetrySnapshot", "TelemetrySnapshot", "legacy view-model builder"],
  "projection/overlay-projection-adapter.ts": [...Array(8).fill("TelemetrySnapshot"), "projection adapter"],
  "transports/projection-observer.ts": ["projection adapter"],
  "transports/projection-telemetry-adapter.ts": Array(3).fill("TelemetrySnapshot"),
  "widget-types/broadcast-tower/broadcast-tower-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot", "snapshot.scoring"],
  "widget-types/car-damage-numbers/car-damage-numbers-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/car-damage-visual/car-damage-visual-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/delta/delta-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot", "TelemetrySnapshot", "snapshot.scoring"],
  "widget-types/delta-advanced/delta-advanced-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/delta-trace/delta-trace-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/fuel-strategy/fuel-strategy-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/head-to-head/head-to-head-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot", "snapshot.scoring"],
  "widget-types/input-telemetry/input-telemetry-accumulator.ts": Array(5).fill("TelemetrySnapshot"),
  "widget-types/input-telemetry/input-telemetry-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/multiclass-relative/multiclass-relative-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot", "snapshot.scoring"],
  "widget-types/pedals/pedals-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/pedals-telemetry/pedals-telemetry-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot", "TelemetrySnapshot", "snapshot.scoring"],
  "widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/racing-flags/racing-flags-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/relative/relative-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot", "snapshot.scoring"],
  "widget-types/shared/damage-reader.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
  "widget-types/standings/standings-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot", "TelemetrySnapshot", "snapshot.scoring"],
  "widget-types/track-map/track-map-view-model.ts": [...Array(7).fill("TelemetrySnapshot"), "snapshot.scoring"],
  "widget-types/track-weather/track-weather-view-model.ts": ["TelemetrySnapshot", "TelemetrySnapshot"],
};

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
  if (!/\.(?:ts|tsx)$/.test(normalized)) return [];
  return [
    [/\bTelemetrySnapshot\b/g, "TelemetrySnapshot"],
    [/\bsnapshot\.scoring\b/g, "snapshot.scoring"],
    [/\badaptOverlayProjectionToSnapshot\s*\(/g, "projection adapter"],
    [/\buseRateLimitedTelemetry\s*\(/g, "legacy telemetry hook"],
    [/\.buildViewModel\s*\(/g, "legacy view-model builder"],
  ].flatMap(([pattern, label]) => Array.from(source.matchAll(pattern as RegExp), () => label as string));
}
