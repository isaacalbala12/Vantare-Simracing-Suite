import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeOverlayUpdateV2 } from "../../../telemetry-transport/overlay-frame-v2-store";
import { carDamageNumbersDefinition } from "../../widget-types/car-damage-numbers/car-damage-numbers-definition";
import { buildCarDamageNumbersViewModelV2 } from "../../widget-types/car-damage-numbers/car-damage-numbers-view-model-v2";
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
  it("renders the damage published in an Overlay v2 frame", () => {
    const wire = JSON.parse(readFileSync(path.resolve(process.cwd(), "../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json"), "utf8"));
    const frame = decodeOverlayUpdateV2(wire).frame;
    expect(frame).toBeDefined();
    const damage = buildCarDamageNumbersViewModelV2({
      ...frame!,
      damage: { ...frame!.damage, tyreWear: { q: "fresh", v: [0.98, 0.91, 0.87, 0.93] } },
    }, { state: "live" }, carDamageNumbersDefinition.parseContent({}));
    const { container } = render(<CarDamageNumbersFunctional model={damage} settings={{}} renderMode="harness" />);
    for (const field of ["aero", "body", "suspension"]) {
      expect(container.querySelector(`[data-damage="${field}"] .vf-car-damage-value`)?.textContent).toBe("100%");
    }
    expect(container.querySelector('[data-damage="tyre"] .vf-car-damage-value')?.textContent).toBe("13%");
  });

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
