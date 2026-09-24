import { decodeOverlayUpdateV2 } from "../../../telemetry-transport/overlay-frame-v2-store";
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

  it("keeps tank range distinct from session laps and the total fuel required", () => {
    const base = measuredFrame();
    const frame = { ...base, fuel: { ...base.fuel, estimatedLaps: { q: "fresh" as const, v: 12 }, basis: "fuel" as const } };
    const model = buildFuelStrategyViewModelV2(frame, { state: "live" }, CONTENT);
    expect(model.lapsRemaining).toBe(12);
    expect(model.requiredFuel).toBe(276.5);
  });

  it("normalizes a US-gallon frame to the widget's fixed litres unit", () => {
    const base = measuredFrame();
    const gallonsPerLiter = 1 / 3.785411784;
    const frame: OverlayFrameV2 = {
      ...base,
      units: { ...base.units, fuel: "gallons-us" },
      fuel: {
        ...base.fuel,
        remaining: { q: "fresh", v: 42 * gallonsPerLiter },
        capacity: { q: "fresh", v: 100 * gallonsPerLiter },
        perLap: { q: "fresh", v: 3.5 * gallonsPerLiter },
        requiredFuel: { q: "fresh", v: 276.5 * gallonsPerLiter },
        history: { q: "fresh", lap: [5, 6], consumed: [3 * gallonsPerLiter, 3.5 * gallonsPerLiter] },
      },
    };

    const model = buildFuelStrategyViewModelV2(frame, { state: "live" }, CONTENT);
    expect(model.fuelLiters).toBeCloseTo(42, 8);
    expect(model.fuelPercent).toBeCloseTo(42, 8);
    expect(model.avgPerLap).toBeCloseTo(3.5, 8);
    expect(model.requiredFuel).toBeCloseTo(276.5, 8);
    expect(model.history[1]?.consumedLiters).toBeCloseTo(3.5, 8);
  });

  it("hides stale field values and history even if the source itself remains live", () => {
    const base = measuredFrame();
    const frame: OverlayFrameV2 = {
      ...base,
      fuel: {
        ...base.fuel,
        remaining: { q: "stale", v: 42 },
        perLap: { q: "stale", v: 3.5 },
        requiredFuel: { q: "stale", v: 276.5 },
        estimatedLaps: { q: "stale", v: 12 },
        basis: "fuel",
        history: { q: "stale", lap: [5], consumed: [3] },
      },
    };
    const model = buildFuelStrategyViewModelV2(frame, { state: "live" }, CONTENT);
    expect(model.fuelLiters).toBeUndefined();
    expect(model.fuelPercent).toBeUndefined();
    expect(model.avgPerLap).toBeUndefined();
    expect(model.lapsRemaining).toBeUndefined();
    expect(model.requiredFuel).toBeUndefined();
    expect(model.history).toEqual([]);
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
  const update = structuredClone(decodeOverlayUpdateV2(JSON.parse(readFileSync(path.resolve(
    process.cwd(),
    `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${vehicles}.golden.json`,
  ), "utf8")))) as OverlayUpdateV2;
  if (!update.frame) throw new Error("golden frame missing");
  return update.frame;
}
