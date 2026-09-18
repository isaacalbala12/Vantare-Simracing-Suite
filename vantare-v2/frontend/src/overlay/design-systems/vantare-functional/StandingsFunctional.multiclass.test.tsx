import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StandingsFunctional } from "./StandingsFunctional";
import type { StandingsViewModel } from "../../widget-types/standings/standings-view-model";

afterEach(cleanup);

const columns = [
  { id: "position", metricId: "position" as const, enabled: true, widthPreset: "sm" as const },
  { id: "name", metricId: "driverName" as const, enabled: true, widthPreset: "auto" as const },
  { id: "gap", metricId: "gap" as const, enabled: true, widthPreset: "lg" as const },
];

function row(id: string, position: number, classPosition: number, vehicleClass: string): StandingsViewModel["rows"][number] {
  return {
    id,
    position,
    classPosition,
    driverNumber: "",
    driverName: id,
    vehicleClass,
    teamCode: "",
    teamBrandColor: "",
    gapText: position === 1 ? "Leader" : `+${position}.00s`,
    intervalText: "—",
    currentLapText: "12",
    lastLapText: "1:42.318",
    bestLapText: "1:41.512",
    pitText: "",
    tireCompound: "",
    isPlayer: id === "h1",
    isLeader: position === 1,
  };
}

function model(classificationMode: StandingsViewModel["classificationMode"] = "normal"): StandingsViewModel {
  return {
    type: "standings",
    status: "ready",
    sessionLabel: "RACE",
    activeClass: "HYPERCAR",
    remainingText: "18:42",
    classScope: classificationMode === "multiclass" ? "all-classes" : "player-class",
    classificationMode,
    columns,
    rows: [
      row("h1", 1, 1, "HYPERCAR"),
      row("p1", 2, 1, "LMP2"),
      row("h2", 3, 2, "HYPERCAR"),
      row("g1", 4, 1, "GTE"),
    ],
  };
}

describe("Functional Standings multiclass rendering", () => {
  it("adds Eficiencia class bands and class positions without changing the table shell", () => {
    const { container } = render(<StandingsFunctional model={model("multiclass")} settings={{}} renderMode="harness" />);

    expect(container.querySelector('[data-class-scope="all-classes"]')).not.toBeNull();
    expect(container.querySelector('[data-classification-mode="multiclass"]')).not.toBeNull();
    expect([...container.querySelectorAll(".vf-class-band")].map((band) => band.textContent)).toEqual([
      "HYPERCAR", "LMP2", "GTE",
    ]);
    expect([...container.querySelectorAll(".vf-class-band")].map((band) => band.getAttribute("data-class-accent"))).toEqual([
      "red", "blue", "amber",
    ]);
    expect([...container.querySelectorAll('tbody td[data-metric="position"]')].map((cell) => cell.textContent)).toEqual([
      "1", "2", "1", "1",
    ]);
    expect(container.querySelectorAll("[data-standings-row]")).toHaveLength(4);
  });

  it("keeps normal mode free of class bands and preserves source positions", () => {
    const { container } = render(<StandingsFunctional model={model("normal")} settings={{}} renderMode="harness" />);

    expect(container.querySelectorAll(".vf-class-band")).toHaveLength(0);
    expect([...container.querySelectorAll('tbody td[data-metric="position"]')].map((cell) => cell.textContent)).toEqual([
      "1", "2", "3", "4",
    ]);
  });
});
