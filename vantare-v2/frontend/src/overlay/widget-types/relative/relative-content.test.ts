import { describe, expect, it } from "vitest";
import {
  createDefaultRelativeContent,
  moveRelativeColumn,
  parseRelativeContent,
  toggleRelativeColumn,
  updateRelativeFilters,
} from "./relative-content";

describe("relative content", () => {
  it("creates stable defaults", () => {
    const content = createDefaultRelativeContent();
    expect(content.rangeAhead).toBe(3);
    expect(content.rangeBehind).toBe(3);
    expect(content.classScope).toBe("all");
    expect(content.includePlayer).toBe(true);
    expect(content.rowHeightMode).toBe("compact");
    expect(content.columns.filter((column) => column.enabled).map((column) => column.metricId)).toEqual([
      "position",
      "class",
      "carNumber",
      "driverName",
      "gap",
      "bestLap",
    ]);
  });

  it("honors migrated window ranges and maps comfortable row height to fill", () => {
    const parsed = parseRelativeContent({
      filters: {
        rangeAhead: 4,
        rangeBehind: 2,
        classScope: "sameClass",
        includePlayer: false,
        rowHeightMode: "comfortable",
      },
    });
    expect(parsed.rangeAhead).toBe(4);
    expect(parsed.rangeBehind).toBe(2);
    expect(parsed.classScope).toBe("sameClass");
    expect(parsed.includePlayer).toBe(true);
    expect(parsed.rowHeightMode).toBe("fill");
  });

  it("clamps out-of-range windows to 0–8 per side", () => {
    const parsed = parseRelativeContent({ rangeAhead: 99, rangeBehind: -8 });
    expect(parsed.rangeAhead).toBe(8);
    expect(parsed.rangeBehind).toBe(0);
  });

  it("rejects duplicate metric ids", () => {
    expect(() =>
      parseRelativeContent({
        columns: [
          { id: "a", metricId: "gap", enabled: true, width: 48 },
          { id: "b", metricId: "gap", enabled: true, width: 48 },
        ],
      }),
    ).toThrow(/duplicate metric id/);
  });

  it("supports column reorder and filter updates", () => {
    const content = createDefaultRelativeContent();
    const toggled = toggleRelativeColumn(content, "bestLap");
    expect(toggled.columns.find((column) => column.id === "bestLap")?.enabled).toBe(false);

    const moved = moveRelativeColumn(content, "driverName", "up");
    expect(moved.columns[2]?.metricId).toBe("driverName");

    const filtered = updateRelativeFilters(content, { classScope: "sameClass", rowHeightMode: "fill" });
    expect(filtered.rangeAhead).toBe(3);
    expect(filtered.classScope).toBe("sameClass");
    expect(filtered.rowHeightMode).toBe("fill");

    const widened = updateRelativeFilters(content, { rangeAhead: 5, rangeBehind: 0 });
    expect(widened.rangeAhead).toBe(5);
    expect(widened.rangeBehind).toBe(0);
    expect(widened.includePlayer).toBe(true);
  });
});
