import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CarDamageNumbersViewModel } from "../../widget-types/car-damage-numbers/car-damage-numbers-view-model";
import { CarDamageNumbersFunctional } from "./CarDamageNumbersFunctional";

afterEach(cleanup);

const model: CarDamageNumbersViewModel = {
  type: "car-damage-numbers",
  status: "ready",
  format: "percent",
  showTyres: true,
  aero: 1,
  body: 0.8,
  suspension: 0.6,
  tyres: [0.1, 0.3, 0.2, 0.4],
};

describe("CarDamageNumbersFunctional", () => {
  it("shows four rows and one aggregated tyre value", () => {
    const { container } = render(<CarDamageNumbersFunctional model={model} settings={{}} renderMode="harness" />);
    expect(container.querySelectorAll(".vf-car-damage-slot")).toHaveLength(4);
    expect(container.querySelector('[data-damage="tyre"] .vf-car-damage-value')?.textContent).toBe("40%");
    expect(container.querySelector('[data-damage="aero"] .vf-car-damage-value')?.textContent).toBe("100%");
  });

  it("keeps unavailable values honest and respects hidden tyres", () => {
    const missingTyres = { ...model, body: undefined, tyres: undefined };
    const { container, rerender } = render(<CarDamageNumbersFunctional model={missingTyres} settings={{}} renderMode="harness" />);
    expect(container.querySelector('[data-damage="tyre"] .vf-car-damage-value')?.textContent).toBe("—");
    rerender(<CarDamageNumbersFunctional model={{ ...missingTyres, showTyres: false }} settings={{}} renderMode="harness" />);
    expect(container.querySelectorAll(".vf-car-damage-slot")).toHaveLength(3);
    expect(container.querySelector('[data-damage="body"] .vf-car-damage-value')?.textContent).toBe("—");
    expect(container.querySelector('[data-damage="tyre"]')).toBeNull();
  });
});
