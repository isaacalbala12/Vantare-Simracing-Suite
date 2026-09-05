import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import {
  buildDeltaAdvancedViewModelV2,
  deltaAdvancedDisplayedValues,
} from "./delta-advanced-view-model-v2";

function golden(vehicles: number): OverlayUpdateV2 {
  return JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`),
      "utf8",
    ),
  ) as OverlayUpdateV2;
}

function goldenFrame(): OverlayFrameV2 {
  const update = golden(20);
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}

function withDelta(frame: OverlayFrameV2, delta: OverlayFrameV2["delta"]): OverlayFrameV2 {
  return { ...frame, delta };
}

describe("delta-advanced v2 view model", () => {
  it("construye modelo completo desde delta.seconds", () => {
    const frame = withDelta(goldenFrame(), {
      seconds: { v: -0.238, q: "fresh" },
      reference: "personal-best",
      requested: "personal-best",
      available: ["personal-best"],
    });
    const model = buildDeltaAdvancedViewModelV2(frame, { state: "live" }, { showUnavailableFields: true });
    expect(model.status).toBe("ready");
    expect(model.best).toBeCloseTo(-0.238, 9);
    expect(model.reference).toBe("personal-best");
    expect(model.availability.best).toBe(true);
    expect(model.availability.sector).toBe(false);
    expect(model.showUnavailableFields).toBe(true);
  });

  it("placeholders cuando delta está missing (como v1 con deltaSeconds undefined)", () => {
    const frame = goldenFrame(); // golden 20 delta is missing
    if (frame.delta.seconds.q !== "missing") throw new Error("golden should be missing for this test");
    const model = buildDeltaAdvancedViewModelV2(frame, { state: "live" }, { showUnavailableFields: true });
    expect(model.status).toBe("missing");
    expect(model.best).toBeUndefined();
    expect(model.availability.best).toBe(false);
  });

  it("propaga lifecycle del source", () => {
    const frame = withDelta(goldenFrame(), {
      seconds: { v: 0.2, q: "fresh" },
      reference: "personal-best",
      requested: "personal-best",
      available: ["personal-best"],
    });
    expect(buildDeltaAdvancedViewModelV2(frame, { state: "stale" }, { showUnavailableFields: true }).status).toBe("stale");
    expect(buildDeltaAdvancedViewModelV2(frame, { state: "stopped" }, { showUnavailableFields: true }).status).toBe("disconnected");
    expect(buildDeltaAdvancedViewModelV2(frame, { state: "error", reason: "boom" }, { showUnavailableFields: true }).statusMessage).toBe("boom");
  });

  it("stale con delta válido mantiene best pero marca stale", () => {
    const frame = withDelta(goldenFrame(), {
      seconds: { v: -0.1, q: "fresh" },
      reference: "personal-best",
      requested: "personal-best",
      available: ["personal-best"],
    });
    const model = buildDeltaAdvancedViewModelV2(frame, { state: "stale" }, { showUnavailableFields: false });
    expect(model.status).toBe("stale");
    expect(model.best).toBeCloseTo(-0.1, 9);
  });

  it("expone best y disponibilidad desde el frame canonico", () => {
    const deltaSeconds = -0.15;
    const v2Frame = withDelta(goldenFrame(), {
      seconds: { v: deltaSeconds, q: "fresh" },
      reference: "personal-best",
      requested: "personal-best",
      available: ["personal-best"],
    });
    const v2 = buildDeltaAdvancedViewModelV2(v2Frame, { state: "live" }, { showUnavailableFields: true });
    expect(v2.best).toBeCloseTo(deltaSeconds, 9);
    expect(v2.availability.best).toBe(true);
    expect(v2.availability.sector).toBe(false);
    expect(v2.showUnavailableFields).toBe(true);
  });

  it("expone proyección estable", () => {
    const frame = withDelta(goldenFrame(), {
      seconds: { v: 0.41, q: "fresh" },
      reference: "personal-best",
      requested: "personal-best",
      available: ["personal-best"],
    });
    const displayed = deltaAdvancedDisplayedValues(buildDeltaAdvancedViewModelV2(frame, { state: "live" }, { showUnavailableFields: true }));
    expect(Object.keys(displayed).sort()).toEqual(["availabilityBest", "best", "showUnavailableFields", "status"]);
  });
});
