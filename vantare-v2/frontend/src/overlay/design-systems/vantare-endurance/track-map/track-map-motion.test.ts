import { describe, expect, it } from "vitest";
import type { TrackMapMarker } from "../../../widget-types/track-map/track-map-view-model";
import {
  advanceMarkers,
  DEFAULT_MOTION_OPTIONS,
  type MarkerPositions,
} from "./track-map-motion";

function marker(id: string, x: number, y: number, isPlayer = false): TrackMapMarker {
  return { id, x, y, isPlayer };
}

function positions(entries: Record<string, [number, number]>): MarkerPositions {
  return new Map(Object.entries(entries).map(([id, [x, y]]) => [id, { x, y }]));
}

describe("advanceMarkers", () => {
  it("places a car it has never seen exactly where it is", () => {
    const got = advanceMarkers(new Map(), [marker("car-1", 40, 90)], 16);
    expect(got.get("car-1")).toEqual({ x: 40, y: 90 });
  });

  it("eases toward the published position without overshooting it", () => {
    const got = advanceMarkers(positions({ "car-1": [0, 0] }), [marker("car-1", 10, 0)], 16);
    const moved = got.get("car-1")!;

    expect(moved.x).toBeGreaterThan(0);
    expect(moved.x).toBeLessThan(10);
    expect(moved.y).toBe(0);
  });

  it("covers the same ground in the same time whatever the refresh rate", () => {
    const target = [marker("car-1", 100, 0)];

    let coarse = positions({ "car-1": [0, 0] });
    coarse = advanceMarkers(coarse, target, 16);

    let fine = positions({ "car-1": [0, 0] });
    for (let frame = 0; frame < 2; frame += 1) {
      fine = advanceMarkers(fine, target, 8);
    }

    expect(fine.get("car-1")!.x).toBeCloseTo(coarse.get("car-1")!.x, 6);
  });

  it("converges on the target rather than stalling short of it", () => {
    let current = positions({ "car-1": [0, 0] });
    for (let frame = 0; frame < 200; frame += 1) {
      current = advanceMarkers(current, [marker("car-1", 100, 50)], 16);
    }
    expect(current.get("car-1")!.x).toBeCloseTo(100, 3);
    expect(current.get("car-1")!.y).toBeCloseTo(50, 3);
  });

  it("jumps instead of sliding when the gap is too large to have been driven", () => {
    const far = DEFAULT_MOTION_OPTIONS.snapDistance + 1;
    const got = advanceMarkers(positions({ "car-1": [0, 0] }), [marker("car-1", far, 0)], 16);
    expect(got.get("car-1")).toEqual({ x: far, y: 0 });
  });

  it("drops cars that left the published frame instead of stranding them", () => {
    const got = advanceMarkers(
      positions({ "car-1": [0, 0], "car-2": [50, 50] }),
      [marker("car-1", 10, 0)],
      16,
    );
    expect([...got.keys()]).toEqual(["car-1"]);
  });

  // A reused grid slot is a different car. The contract's identity carries a
  // generation, so it arrives here as a different key and must not inherit the
  // previous occupant's position: sliding one car across the map into another
  // would look deliberate and be entirely wrong.
  it("never carries a position across a change of vehicle identity", () => {
    const got = advanceMarkers(
      positions({ "lmu-slot-7-generation-1": [10, 10] }),
      [marker("lmu-slot-7-generation-2", 300, 200)],
      16,
    );
    expect(got.get("lmu-slot-7-generation-2")).toEqual({ x: 300, y: 200 });
    expect(got.has("lmu-slot-7-generation-1")).toBe(false);
  });

  it("snaps when no time has passed rather than dividing by nothing", () => {
    const got = advanceMarkers(positions({ "car-1": [0, 0] }), [marker("car-1", 10, 0)], 0);
    expect(got.get("car-1")).toEqual({ x: 10, y: 0 });
  });

  it("is pure: the positions handed in are never mutated", () => {
    const before = positions({ "car-1": [0, 0] });
    advanceMarkers(before, [marker("car-1", 10, 10)], 16);
    expect(before.get("car-1")).toEqual({ x: 0, y: 0 });
  });
});
