import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../../generated/telemetry";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import type { PedalsTelemetryContent } from "../widget-types/pedals-telemetry/pedals-telemetry-definition";
import { buildPedalsTelemetryViewModel } from "../widget-types/pedals-telemetry/pedals-telemetry-view-model";
import {
  buildPedalsTelemetryViewModelV2,
  pedalsTelemetryDisplayedValues,
} from "../widget-types/pedals-telemetry/pedals-telemetry-view-model-v2";
import { createOverlayV2PlayerInstrumentsComparator } from "./overlay-shadow-comparator";

const CONTENT: PedalsTelemetryContent = { showPosition: false, showClutch: true };
const LEGACY: TelemetrySnapshot = {
  status: "ready",
  capturedAt: Date.parse("2026-08-19T12:00:02Z"),
  session: { type: "race", trackName: "Sebring" },
  player: {
    inPit: false,
    speedKph: 180,
    rpm: 7_200,
    gear: 4,
    throttle: 0.75,
    brake: 0.125,
    clutch: 0,
  },
  scoring: [],
};

describe("OverlayFrame v2 player-instruments parity", () => {
  it.each([1, 20, 44, 104])("matches displayed v1 bytes for the %i-vehicle Go golden", (vehicles) => {
    const update = golden(vehicles);
    if (!update.frame) throw new Error("golden frame missing");
    const legacy = pedalsTelemetryDisplayedValues(buildPedalsTelemetryViewModel(LEGACY, CONTENT));
    const overlayV2 = pedalsTelemetryDisplayedValues(
      buildPedalsTelemetryViewModelV2(update.frame, update.source, CONTENT),
    );
    expect(JSON.stringify(overlayV2)).toBe(JSON.stringify(legacy));
  });

  it("counts mismatches per field and exports a bounded session summary", () => {
    const update = golden(1);
    if (!update.frame) throw new Error("golden frame missing");
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    expect(comparator.compare({ legacySnapshot: LEGACY, frame: update.frame, source: update.source, content: CONTENT }).equal).toBe(true);
    const changed = {
      ...update.frame,
      player: { ...update.frame.player, speed: { v: 51, q: "fresh" as const } },
    };
    expect(comparator.compare({ legacySnapshot: LEGACY, frame: changed, source: update.source, content: CONTENT }).equal).toBe(false);
    expect(comparator.sessionSummary()).toEqual({
      frames: 2,
      mismatches: 2,
      declaredDifferences: 0,
      notComparable: 0,
      framesByPhase: { live: 2, stale: 0, degraded: 0, "no-frame": 0, transition: 0 },
      mismatchesByPhase: { live: 2, stale: 0, degraded: 0, "no-frame": 0, transition: 0 },
      epochResets: 0,
      metrics: {
        'overlay_shadow_mismatches_total{feature="player-instruments",field="display.speed",phase="live"}': 1,
        'overlay_shadow_mismatches_total{feature="player-instruments",field="speedKph",phase="live"}': 1,
      },
    });
  });
});

function golden(vehicles: number): OverlayUpdateV2 {
  return JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")) as OverlayUpdateV2;
}
