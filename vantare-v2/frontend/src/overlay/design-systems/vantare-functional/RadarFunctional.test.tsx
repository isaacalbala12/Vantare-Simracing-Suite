import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RadarFunctional } from "./RadarFunctional";

describe("Efficiency radar", () => {
  it("places a car to the player's left and highlights overlap", () => {
    const { container } = render(<RadarFunctional model={{
      type: "radar", status: "ready", available: true,
      cars: [{ id: "left", x: 5, z: -4, overlap: true, near: true, lapped: false }], leftOverlap: true, rightOverlap: false,
    }} settings={{}} renderMode="harness" />);
    const car = container.querySelector(".vf-radar-car");
    expect(car?.getAttribute("x")).toBe("87");
    expect(car?.getAttribute("y")).toBe("82");
    expect(car?.getAttribute("data-overlap")).toBe("true");
    expect(car?.getAttribute("data-near")).toBe("true");
    expect(car?.getAttribute("data-lapped")).toBe("false");
    expect(container.querySelectorAll(".vf-radar-side-active")).toHaveLength(1);
    expect(container.querySelector(".vf-radar-range")).toBeNull();
    expect(car?.getAttribute("width")).toBe("16");
    expect(car?.getAttribute("height")).toBe("32");
  });

  it("marks a nearby lapped car without losing its lap identity", () => {
    const { container } = render(<RadarFunctional model={{
      type: "radar", status: "ready", available: true,
      cars: [{ id: "backmarker", x: 4, z: 0, overlap: false, near: true, lapped: true }],
      leftOverlap: false, rightOverlap: false,
    }} settings={{}} renderMode="harness" />);
    const car = container.querySelector(".vf-radar-car");
    expect(car?.getAttribute("data-near")).toBe("true");
    expect(car?.getAttribute("data-lapped")).toBe("true");
  });
});
