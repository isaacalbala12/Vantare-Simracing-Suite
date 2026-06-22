import { describe, expect, it } from "vitest";
import {
  STANDINGS_COLUMNS,
  STANDINGS_METRICS,
  createDefaultStandingsColumns,
  getStandingsColumn,
  getStandingsMetric,
} from "./standings-catalog";

describe("standings catalog", () => {
  it("returns default columns in stable order", () => {
    const columns = createDefaultStandingsColumns();

    expect(columns.map((column) => column.id)).toEqual([
      "position",
      "driverNumber",
      "driverName",
      "gap",
      "vehicleClass",
      "currentLap",
      "interval",
      "bestLap",
      "lastLap",
    ]);
  });

  it("enables base columns by default", () => {
    const columns = createDefaultStandingsColumns();

    expect(columns.filter((column) => column.enabled).map((column) => column.id)).toEqual([
      "position",
      "driverNumber",
      "driverName",
      "gap",
    ]);
  });

  it("disables optional alpha columns by default", () => {
    const columns = createDefaultStandingsColumns();
    const optionalIds = ["vehicleClass", "currentLap", "interval", "bestLap", "lastLap"];

    for (const id of optionalIds) {
      expect(columns.find((column) => column.id === id)?.enabled).toBe(false);
    }
  });

  it("references a defined metric for every column", () => {
    for (const column of STANDINGS_COLUMNS) {
      const metric = getStandingsMetric(column.metricId);
      expect(metric).toBeDefined();
    }
  });

  it("does not include later or unavailable metrics in stable metrics", () => {
    const stableMetrics = STANDINGS_METRICS.filter((metric) => metric.releaseChannel === "stable");
    const stableIds = stableMetrics.map((metric) => metric.id);

    const laterOrUnavailableIds = [
      "nationality",
      "positionsGained",
      "tireCompound",
      "offtracks",
      "maxSpeed",
      "virtualEnergy",
      "brandLogo",
      "lastFiveLaps",
      "lastTenLaps",
      "pitLapDuration",
    ];

    for (const id of laterOrUnavailableIds) {
      expect(stableIds).not.toContain(id);
    }
  });

  it("returns a fresh copy from createDefaultStandingsColumns", () => {
    const first = createDefaultStandingsColumns();
    const second = createDefaultStandingsColumns();

    expect(first).not.toBe(second);

    const firstDriverName = first.find((column) => column.id === "driverName")!;
    const secondDriverName = second.find((column) => column.id === "driverName")!;
    expect(firstDriverName).not.toBe(secondDriverName);
    expect(firstDriverName.format).not.toBe(secondDriverName.format);
    expect(firstDriverName.style).not.toBe(secondDriverName.style);

    const firstBestLap = first.find((column) => column.id === "bestLap")!;
    const secondBestLap = second.find((column) => column.id === "bestLap")!;
    expect(firstBestLap.format).not.toBe(secondBestLap.format);
    expect(firstBestLap.style).not.toBe(secondBestLap.style);
  });

  it("returns undefined for unknown catalog entries", () => {
    expect(getStandingsMetric("unknown")).toBeUndefined();
    expect(getStandingsColumn("unknown")).toBeUndefined();
  });

  it("provides default width, format and style for name and lap columns", () => {
    const columns = createDefaultStandingsColumns();

    expect(columns.find((column) => column.id === "driverName")).toMatchObject({
      width: 132,
      format: { mode: "full", maxChars: 16 },
      style: { align: "left" },
    });

    expect(columns.find((column) => column.id === "bestLap")).toMatchObject({
      width: 76,
      format: { display: "full", decimals: 3 },
      style: { align: "right" },
    });

    expect(columns.find((column) => column.id === "lastLap")).toMatchObject({
      width: 76,
      format: { display: "full", decimals: 3 },
      style: { align: "right" },
    });
  });
});
