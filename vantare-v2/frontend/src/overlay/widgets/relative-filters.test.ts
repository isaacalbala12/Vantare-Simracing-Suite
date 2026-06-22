import { describe, expect, it } from "vitest";
import type { VehicleScoring } from "../../lib/telemetry-ref";
import {
  DEFAULT_RELATIVE_FILTERS,
  getRelativeFilters,
  selectRelativeRows,
} from "./relative-filters";

function car(partial: Partial<VehicleScoring>): Partial<VehicleScoring> {
  return partial;
}

const vehicles: Partial<VehicleScoring>[] = [
  car({ id: 1, driverName: "Ahead far", place: 1, vehicleClass: "HYPERCAR", timeGapToPlayer: 6 }),
  car({ id: 2, driverName: "Ahead near", place: 2, vehicleClass: "HYPERCAR", timeGapToPlayer: 2 }),
  car({ id: 3, driverName: "Ahead gt", place: 3, vehicleClass: "LMGT3", timeGapToPlayer: 1 }),
  car({ id: 4, driverName: "Player", place: 4, vehicleClass: "HYPERCAR", isPlayer: true, timeGapToPlayer: 0 }),
  car({ id: 5, driverName: "Behind near", place: 5, vehicleClass: "HYPERCAR", timeGapToPlayer: -1 }),
  car({ id: 6, driverName: "Behind gt", place: 6, vehicleClass: "LMGT3", timeGapToPlayer: -2 }),
  car({ id: 7, driverName: "Behind far", place: 7, vehicleClass: "HYPERCAR", timeGapToPlayer: -5 }),
];

describe("relative filters", () => {
  it("uses stable defaults", () => {
    expect(DEFAULT_RELATIVE_FILTERS).toEqual({
      rangeAhead: 3,
      rangeBehind: 3,
      classScope: "all",
      includePlayer: true,
      rowHeightMode: "fill",
    });
  });

  it("selects cars ahead, player and cars behind by default", () => {
    const rows = selectRelativeRows(vehicles, DEFAULT_RELATIVE_FILTERS);
    expect(rows.map((row) => row.driverName)).toEqual([
      "Ahead far",
      "Ahead near",
      "Ahead gt",
      "Player",
      "Behind near",
      "Behind gt",
      "Behind far",
    ]);
  });

  it("can filter to same class only", () => {
    const rows = selectRelativeRows(vehicles, {
      ...DEFAULT_RELATIVE_FILTERS,
      classScope: "sameClass",
    });
    expect(rows.map((row) => row.driverName)).toEqual([
      "Ahead far",
      "Ahead near",
      "Player",
      "Behind near",
      "Behind far",
    ]);
  });

  it("can hide the player row", () => {
    const rows = selectRelativeRows(vehicles, {
      ...DEFAULT_RELATIVE_FILTERS,
      includePlayer: false,
    });
    expect(rows.map((row) => row.driverName)).not.toContain("Player");
  });

  it("clamps range filters to the selectable 0..4 range and preserves legacy range props", () => {
    expect(getRelativeFilters(undefined, { rangeAhead: 99, rangeBehind: -5 })).toEqual({
      rangeAhead: 4,
      rangeBehind: 0,
      classScope: "all",
      includePlayer: true,
      rowHeightMode: "fill",
    });
  });

  it("variant filters override legacy range props", () => {
    expect(getRelativeFilters(
      { rangeAhead: 1, rangeBehind: 2, classScope: "sameClass", includePlayer: false, rowHeightMode: "compact" },
      { rangeAhead: 8, rangeBehind: 8 },
    )).toEqual({
      rangeAhead: 1,
      rangeBehind: 2,
      classScope: "sameClass",
      includePlayer: false,
      rowHeightMode: "compact",
    });
  });
});
