import { describe, expect, it } from "vitest";
import { extractPreset, applyPreset, generatePresetId, type WidgetPreset } from "./widget-presets";
import type { ProfileConfig, WidgetConfig } from "./profile";

function makeRelativeWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "rel-1",
    type: "relative",
    enabled: true,
    updateHz: 15,
    position: { x: 100, y: 200, w: 320, h: 280 },
    variantId: "variant-rel-1",
    props: {
      appearance: { accentColor: "#ff0000", textColor: "#ffffff" },
      style: "vantare-racing",
      __previewFillHost: false,
      __engineerTransport: "none",
      mockSessionScenario: "race",
    },
    ...overrides,
  };
}

function makeProfile(widget: WidgetConfig, variants: ProfileConfig["variants"] = []): ProfileConfig {
  return {
    schemaVersion: 2,
    id: "test-profile",
    name: "Test",
    displayMode: "racing",
    monitorIndex: 0,
    widgets: [widget],
    variants,
  };
}

describe("extractPreset", () => {
  it("extracts appearance from widget.props", () => {
    const widget = makeRelativeWidget();
    const profile = makeProfile(widget);
    const preset = extractPreset(widget, profile);
    expect(preset.appearance).toEqual({ accentColor: "#ff0000", textColor: "#ffffff" });
  });

  it("extracts variant from profile.variants when variantId matches", () => {
    const widget = makeRelativeWidget();
    const profile = makeProfile(widget, [
      {
        id: "variant-rel-1",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        themeId: "vantare-racing",
        columns: [{ id: "position", metricId: "position", enabled: true, width: 24 }],
        filters: { rangeAhead: 5 },
      },
    ]);
    const preset = extractPreset(widget, profile);
    expect(preset.variant).toBeDefined();
    expect(preset.variant?.templateId).toBe("relative-vantare-default");
    expect(preset.variant?.columns).toHaveLength(1);
    expect(preset.variant?.filters).toEqual({ rangeAhead: 5 });
  });

  it("does not include variant when widget has no variantId", () => {
    const widget = makeRelativeWidget({ variantId: undefined });
    const profile = makeProfile(widget);
    const preset = extractPreset(widget, profile);
    expect(preset.variant).toBeUndefined();
  });

  it("does not copy position, enabled, variantId, or runtime props", () => {
    const widget = makeRelativeWidget();
    const profile = makeProfile(widget);
    const preset = extractPreset(widget, profile);
    const presetJson = JSON.stringify(preset);
    expect(presetJson).not.toContain("position");
    expect(presetJson).not.toContain("enabled");
    expect(presetJson).not.toContain("variantId");
    expect(presetJson).not.toContain("__previewFillHost");
    expect(presetJson).not.toContain("__engineerTransport");
    expect(presetJson).not.toContain("mockSessionScenario");
    expect(presetJson).not.toContain("telemetryMode");
  });

  it("does not mutate the original widget or profile", () => {
    const widget = makeRelativeWidget();
    const profile = makeProfile(widget, [
      { id: "variant-rel-1", widgetType: "relative", columns: [] },
    ]);
    const widgetJson = JSON.stringify(widget);
    const profileJson = JSON.stringify(profile);
    extractPreset(widget, profile);
    expect(JSON.stringify(widget)).toBe(widgetJson);
    expect(JSON.stringify(profile)).toBe(profileJson);
  });
});

describe("applyPreset", () => {
  it("applies appearance and props to widget", () => {
    const widget = makeRelativeWidget({ props: { appearance: { accentColor: "#000" } } });
    const preset: WidgetPreset = {
      id: "preset-1",
      name: "Test",
      widgetType: "relative",
      appearance: { accentColor: "#00ff00", textColor: "#fff" },
      createdAt: "2026-06-26T10:00:00Z",
      updatedAt: "2026-06-26T10:00:00Z",
    };
    const result = applyPreset(widget, preset);
    expect(result.widget.props?.appearance).toEqual({ accentColor: "#00ff00", textColor: "#fff" });
  });

  it("preserves position, enabled, id, and type", () => {
    const widget = makeRelativeWidget();
    const preset: WidgetPreset = {
      id: "preset-1",
      name: "Test",
      widgetType: "relative",
      appearance: {},
      createdAt: "2026-06-26T10:00:00Z",
      updatedAt: "2026-06-26T10:00:00Z",
    };
    const result = applyPreset(widget, preset);
    expect(result.widget.position).toEqual(widget.position);
    expect(result.widget.enabled).toBe(widget.enabled);
    expect(result.widget.id).toBe(widget.id);
    expect(result.widget.type).toBe(widget.type);
  });

  it("throws when widgetType does not match", () => {
    const widget = makeRelativeWidget();
    const preset: WidgetPreset = {
      id: "preset-1",
      name: "Test",
      widgetType: "delta",
      appearance: {},
      createdAt: "2026-06-26T10:00:00Z",
      updatedAt: "2026-06-26T10:00:00Z",
    };
    expect(() => applyPreset(widget, preset)).toThrow();
  });

  it("generates variantId and returns variant when preset has variant", () => {
    const widget = makeRelativeWidget();
    const preset: WidgetPreset = {
      id: "preset-1",
      name: "Test Variant",
      widgetType: "relative",
      appearance: {},
      variant: {
        templateId: "relative-vantare-default",
        themeId: "vantare-racing",
        columns: [{ id: "position", metricId: "position", enabled: true, width: 24 }],
      },
      createdAt: "2026-06-26T10:00:00Z",
      updatedAt: "2026-06-26T10:00:00Z",
    };
    const result = applyPreset(widget, preset);
    expect(result.widget.variantId).toBe("preset-preset-1-rel-1");
    expect(result.variant).toBeDefined();
    expect(result.variant?.widgetType).toBe("relative");
    expect(result.variant?.columns).toHaveLength(1);
  });

  it("does not generate variant when preset has no variant", () => {
    const widget = makeRelativeWidget();
    const preset: WidgetPreset = {
      id: "preset-1",
      name: "Test",
      widgetType: "relative",
      appearance: {},
      createdAt: "2026-06-26T10:00:00Z",
      updatedAt: "2026-06-26T10:00:00Z",
    };
    const result = applyPreset(widget, preset);
    expect(result.variant).toBeUndefined();
  });

  it("does not mutate the original widget", () => {
    const widget = makeRelativeWidget();
    const widgetJson = JSON.stringify(widget);
    const preset: WidgetPreset = {
      id: "preset-1",
      name: "Test",
      widgetType: "relative",
      appearance: { accentColor: "#000" },
      createdAt: "2026-06-26T10:00:00Z",
      updatedAt: "2026-06-26T10:00:00Z",
    };
    applyPreset(widget, preset);
    expect(JSON.stringify(widget)).toBe(widgetJson);
  });

  it("does not alias preset variant when applied", () => {
    const widget = makeRelativeWidget();
    const preset: WidgetPreset = {
      id: "preset-1",
      name: "Test",
      widgetType: "relative",
      appearance: {},
      variant: {
        templateId: "relative-vantare-default",
        themeId: "vantare-racing",
        columns: [{ id: "position", metricId: "position", enabled: true, width: 24 }],
      },
      createdAt: "2026-06-26T10:00:00Z",
      updatedAt: "2026-06-26T10:00:00Z",
    };
    const presetJson = JSON.stringify(preset);
    const result = applyPreset(widget, preset);
    result.variant!.columns![0].width = 999;
    expect(JSON.stringify(preset)).toBe(presetJson);
  });

  it("does not alias widget variant when extracted", () => {
    const widget = makeRelativeWidget();
    const profile = makeProfile(widget, [
      {
        id: "variant-rel-1",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        themeId: "vantare-racing",
        columns: [{ id: "position", metricId: "position", enabled: true, width: 24 }],
      },
    ]);
    const profileJson = JSON.stringify(profile);
    const preset = extractPreset(widget, profile);
    preset.variant!.columns![0].width = 999;
    expect(JSON.stringify(profile)).toBe(profileJson);
  });
});

describe("generatePresetId", () => {
  it("generates a unique-looking ID", () => {
    const id1 = generatePresetId();
    const id2 = generatePresetId();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(8);
  });
});
