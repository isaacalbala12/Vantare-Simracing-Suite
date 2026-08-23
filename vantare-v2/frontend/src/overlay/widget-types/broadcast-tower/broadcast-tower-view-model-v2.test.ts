import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import { buildBroadcastTowerViewModelV2 } from "./broadcast-tower-view-model-v2";

function frame(rows: number): OverlayFrameV2 {
  const standings = Array.from({ length: rows }, (_, index) => ({
    id: `vehicle-${String(index).padStart(3, "0")}`,
    position: index + 1,
    classPosition: (index % 3) + 1,
    classId: index < 2 ? "hypercar" : "lmp2",
    driver: `Driver ${index}`,
    number: `${10 + index}`,
    gap: index === 0 ? { q: "fresh" as const } : { q: "fresh" as const, v: index * 1.1 },
    gapLaps: 0,
    pit: "track",
    laps: 34 - Math.floor(index / 8),
    lastLap: { q: "fresh" as const, v: 90 + index * 0.1 },
    lapDistance: { q: "fresh" as const, v: index * 42.5 },
    groundPosition: { q: "fresh" as const, v: { x: index * 10, z: index * -5 } },
  }));
  return {
    contract: 2, algorithm: 1, epoch: 3, sequence: 2, sessionId: "s", generatedAt: "2026-08-19T12:00:02Z",
    units: { speed: "mps", temperature: "celsius", pressure: "kpa", fuel: "liters" },
    session: { track: { q: "fresh", v: "Sebring" }, phase: { q: "fresh", v: "race" }, flag: { q: "missing" }, remaining: { q: "fresh", v: 7198 }, maxLaps: { q: "fresh", v: 240 } },
    player: { id: "vehicle-000", speed: { q: "fresh", v: 50 }, rpm: { q: "fresh", v: 7200 }, gear: { q: "fresh", v: 4 }, throttle: { q: "fresh", v: 0.75 }, brake: { q: "fresh", v: 0.1 }, clutch: { q: "fresh", v: 0 }, steering: { q: "missing" } },
    controls: { history: { q: "fresh", throttle: [750], brake: [125], clutch: [0] } },
    standings: standings as unknown as OverlayFrameV2["standings"],
    relative: [],
    delta: { seconds: { q: "missing" }, available: [] },
    fuel: { remaining: { q: "fresh", v: 42 }, capacity: { q: "fresh", v: 100 }, perLap: { q: "missing" }, estimatedLaps: { q: "fresh", v: 79 } },
    spotter: { mode: "none", left: { q: "missing" }, right: { q: "missing" } },
    weather: { ambientC: { q: "missing" }, trackC: { q: "missing" }, rainPercent: { q: "missing" }, wetnessPct: { q: "missing" }, windKph: { q: "missing" }, windDir: { q: "missing" }, pressureHpa: { q: "missing" } },
    capabilities: { supported: [], available: {}, modes: { spatial: [], delta: [], standings: "official", gaps: "official" } },
  } as unknown as OverlayFrameV2;
}

describe("buildBroadcastTowerViewModelV2", () => {
  it("maps standings rows and keeps unknown weather/SOF unavailable", () => {
    const model = buildBroadcastTowerViewModelV2(frame(12), { state: "live" } as OverlaySourceStatusV2, { rowCount: 5, showWeather: true, showSof: true });
    expect(model.rows).toHaveLength(5);
    expect(model.rows[0]).toMatchObject({ place: 1, isPlayer: true });
    expect(model.sessionLabel).toBe("RACE");
    expect(model.trackTempC).toBeUndefined();
    expect(model.sof).toBeUndefined();
  });

  it("caps rows at ten regardless of config", () => {
    const model = buildBroadcastTowerViewModelV2(frame(20), { state: "live" } as OverlaySourceStatusV2, { rowCount: 20, showWeather: false, showSof: false });
    expect(model.rows).toHaveLength(10);
  });

  it("reports disconnected on error/stopped source", () => {
    const model = buildBroadcastTowerViewModelV2(frame(5), { state: "error", reason: "boom" } as unknown as OverlaySourceStatusV2, { rowCount: 3, showWeather: true, showSof: true });
    expect(model.status).toBe("error");
    expect(model.rows).toHaveLength(0);
  });
});
