import { describe, expect, it } from "vitest";
import {
  buildTrackOutlinePath,
  createTrackProjection,
  normalizeTrackName,
  projectTrackPoint,
  resolveTrackGeometry,
  type TrackGeometry,
  type TrackPoint,
  type TrackViewport,
} from "./track-geometry";

const viewport: TrackViewport = { width: 320, height: 220, padding: 10 };

const square: readonly TrackPoint[] = [
  { x: 0, z: 0 },
  { x: 100, z: 0 },
  { x: 100, z: 100 },
  { x: 0, z: 100 },
];

function geometry(id: string, aliases: readonly string[] = []): TrackGeometry {
  return { id, label: id, synthetic: true, aliases, points: square };
}

describe("normalizeTrackName", () => {
  it("collapses case, diacritics, punctuation and spacing", () => {
    for (const input of [
      "Circuit de Barcelona",
      "  circuit   de   barcelona  ",
      "CIRCUIT-DE-BARCELONA",
      "Círcuit de Barçelona",
      "Circuit_de_Barcelona!",
    ]) {
      expect(normalizeTrackName(input)).toBe("circuit de barcelona");
    }
  });

  it("reduces blank input to an empty key", () => {
    for (const input of ["", "   ", "---", "\t\n"]) {
      expect(normalizeTrackName(input)).toBe("");
    }
  });
});

describe("resolveTrackGeometry", () => {
  const pack = [geometry("mount-panorama", ["Bathurst"]), geometry("spa-francorchamps")];

  it("matches the id regardless of formatting", () => {
    for (const name of ["mount-panorama", "Mount Panorama", "  MOUNT   panorama "]) {
      expect(resolveTrackGeometry(name, pack)?.id).toBe("mount-panorama");
    }
  });

  it("matches a declared alias", () => {
    expect(resolveTrackGeometry("bathurst", pack)?.id).toBe("mount-panorama");
  });

  it("fails closed for an unknown track instead of picking the closest one", () => {
    for (const name of ["spa", "spa-francorchamps-gp", "mount", "nurburgring"]) {
      expect(resolveTrackGeometry(name, pack)).toBeUndefined();
    }
  });

  it("fails closed for absent or blank names", () => {
    for (const name of [undefined, "", "   "]) {
      expect(resolveTrackGeometry(name, pack)).toBeUndefined();
    }
  });

  it("fails closed when two entries claim the same name", () => {
    const ambiguous = [geometry("le-mans", ["circuit de la sarthe"]), geometry("circuit-de-la-sarthe")];
    expect(resolveTrackGeometry("circuit de la sarthe", ambiguous)).toBeUndefined();
  });
});

describe("createTrackProjection", () => {
  it("preserves aspect ratio with a single scale factor", () => {
    const wide: readonly TrackPoint[] = [
      { x: 0, z: 0 },
      { x: 200, z: 0 },
      { x: 200, z: 50 },
      { x: 0, z: 50 },
    ];
    const projection = createTrackProjection(wide, viewport);
    expect(projection).toBeDefined();

    const topLeft = projectTrackPoint(wide[0], projection!);
    const bottomRight = projectTrackPoint(wide[2], projection!);
    const renderedWidth = bottomRight.x - topLeft.x;
    const renderedHeight = bottomRight.y - topLeft.y;

    expect(renderedWidth / renderedHeight).toBeCloseTo(200 / 50, 10);
  });

  it("fits inside the padded viewport and centres the outline", () => {
    const projection = createTrackProjection(square, viewport)!;
    const corners = square.map((point) => projectTrackPoint(point, projection));
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(viewport.padding);
    expect(Math.max(...xs)).toBeLessThanOrEqual(viewport.width - viewport.padding);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(viewport.padding);
    expect(Math.max(...ys)).toBeLessThanOrEqual(viewport.height - viewport.padding);

    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(viewport.width, 10);
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(viewport.height, 10);
  });

  it("is deterministic", () => {
    expect(createTrackProjection(square, viewport)).toEqual(createTrackProjection(square, viewport));
  });

  it("rejects geometry that cannot describe a closed outline", () => {
    expect(createTrackProjection([], viewport)).toBeUndefined();
    expect(createTrackProjection([{ x: 0, z: 0 }, { x: 1, z: 1 }], viewport)).toBeUndefined();
  });

  it("rejects degenerate and non-finite geometry", () => {
    const collapsed = [
      { x: 5, z: 5 },
      { x: 5, z: 5 },
      { x: 5, z: 5 },
    ];
    expect(createTrackProjection(collapsed, viewport)).toBeUndefined();
    expect(
      createTrackProjection([{ x: 0, z: 0 }, { x: Number.NaN, z: 1 }, { x: 2, z: 2 }], viewport),
    ).toBeUndefined();
    expect(
      createTrackProjection(
        [{ x: 0, z: 0 }, { x: Number.POSITIVE_INFINITY, z: 1 }, { x: 2, z: 2 }],
        viewport,
      ),
    ).toBeUndefined();
  });

  it("rejects a viewport with no room left after padding", () => {
    expect(createTrackProjection(square, { width: 20, height: 220, padding: 10 })).toBeUndefined();
    expect(createTrackProjection(square, { width: 320, height: 10, padding: 10 })).toBeUndefined();
  });

  it("still fits a straight line, which has no extent on one axis", () => {
    const line = [
      { x: 0, z: 40 },
      { x: 50, z: 40 },
      { x: 100, z: 40 },
    ];
    const projection = createTrackProjection(line, viewport);
    expect(projection).toBeDefined();
    expect(Number.isFinite(projection!.scale)).toBe(true);
  });
});

describe("buildTrackOutlinePath", () => {
  it("emits a closed path through every point", () => {
    const projection = createTrackProjection(square, viewport)!;
    const path = buildTrackOutlinePath(square, projection);

    expect(path.startsWith("M ")).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
    expect(path.match(/L /g)).toHaveLength(square.length - 1);
  });

  it("maps world +Z to screen +Y, the documented top-down convention", () => {
    const projection = createTrackProjection(square, viewport)!;
    const north = projectTrackPoint({ x: 50, z: 0 }, projection);
    const south = projectTrackPoint({ x: 50, z: 100 }, projection);

    expect(south.y).toBeGreaterThan(north.y);
  });
});
