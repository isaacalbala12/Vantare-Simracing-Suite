import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import {
  DEFAULT_OVERLAY_V2_FEATURES,
  OVERLAY_V2_FUEL,
  hasOverlayV2Feature,
} from "../../telemetry-shadow/overlay-v2-features";
import { fuelStrategyDefinition } from "./fuel-strategy-definition";
import {
  OVERLAY_V2_FUEL_DECLARED_GAPS,
  OVERLAY_V2_FUEL_INTENTIONAL_DIFFERENCES,
  buildFuelStrategyViewModelV2,
  fuelStrategyDisplayedValues,
} from "./fuel-strategy-view-model-v2";

const CONTENT = fuelStrategyDefinition.parseContent({});

describe("fuel strategy v2 view model", () => {
  it("is off by default and only opts in through the feature flag", () => {
    expect(DEFAULT_OVERLAY_V2_FEATURES).toEqual([]);
    expect(hasOverlayV2Feature(undefined, OVERLAY_V2_FUEL)).toBe(false);
    expect(hasOverlayV2Feature([OVERLAY_V2_FUEL], OVERLAY_V2_FUEL)).toBe(true);
  });

  it("reads the tank and the laps projection resolved in Go without recomputing", () => {
    const frame = goldenFrame(20);
    expect(frame.fuel.remaining.q).toBe("fresh");
    expect(frame.fuel.estimatedLaps.q).toBe("fresh");
    const model = buildFuelStrategyViewModelV2(frame, { state: "live" }, CONTENT);
    expect(model.fuelLiters).toBe(frame.fuel.remaining.v);
    expect(model.lapsRemaining).toBe(frame.fuel.estimatedLaps.v);
  });

  it("leaves everything the frame does not publish undefined instead of inventing it", () => {
    const model = buildFuelStrategyViewModelV2(goldenFrame(20), { state: "live" }, CONTENT);
    expect(model.requiredFuel).toBeUndefined();
    expect(model.fuelPercent).toBeUndefined();
    expect(model.history).toEqual([]);
    expect(OVERLAY_V2_FUEL_DECLARED_GAPS).toEqual(
      expect.arrayContaining(["requiredFuel", "history", "fuelPercent"]),
    );
  });

  it("reads the canonical per-lap consumption without averaging anything itself", () => {
    const frame = goldenFrame(20);
    // The golden fixture measures no lap, so the derivation is missing.
    expect(frame.fuel.perLap.q).toBe("missing");
    expect(buildFuelStrategyViewModelV2(frame, { state: "live" }, CONTENT).avgPerLap).toBeUndefined();

    const measured = { ...frame, fuel: { ...frame.fuel, perLap: { q: "fresh", v: 3.42 } } } as OverlayFrameV2;
    const model = buildFuelStrategyViewModelV2(measured, { state: "live" }, CONTENT);
    // Read verbatim: no rounding, no window of its own. The window is the
    // canonical one and the value can differ from the v1 average by design.
    expect(model.avgPerLap).toBe(3.42);
    expect(OVERLAY_V2_FUEL_INTENTIONAL_DIFFERENCES).toEqual(
      expect.arrayContaining(["avgPerLap", "lapsRemaining"]),
    );
  });

  it("honours the widget projection switch without touching the frame", () => {
    const frame = goldenFrame(20);
    const off = buildFuelStrategyViewModelV2(frame, { state: "live" }, { ...CONTENT, showProjection: false });
    expect(off.lapsRemaining).toBeUndefined();
    expect(off.fuelLiters).toBe(frame.fuel.remaining.v);
  });

  it("preserves an empty tank as a zero and a missing tank as undefined", () => {
    const frame = goldenFrame(20);
    const empty = buildFuelStrategyViewModelV2(
      { ...frame, fuel: { ...frame.fuel, remaining: { q: "fresh" } } },
      { state: "live" },
      CONTENT,
    );
    expect(empty.fuelLiters).toBe(0);

    const missing = buildFuelStrategyViewModelV2(
      { ...frame, fuel: { ...frame.fuel, remaining: { q: "missing" } } },
      { state: "live" },
      CONTENT,
    );
    expect(missing.fuelLiters).toBeUndefined();
  });

  it("propagates the source lifecycle instead of rendering a stale tank as ready", () => {
    const frame = goldenFrame(20);
    expect(buildFuelStrategyViewModelV2(frame, { state: "stale" }, CONTENT).status).toBe("stale");
    const stopped = buildFuelStrategyViewModelV2(frame, { state: "stopped" }, CONTENT);
    expect(stopped.status).toBe("disconnected");
    expect(stopped.fuelLiters).toBeUndefined();
    expect(stopped.lapsRemaining).toBeUndefined();
  });

  it("exposes a stable displayed projection for the shadow comparator", () => {
    const displayed = fuelStrategyDisplayedValues(
      buildFuelStrategyViewModelV2(goldenFrame(20), { state: "live" }, CONTENT),
    );
    expect(Object.keys(displayed).sort()).toEqual([
      "avgPerLap", "fuelLiters", "historyRows", "lapsRemaining", "status",
    ]);
    expect(displayed.historyRows).toBe("0");
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
