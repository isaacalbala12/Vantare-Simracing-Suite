import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildMulticlassRelativeViewModel } from "./multiclass-relative-view-model";
describe("buildMulticlassRelativeViewModel", () => { it("centers the player and includes other classes", () => { const snapshot = buildMockTelemetry({ session: "race", location: "track" }); const rows = [...snapshot.scoring, { id: 55, place: 4, driverNumber: "55", driverName: "GT3 RIVAL", vehicleClass: "GT3", isPlayer: false }]; const model = buildMulticlassRelativeViewModel({ ...snapshot, scoring: rows }, { rowCount: 5, classMode: "all", showClassDivider: true }); expect(model.rows.some((row) => row.isPlayer)).toBe(true); expect(model.rows.some((row) => row.classId === "GT3")).toBe(true); expect(model.rows.length).toBeLessThanOrEqual(7); }); });

it("places the player in the second row when an even four-row window is available", () => {
  const snapshot = buildMockTelemetry({ session: "race", location: "track" });
  const scoring = [
    ...snapshot.scoring,
    { id: 12, place: 7, driverName: "Trailing driver", vehicleClass: "HYPERCAR", isPlayer: false },
  ];
  const model = buildMulticlassRelativeViewModel(
    { ...snapshot, scoring },
    { rowCount: 4, classMode: "all", showClassDivider: true },
  );
  expect(model.rows).toHaveLength(4);
  expect(model.rows.findIndex((row) => row.isPlayer)).toBe(1);
});
