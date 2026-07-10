import { describe, expect, it } from "vitest";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { mergeVisualSettings, prepareWidgetVisualSettings } from "./widget-visual-settings";

describe("mergeVisualSettings", () => {
  it("merges nested plain objects without mutating inputs", () => {
    const base = { typography: { scale: 1, weight: 700 }, flags: ["a"] };
    const overrides = { typography: { scale: 1.2 }, flags: ["b", "c"] };
    const merged = mergeVisualSettings(base, overrides);
    expect(merged).toEqual({
      typography: { scale: 1.2, weight: 700 },
      flags: ["b", "c"],
    });
    expect(base).toEqual({ typography: { scale: 1, weight: 700 }, flags: ["a"] });
    expect(overrides).toEqual({ typography: { scale: 1.2 }, flags: ["b", "c"] });
  });
});

describe("prepareWidgetVisualSettings", () => {
  it("migrates base settings and merges appearance overrides", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    widget.visual = {
      ...widget.visual,
      systemVersion: 0,
      configVersion: 0,
      baseSettings: { legacy: true },
      appearanceOverrides: { accent: { hue: 12 } },
    };
    const prepared = prepareWidgetVisualSettings(widget);
    expect(prepared.registration.widgetType).toBe("delta");
    expect(prepared.settings).toEqual({
      showHeader: true,
      legacy: true,
      accent: { hue: 12 },
    });
  });
});