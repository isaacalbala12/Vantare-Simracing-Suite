import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CarDamageNumbersViewModel } from "../../../widget-types/car-damage-numbers/car-damage-numbers-view-model";
import { CarDamageNumbersCrystal } from "./CarDamageNumbersCrystal";

afterEach(() => cleanup());

const model: CarDamageNumbersViewModel = {
  type: "car-damage-numbers",
  status: "missing",
  showTyres: true,
  format: "percent",
};

describe("CarDamageNumbersCrystal", () => {
  it("renders the four canonical rows without inventing unavailable values", () => {
    const { container } = render(<CarDamageNumbersCrystal model={model} settings={{}} renderMode="harness" />);
    const root = container.querySelector('[data-widget-system="vantare-crystal"]') as HTMLElement;
    expect(root.querySelectorAll(":scope > div")).toHaveLength(4);
    expect(root.textContent?.match(/n\/a/g)).toHaveLength(4);
  });
});
