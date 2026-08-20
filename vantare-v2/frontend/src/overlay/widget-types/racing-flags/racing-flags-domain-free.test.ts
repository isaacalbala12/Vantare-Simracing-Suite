import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../../../generated/telemetry";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  OVERLAY_V2_SESSION,
  hasOverlayV2Feature,
} from "../../telemetry-shadow/overlay-v2-features";
import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import { buildRacingFlagsViewModel } from "./racing-flags-view-model";
import {
  buildRacingFlagsViewModelV2,
  racingFlagsDisplayedValues,
} from "./racing-flags-view-model-v2";

const CONTENT = { showSectorFlags: true, hideWhenGreen: true } as const;

const LEGACY: TelemetrySnapshot = {
  status: "ready",
  capturedAt: Date.parse("2026-08-19T12:00:02Z"),
  session: { type: "race", trackName: "Sebring" },
  player: { inPit: false },
  scoring: [],
};

describe("racing-flags v2 view model", () => {
  it("is off by default and only opts in through the feature flag", () => {
    expect(DEFAULT_OVERLAY_V2_FEATURES).toEqual([]);
    expect(hasOverlayV2Feature(undefined, OVERLAY_V2_SESSION)).toBe(false);
    expect(hasOverlayV2Feature([OVERLAY_V2_SESSION], OVERLAY_V2_SESSION)).toBe(true);
  });

  it.each([1, 20, 44, 104])(
    "matches the displayed v1 values for the %i-vehicle Go golden",
    (vehicles) => {
      const update = golden(vehicles);
      if (!update.frame) throw new Error("golden frame missing");
      const legacy = racingFlagsDisplayedValues(buildRacingFlagsViewModel(LEGACY, CONTENT));
      const overlayV2 = racingFlagsDisplayedValues(
        buildRacingFlagsViewModelV2(update.frame, update.source, CONTENT),
      );
      expect(overlayV2).toEqual(legacy);
    },
  );

  it("keeps the flag absent while the canonical state has no flag signal", () => {
    const update = golden(1);
    if (!update.frame) throw new Error("golden frame missing");
    expect(update.frame.session.flag.q).toBe("missing");
    const model = buildRacingFlagsViewModelV2(update.frame, update.source, CONTENT);
    expect(model.globalFlag).toBeUndefined();
    expect(model.sectorFlags).toEqual([]);
    expect(model.hidden).toBe(false);
  });

  it("reads only the session slice: no vehicle, scoring or history input", () => {
    const update = golden(104);
    if (!update.frame) throw new Error("golden frame missing");
    const sessionOnly = {
      ...update.frame,
      standings: [],
      relative: [],
      player: { ...update.frame.player, gear: { q: "missing" as const } },
    };
    expect(buildRacingFlagsViewModelV2(sessionOnly, update.source, CONTENT)).toEqual(
      buildRacingFlagsViewModelV2(update.frame, update.source, CONTENT),
    );
  });

  it("propagates the source lifecycle without inventing a flag", () => {
    const update = golden(1);
    if (!update.frame) throw new Error("golden frame missing");
    const stale = buildRacingFlagsViewModelV2(update.frame, { state: "stale" }, CONTENT);
    expect(stale.status).toBe("stale");
    const stopped = buildRacingFlagsViewModelV2(update.frame, { state: "stopped" }, CONTENT);
    expect(stopped.status).toBe("disconnected");
    expect(stopped.globalFlag).toBeUndefined();
  });
});

function golden(vehicles: number): OverlayUpdateV2 {
  return JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")) as OverlayUpdateV2;
}
