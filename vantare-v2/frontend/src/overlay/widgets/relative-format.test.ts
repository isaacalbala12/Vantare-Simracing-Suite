import { describe, expect, it } from "vitest";
import type { ColumnConfig } from "../../lib/profile";
import {
  formatRelativeDriverName,
  formatRelativeLapTime,
  getRelativeColumnAlign,
  getRelativeColumnColor,
  getRelativeColumnWidth,
  getRelativeIntrinsicWidth,
  RELATIVE_COMPACT_NON_ROW_HEIGHT,
  RELATIVE_COMPACT_ROW_HEIGHT,
  getRelativeCompactHeight,
} from "./relative-format";

describe("relative-format", () => {
  it("renders full driver names by default", () => {
    const column: ColumnConfig = { id: "driverName", metricId: "driverName", enabled: true };

    expect(formatRelativeDriverName("PORSCHE PENSKE MOTORSPORT", column)).toBe("PORSCHE PENSKE MOTORSPORT");
  });

  it("truncates driver names only when configured", () => {
    const column: ColumnConfig = {
      id: "driverName",
      metricId: "driverName",
      enabled: true,
      format: { mode: "truncate", maxChars: 10 },
    };

    expect(formatRelativeDriverName("PORSCHE PENSKE MOTORSPORT", column)).toBe("PORSCHE P…");
  });

  it("formats lap times with full and compact display", () => {
    expect(formatRelativeLapTime(95.765, { id: "bestLap", metricId: "bestLap", enabled: true })).toBe("1:35.765");
    expect(formatRelativeLapTime(95.765, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { display: "compact" },
    })).toBe("35.765");
  });

  it("compact display drops minutes for laps under one minute", () => {
    expect(formatRelativeLapTime(45.123, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { display: "compact", decimals: 3 },
    })).toBe("45.123");
    expect(formatRelativeLapTime(45.123, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { display: "full", decimals: 3 },
    })).toBe("0:45.123");
  });

  it("carries seconds overflow into minutes", () => {
    expect(formatRelativeLapTime(119.9995, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { display: "full", decimals: 0 },
    })).toBe("2:00");
    expect(formatRelativeLapTime(119.9995, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { display: "compact", decimals: 0 },
    })).toBe("0");
  });

  it("formats lap decimals from 0 to 3", () => {
    expect(formatRelativeLapTime(95.765, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { decimals: 0 },
    })).toBe("1:36");
    expect(formatRelativeLapTime(95.765, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { display: "compact", decimals: 1 },
    })).toBe("35.8");
    expect(formatRelativeLapTime(95.765, {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      format: { decimals: 2 },
    })).toBe("1:35.77");
  });

  it("returns dash fallback for missing lap values", () => {
    const column: ColumnConfig = { id: "lastLap", metricId: "lastLap", enabled: true };

    expect(formatRelativeLapTime(undefined, column)).toBe("-");
    expect(formatRelativeLapTime(0, column)).toBe("-");
    expect(formatRelativeLapTime(NaN, column)).toBe("-");
  });

  it("normalizes width, color and alignment", () => {
    const column: ColumnConfig = {
      id: "bestLap",
      metricId: "bestLap",
      enabled: true,
      width: 88,
      style: { color: "#ffcc00", align: "center" },
    };

    expect(getRelativeColumnWidth(column, 62)).toBe(88);
    expect(getRelativeColumnColor(column, "#ffffff")).toBe("#ffcc00");
    expect(getRelativeColumnAlign(column, "right")).toBe("center");
  });

  it("calculates intrinsic width from enabled columns", () => {
    const columns: ColumnConfig[] = [
      { id: "position", metricId: "position", enabled: true, width: 24 },
      { id: "class", metricId: "class", enabled: true, width: 6 },
      { id: "carNumber", metricId: "carNumber", enabled: true, width: 28 },
      { id: "driverName", metricId: "driverName", enabled: true, width: 180 },
      { id: "gap", metricId: "gap", enabled: true, width: 48 },
      { id: "bestLap", metricId: "bestLap", enabled: true, width: 72 },
      { id: "lastLap", metricId: "lastLap", enabled: true, width: 72 },
    ];

    expect(getRelativeIntrinsicWidth(columns)).toBe(462);
  });
});

describe("relative compact height", () => {
  it("computes compact height from fixed chrome and visible rows", () => {
    expect(RELATIVE_COMPACT_ROW_HEIGHT).toBe(31);
    expect(RELATIVE_COMPACT_NON_ROW_HEIGHT).toBe(68);
    expect(getRelativeCompactHeight(0)).toBe(68);
    expect(getRelativeCompactHeight(8)).toBe(316);
  });

  it("clamps invalid compact row counts to zero", () => {
    expect(getRelativeCompactHeight(-3)).toBe(68);
    expect(getRelativeCompactHeight(Number.NaN)).toBe(68);
  });
});
