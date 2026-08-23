import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../../generated/telemetry";
import { buildTrackWeatherViewModelV2 } from "./track-weather-view-model-v2";

function frameWithWeather(overrides: Partial<OverlayFrameV2["weather"]> = {}): OverlayFrameV2 {
  return {
    contract: 2, algorithm: 1, epoch: 3, sequence: 2, sessionId: "s", generatedAt: "2026-08-19T12:00:02Z",
    units: { speed: "mps", temperature: "celsius", pressure: "kpa", fuel: "liters" },
    session: { track: { q: "fresh", v: "Sebring" }, phase: { q: "fresh", v: "race" }, flag: { q: "missing" }, remaining: { q: "fresh", v: 7198 }, maxLaps: { q: "missing" } },
    player: { id: "vehicle-000", speed: { q: "missing" }, rpm: { q: "missing" }, gear: { q: "missing" }, throttle: { q: "missing" }, brake: { q: "missing" }, clutch: { q: "missing" }, steering: { q: "missing" } },
    controls: { history: { q: "missing" } },
    standings: [], relative: [],
    delta: { seconds: { q: "missing" }, available: [] },
    fuel: { remaining: { q: "missing" }, capacity: { q: "missing" }, perLap: { q: "missing" }, estimatedLaps: { q: "missing" } },
    spotter: { mode: "none", left: { q: "missing" }, right: { q: "missing" } },
    weather: {
      ambientC: { q: "missing" }, trackC: { q: "missing" }, rainPercent: { q: "missing" }, wetnessPct: { q: "missing" }, windKph: { q: "missing" }, windDir: { q: "missing" }, pressureHpa: { q: "missing" }, ...overrides,
    },
    capabilities: { supported: [], available: {}, modes: { spatial: [], delta: [], standings: "none", gaps: "none" } },
  } as unknown as OverlayFrameV2;
}

describe("buildTrackWeatherViewModelV2", () => {
  it("stays missing when the frame carries no weather (current production)", () => {
    const model = buildTrackWeatherViewModelV2(frameWithWeather(), { state: "live" } as OverlaySourceStatusV2, { showAmbient: true, showTrack: true, showRain: true, showWind: true });
    expect(model.status).toBe("missing");
  });

  it("reports ready when at least one weather field is fresh", () => {
    const model = buildTrackWeatherViewModelV2(frameWithWeather({ ambientC: { q: "fresh", v: 22 }, trackC: { q: "fresh", v: 31 } }), { state: "live" } as OverlaySourceStatusV2, { showAmbient: true, showTrack: true, showRain: true, showWind: true });
    expect(model.status).toBe("ready");
    expect(model.ambientC).toBe(22);
    expect(model.trackC).toBe(31);
  });

  it("preserves stale across the wire quality", () => {
    const model = buildTrackWeatherViewModelV2(frameWithWeather({ ambientC: { q: "stale", v: 22 } }), { state: "stale", reason: "degraded" } as unknown as OverlaySourceStatusV2, { showAmbient: true, showTrack: true, showRain: true, showWind: true });
    expect(model.status).toBe("stale");
  });
});
