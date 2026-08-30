import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";
import { decodeOverlayUpdateV2 } from "../../telemetry-transport/overlay-frame-v2-store";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import {
  createOverlayV2PlayerInstrumentsComparator,
  resolveOverlayShadowPhase,
} from "./overlay-shadow-comparator";

const GOLDEN = path.resolve(
  process.cwd(),
  "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json",
);

describe("shadow phase segmentation", () => {
  it("classifies the effective phase only when both contracts agree", () => {
    expect(resolveOverlayShadowPhase(legacySnapshot("ready"), source("live"))).toBe("live");
    expect(resolveOverlayShadowPhase(legacySnapshot("stale"), source("stale"))).toBe("stale");
    expect(resolveOverlayShadowPhase(legacySnapshot("disconnected"), source("error"))).toBe("no-frame");
  });

  it("marks a stale<->live flap as a transition instead of a live divergence", () => {
    // Measured on a 54-car AI session: the two producers observe the same
    // freshness edge at different instants for a few frames.
    expect(resolveOverlayShadowPhase(legacySnapshot("ready"), source("stale"))).toBe("transition");
    expect(resolveOverlayShadowPhase(legacySnapshot("stale"), source("live"))).toBe("transition");
    expect(resolveOverlayShadowPhase(legacySnapshot("ready"), source("degraded"))).toBe("transition");
    expect(resolveOverlayShadowPhase(legacySnapshot("ready"), source("error"))).toBe("transition");

    const comparator = createOverlayV2PlayerInstrumentsComparator();
    const frame = goldenFrame();
    // The 153 measured display.status mismatches all arise from this flap.
    comparator.compare({
      legacySnapshot: legacySnapshot("ready"),
      frame,
      source: source("stale"),
      content: { showPosition: false, showClutch: true },
    });
    const summary = comparator.sessionSummary();
    expect(summary.framesByPhase.live).toBe(0);
    expect(summary.framesByPhase.transition).toBe(1);
    expect(summary.mismatches).toBe(0);
    expect(summary.mismatchesByPhase.transition).toBe(0);
    expect(summary.notComparable).toBe(1);
    expect(summary.metrics).toMatchObject({
      'overlay_shadow_not_comparable_total{feature="player-instruments",reason="transition-phase",phase="transition"}': 1,
    });
  });

  it("marks a real S1 stale divergence as not comparable and keeps the live gate clean", () => {
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    const frame = goldenFrame();
    const content = { showPosition: false, showClutch: true } as const;

    // v1 legacy retains the last known gear while the v2 view model hides it:
    // an intentional contract difference, only visible outside the live phase.
    const stale = comparator.compare({
      legacySnapshot: legacySnapshot("stale"),
      frame: { ...frame, player: { ...frame.player, gear: { q: "missing" } } },
      source: source("stale"),
      content,
    });
    expect(stale.phase).toBe("stale");
    expect(stale.equal).toBe(true);
    expect(stale.mismatches).toEqual([]);

    const live = comparator.compare({
      legacySnapshot: legacySnapshot("ready"),
      frame,
      source: source("live"),
      content,
    });
    expect(live.phase).toBe("live");

    const summary = comparator.sessionSummary();
    expect(summary.framesByPhase).toMatchObject({ live: 1, stale: 1 });
    expect(summary.frames).toBe(1);
    expect(summary.mismatches).toBe(summary.mismatchesByPhase.live);
    expect(summary.mismatchesByPhase.stale).toBe(0);
    expect(summary.notComparable).toBe(1);
    expect(summary.declaredDifferences).toBe(1);
    expect(summary.metrics).toMatchObject({
      'overlay_shadow_not_comparable_total{feature="player-instruments",reason="stale-phase",phase="stale"}': 1,
    });
    expect(Object.keys(summary.metrics).every((key) => key.includes('phase="'))).toBe(true);
  });

  it("rotates every accumulator on reset and records the rotation", () => {
    const comparator = createOverlayV2PlayerInstrumentsComparator();
    const frame = goldenFrame();
    comparator.compare({
      legacySnapshot: legacySnapshot("stale"),
      frame: { ...frame, player: { ...frame.player, gear: { q: "missing" } } },
      source: source("stale"),
      content: { showPosition: false, showClutch: true },
    });
    comparator.reset();

    const summary = comparator.sessionSummary();
    expect(summary.declaredDifferences).toBe(0);
    expect(summary.framesByPhase.stale).toBe(0);
    expect(summary.metrics).toEqual({});
    expect(summary.epochResets).toBe(1);
  });
});

function goldenFrame(): OverlayFrameV2 {
  const update = decodeOverlayUpdateV2(JSON.parse(readFileSync(GOLDEN, "utf8")));
  return update.frame as OverlayFrameV2;
}

function source(state: string): OverlaySourceStatusV2 {
  return { state } as OverlaySourceStatusV2;
}

function legacySnapshot(status: TelemetrySnapshot["status"]): TelemetrySnapshot {
  return {
    status,
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
