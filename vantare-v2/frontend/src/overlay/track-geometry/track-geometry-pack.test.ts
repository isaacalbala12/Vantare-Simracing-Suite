import { describe, expect, it } from "vitest";
import { REFERENCE_LOOP_ID, TRACK_GEOMETRY_PACK } from "./track-geometry-pack";
import { createTrackProjection, resolveTrackGeometry } from "./track-geometry";

const realTracks = TRACK_GEOMETRY_PACK.filter((geometry) => !geometry.synthetic);

describe("track geometry pack", () => {
  it("ships the circuits derived from recorded telemetry", () => {
    expect(realTracks.length).toBeGreaterThanOrEqual(10);
    for (const geometry of realTracks) {
      expect(geometry.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(geometry.label.trim()).not.toBe("");
      expect(geometry.points.length).toBeGreaterThan(100);
    }
  });

  it("keeps the authoring placeholder marked as synthetic", () => {
    const reference = TRACK_GEOMETRY_PACK.find((geometry) => geometry.id === REFERENCE_LOOP_ID);
    expect(reference?.synthetic).toBe(true);
    expect(reference?.aliases).toEqual([]);
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

  it("resolves the circuit names LMU reports", () => {
    for (const name of ["Circuit de Barcelona", "Circuit de la Sarthe", "Autodromo Nazionale Monza"]) {
      expect(resolveTrackGeometry(name, TRACK_GEOMETRY_PACK)?.label).toBe(name);
    }
  });

  it("still refuses a circuit it does not ship", () => {
    for (const name of ["Nürburgring", "Circuit de Barcelona GP", "Suzuka", ""]) {
      expect(resolveTrackGeometry(name, TRACK_GEOMETRY_PACK)).toBeUndefined();
    }
  });

  it("keeps every outline inside a plausible circuit footprint", () => {
    for (const geometry of realTracks) {
      const xs = geometry.points.map((point) => point.x);
      const zs = geometry.points.map((point) => point.z);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...zs) - Math.min(...zs);
      // Circuits span hundreds of metres to a few kilometres. Anything outside
      // that means the conversion from telemetry degrees went wrong.
      expect(width).toBeGreaterThan(200);
      expect(height).toBeGreaterThan(200);
      expect(Math.max(width, height)).toBeLessThan(10000);
    }
  });
});
