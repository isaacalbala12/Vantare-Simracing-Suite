import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CarDamageVisualViewModel } from "../../../widget-types/car-damage-visual/car-damage-visual-view-model";
import { CarDamageVisualCrystal } from "./CarDamageVisualCrystal";

afterEach(() => cleanup());

const model: CarDamageVisualViewModel = {
  type: "car-damage-visual",
  status: "ready",
  body: 0,
  aero: 0,
  suspension: 0,
  tyres: [0, 0, 0, 0],
  showPercent: true,
  showAero: true,
};

describe("CarDamageVisualCrystal", () => {
  it("renders the canonical chassis, four tyres and honest health", () => {
    const { container } = render(<CarDamageVisualCrystal model={model} settings={{}} renderMode="harness" />);
    const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
    expect(root.querySelectorAll(".vc-damage-tire")).toHaveLength(4);
    expect(root.querySelector(".vc-damage-chassis b")?.textContent).toBe("100%");
    expect(root.querySelectorAll("button, input, textarea")).toHaveLength(0);
  });
});
