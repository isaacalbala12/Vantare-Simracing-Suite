import { describe, expect, it } from "vitest";
import {
  RELATIVE_DEFAULT_TEMPLATE_ID,
  RELATIVE_METRICS,
  createDefaultRelativeColumns,
  getRelativeColumn,
  getRelativeMetric,
  getRelativeTemplate,
} from "./relative-catalog";

describe("relative catalog", () => {
  it("declares the Vantare default template", () => {
    const template = getRelativeTemplate(RELATIVE_DEFAULT_TEMPLATE_ID);

    expect(template.id).toBe("relative-vantare-default");
    expect(template.columns.map((column) => column.id)).toEqual([
      "position",
      "class",
      "carNumber",
      "driverName",
      "gap",
      "bestLap",
      "lastLap",
    ]);
  });

  it("creates current Relative columns as enabled defaults", () => {
    const columns = createDefaultRelativeColumns();

    expect(columns.filter((column) => column.enabled).map((column) => column.id)).toEqual([
      "position",
      "class",
      "carNumber",
      "driverName",
      "gap",
    ]);
    expect(columns.find((column) => column.id === "bestLap")?.enabled).toBe(false);
    expect(columns.find((column) => column.id === "lastLap")?.enabled).toBe(false);
  });

  it("marks bestLap and lastLap as stable REST-backed metrics", () => {
    expect(getRelativeMetric("bestLap")).toMatchObject({
      id: "bestLap",
      sourceField: "bestLapTime",
      releaseChannel: "stable",
      reliability: "available",
      requiresLive: false,
    });
    expect(getRelativeMetric("lastLap")).toMatchObject({
      id: "lastLap",
      sourceField: "lastLapTime",
      releaseChannel: "stable",
      reliability: "available",
      requiresLive: false,
    });
  });

  it("keeps every template column backed by a compatible metric", () => {
    const template = getRelativeTemplate(RELATIVE_DEFAULT_TEMPLATE_ID);

    for (const column of template.columns) {
      const metric = getRelativeMetric(column.metricId);
      expect(metric).toBeDefined();
      expect(metric!.widgets).toContain("relative");
      expect(metric!.columns).toContain(column.id);
    }
  });

  it("returns undefined for unknown catalog entries", () => {
    expect(getRelativeMetric("unknown")).toBeUndefined();
    expect(getRelativeColumn("unknown")).toBeUndefined();
  });

  it("does not reuse translated labels as ids", () => {
    expect(RELATIVE_METRICS.map((metric) => metric.id)).toEqual([
      "position",
      "class",
      "carNumber",
      "driverName",
      "gap",
      "bestLap",
      "lastLap",
    ]);
  });

  it("creates default formats for driver name and lap columns", () => {
    const columns = createDefaultRelativeColumns();

    expect(columns.find((column) => column.id === "driverName")?.format).toEqual({
      mode: "full",
      maxChars: 18,
    });
    expect(columns.find((column) => column.id === "bestLap")?.format).toEqual({
      display: "full",
      decimals: 3,
    });
    expect(columns.find((column) => column.id === "lastLap")?.format).toEqual({
      display: "full",
      decimals: 3,
    });
  });
});
