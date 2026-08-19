import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2 } from "../../generated/telemetry";
import { decodeOverlayUpdateV2 } from "../../telemetry-transport/overlay-frame-v2-store";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import { createOverlayV2ShadowRuntime } from "./overlay-v2-shadow-runtime";

describe("Overlay v2 shadow runtime", () => {
  it("compares only matching sequences regardless of arrival order", () => {
    const runtime = createOverlayV2ShadowRuntime();
    const update = decodeOverlayUpdateV2(JSON.parse(readFileSync(path.resolve(
      process.cwd(),
      "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json",
    ), "utf8")));
    const frame = update.frame as OverlayFrameV2;

    runtime.acceptOverlayV2(frame, update.source);
    expect(runtime.sessionSummary().frames).toBe(0);
    runtime.acceptLegacy(frame.epoch, frame.sequence, legacySnapshot());

    expect(runtime.sessionSummary()).toMatchObject({ frames: 1, mismatches: 0 });

    const nextEpoch = { ...frame, epoch: frame.epoch + 1 };
    runtime.acceptLegacy(nextEpoch.epoch, nextEpoch.sequence, legacySnapshot());
    runtime.acceptOverlayV2(nextEpoch, update.source);
    expect(runtime.sessionSummary()).toMatchObject({ frames: 2, mismatches: 0 });
  });
});

function legacySnapshot(): TelemetrySnapshot {
  return {
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
}
