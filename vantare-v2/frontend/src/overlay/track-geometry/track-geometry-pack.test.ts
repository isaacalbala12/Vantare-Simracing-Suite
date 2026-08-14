import { describe, expect, it } from "vitest";
import { REFERENCE_LOOP_ID, TRACK_GEOMETRY_PACK } from "./track-geometry-pack";
import { createTrackProjection, resolveTrackGeometry } from "./track-geometry";

describe("track geometry pack", () => {
  it("declares every entry that is not from a real capture as synthetic", () => {
    for (const geometry of TRACK_GEOMETRY_PACK) {
      if (geometry.id === REFERENCE_LOOP_ID) {
        expect(geometry.synthetic).toBe(true);
      }
    }
  });

  it("uses unique ids", () => {
    const ids = TRACK_GEOMETRY_PACK.map((geometry) => geometry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships outlines that can actually be projected", () => {
    for (const geometry of TRACK_GEOMETRY_PACK) {
      expect(
        createTrackProjection(geometry.points, { width: 320, height: 220, padding: 12 }),
      ).toBeDefined();
    }
  });

  it("cannot be resolved by a real LMU track name", () => {
    for (const name of ["Circuit de Barcelona", "Le Mans", "Sebring", "Monza", "Bahrain"]) {
      expect(resolveTrackGeometry(name, TRACK_GEOMETRY_PACK)).toBeUndefined();
    }
  });
});
