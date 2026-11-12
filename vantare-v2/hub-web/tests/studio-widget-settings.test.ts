import { describe, expect, it } from "vitest";
import recipes from "../../native/hub-host/data/table-presets.json";
import corpus from "../src/contract/generated/corpus/studio.json";
import {
  studioWidgetDefaults as defaults,
  studioWidgetOptions as o,
} from "../src/contract/generated/studio";
import {
  isWidgetSettings,
  isWidgetSettingsPatch,
} from "../src/contract/studio-widget-settings";
import { applyWidgetSettings } from "../src/mock/modules/studio";

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

it("rejects the same negative settings corpus as Rust", () => {
  for (const input of corpus.invalidSettings)
    expect(isWidgetSettingsPatch(input), JSON.stringify(input)).toBe(false);
});

describe("native table recipe commands", () => {
  for (const kind of ["standings", "relative"] as const) {
    for (const tablePreset of o.tableSizes) {
      it(`${kind}: applies ${tablePreset} without persisting the command`, () => {
        const update = { kind, tablePreset };
        expect(isWidgetSettingsPatch(update)).toBe(true);
        const result = applyWidgetSettings(defaults[kind], update);
        expect(result?.columns).toEqual(recipes.recipes[kind][tablePreset]);
        expect(result).not.toHaveProperty("tablePreset");
        if (kind === "standings") {
          expect(result).toHaveProperty(
            "practiceColumns",
            defaults.standings.practiceColumns ??
              defaults.standings.columns ??
              recipes.recipes.standings.standard,
          );
          expect(result).toHaveProperty(
            "qualifyingColumns",
            defaults.standings.qualifyingColumns ??
              defaults.standings.columns ??
              recipes.recipes.standings.standard,
          );
        }
      });
    }
    it(`${kind}: cannot combine a recipe with any other field`, () => {
      for (const extra of [
        { columns: null },
        { style: "neo" },
        { columns: [] },
      ]) {
        expect(
          isWidgetSettingsPatch({ kind, tablePreset: "standard", ...extra }),
        ).toBe(false);
      }
    });
    it(`${kind}: does not offer the Vantare recipe on Eficiencia`, () => {
      expect(
        applyWidgetSettings(
          { ...defaults[kind], designSystem: "eficiencia" },
          { kind, tablePreset: "compact" },
        ),
      ).toBeNull();
    });
  }
  it("preserves existing independent session overrides in the mock", () => {
    const original = {
      ...defaults.standings,
      columns: recipes.recipes.standings.expanded,
      practiceColumns: [],
      qualifyingColumns: recipes.recipes.standings.compact,
    };
    const result = applyWidgetSettings(original, {
      kind: "standings",
      tablePreset: "standard",
    });
    expect(result).toHaveProperty("practiceColumns", []);
    expect(result).toHaveProperty(
      "qualifyingColumns",
      recipes.recipes.standings.compact,
    );
  });
});
