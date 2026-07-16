import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TrackWeatherViewModel } from "../../../widget-types/track-weather/track-weather-view-model";
import { TrackWeatherCrystal } from "./TrackWeatherCrystal";

const readyModel: TrackWeatherViewModel = {
  type: "track-weather",
  status: "ready",
  trackC: 27.2,
  wetnessPercent: 35,
  rainPercent: 0,
  windKph: 8,
  windDirection: "Tailwind SE → NW",
  pressureHpa: 1014,
  content: { showAmbient: true, showTrack: true, showRain: true, showWind: true },
};

describe("TrackWeatherCrystal", () => {
  it("renders honest environmental values in the canonical four-panel hierarchy", () => {
    const { container } = render(<TrackWeatherCrystal model={readyModel} settings={{}} />);

    expect(container.querySelectorAll(".vc-weather-box")).toHaveLength(4);
    expect(screen.getByText("27.2 °C")).toBeTruthy();
    expect(screen.getByText("No rain detected")).toBeTruthy();
    expect(screen.getByText("Tailwind SE → NW")).toBeTruthy();
    expect(screen.getByText("1014 hPa")).toBeTruthy();
  });
});
