import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildTrackWeatherViewModel } from "./track-weather-view-model";

describe("buildTrackWeatherViewModel", () => {
  it("keeps current live transport missing and renders approved optional environment fields", () => {
    const base = buildMockTelemetry({ session: "race", location: "track" });
    expect(buildTrackWeatherViewModel(base, { showAmbient:true,showTrack:true,showRain:true,showWind:true }).status).toBe("missing");
    const ready = buildTrackWeatherViewModel({ ...base, environment: { ambientC:22,trackC:31,rainPercent:5,windKph:12,windDirection:"NW",pressureHpa:1012 } }, { showAmbient:true,showTrack:true,showRain:true,showWind:true });
    expect(ready).toMatchObject({ status:"ready", ambientC:22, trackC:31, rainPercent:5 });
  });
});
