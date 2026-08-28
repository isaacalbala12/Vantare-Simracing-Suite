import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import { REFERENCE_LOOP_ID, TRACK_GEOMETRY_PACK } from "../../track-geometry/track-geometry-pack";
import { createDefaultTrackMapContent } from "./track-map-content";
import { buildTrackMapPreviewViewModelV2, buildTrackMapViewModelV2 } from "./track-map-view-model-v2";

function frameFixture(trackName: string | undefined, state: OverlaySourceStatusV2 = { state: "live" }): { frame: OverlayFrameV2; source: OverlaySourceStatusV2 } {
  const frame: OverlayFrameV2 = {
    algorithm: 1,
    contract: 1,
    epoch: 1,
    sequence: 1,
    sessionId: "s1",
    generatedAt: new Date().toISOString(),
    capabilities: { available: {}, modes: { delta: [], gaps: "none", spatial: [], standings: "none" }, supported: [] },
    controls: { history: { q: "missing" } },
    delta: { available: [], seconds: { q: "missing" } },
    fuel: { capacity: { q: "missing" }, estimatedLaps: { q: "missing" }, perLap: { q: "missing" }, remaining: { q: "missing" } },
    player: { id: "1", brake: { q: "missing" }, clutch: { q: "missing" }, gear: { q: "missing" }, rpm: { q: "missing" }, speed: { q: "missing" }, steering: { q: "missing" }, throttle: { q: "missing" } },
    relative: [],
    session: {
      flag: { q: "missing" },
      maxLaps: { q: "missing" },
      phase: { q: "missing" },
      remaining: { q: "missing" },
      track: trackName ? { q: "fresh", v: trackName } : { q: "missing" },
    },
    spotter: { left: { q: "missing" }, mode: "none", right: { q: "missing" } },
    standings: [],
    units: { fuel: "liters", pressure: "kpa", speed: "kph", temperature: "celsius" },
  };
  return { frame, source: state };
}

const content = createDefaultTrackMapContent();
const referenceLabel = TRACK_GEOMETRY_PACK.find((g) => g.id === REFERENCE_LOOP_ID)!.label;

describe("buildTrackMapViewModelV2", () => {
  it("dibuja outline cuando el track resuelve a una geometria", () => {
    const { frame, source } = frameFixture(referenceLabel);
    const model = buildTrackMapViewModelV2(frame, source, content);
    expect(model.unavailableReason).toBeUndefined();
    expect(model.outlinePath?.startsWith("M ")).toBe(true);
    expect(model.trackLabel).toBe(referenceLabel);
  });

  it("reporta unknown-track sin dibujar cuando no resuelve", () => {
    const { frame, source } = frameFixture("Suzuka");
    const model = buildTrackMapViewModelV2(frame, source, content);
    expect(model.unavailableReason).toBe("unknown-track");
    expect(model.outlinePath).toBeUndefined();
  });

  it("reporta no-telemetry ante estados no live", () => {
    for (const state of ["error", "stopped", "stopping", "detecting", "connecting"] as const) {
      const { frame } = frameFixture(referenceLabel);
      const model = buildTrackMapViewModelV2(frame, { state }, content);
      expect(model.unavailableReason).toBe("no-telemetry");
    }
  });

  it("mantiene el ultimo mapa util en degraded/stale", () => {
    for (const state of ["degraded", "stale"] as const) {
      const { frame } = frameFixture(referenceLabel);
      const model = buildTrackMapViewModelV2(frame, { state }, content);
      expect(model.status).toBe("stale");
      expect(model.outlinePath).toBeDefined();
    }
  });

  it("mantiene markers vacios porque el frame no trae posiciones", () => {
    const { frame, source } = frameFixture(referenceLabel);
    const model = buildTrackMapViewModelV2(frame, source, content);
    expect(model.markers).toEqual([]);
  });

  it("preview usa reference loop cuando no hay outline", () => {
    const { frame, source } = frameFixture("Suzuka");
    const model = buildTrackMapPreviewViewModelV2(frame, source, content);
    expect(model.outlinePath).toBeDefined();
    expect(model.synthetic).toBe(true);
  });
});

describe("track-map v2 markers desde groundPosition (ISA-805)", () => {
  it("coloca un marcador por fila con posicion fresh/stale y omite missing", () => {
    const fresh = <T,>(v: T) => ({ v, q: "fresh" as const });
    const row = (id: string, ground: unknown) => ({
      id, position: 1, classPosition: 1, gap: fresh(0), lastLap: fresh(90), lapDistance: fresh(0), groundPosition: ground,
    });
    const frame = {
      session: { track: fresh("Autodromo Nazionale Monza") },
      player: { id: "p1" },
      standings: [row("p1", fresh({ x: 10, z: -5 })), row("r2", { v: { x: 20, z: 5 }, q: "stale" }), row("r3", { q: "missing" })],
    } as never;
    const model = buildTrackMapViewModelV2(frame, { state: "live" } as never, { showTrackLabel: true } as never);
    expect(model.outlinePath).toBeTruthy();
    expect(model.markers.map((m) => m.id)).toEqual(["p1", "r2"]);
    expect(model.markers[0]?.isPlayer).toBe(true);
    expect(model.markers[1]?.isPlayer).toBe(false);
  });
});
