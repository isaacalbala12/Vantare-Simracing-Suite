import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FuelStrategyViewModel } from "../../../widget-types/fuel-strategy/fuel-strategy-view-model";
import { FuelStrategyCrystal } from "./FuelStrategyCrystal";

afterEach(() => cleanup());

const model: FuelStrategyViewModel = {
  type: "fuel-strategy",
  status: "ready",
  fuelLiters: 12.4,
  fuelPercent: 31,
  avgPerLap: 0.9,
  lapsRemaining: 12.9,
  requiredFuel: 17.4,
  history: [
    { lap: 7, consumedLiters: 1 },
    { lap: 8, consumedLiters: 1 },
    { lap: 9, consumedLiters: 1 },
    { lap: 10, consumedLiters: 1 },
  ],
  units: "liters",
  showProjection: true,
};

describe("FuelStrategyCrystal", () => {
  it("renders the canonical unified card hierarchy without showcase content", () => {
    const { container } = render(<FuelStrategyCrystal model={model} settings={{}} renderMode="harness" />);
    const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
    expect(root.getAttribute("data-widget-renderer")).toBe("fuel-strategy");
    expect(root.querySelector(".vc-fuel-top .vc-fuel-bar")).toBeTruthy();
    expect(root.querySelectorAll(".vc-fuel-stats > span")).toHaveLength(3);
    expect(root.querySelectorAll(".vc-fuel-history-list > div")).toHaveLength(4);
    expect((root.querySelector(".vc-fuel-bar i") as HTMLElement).style.width).toBe("31%");
    expect(root.querySelectorAll("button, input, textarea, [contenteditable='true']")).toHaveLength(0);
  });
});
