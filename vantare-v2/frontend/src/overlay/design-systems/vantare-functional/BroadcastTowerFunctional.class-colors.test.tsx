import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BroadcastTowerFunctional } from "./BroadcastTowerFunctional";
import type { BroadcastTowerViewModel } from "../../widget-types/broadcast-tower/broadcast-tower-view-model";

afterEach(cleanup);

const model: BroadcastTowerViewModel = {
  type: "broadcast-tower",
  status: "ready",
  sessionLabel: "RACE",
  rows: [
    { place: 1, number: "1", name: "André Lotterer", team: "HYPERCAR", className: "HYPERCAR", isPlayer: true },
    { place: 2, number: "2", name: "Ben Hanley", team: "LMP2", className: "LMP2", isPlayer: false },
    { place: 3, number: "3", name: "Kévin Estre", team: "GTE", className: "GTE", isPlayer: false },
  ],
  rowCount: 3,
  showWeather: false,
  showSof: false,
};

describe("Functional Broadcast Tower class colours", () => {
  it("colours HYP, LMP and GTE badges by category", () => {
    const { container } = render(<BroadcastTowerFunctional model={model} settings={{}} renderMode="harness" />);

    expect([...container.querySelectorAll(".vf-bt-class")].map((badge) => [
      badge.textContent,
      badge.getAttribute("data-class-accent"),
    ])).toEqual([
      ["HYP", "red"],
      ["LMP", "blue"],
      ["GTE", "amber"],
    ]);
  });
});
