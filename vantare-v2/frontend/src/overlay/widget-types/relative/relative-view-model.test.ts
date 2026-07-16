import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { createDefaultRelativeContent } from "./relative-content";
import { buildRelativeViewModel } from "./relative-view-model";
import { selectRelativeRows } from "./relative-row-selection";

const content = createDefaultRelativeContent();

const vehicles = [
  { id: 1, driverName: "Ahead far", place: 1, vehicleClass: "HYPERCAR", timeGapToPlayer: 6 },
  { id: 2, driverName: "Ahead near", place: 2, vehicleClass: "HYPERCAR", timeGapToPlayer: 2 },
  { id: 3, driverName: "Ahead gt", place: 3, vehicleClass: "LMGT3", timeGapToPlayer: 1 },
  { id: 4, driverName: "Player", place: 4, vehicleClass: "HYPERCAR", isPlayer: true, timeGapToPlayer: 0 },
  { id: 5, driverName: "Behind near", place: 5, vehicleClass: "HYPERCAR", timeGapToPlayer: -1 },
  { id: 6, driverName: "Behind gt", place: 6, vehicleClass: "LMGT3", timeGapToPlayer: -2 },
  { id: 7, driverName: "Behind far", place: 7, vehicleClass: "HYPERCAR", timeGapToPlayer: -5 },
];

describe("selectRelativeRows", () => {
  it("selects ahead, player and behind rows in gap order", () => {
    const rows = selectRelativeRows(vehicles, content);
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

  it("filters to same class and can hide the player", () => {
    const sameClass = selectRelativeRows(vehicles, { ...content, classScope: "sameClass" });
    expect(sameClass.map((row) => row.driverName)).toEqual([
      "Ahead far",
      "Ahead near",
      "Player",
      "Behind near",
      "Behind far",
    ]);

    const withoutPlayer = selectRelativeRows(vehicles, { ...content, includePlayer: false });
    expect(withoutPlayer.map((row) => row.driverName)).not.toContain("Player");
  });
});

describe("buildRelativeViewModel", () => {
  it("builds ready rows with player tone and enabled columns", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const enriched = {
      ...snapshot,
      scoring: [
        ...vehicles,
        { id: 8, place: 8, driverName: "Malformed", timeGapToPlayer: Number.NaN },
      ],
    };
    const model = buildRelativeViewModel(enriched, content);
    expect(model.status).toBe("ready");
    expect(model.type).toBe("relative");
    expect(model.rowHeightMode).toBe("compact");
    expect(model.rows.some((row) => row.isPlayer)).toBe(true);
    expect(model.rows.find((row) => row.isPlayer)?.tone).toBe("player");
    expect(model.columns.map((column) => column.metricId)).toEqual(
      content.columns.filter((column) => column.enabled).map((column) => column.metricId),
    );
  });

  it("propagates disconnected snapshots without throwing", () => {
    const model = buildRelativeViewModel(
      buildMockTelemetry({ session: "race", location: "track", state: "disconnected" }),
      content,
    );
    expect(model.status).toBe("disconnected");
    expect(model.rows).toEqual([]);
  });

  it("handles large scoring inputs safely", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const manyRows = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      place: index + 1,
      driverName: `Driver ${index + 1}`,
      vehicleClass: "HYPERCAR",
      timeGapToPlayer: index === 50 ? 0 : index < 50 ? 50 - index : -(index - 50),
      isPlayer: index === 50,
    }));
    const model = buildRelativeViewModel({ ...snapshot, scoring: manyRows }, content);
    expect(model.rows.length).toBeLessThanOrEqual(content.rangeAhead + content.rangeBehind + 1);
    expect(model.rows.some((row) => row.isPlayer)).toBe(true);
  });
});