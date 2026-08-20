import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  OVERLAY_V2_DELTA,
  hasOverlayV2Feature,
} from "../../telemetry-shadow/overlay-v2-features";
import { deltaDefinition } from "./delta-definition";
import {
  OVERLAY_V2_DELTA_DECLARED_GAPS,
  buildDeltaViewModelV2,
  deltaDisplayedValues,
  deltaEffectiveReference,
  deltaHonoursRequest,
} from "./delta-view-model-v2";

const CONTENT = deltaDefinition.parseContent({ reference: "personal-best" });

describe("delta v2 view model", () => {
  it("is off by default and only opts in through the feature flag", () => {
    expect(DEFAULT_OVERLAY_V2_FEATURES).toEqual([]);
    expect(hasOverlayV2Feature(undefined, OVERLAY_V2_DELTA)).toBe(false);
    expect(hasOverlayV2Feature([OVERLAY_V2_DELTA], OVERLAY_V2_DELTA)).toBe(true);
  });

  it("renders the reference resolved in Go without choosing one itself", () => {
    const frame = withDelta(golden(20), {
      seconds: { v: -0.238, q: "fresh" },
      reference: "session-best",
      requested: "personal-best",
      available: ["session-best"],
    });
    const model = buildDeltaViewModelV2(frame, { state: "live" }, CONTENT);

    expect(model.deltaText).toBe("-0.238");
    expect(model.tone).toBe("gaining");
    expect(model.progress).toBeCloseTo(-0.119, 9);
    expect(model.splitText).toBe("-0.238");
    expect(deltaEffectiveReference(frame)).toBe("session-best");
    // The widget asked for the personal best and the frame could not honour it:
    // the model renders what the frame carries, it does not re-resolve.
    expect(deltaHonoursRequest(frame, CONTENT)).toBe(false);
  });

  it("formats a losing delta with an explicit sign and a fresh zero as 0.000", () => {
    const losing = buildDeltaViewModelV2(
      withDelta(golden(20), { seconds: { v: 0.41, q: "fresh" }, reference: "personal-best", requested: "personal-best", available: ["personal-best"] }),
      { state: "live" },
      CONTENT,
    );
    expect(losing.deltaText).toBe("+0.410");
    expect(losing.tone).toBe("losing");

    const zero = buildDeltaViewModelV2(
      withDelta(golden(20), { seconds: { q: "fresh" }, reference: "personal-best", requested: "personal-best", available: ["personal-best"] }),
      { state: "live" },
      CONTENT,
    );
    expect(zero.deltaText).toBe("0.000");
    expect(zero.tone).toBe("neutral");
  });

  it("reports a missing delta as missing instead of inventing a zero", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    expect(update.frame.delta.seconds.q).toBe("missing");
    const model = buildDeltaViewModelV2(update.frame, update.source, CONTENT);
    expect(model.status).toBe("missing");
    expect(model.deltaText).toBe("—");
    expect(model.progress).toBe(0);
    expect(model.splitText).toBeUndefined();
  });

  it("leaves the fields the canonical state does not carry at the placeholder", () => {
    const model = buildDeltaViewModelV2(golden20Frame(), { state: "live" }, CONTENT);
    expect(model.bestLapText).toBe("—");
    expect(model.lapText).toBeUndefined();
    expect(model.predictedLapText).toBeUndefined();
    expect(OVERLAY_V2_DELTA_DECLARED_GAPS).toContain("trend");
  });

  it("reads the player last lap from the frame identity, never from a heuristic", () => {
    const update = golden(20);
    if (!update.frame) throw new Error("golden frame missing");
    const playerRow = update.frame.standings.find((row) => row.id === update.frame?.player.id);
    expect(playerRow).toBeDefined();
    const model = buildDeltaViewModelV2(update.frame, update.source, CONTENT);
    expect(model.lastLapText).toBe("1:31.234");
  });

  it("propagates the source lifecycle instead of rendering a stale delta as ready", () => {
    const frame = withDelta(golden(20), {
      seconds: { v: 0.2, q: "stale" }, reference: "personal-best", requested: "personal-best", available: ["personal-best"],
    });
    expect(buildDeltaViewModelV2(frame, { state: "stale" }, CONTENT).status).toBe("stale");
    const stopped = buildDeltaViewModelV2(frame, { state: "stopped" }, CONTENT);
    expect(stopped.status).toBe("disconnected");
    expect(stopped.deltaText).toBe("—");
  });

  it("exposes a stable displayed projection for the shadow comparator", () => {
    const displayed = deltaDisplayedValues(
      buildDeltaViewModelV2(golden20Frame(), { state: "live" }, CONTENT),
    );
    expect(Object.keys(displayed).sort()).toEqual([
      "bestLapText", "deltaText", "lastLapText", "progress", "splitText", "status", "tone",
    ]);
  });
});

function golden20Frame(): OverlayFrameV2 {
  const update = golden(20);
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}

function withDelta(update: OverlayUpdateV2, delta: OverlayFrameV2["delta"]): OverlayFrameV2 {
  if (!update.frame) throw new Error("golden frame missing");
  return { ...update.frame, delta };
}

function golden(vehicles: number): OverlayUpdateV2 {
  return JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")) as OverlayUpdateV2;
}
