import { describe, expect, it } from "vitest";
import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import { REFERENCE_LOOP_ID, TRACK_GEOMETRY_PACK } from "../../track-geometry/track-geometry-pack";
import { createTrackProjection, projectTrackPoint } from "../../track-geometry/track-geometry";
import { createDefaultTrackMapContent, parseTrackMapContent } from "./track-map-content";
import { trackMapDefinition } from "./track-map-definition";
import {
  buildTrackMapPreviewViewModel,
  buildTrackMapViewModel,
  TRACK_MAP_VIEWPORT,
} from "./track-map-view-model";

function snapshot(overrides: {
  status?: TelemetrySnapshot["status"];
  trackName?: string;
  scoring?: readonly Record<string, unknown>[];
}): TelemetrySnapshot {
  return {
    status: overrides.status ?? "ready",
    capturedAt: 0,
    session: { type: "race", trackName: overrides.trackName },
    player: { inPit: false },
    scoring: overrides.scoring ?? [],
  };
}

const content = createDefaultTrackMapContent();
const referenceLabel = TRACK_GEOMETRY_PACK.find(
  (geometry) => geometry.id === REFERENCE_LOOP_ID,
)!.label;

describe("buildTrackMapViewModel", () => {
  it("draws the outline when the track resolves to exactly one geometry", () => {
    const model = buildTrackMapViewModel(snapshot({ trackName: referenceLabel }), content);

    expect(model.unavailableReason).toBeUndefined();
    expect(model.outlinePath?.startsWith("M ")).toBe(true);
    expect(model.trackLabel).toBe(referenceLabel);
    expect(model.synthetic).toBe(true);
  });

  it("reports an unknown track rather than drawing something close enough", () => {
    for (const trackName of ["Suzuka", "Circuit de Barcelona GP", "", undefined]) {
      const model = buildTrackMapViewModel(snapshot({ trackName }), content);
      expect(model.unavailableReason).toBe("unknown-track");
      expect(model.outlinePath).toBeUndefined();
      expect(model.trackLabel).toBeUndefined();
      expect(model.synthetic).toBe(false);
    }
  });

  it("reports missing telemetry ahead of track resolution", () => {
    for (const status of ["missing", "disconnected", "error"] as const) {
      const model = buildTrackMapViewModel(
        snapshot({ status, trackName: referenceLabel }),
        content,
      );
      expect(model.unavailableReason).toBe("no-telemetry");
      expect(model.outlinePath).toBeUndefined();
    }
  });

  it("keeps drawing while telemetry is only stale", () => {
    const model = buildTrackMapViewModel(
      snapshot({ status: "stale", trackName: referenceLabel }),
      content,
    );
    expect(model.outlinePath).toBeDefined();
    expect(model.status).toBe("stale");
  });

  it("always exposes a viewBox so the renderer can size itself", () => {
    for (const trackName of [referenceLabel, "unknown circuit"]) {
      expect(buildTrackMapViewModel(snapshot({ trackName }), content).viewBox).toBe("0 0 320 220");
    }
  });
});

describe("buildTrackMapPreviewViewModel", () => {
  it("falls back to the reference loop so authoring has something to lay out", () => {
    const model = buildTrackMapPreviewViewModel(
      snapshot({ status: "missing", trackName: "Suzuka" }),
      content,
    );

    expect(model.outlinePath).toBeDefined();
    expect(model.synthetic).toBe(true);
    expect(model.trackLabel).toBe(referenceLabel);
  });

  it("does not override a real resolution", () => {
    const model = buildTrackMapPreviewViewModel(snapshot({ trackName: referenceLabel }), content);
    expect(model.trackLabel).toBe(referenceLabel);
  });
});

describe("track-map content", () => {
  it("defaults missing and absent input", () => {
    expect(parseTrackMapContent(null)).toEqual({ showTrackLabel: true });
    expect(parseTrackMapContent(undefined)).toEqual({ showTrackLabel: true });
    expect(parseTrackMapContent({})).toEqual({ showTrackLabel: true });
    expect(parseTrackMapContent({ showTrackLabel: "yes" })).toEqual({ showTrackLabel: true });
    expect(parseTrackMapContent({ showTrackLabel: false })).toEqual({ showTrackLabel: false });
  });

  it("rejects content that is not an object", () => {
    for (const input of [[], "outline", 7, true]) {
      expect(() => parseTrackMapContent(input)).toThrow(/must be an object/);
    }
  });
});

describe("track-map definition", () => {
  it("creates a default instance that renders in the design system that implements it", () => {
    const instance = trackMapDefinition.createDefault("widget-1");
    expect(instance.type).toBe("track-map");
    expect(instance.visual.systemId).toBe("vantare-endurance");
    expect(instance.layout.w).toBe(trackMapDefinition.capabilities.defaultSize.width);
    expect(instance.layout.h).toBe(trackMapDefinition.capabilities.defaultSize.height);
    expect(trackMapDefinition.parseContent(instance.content)).toEqual(content);
  });
});

describe("track map markers", () => {
  const grid = [
    { id: "car-1", isPlayer: true, groundPositionXMeters: 0, groundPositionZMeters: 0 },
    { id: "car-2", groundPositionXMeters: 200, groundPositionZMeters: -150 },
    { id: "car-3" },
    { id: "car-4", groundPositionXMeters: 10 },
  ];

  it("places only the vehicles whose position survived the adapter", () => {
    const model = buildTrackMapViewModel(
      snapshot({ trackName: referenceLabel, scoring: grid }),
      content,
    );

    expect(model.markers.map((marker) => marker.id)).toEqual(["car-1", "car-2"]);
    expect(model.markers[0].isPlayer).toBe(true);
    expect(model.markers[1].isPlayer).toBe(false);
  });

  it("places markers with the transform that drew the outline", () => {
    const model = buildTrackMapViewModel(
      snapshot({ trackName: referenceLabel, scoring: grid }),
      content,
    );
    const geometry = TRACK_GEOMETRY_PACK.find((entry) => entry.id === REFERENCE_LOOP_ID)!;
    const projection = createTrackProjection(geometry.points, TRACK_MAP_VIEWPORT)!;

    expect(model.markers[0]).toMatchObject(projectTrackPoint({ x: 0, z: 0 }, projection));
    expect(model.markers[1]).toMatchObject(projectTrackPoint({ x: 200, z: -150 }, projection));
  });

  it("has no markers when there is no outline to place them on", () => {
    expect(
      buildTrackMapViewModel(snapshot({ trackName: "Suzuka", scoring: grid }), content).markers,
    ).toEqual([]);
    expect(
      buildTrackMapViewModel(
        snapshot({ status: "missing", trackName: referenceLabel, scoring: grid }),
        content,
      ).markers,
    ).toEqual([]);
  });
});
