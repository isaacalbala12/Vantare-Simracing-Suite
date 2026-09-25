import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import { buildRadarViewModelV2 } from "./radar-view-model-v2";

const live: OverlaySourceStatusV2 = { state: "live" };
const frame = { radar: { mode: "xyz", cars: [
  { id: "left", x: 5, z: 0, overlap: true },
  { id: "right", x: -10, z: -5, overlap: false },
] } } as OverlayFrameV2;

describe("radar view model", () => {
  it("keeps observed local positions and marks only the occupied side", () => {
    const model = buildRadarViewModelV2(frame, live);
    expect(model.status).toBe("ready");
    expect(model.cars).toEqual(frame.radar.cars);
    expect(model.leftOverlap).toBe(true);
    expect(model.rightOverlap).toBe(false);
  });

  it("does not show stale or unavailable positions as clear track", () => {
    expect(buildRadarViewModelV2(frame, { state: "stale" }).cars).toEqual([]);
    const unavailable = buildRadarViewModelV2({ radar: { mode: "none", cars: [] } } as OverlayFrameV2, live);
    expect(unavailable.status).toBe("missing");
    expect(unavailable.available).toBe(false);
  });
});
