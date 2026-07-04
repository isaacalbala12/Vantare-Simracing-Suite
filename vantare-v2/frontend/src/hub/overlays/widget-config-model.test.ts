import { describe, it, expect } from "vitest";
import {
  buildDefaultSlots,
  buildDefaultColumns,
  buildDefaultColumnGroups,
  filterMetricsForWidget,
  normaliseWidgetVariantConfig,
  type MetricCatalogEntry,
} from "./widget-config-model";

describe("buildDefaultSlots", () => {
  it("returns 3 slots for delta with themeId", () => {
    const slots = buildDefaultSlots("delta", "vantare-crystal");
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.id)).toEqual([
      "headerStat",
      "footerStat",
      "playerBadge",
    ]);
  });

  it("returns same 3 slots for delta with undefined themeId", () => {
    const slots = buildDefaultSlots("delta", undefined);
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.id)).toEqual([
      "headerStat",
      "footerStat",
      "playerBadge",
    ]);
  });

  it("returns empty array for standings (columns model)", () => {
    expect(buildDefaultSlots("standings", "vantare-crystal")).toEqual([]);
  });

  it("returns 3 slots for pedals", () => {
    const slots = buildDefaultSlots("pedals", undefined);
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.id)).toEqual(["throttle", "brake", "clutch"]);
  });

  it("returns 5 slots for broadcast-tower", () => {
    const slots = buildDefaultSlots("broadcast-tower", undefined);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.id)).toEqual([
      "lapCounter",
      "position1",
      "position2",
      "position3",
      "position4",
    ]);
  });

  it("returns 1 slot for multiclass-relative", () => {
    const slots = buildDefaultSlots("multiclass-relative", undefined);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.id).toBe("classBadge");
  });

  it("returns empty array for unknown widget type", () => {
    expect(buildDefaultSlots("unknown-type", "base")).toEqual([]);
  });
});

describe("buildDefaultColumns", () => {
  it("returns 7 columns for standings", () => {
    const cols = buildDefaultColumns("standings", "vantare-crystal");
    expect(cols).toHaveLength(7);
    expect(cols.map((c) => c.id)).toEqual([
      "position",
      "carNumber",
      "driver",
      "class",
      "gap",
      "lastLap",
      "bestLap",
    ]);
  });

  it("returns 6 columns for relative", () => {
    const cols = buildDefaultColumns("relative", "vantare-crystal");
    expect(cols).toHaveLength(6);
    expect(cols.map((c) => c.id)).toEqual([
      "position",
      "carNumber",
      "driver",
      "gap",
      "bestLap",
      "lastLap",
    ]);
  });

  it("returns 4 columns for multiclass-relative", () => {
    const cols = buildDefaultColumns("multiclass-relative", undefined);
    expect(cols).toHaveLength(4);
    expect(cols.map((c) => c.id)).toEqual([
      "position",
      "className",
      "driver",
      "gap",
    ]);
  });

  it("returns empty array for delta (slots model)", () => {
    expect(buildDefaultColumns("delta", "vantare-crystal")).toEqual([]);
  });

  it("returns empty array for unknown widget type", () => {
    expect(buildDefaultColumns("unknown-type", "base")).toEqual([]);
  });
});

describe("buildDefaultColumnGroups", () => {
  it("returns 3 groups for standings", () => {
    const groups = buildDefaultColumnGroups("standings", "vantare-crystal");
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.id)).toEqual(["hypercar", "lmp2", "lmgt3"]);
    expect(groups[0]!.enabled).toBe(true);
    expect(groups[1]!.enabled).toBe(true);
    expect(groups[2]!.enabled).toBe(false);
    expect(groups[0]!.columns).toHaveLength(7);
  });

  it("returns empty array for delta", () => {
    expect(buildDefaultColumnGroups("delta", "vantare-crystal")).toEqual([]);
  });

  it("returns empty array for relative", () => {
    expect(buildDefaultColumnGroups("relative", undefined)).toEqual([]);
  });
});

describe("filterMetricsForWidget", () => {
  it("returns only metrics compatible with standings", () => {
    const metrics: MetricCatalogEntry[] = [
      {
        id: "pos",
        label: "Position",
        compatibleWidgets: ["standings", "relative"],
      },
      {
        id: "throttle",
        label: "Throttle",
        compatibleWidgets: ["pedals"],
      },
      {
        id: "gap",
        label: "Gap",
        compatibleWidgets: ["standings"],
      },
    ];
    const result = filterMetricsForWidget("standings", metrics);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["pos", "gap"]);
  });

  it("returns empty array for delta with empty metrics", () => {
    expect(filterMetricsForWidget("delta", [])).toEqual([]);
  });

  it("returns empty array when no metrics match", () => {
    const metrics: MetricCatalogEntry[] = [
      {
        id: "throttle",
        label: "Throttle",
        compatibleWidgets: ["pedals"],
      },
    ];
    expect(filterMetricsForWidget("standings", metrics)).toEqual([]);
  });
});

describe("normaliseWidgetVariantConfig", () => {
  it("populates slots array for delta, has no position", () => {
    const result = normaliseWidgetVariantConfig({ widgetType: "delta" });
    expect(result.slots).toBeDefined();
    expect(result.slots!.length).toBe(3);
    expect(result).not.toHaveProperty("position");
    expect(result).not.toHaveProperty("x");
    expect(result).not.toHaveProperty("y");
    expect(result).not.toHaveProperty("w");
    expect(result).not.toHaveProperty("h");
  });

  it("result has no position/x/y/w/h keys", () => {
    const result = normaliseWidgetVariantConfig({ widgetType: "standings" });
    const forbidden = ["position", "x", "y", "w", "h"];
    for (const key of forbidden) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it("throws when widgetType is missing", () => {
    expect(() => normaliseWidgetVariantConfig({})).toThrow("widgetType");
  });

  it("preserves provided id", () => {
    const result = normaliseWidgetVariantConfig({
      id: "custom-id",
      widgetType: "delta",
    });
    expect(result.id).toBe("custom-id");
  });

  it("generates id when not provided", () => {
    const result = normaliseWidgetVariantConfig({ widgetType: "delta" });
    expect(result.id).toMatch(/^variant-delta-\d+$/);
  });

  it("defaults filters and formats to empty objects", () => {
    const result = normaliseWidgetVariantConfig({ widgetType: "delta" });
    expect(result.filters).toEqual({});
    expect(result.formats).toEqual({});
  });
});
