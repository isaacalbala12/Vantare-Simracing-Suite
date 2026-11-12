import { describe, expect, it } from "vitest";
import {
  studioWidgetDefaults as defaults,
  studioWidgetOptions as o,
} from "../src/contract/generated/studio";
import {
  isWidgetSettings,
  isWidgetSettingsPatch,
} from "../src/contract/studio-widget-settings";

describe("closed Studio settings", () => {
  it("accepts every projected native default, including unsupported nulls", () => {
    for (const [kind, value] of Object.entries(defaults))
      expect(isWidgetSettings(value, kind), kind).toBe(true);
  });
  it("rejects unknown native enum values in host projections too", () => {
    expect(
      isWidgetSettings({ ...defaults.delta, designSystem: "unknown" }, "delta"),
    ).toBe(false);
    expect(
      isWidgetSettings({ ...defaults.delta, style: "unknown" }, "delta"),
    ).toBe(false);
    expect(
      isWidgetSettings({ ...defaults.delta, accent: "unknown" }, "delta"),
    ).toBe(false);
  });
  it("rejects renderer paths, unknown enums and readonly branding", () => {
    for (const value of [
      { kind: "delta", brandVisible: false },
      { kind: "delta", path: "C:/a" },
      { kind: "delta", designSystem: "unknown" },
      { kind: "relative", columns: [{ metric: "driverName", id: "invented" }] },
      { kind: "pedals", gap: null },
      { kind: "delta", style: "unknown" },
      { kind: "delta", accent: "unknown" },
    ])
      expect(isWidgetSettingsPatch(value)).toBe(false);
  });
  it("checks shared boundaries and rejects repeated columns", () => {
    expect(
      isWidgetSettingsPatch({
        kind: "standings",
        rowCount: o.standings.rowsMax,
      }),
    ).toBe(true);
    expect(
      isWidgetSettingsPatch({
        kind: "standings",
        rowCount: o.standings.rowsMax + 1,
      }),
    ).toBe(false);
    expect(
      isWidgetSettingsPatch({
        kind: "relative",
        rangeAhead: o.relative.rangeMax + 1,
      }),
    ).toBe(false);
    expect(
      isWidgetSettingsPatch({
        kind: "relative",
        columns: [{ metric: "driverName" }, { metric: "driverName" }],
      }),
    ).toBe(false);
    expect(
      isWidgetSettingsPatch({
        kind: "relative",
        columns: o.relative.columns.map((metric) => ({ metric })),
      }),
    ).toBe(true);
    expect(isWidgetSettingsPatch({ kind: "standings", columns: null })).toBe(
      true,
    );
    expect(isWidgetSettingsPatch({ kind: "pedals", gap: Number.NaN })).toBe(
      false,
    );
    expect(
      isWidgetSettingsPatch({ kind: "pedals", gap: o.pedals.gapMax }),
    ).toBe(true);
  });
});
