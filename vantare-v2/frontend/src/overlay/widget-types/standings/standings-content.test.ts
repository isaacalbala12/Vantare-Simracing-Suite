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
    expect(enabled).toEqual(["position", "driverNumber", "driverName", "gap", "bestLap"]);
  });

  it("falls back to defaults when columns are missing", () => {
    const parsed = parseStandingsContent({});
    expect(parsed.columns).toEqual(createDefaultStandingsContent().columns);
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
});