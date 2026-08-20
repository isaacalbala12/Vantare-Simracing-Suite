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

    expect(runtime.sessionSummary().frames).toBe(1);
    expect(playerInstrumentMismatches(runtime.sessionSummary())).toBe(0);

    const nextSequence = { ...frame, sequence: frame.sequence + 1 };
    runtime.acceptLegacy(nextSequence.epoch, nextSequence.sequence, legacySnapshot());
    runtime.acceptOverlayV2(nextSequence, update.source);
    expect(runtime.sessionSummary().frames).toBe(2);
    expect(playerInstrumentMismatches(runtime.sessionSummary())).toBe(0);
  });

  it("keeps pairing while the phase flaps and one side runs ahead", () => {
    // Regression for the measured stall: with a short pending window the two
    // key sets stopped overlapping and pairing froze for ~2 minutes.
    const runtime = createOverlayV2ShadowRuntime();
    const update = decodeOverlayUpdateV2(JSON.parse(readFileSync(path.resolve(
      process.cwd(),
      "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json",
    ), "utf8")));
    const frame = update.frame as OverlayFrameV2;
    const total = 40;

    // The v2 producer runs a full burst ahead before any legacy frame lands.
    for (let index = 0; index < total; index += 1) {
      runtime.acceptOverlayV2(
        { ...frame, sequence: frame.sequence + index },
        { ...update.source, state: index % 3 === 0 ? "stale" : "live" },
      );
    }
    for (let index = 0; index < total; index += 1) {
      runtime.acceptLegacy(frame.epoch, frame.sequence + index, legacySnapshot());
    }

    const summary = runtime.sessionSummary();
    const paired = Object.values(summary.framesByPhase).reduce((total, value) => total + value, 0);
    expect(paired).toBe(total);
    expect(summary.frames).toBeGreaterThan(0);
    expect(playerInstrumentMismatches(summary)).toBe(0);
  });

  it("rotates the accumulators when the stream epoch changes", () => {
    const runtime = createOverlayV2ShadowRuntime();
    const update = decodeOverlayUpdateV2(JSON.parse(readFileSync(path.resolve(
      process.cwd(),
      "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json",
    ), "utf8")));
    const frame = update.frame as OverlayFrameV2;

    runtime.acceptOverlayV2(frame, update.source);
    runtime.acceptLegacy(frame.epoch, frame.sequence, legacySnapshot());
    expect(runtime.sessionSummary().frames).toBe(1);

    const nextEpoch = { ...frame, epoch: frame.epoch + 1 };
    runtime.acceptOverlayV2(nextEpoch, update.source);
    runtime.acceptLegacy(nextEpoch.epoch, nextEpoch.sequence, legacySnapshot());
    expect(runtime.sessionSummary()).toMatchObject({ frames: 1, epochResets: 1 });
  });
});

// The synthetic legacy snapshot carries no scoring, so the standings feature
// legitimately diverges here, and the flapping source puts several frames in
// the transition phase. These tests assert pairing, so they read the anchor
// feature in the live phase only: exactly what the gate reads.
function playerInstrumentMismatches(
  summary: ReturnType<ReturnType<typeof createOverlayV2ShadowRuntime>["sessionSummary"]>,
): number {
  return Object.entries(summary.metrics)
    .filter(([key]) =>
      key.includes('feature="player-instruments"') && key.includes('phase="live"'))
    .reduce((total, [, value]) => total + value, 0);
}

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
