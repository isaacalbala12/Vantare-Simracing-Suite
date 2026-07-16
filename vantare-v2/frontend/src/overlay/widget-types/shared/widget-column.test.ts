import { describe, expect, it } from "vitest";
import type { WidgetColumnV3 } from "./widget-column";
import {
  cloneWidgetColumns,
  resolveColumnWidthPixels,
  validateWidgetColumns,
  WIDTH_PRESET_PIXELS,
} from "./widget-column";

const sampleColumn: WidgetColumnV3 = {
  id: "position",
  metricId: "position",
  enabled: true,
  widthPreset: "md",
};

describe("validateWidgetColumns", () => {
  it("accepts unique ids and known metric ids", () => {
    expect(() =>
      validateWidgetColumns(
        [
          sampleColumn,
          { ...sampleColumn, id: "gap", metricId: "gap", enabled: false },
        ],
        { allowedMetricIds: ["position", "gap"] },
      ),
    ).not.toThrow();
  });

  it("rejects duplicate column ids", () => {
    expect(() =>
      validateWidgetColumns([sampleColumn, { ...sampleColumn, metricId: "gap" }], {
        allowedMetricIds: ["position", "gap"],
      }),
    ).toThrow(/duplicate id/i);
  });

  it("rejects unknown metric ids", () => {
    expect(() =>
      validateWidgetColumns([{ ...sampleColumn, metricId: "unknown" }], {
        allowedMetricIds: ["position"],
      }),
    ).toThrow(/unknown metric/i);
  });

  it("rejects unsafe format keys", () => {
    expect(() =>
      validateWidgetColumns(
        [{ ...sampleColumn, format: { "bad key": "x" } }],
        { allowedMetricIds: ["position"] },
      ),
    ).toThrow(/unsafe format/i);
    expect(() =>
      validateWidgetColumns(
        [{ ...sampleColumn, format: { constructor: "x" } }],
        { allowedMetricIds: ["position"] },
      ),
    ).toThrow(/unsafe format/i);
  });
});

describe("resolveColumnWidthPixels", () => {
  it("maps presets to deterministic pixel widths", () => {
    expect(resolveColumnWidthPixels({ ...sampleColumn, widthPreset: "xs" }, 48)).toBe(
      WIDTH_PRESET_PIXELS.xs,
    );
    expect(resolveColumnWidthPixels({ ...sampleColumn, widthPreset: "lg" }, 48)).toBe(
      WIDTH_PRESET_PIXELS.lg,
    );
  });

  it("uses fallback for auto preset", () => {
    expect(resolveColumnWidthPixels({ ...sampleColumn, widthPreset: "auto" }, 72)).toBe(72);
  });
});

describe("cloneWidgetColumns", () => {
  it("deep-clones column definitions", () => {
    const columns: WidgetColumnV3[] = [
      {
        ...sampleColumn,
        format: { mode: "truncate", maxChars: 12 },
        style: { align: "center" },
      },
    ];
    const cloned = cloneWidgetColumns(columns);
    expect(cloned).toEqual(columns);
    expect(cloned).not.toBe(columns);
    expect(cloned[0]).not.toBe(columns[0]);
    expect(cloned[0]?.format).not.toBe(columns[0]?.format);
  });
});