import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../../generated/telemetry";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import { racingFlagsDefinition } from "../widget-types/racing-flags/racing-flags-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { buildStandingsViewModelV2 } from "../widget-types/standings/standings-view-model-v2";
import {
  OVERLAY_V2_STANDINGS_DECLARED_GAPS,
  compareStandingsModels,
  createOverlayV2PlayerInstrumentsComparator,
} from "./overlay-shadow-comparator";

const STANDINGS_CONTENT = standingsDefinition.parseContent({
  classScope: "all-classes",
  rowCount: 20,
});
const FLAGS_CONTENT = racingFlagsDefinition.parseContent({});

describe("shadow comparator: session and standings features", () => {
  it("omits currentLapText when the S1 shadow column is hidden but keeps visible laps exact", () => {
    const evidence = JSON.parse(readFileSync(path.resolve(
      process.cwd(),
      "src/overlay/telemetry-shadow/testdata/s1-on-20260830-185729.json",
    ), "utf8")) as { shadow: { metrics: Record<string, number> } };
    expect(evidence.shadow.metrics[
      'overlay_shadow_mismatches_total{feature="standings",field="rows[].currentLapText",phase="live"}'
    ]).toBe(2);

    const update = golden(1);
    if (!update.frame) throw new Error("golden frame missing");
    const hidden = buildStandingsViewModelV2(update.frame, update.source, STANDINGS_CONTENT);
    expect(hidden.rows[0]?.currentLapText).toBe("");

    const visibleContent = {
      ...STANDINGS_CONTENT,
      columns: STANDINGS_CONTENT.columns.map((column) =>
        column.metricId === "currentLap" ? { ...column, enabled: true } : column,
      ),
    };
    const visible = buildStandingsViewModelV2(update.frame, update.source, visibleContent);
    expect(visible.rows[0]?.currentLapText).toBe("127");
    const changed = {
      ...visible,
      rows: visible.rows.map((row, index) => index === 0 ? { ...row, currentLapText: "126" } : row),
    };
    expect(compareStandingsModels(visible, changed)).toContain("rows[].currentLapText");
  });

  it("labels every metric with its feature and phase", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    const comparator = createOverlayV2PlayerInstrumentsComparator();

    comparator.compareSession({
      legacySnapshot: legacy(),
      frame: update.frame,
      source: update.source,
      content: FLAGS_CONTENT,
    });
    comparator.compareStandings({
      legacySnapshot: legacy(),
      frame: update.frame,
      source: update.source,
      content: STANDINGS_CONTENT,
    });

    const summary = comparator.sessionSummary();
    // framesByPhase counts paired frames through the anchor feature, so the
    // two extra feature comparisons must not inflate the gate denominator.
    expect(summary.framesByPhase.live).toBe(0);
    for (const key of Object.keys(summary.metrics)) {
      expect(key).toMatch(/^overlay_shadow_mismatches_total\{feature="(session|standings)",field=".+",phase="live"\}$/);
    }
  });

  it("agrees with v1 on the absent flag, so the session feature has no live mismatch", () => {
    const update = golden(1);
    if (!update.frame) throw new Error("golden frame missing");
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    const result = comparator.compareSession({
      legacySnapshot: legacy(),
      frame: update.frame,
      source: update.source,
      content: FLAGS_CONTENT,
    });
    expect(result.phase).toBe("live");
    expect(result.mismatches).toEqual([]);
  });

  it("treats the row order as significant", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    const model = buildStandingsViewModelV2(update.frame, update.source, STANDINGS_CONTENT);
    const swapped = {
      ...model,
      rows: [model.rows[1], model.rows[0], ...model.rows.slice(2)],
    };
    expect(compareStandingsModels(model, model)).toEqual([]);
    expect(compareStandingsModels(model, swapped)).toContain("rows.order");
  });

  it("reports a per-row value divergence keyed by identity, not by index", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    const model = buildStandingsViewModelV2(update.frame, update.source, STANDINGS_CONTENT);
    const changed = {
      ...model,
      rows: model.rows.map((row, index) =>
        index === 3 ? { ...row, driverName: "PII_OTHER_DRIVER" } : row,
      ),
    };
    const mismatches = compareStandingsModels(model, changed);
    expect(mismatches).toContain("rows[].driverName");
    expect(mismatches).not.toContain("rows.order");
  });

  it("declares the fields without a canonical signal instead of comparing them", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    const model = buildStandingsViewModelV2(update.frame, update.source, STANDINGS_CONTENT);
    const stripped = {
      ...model,
      rows: model.rows.map((row) => ({
        ...row,
        driverNumber: "42",
        teamCode: "TEAM",
        teamBrandColor: "#fff",
        tireCompound: "soft",
        bestLapText: "1:30.000",
        intervalText: "+1.000s",
      })),
    };
    expect(compareStandingsModels(model, stripped)).toEqual([]);
    expect(OVERLAY_V2_STANDINGS_DECLARED_GAPS).toContain("rows[].bestLapText");
  });
});

function golden(vehicles: number): OverlayUpdateV2 {
  return JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")) as OverlayUpdateV2;
}

function legacy(): TelemetrySnapshot {
  return {
    status: "ready",
    capturedAt: Date.parse("2026-08-19T12:00:02Z"),
    session: { type: "race", trackName: "Sebring" },
    player: { inPit: false },
    scoring: [],
  };
}
