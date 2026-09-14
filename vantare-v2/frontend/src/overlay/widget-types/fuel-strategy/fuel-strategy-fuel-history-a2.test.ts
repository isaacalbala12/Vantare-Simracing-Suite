import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import { fuelStrategyDefinition } from "./fuel-strategy-definition";
import { buildFuelStrategyViewModelV2 } from "./fuel-strategy-view-model-v2";

const CONTENT = fuelStrategyDefinition.parseContent({});

// Frame with a measured fuel history: laps 5-6 at 3.0/3.5 litres, session
// projection 79 laps, required fuel 3.5 x 79 = 276.5 litres.
function measuredFrame(): OverlayFrameV2 {
  const frame = goldenFrame(20);
  return {
    ...frame,
    fuel: {
      ...frame.fuel,
      perLap: { q: "fresh", v: 3.5 },
      sessionLaps: { q: "fresh", v: 79 },
      requiredFuel: { q: "fresh", v: 276.5 },
      history: { q: "fresh", lap: [5, 6], consumed: [3.0, 3.5] },
    },
  };
}

describe("fuel strategy v2 fuel history decoder (A2)", () => {
  it("decodes the measured per-lap history in canonical litres without averaging", () => {
    const model = buildFuelStrategyViewModelV2(measuredFrame(), { state: "live" }, CONTENT);
    expect(model.history).toEqual([
      { lap: 5, consumedLiters: 3.0 },
      { lap: 6, consumedLiters: 3.5 },
    ]);
  });

  it("reads the Go-computed required fuel verbatim instead of recomputing it", () => {
    const model = buildFuelStrategyViewModelV2(measuredFrame(), { state: "live" }, CONTENT);
    expect(model.requiredFuel).toBe(276.5);
  });

  it("clips the history to the widget historyRows window for presentation only", () => {
    const frame = measuredFrame();
    const clipped = buildFuelStrategyViewModelV2(frame, { state: "live" }, { ...CONTENT, historyRows: 1 });
    expect(clipped.history).toEqual([{ lap: 6, consumedLiters: 3.5 }]);
  });

  it("leaves history empty and required fuel undefined when the frame has none", () => {
    const model = buildFuelStrategyViewModelV2(goldenFrame(20), { state: "live" }, CONTENT);
    expect(model.history).toEqual([]);
    expect(model.requiredFuel).toBeUndefined();
  });

  it("is deterministic: no clock reads, same frame always decodes the same model", () => {
    const frame = measuredFrame();
    const first = buildFuelStrategyViewModelV2(frame, { state: "live" }, CONTENT);
    const second = buildFuelStrategyViewModelV2(
      { ...frame, generatedAt: "1999-01-01T00:00:00.000Z" },
      { state: "live" },
      CONTENT,
    );
    expect(second).toEqual(first);
  });
});

function goldenFrame(vehicles: number): OverlayFrameV2 {
  const update = JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")) as OverlayUpdateV2;
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}
