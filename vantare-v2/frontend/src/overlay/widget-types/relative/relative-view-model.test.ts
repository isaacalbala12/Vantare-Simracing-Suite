import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { createDefaultRelativeContent } from "./relative-content";
import { buildRelativeViewModel } from "./relative-view-model";
import { selectRelativeRows } from "./relative-row-selection";

const content = createDefaultRelativeContent();

const vehicles = [
  { id: 1, driverName: "Ahead far", place: 1, vehicleClass: "HYPERCAR", lapDistanceMeters: 1_300, timeGapToPlayer: 6 },
  { id: 2, driverName: "Ahead near", place: 2, vehicleClass: "HYPERCAR", lapDistanceMeters: 1_200, timeGapToPlayer: 2 },
  { id: 3, driverName: "Ahead gt", place: 3, vehicleClass: "LMGT3", lapDistanceMeters: 1_100, timeGapToPlayer: 1 },
  { id: 4, driverName: "Player", place: 4, vehicleClass: "HYPERCAR", lapDistanceMeters: 1_000, isPlayer: true, timeGapToPlayer: 0 },
  { id: 5, driverName: "Behind near", place: 5, vehicleClass: "HYPERCAR", lapDistanceMeters: 900, timeGapToPlayer: -1 },
  { id: 6, driverName: "Behind gt", place: 6, vehicleClass: "LMGT3", lapDistanceMeters: 800, timeGapToPlayer: -2 },
  { id: 7, driverName: "Behind far", place: 7, vehicleClass: "HYPERCAR", lapDistanceMeters: 700, timeGapToPlayer: -5 },
];

function selectedNames(rows: ReturnType<typeof selectRelativeRows>): unknown[] {
  return rows.map(({ row }) => row.driverName);
}

describe("selectRelativeRows", () => {
  it("keeps the physical 2+2 neighbours when only the player has a relative time gap", () => {
    const liveRows = Array.from({ length: 38 }, (_, index) => ({
      id: index + 1,
      driverName: index === 10 ? "Player" : `Driver ${index + 1}`,
      place: index + 1,
      vehicleClass: "HYPERCAR",
      lapDistanceMeters: index * 100,
      isPlayer: index === 10,
      ...(index === 10 ? { timeGapToPlayer: 0 } : {}),
    }));

    const rows = selectRelativeRows(liveRows, {
      ...content,
      rangeAhead: 2,
      rangeBehind: 2,
    });

    expect(selectedNames(rows)).toEqual([
      "Driver 13",
      "Driver 12",
      "Player",
      "Driver 10",
      "Driver 9",
    ]);
    expect(rows.map((row) => row.side)).toEqual([
      "ahead",
      "ahead",
      "player",
      "behind",
      "behind",
    ]);
  });

  it("selects ahead, player and behind rows in physical order", () => {
    const rows = selectRelativeRows(vehicles, content);
    expect(selectedNames(rows)).toEqual([
      "Ahead near",
      "Ahead gt",
      "Player",
      "Behind near",
      "Behind gt",
    ]);
  });

  it("filters to same class and can hide the player", () => {
    const sameClass = selectRelativeRows(vehicles, {
      ...content,
      rangeAhead: 2,
      rangeBehind: 2,
      classScope: "sameClass",
    });
    expect(selectedNames(sameClass)).toEqual([
      "Ahead far",
      "Ahead near",
      "Player",
      "Behind near",
      "Behind far",
    ]);

    const withoutPlayer = selectRelativeRows(vehicles, { ...content, includePlayer: false });
    expect(selectedNames(withoutPlayer)).not.toContain("Player");
  });

  it("wraps around the start-finish line without knowing track length", () => {
    const rows = selectRelativeRows(
      [
        { id: "after-line", driverName: "After line", lapDistanceMeters: 5 },
        { id: "far-behind", driverName: "Far behind", lapDistanceMeters: 4_800 },
        { id: "near-behind", driverName: "Near behind", lapDistanceMeters: 4_870 },
        { id: "player", driverName: "Player", lapDistanceMeters: 4_890, isPlayer: true },
        { id: "near-ahead", driverName: "Near ahead", lapDistanceMeters: 4_898 },
      ],
      { ...content, rangeAhead: 2, rangeBehind: 2 },
    );

    expect(selectedNames(rows)).toEqual([
      "After line",
      "Near ahead",
      "Player",
      "Near behind",
      "Far behind",
    ]);
    expect(rows.map(({ side }) => side)).toEqual(["ahead", "ahead", "player", "behind", "behind"]);
  });

  it("ignores completed laps when a lapped car is physically adjacent", () => {
    const rows = selectRelativeRows(
      [
        { id: "ahead-2", driverName: "Ahead two laps down", lapDistanceMeters: 1_020, completedLaps: 4 },
        { id: "player", driverName: "Player", lapDistanceMeters: 1_000, completedLaps: 6, isPlayer: true },
        { id: "behind", driverName: "Behind one lap up", lapDistanceMeters: 980, completedLaps: 7 },
        { id: "ahead", driverName: "Ahead same lap", lapDistanceMeters: 1_010, completedLaps: 6 },
        { id: "behind-2", driverName: "Behind same lap", lapDistanceMeters: 970, completedLaps: 6 },
      ],
      { ...content, rangeAhead: 2, rangeBehind: 2 },
    );

    expect(selectedNames(rows)).toEqual([
      "Ahead two laps down",
      "Ahead same lap",
      "Player",
      "Behind one lap up",
      "Behind same lap",
    ]);
  });

  it("is stable when scoring input order changes", () => {
    const filters = { ...content, rangeAhead: 2, rangeBehind: 2 };
    expect(selectedNames(selectRelativeRows(vehicles, filters))).toEqual(
      selectedNames(selectRelativeRows([...vehicles].reverse(), filters)),
    );
  });

  it("uses driver identity to break equal-distance ties when an id is absent", () => {
    const tied = [
      { driverName: "Zulu", lapDistanceMeters: 1_100 },
      { driverName: "Alpha", lapDistanceMeters: 1_100 },
      { driverName: "Player", lapDistanceMeters: 1_000, isPlayer: true },
      { driverName: "Behind", lapDistanceMeters: 900 },
    ];
    const filters = { ...content, rangeAhead: 2, rangeBehind: 1 };

    expect(selectedNames(selectRelativeRows(tied, filters))).toEqual(
      selectedNames(selectRelativeRows([...tied].reverse(), filters)),
    );
  });

  it("excludes invalid rival distances and fails closed when player distance is invalid", () => {
    const rows = selectRelativeRows(
      [
        ...vehicles,
        { id: "nan", driverName: "NaN", lapDistanceMeters: Number.NaN },
        { id: "infinity", driverName: "Infinity", lapDistanceMeters: Number.POSITIVE_INFINITY },
      ],
      { ...content, rangeAhead: 2, rangeBehind: 2 },
    );
    expect(selectedNames(rows)).not.toContain("NaN");
    expect(selectedNames(rows)).not.toContain("Infinity");

    const invalidPlayer = selectRelativeRows(
      vehicles.map((row) => (row.isPlayer ? { ...row, lapDistanceMeters: Number.NaN } : row)),
      { ...content, rangeAhead: 2, rangeBehind: 2 },
    );
    expect(selectedNames(invalidPlayer)).toEqual(["Player"]);
  });

  it("shows a short field once and keeps one rival on each physical side", () => {
    const rows = selectRelativeRows(
      [
        { id: "behind", driverName: "Behind", lapDistanceMeters: 900 },
        { id: "player", driverName: "Player", lapDistanceMeters: 1_000, isPlayer: true },
        { id: "ahead", driverName: "Ahead", lapDistanceMeters: 1_100 },
      ],
      { ...content, rangeAhead: 2, rangeBehind: 2 },
    );

    expect(selectedNames(rows)).toEqual(["Ahead", "Player", "Behind"]);
    expect(rows.map(({ side }) => side)).toEqual(["ahead", "player", "behind"]);
  });
});

describe("buildRelativeViewModel", () => {
  it("keeps physical relative gaps when the player is in pit", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "pit", state: "ready" });
    const model = buildRelativeViewModel(
      {
        ...snapshot,
        scoring: vehicles.map((row) =>
          row.isPlayer ? { ...row, inPit: true } : row,
        ),
      },
      { ...content, rangeAhead: 2, rangeBehind: 2 },
    );

    expect(model.rows).toHaveLength(5);
    expect(model.rows.find((row) => row.driverName === "Ahead near")).toMatchObject({
      gapSeconds: 2,
      gapText: "+2.0",
      tone: "ahead",
    });
    expect(model.rows.find((row) => row.driverName === "Behind near")).toMatchObject({
      gapSeconds: -1,
      gapText: "-1.0",
      tone: "behind",
    });
  });

  it("keeps a rival relative gap while that rival is in pit", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const model = buildRelativeViewModel(
      {
        ...snapshot,
        scoring: vehicles.map((row) =>
          row.driverName === "Ahead near" ? { ...row, inPit: true } : row,
        ),
      },
      { ...content, rangeAhead: 2, rangeBehind: 2 },
    );

    const pitRival = model.rows.find((row) => row.driverName === "Ahead near");
    const trackRival = model.rows.find((row) => row.driverName === "Ahead gt");
    expect(pitRival).toMatchObject({ gapSeconds: 2, gapText: "+2.0", tone: "ahead" });
    expect(trackRival).toMatchObject({ gapSeconds: 1, tone: "ahead" });
  });

  it("keeps lap delta separate while rejecting a gap sign that contradicts the physical side", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const model = buildRelativeViewModel(
      {
        ...snapshot,
        scoring: vehicles.map((row) => {
          if (row.driverName === "Ahead near") {
            return { ...row, timeGapToPlayer: -2 };
          }
          if (row.driverName === "Behind near") {
            return { ...row, relativeLapDelta: 1 };
          }
          return row;
        }),
      },
      { ...content, rangeAhead: 2, rangeBehind: 2 },
    );

    expect(model.rows.find((row) => row.driverName === "Ahead near")).toMatchObject({
      side: "ahead",
      gapSeconds: null,
      gapText: "—",
      tone: "neutral",
    });
    expect(model.rows.find((row) => row.driverName === "Behind near")).toMatchObject({
      side: "behind",
      gapSeconds: -1,
      gapText: "-1.0",
      tone: "behind",
    });
  });

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
      lapDistanceMeters: index * 50,
      timeGapToPlayer: index === 50 ? 0 : index < 50 ? 50 - index : -(index - 50),
      isPlayer: index === 50,
    }));
    const model = buildRelativeViewModel(
      { ...snapshot, scoring: manyRows },
      { ...content, rangeAhead: 2, rangeBehind: 2 },
    );
    expect(model.rows).toHaveLength(5);
    expect(model.rows.some((row) => row.isPlayer)).toBe(true);
  });
});
