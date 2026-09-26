import { describe, expect, it } from "vitest";
import {
  createDefaultStandingsContent,
  moveStandingsColumn,
  nearestWidthPreset,
  parseStandingsContent,
  toggleStandingsColumn,
} from "./standings-content";

describe("standings-content", () => {
  it("creates default columns with the planned enabled metrics", () => {
    const content = createDefaultStandingsContent();
    const enabled = content.columns.filter((column) => column.enabled).map((column) => column.metricId);
    expect(enabled).toEqual(["position", "driverNumber", "driverName", "gap", "lastLap"]);
  });

  it("falls back to defaults when columns are missing", () => {
    const parsed = parseStandingsContent({});
    expect(parsed.columns).toEqual(createDefaultStandingsContent().columns);
  });

  it("infers legacy all-class content as multiclass unless the mode is explicit", () => {
    const legacy = parseStandingsContent({ ...createDefaultStandingsContent(), classScope: "all-classes" });
    const normal = parseStandingsContent({ classScope: "all-classes", classificationMode: "normal" });
    expect(legacy.classificationMode).toBe("multiclass");
    expect(normal.classificationMode).toBe("normal");
  });

  it("maps legacy numeric widths to the nearest preset", () => {
    expect(nearestWidthPreset(28)).toBe("sm");
    expect(nearestWidthPreset(132)).toBe("lg");
    const parsed = parseStandingsContent({
      columns: [
        {
          id: "position",
          metricId: "position",
          enabled: true,
          width: 28,
        },
      ],
    });
    expect(parsed.columns[0]?.widthPreset).toBe("sm");
  });

  it("rejects duplicate and unknown metrics", () => {
    expect(() =>
      parseStandingsContent({
        columns: [
          { id: "position", metricId: "position", enabled: true, widthPreset: "sm" },
          { id: "position-copy", metricId: "position", enabled: true, widthPreset: "sm" },
        ],
      }),
    ).toThrow(/duplicate metric/i);

    expect(() =>
      parseStandingsContent({
        columns: [{ id: "custom", metricId: "unknown", enabled: true, widthPreset: "sm" }],
      }),
    ).toThrow(/unknown metric/i);
  });

  it("supports column toggles and reordering helpers", () => {
    const content = createDefaultStandingsContent();
    const disabledGap = toggleStandingsColumn(content, "gap");
    expect(disabledGap.columns.find((column) => column.id === "gap")?.enabled).toBe(false);

    const moved = moveStandingsColumn(content, "driverName", "up");
    expect(moved.columns[1]?.id).toBe("driverName");
    expect(moved.columns[0]?.id).toBe("position");
  });

  it("defaults rowCount to 20", () => {
    const content = createDefaultStandingsContent();
    expect(content.rowCount).toBe(20);
  });

  it("accepts every rowCount in the 1–30 range", () => {
    for (const count of [1, 5, 7, 10, 15, 20, 25, 30]) {
      const parsed = parseStandingsContent({ rowCount: count });
      expect(parsed.rowCount).toBe(count);
    }
  });

  it("rejects invalid rowCount and falls back to default", () => {
    expect(parseStandingsContent({ rowCount: 0 }).rowCount).toBe(20);
    expect(parseStandingsContent({ rowCount: 31 }).rowCount).toBe(20);
    expect(parseStandingsContent({ rowCount: -1 }).rowCount).toBe(20);
    expect(parseStandingsContent({ rowCount: 7.5 }).rowCount).toBe(20);
    expect(parseStandingsContent({ rowCount: "25" }).rowCount).toBe(20);
  });

  it("preserves rowCount when parsing existing content", () => {
    const parsed = parseStandingsContent({
      columns: [{ id: "position", metricId: "position", enabled: true, widthPreset: "sm" }],
      rowCount: 10,
    });
    expect(parsed.rowCount).toBe(10);
  });
});
