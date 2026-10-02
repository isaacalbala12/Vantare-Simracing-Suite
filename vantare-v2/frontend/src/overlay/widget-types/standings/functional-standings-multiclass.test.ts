import { describe, expect, it } from "vitest";
import type { StandingsRowViewModel } from "./standings-view-model";
import {
  buildFunctionalStandingsEntries,
  countFunctionalStandingsClassBands,
  FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT,
  takeFunctionalStandingsRows,
} from "./functional-standings-multiclass";

function row(id: string, position: number, vehicleClass: string, classPosition?: number): StandingsRowViewModel {
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
    isPlayer: position === 1,
    isLeader: position === 1,
  };
}

describe("functional standings multiclass projection", () => {
  it("leaves normal rows untouched and does not add class bands", () => {
    const rows = [row("a", 1, "hypercar", 1), row("b", 2, "lmp2", 1)];
    const entries = buildFunctionalStandingsEntries(rows, "normal");

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.kind === "row")).toBe(true);
    expect(entries.map((entry) => entry.kind === "row" && entry.displayPosition)).toEqual([1, 2]);
    expect(countFunctionalStandingsClassBands(rows, "normal")).toBe(0);
  });

  it("groups interleaved producer rows by first-seen class and uses class positions", () => {
    const rows = [
      row("h1", 1, "hypercar", 1),
      row("p1", 2, "lmp2", 1),
      row("h2", 3, "hypercar", 2),
      row("g1", 4, "gte", 1),
    ];
    const entries = buildFunctionalStandingsEntries(rows, "multiclass");

    expect(entries.filter((entry) => entry.kind === "class").map((entry) => entry.kind === "class" && entry.label)).toEqual([
      "HYPERCAR", "LMP2", "GTE",
    ]);
    expect(entries.filter((entry) => entry.kind === "row").map((entry) => entry.kind === "row" && entry.row.id)).toEqual([
      "h1", "h2", "p1", "g1",
    ]);
    expect(entries.filter((entry) => entry.kind === "row").map((entry) => entry.kind === "row" && entry.displayPosition)).toEqual([
      1, 2, 1, 1,
    ]);
    expect(countFunctionalStandingsClassBands(rows, "multiclass")).toBe(3);
  });

  it("keeps rows without a class visible without inventing a band", () => {
    const entries = buildFunctionalStandingsEntries([
      row("unknown", 7, "", undefined),
      row("known", 8, "gt3", undefined),
    ], "multiclass");

    expect(entries.filter((entry) => entry.kind === "class")).toHaveLength(1);
    expect(entries.filter((entry) => entry.kind === "row").map((entry) => entry.kind === "row" && entry.row.id)).toEqual([
      "known", "unknown",
    ]);
    expect(entries.filter((entry) => entry.kind === "row").map((entry) => entry.kind === "row" && entry.displayPosition)).toEqual([8, 7]);
  });

  it("charges each distinct class band when fitting rows to the widget body", () => {
    const rows = [
      row("h1", 1, "hypercar", 1),
      row("p1", 2, "lmp2", 1),
      row("h2", 3, "hypercar", 2),
    ];
    const oneRowHeight = 30 + FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT;
    expect(takeFunctionalStandingsRows(rows, "multiclass", oneRowHeight)).toHaveLength(1);
    expect(takeFunctionalStandingsRows(rows, "multiclass", oneRowHeight + 30 + FUNCTIONAL_STANDINGS_CLASS_BAND_HEIGHT)).toHaveLength(2);
    expect(takeFunctionalStandingsRows(rows, "normal", 60)).toHaveLength(2);
  });
});
