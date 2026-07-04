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
    expect(slots.map((s) => s.id)).toEqual(["headerStat", "footerStat", "playerBadge"]);
  });

  it("returns same 3 slots for delta with undefined themeId", () => {
    const slots = buildDefaultSlots("delta", undefined);
    expect(slots).toHaveLength(3);
  });

  it("returns empty array for standings (columns model)", () => {
    expect(buildDefaultSlots("standings", "vantare-crystal")).toEqual([]);
  });

  it("returns 3 slots for pedals", () => {
    const slots = buildDefaultSlots("pedals", "vantare-crystal");
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.id)).toEqual(["throttle", "brake", "clutch"]);
  });

  it("returns 5 slots for broadcast-tower", () => {
    const slots = buildDefaultSlots("broadcast-tower", "vantare-crystal");
    expect(slots).toHaveLength(5);
  });

  it("returns 1 slot for multiclass-relative", () => {
    const slots = buildDefaultSlots("multiclass-relative", "vantare-crystal");
    expect(slots).toHaveLength(1);
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
    const cols = buildDefaultColumns("multiclass-relative", "vantare-crystal");
    expect(cols).toHaveLength(4);
  });

  it("returns empty array for delta (slots model)", () => {
    expect(buildDefaultColumns("delta", "vantare-crystal")).toEqual([]);
  });

  it("returns empty array for unknown widget type", () => {
    expect(buildDefaultColumns("unknown-type", "base")).toEqual([]);
  });
});

describe("buildDefaultColumnGroups", () => {
  it("returns column groups for standings", () => {
    const groups = buildDefaultColumnGroups("standings", "vantare-crystal");
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.map((g) => g.id)).toContain("hypercar");
  });

  it("returns empty array for delta (slots model)", () => {
    expect(buildDefaultColumnGroups("delta", "vantare-crystal")).toEqual([]);
  });

  it("returns empty array for unknown widget type", () => {
    expect(buildDefaultColumnGroups("unknown-type", "base")).toEqual([]);
  });
});

describe("filterMetricsForWidget", () => {
  const metrics: MetricCatalogEntry[] = [
    { id: "pos", label: "Position", compatibleWidgets: ["standings", "relative"] },
    { id: "delta", label: "Delta", compatibleWidgets: ["delta"] },
    { id: "speed", label: "Speed", compatibleWidgets: ["standings", "relative", "delta"] },
  ];

  it("returns metrics compatible with standings", () => {
    const result = filterMetricsForWidget("standings", metrics);
    expect(result.map((m) => m.id)).toEqual(["pos", "speed"]);
  });

  it("returns metrics compatible with delta", () => {
    const result = filterMetricsForWidget("delta", metrics);
    expect(result.map((m) => m.id)).toEqual(["delta", "speed"]);
  });

  it("returns empty for incompatible widget", () => {
    const result = filterMetricsForWidget("pedals", metrics);
    expect(result).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(filterMetricsForWidget("standings", [])).toEqual([]);
  });
});

describe("normaliseWidgetVariantConfig", () => {
  it("throws if widgetType is missing", () => {
    expect(() => normaliseWidgetVariantConfig({})).toThrow("widgetType is required");
  });

  it("uses defaults when optional fields are missing", () => {
    const result = normaliseWidgetVariantConfig({ widgetType: "delta" });
    expect(result.slots).toHaveLength(3);
    expect(result.columns).toEqual([]);
    expect(result.columnGroups).toEqual([]);
    expect(result.themeId).toBeUndefined();
    expect(result.name).toBeUndefined();
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

// ---------------------------------------------------------------------------
// MC-1: Editing helpers
// ---------------------------------------------------------------------------

import {
  toggleSlotEnabled,
  updateSlotConfig,
  toggleColumnEnabled,
  updateColumnConfig,
  toggleColumnGroupEnabled,
} from "./widget-config-model";

describe("toggleSlotEnabled", () => {
  const slots = [
    { id: "headerStat", metricId: "pos", enabled: true },
    { id: "delta", metricId: "delta", enabled: false },
  ];

  it("toggles a slot from enabled to disabled", () => {
    const result = toggleSlotEnabled(slots, "headerStat");
    expect(result.find((s) => s.id === "headerStat")?.enabled).toBe(false);
  });

  it("toggles a slot from disabled to enabled", () => {
    const result = toggleSlotEnabled(slots, "delta");
    expect(result.find((s) => s.id === "delta")?.enabled).toBe(true);
  });

  it("does not mutate the original array", () => {
    toggleSlotEnabled(slots, "headerStat");
    expect(slots[0].enabled).toBe(true);
  });

  it("returns same array reference for unknown id", () => {
    const result = toggleSlotEnabled(slots, "nonexistent");
    expect(result).toBe(slots);
  });

  it("does not include position fields in output", () => {
    const result = toggleSlotEnabled(slots, "headerStat");
    for (const slot of result) {
      expect(slot).not.toHaveProperty("position");
      expect(slot).not.toHaveProperty("x");
      expect(slot).not.toHaveProperty("y");
      expect(slot).not.toHaveProperty("w");
      expect(slot).not.toHaveProperty("h");
    }
  });
});

describe("updateSlotConfig", () => {
  const slots = [
    { id: "headerStat", metricId: "pos", enabled: true, format: undefined, style: undefined },
  ];

  it("updates metricId on a slot", () => {
    const result = updateSlotConfig(slots, "headerStat", { metricId: "speed" });
    expect(result[0].metricId).toBe("speed");
  });

  it("updates label (stored as style.label) on a slot", () => {
    const result = updateSlotConfig(slots, "headerStat", { label: "Position" });
    expect(result[0].style).toEqual({ label: "Position" });
  });

  it("does not mutate original", () => {
    updateSlotConfig(slots, "headerStat", { metricId: "speed" });
    expect(slots[0].metricId).toBe("pos");
  });

  it("returns same array for unknown id", () => {
    const result = updateSlotConfig(slots, "nonexistent", { metricId: "x" });
    expect(result).toBe(slots);
  });
});

describe("toggleColumnEnabled", () => {
  const columns = [
    { id: "position", metricId: "pos", enabled: true },
    { id: "driver", metricId: "driverName", enabled: true },
  ];

  it("disables a column", () => {
    const result = toggleColumnEnabled(columns, "position");
    expect(result.find((c) => c.id === "position")?.enabled).toBe(false);
  });

  it("enables a column", () => {
    const cols = [{ id: "gap", metricId: "gap", enabled: false }];
    const result = toggleColumnEnabled(cols, "gap");
    expect(result[0].enabled).toBe(true);
  });

  it("does not mutate original", () => {
    toggleColumnEnabled(columns, "position");
    expect(columns[0].enabled).toBe(true);
  });

  it("returns same array for unknown id", () => {
    const result = toggleColumnEnabled(columns, "nonexistent");
    expect(result).toBe(columns);
  });

  it("does not include position fields", () => {
    const result = toggleColumnEnabled(columns, "position");
    for (const col of result) {
      expect(col).not.toHaveProperty("position");
      expect(col).not.toHaveProperty("x");
      expect(col).not.toHaveProperty("y");
    }
  });
});

describe("updateColumnConfig", () => {
  const columns = [
    { id: "position", metricId: "pos", enabled: true, width: 60, format: undefined, style: undefined },
  ];

  it("updates metricId", () => {
    const result = updateColumnConfig(columns, "position", { metricId: "class" });
    expect(result[0].metricId).toBe("class");
  });

  it("updates widthPreset", () => {
    const result = updateColumnConfig(columns, "position", { widthPreset: "lg" });
    expect(result[0].widthPreset).toBe("lg");
  });

  it("does not mutate original", () => {
    updateColumnConfig(columns, "position", { metricId: "class" });
    expect(columns[0].metricId).toBe("pos");
  });

  it("returns same array for unknown id", () => {
    const result = updateColumnConfig(columns, "nonexistent", { metricId: "x" });
    expect(result).toBe(columns);
  });
});

describe("toggleColumnGroupEnabled", () => {
  const groups = [
    { id: "hypercar", enabled: true, columns: [] },
    { id: "lmp2", enabled: false, columns: [] },
  ];

  it("disables a group", () => {
    const result = toggleColumnGroupEnabled(groups, "hypercar");
    expect(result.find((g) => g.id === "hypercar")?.enabled).toBe(false);
  });

  it("enables a group", () => {
    const result = toggleColumnGroupEnabled(groups, "lmp2");
    expect(result.find((g) => g.id === "lmp2")?.enabled).toBe(true);
  });

  it("does not mutate original", () => {
    toggleColumnGroupEnabled(groups, "hypercar");
    expect(groups[0].enabled).toBe(true);
  });

  it("returns same array for unknown id", () => {
    const result = toggleColumnGroupEnabled(groups, "nonexistent");
    expect(result).toBe(groups);
  });
});

// ---------------------------------------------------------------------------
// MC-2: resolveEffectiveWidgetVariant
// ---------------------------------------------------------------------------

import { resolveEffectiveWidgetVariant } from "./widget-config-model";

describe("resolveEffectiveWidgetVariant", () => {
  it("uses variant when widget has variantId matching a profile variant", () => {
    const widget = {
      type: "standings",
      variantId: "v1",
      style: "base",
    };
    const profile = {
      variants: [
        {
          id: "v1",
          widgetType: "standings",
          themeId: "vantare-crystal",
          columns: [{ id: "position", metricId: "pos", enabled: true }],
        },
      ],
    };
    const result = resolveEffectiveWidgetVariant(widget, profile);
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].id).toBe("position");
    expect(result.themeId).toBe("vantare-crystal");
  });

  it("falls back to defaults when variantId not found", () => {
    const widget = {
      type: "standings",
      variantId: "nonexistent",
      style: "base",
    };
    const profile = { variants: [] };
    const result = resolveEffectiveWidgetVariant(widget, profile);
    expect(result.columns).toHaveLength(7);
  });

  it("uses widget.props slots/columns when no variant", () => {
    const widget = {
      type: "standings",
      style: "base",
      props: {
        columns: [{ id: "position", metricId: "pos", enabled: false }],
      },
    };
    const profile = {};
    const result = resolveEffectiveWidgetVariant(widget, profile);
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].enabled).toBe(false);
  });

  it("falls back to defaults when no variant and no props", () => {
    const widget = { type: "delta", style: "base" };
    const profile = {};
    const result = resolveEffectiveWidgetVariant(widget, profile);
    expect(result.slots).toHaveLength(3);
    expect(result.columns).toEqual([]);
  });

  it("does not touch position", () => {
    const widget = { type: "standings", style: "base" };
    const profile = {};
    const result = resolveEffectiveWidgetVariant(widget, profile);
    expect(result).not.toHaveProperty("position");
    expect(result).not.toHaveProperty("x");
    expect(result).not.toHaveProperty("y");
    expect(result).not.toHaveProperty("w");
    expect(result).not.toHaveProperty("h");
  });
});
