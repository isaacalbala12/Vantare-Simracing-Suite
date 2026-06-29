import { describe, expect, it } from "vitest";
import {
  OFFICIAL_DESIGNS,
  applyOfficialDesign,
  applyOfficialDesignToProfile,
  getOfficialDesign,
  isOfficialDesignCompatible,
  listOfficialDesigns,
} from "./widget-design-gallery";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";

function makeWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
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

describe("OFFICIAL_DESIGNS catalog", () => {
  it("includes designs for every supported widget type", () => {
    const supportedTypes = ["relative", "standings", "delta", "pedals"];
    for (const type of supportedTypes) {
      const designs = OFFICIAL_DESIGNS.filter((d) => d.widgetType === type);
      expect(designs.length, `expected at least 2 designs for ${type}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses unique ids across the catalog", () => {
    const ids = new Set(OFFICIAL_DESIGNS.map((d) => d.id));
    expect(ids.size).toBe(OFFICIAL_DESIGNS.length);
  });

  it("every design has a non-empty name and description", () => {
    for (const d of OFFICIAL_DESIGNS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
    }
  });
});

describe("listOfficialDesigns", () => {
  it("returns only designs matching the requested widget type", () => {
    expect(listOfficialDesigns("relative").every((d) => d.widgetType === "relative")).toBe(true);
    expect(listOfficialDesigns("standings").every((d) => d.widgetType === "standings")).toBe(true);
    expect(listOfficialDesigns("delta").every((d) => d.widgetType === "delta")).toBe(true);
    expect(listOfficialDesigns("pedals").every((d) => d.widgetType === "pedals")).toBe(true);
  });

  it("returns empty list for unknown widget types", () => {
    expect(listOfficialDesigns("unknown-type")).toEqual([]);
    expect(listOfficialDesigns("")).toEqual([]);
  });

  it("returns a stable slice per widget type", () => {
    expect(listOfficialDesigns("relative").length).toBeGreaterThan(0);
    expect(listOfficialDesigns("relative").length).toBe(listOfficialDesigns("relative").length);
  });
});

describe("getOfficialDesign", () => {
  it("returns the design by id", () => {
    const d = getOfficialDesign("vantare-racing-essential");
    expect(d).toBeDefined();
    expect(d?.widgetType).toBe("relative");
  });

  it("returns undefined for unknown id", () => {
    expect(getOfficialDesign("does-not-exist")).toBeUndefined();
  });
});

describe("isOfficialDesignCompatible", () => {
  it("returns true when widget type matches design type", () => {
    const widget = makeWidget();
    const design = OFFICIAL_DESIGNS.find((d) => d.widgetType === "relative")!;
    expect(isOfficialDesignCompatible(design, widget)).toBe(true);
  });

  it("returns false when widget type differs from design type", () => {
    const widget = makeWidget();
    const design = OFFICIAL_DESIGNS.find((d) => d.widgetType === "delta")!;
    expect(isOfficialDesignCompatible(design, widget)).toBe(false);
  });

  it("returns false when widget is null", () => {
    const design = OFFICIAL_DESIGNS[0];
    expect(isOfficialDesignCompatible(design, null)).toBe(false);
  });
});

describe("applyOfficialDesign", () => {
  it("preserves widget position byte for byte", () => {
    const widget = makeWidget();
    const design = getOfficialDesign("vantare-racing-essential")!;
    const result = applyOfficialDesign(widget, design);
    expect(result.widget.position).toEqual(widget.position);
    expect(result.widget.position).toEqual({ x: 100, y: 200, w: 320, h: 280 });
  });

  it("updates appearance from the design", () => {
    const widget = makeWidget();
    const design = getOfficialDesign("vantare-racing-essential")!;
    const result = applyOfficialDesign(widget, design);
    expect(result.widget.props?.appearance).toEqual(design.appearance);
  });

  it("generates a stable variant id based on design and widget", () => {
    const widget = makeWidget();
    const design = getOfficialDesign("vantare-racing-essential")!;
    const result = applyOfficialDesign(widget, design);
    expect(result.widget.variantId).toBe(`official-${design.id}-${widget.id}`);
    expect(result.variant?.id).toBe(result.widget.variantId);
  });

  it("returns a variant matching the widget type and design name", () => {
    const widget = makeWidget();
    const design = getOfficialDesign("vantare-racing-essential")!;
    const result = applyOfficialDesign(widget, design);
    expect(result.variant).toBeDefined();
    expect(result.variant?.widgetType).toBe(widget.type);
    expect(result.variant?.name).toBe(design.name);
  });

  it("changes variant columns when the design defines them", () => {
    const widget = makeWidget();
    const design = getOfficialDesign("broadcast-pro")!;
    const result = applyOfficialDesign(widget, design);
    const bestLap = result.variant?.columns?.find((c) => c.id === "bestLap");
    const lastLap = result.variant?.columns?.find((c) => c.id === "lastLap");
    expect(bestLap?.enabled).toBe(true);
    expect(lastLap?.enabled).toBe(true);
  });

  it("throws when widget type does not match design type", () => {
    const widget = makeWidget({ type: "delta" });
    const design = getOfficialDesign("vantare-racing-essential")!;
    expect(() => applyOfficialDesign(widget, design)).toThrow(/does not match widget type/);
  });

  it("does not mutate the original widget", () => {
    const widget = makeWidget();
    const widgetJson = JSON.stringify(widget);
    const design = getOfficialDesign("broadcast-pro")!;
    applyOfficialDesign(widget, design);
    expect(JSON.stringify(widget)).toBe(widgetJson);
  });

  it("preserves enabled, updateHz and id from the original widget", () => {
    const widget = makeWidget({ enabled: false, updateHz: 5 });
    const design = getOfficialDesign("delta-broadcast")!;
    const widgetForDelta: WidgetConfig = { ...widget, type: "delta" };
    const result = applyOfficialDesign(widgetForDelta, design);
    expect(result.widget.enabled).toBe(false);
    expect(result.widget.updateHz).toBe(5);
    expect(result.widget.id).toBe(widget.id);
    expect(result.widget.type).toBe("delta");
  });

  it("applies design to standings widget preserving position and changing columns", () => {
    const widget = makeWidget({
      id: "stand-1",
      type: "standings",
      position: { x: 50, y: 60, w: 340, h: 420 },
    });
    const design = getOfficialDesign("standings-endurance")!;
    const result = applyOfficialDesign(widget, design);
    expect(result.widget.position).toEqual({ x: 50, y: 60, w: 340, h: 420 });
    expect(result.widget.props?.appearance).toEqual(design.appearance);
    expect(result.variant?.columns?.find((c) => c.id === "interval")?.enabled).toBe(true);
    expect(result.variant?.columns?.find((c) => c.id === "currentLap")?.enabled).toBe(true);
  });

  it("applies design to pedals widget preserving position and changing colors", () => {
    const widget = makeWidget({
      id: "pedals-1",
      type: "pedals",
      position: { x: 80, y: 80, w: 90, h: 100 },
    });
    const design = getOfficialDesign("pedals-clean-broadcast")!;
    const result = applyOfficialDesign(widget, design);
    expect(result.widget.position).toEqual({ x: 80, y: 80, w: 90, h: 100 });
    expect(result.widget.props?.appearance?.pedalThrottleColor).toBe("#34d399");
    expect(result.widget.props?.appearance?.pedalBrakeColor).toBe("#e63946");
    expect(result.widget.props?.appearance?.pedalClutchColor).toBe("#3aa6c8");
    expect(result.widget.props?.appearance?.backgroundColor).toBe("transparent");
  });

  it("applies design to delta widget preserving position", () => {
    const widget = makeWidget({
      id: "delta-1",
      type: "delta",
      position: { x: 700, y: 40, w: 400, h: 48 },
    });
    const design = getOfficialDesign("delta-time-attack")!;
    const result = applyOfficialDesign(widget, design);
    expect(result.widget.position).toEqual({ x: 700, y: 40, w: 400, h: 48 });
    expect(result.widget.props?.appearance?.positiveColor).toBe("#e74c3c");
    expect(result.widget.props?.appearance?.negativeColor).toBe("#2ecc71");
  });
});

describe("applyOfficialDesignToProfile", () => {
  it("returns a new profile with updated widget and preserved position", () => {
    const widget = makeWidget();
    const profile = makeProfile(widget);
    const design = getOfficialDesign("broadcast-pro")!;
    const next = applyOfficialDesignToProfile(profile, widget.id, design);
    expect(next).not.toBe(profile);
    const newWidget = next.widgets.find((w) => w.id === widget.id);
    expect(newWidget?.position).toEqual(widget.position);
    expect(newWidget?.props?.appearance).toEqual(design.appearance);
  });

  it("replaces previous variant in profile.variants when applying a new design", () => {
    const widget = makeWidget();
    const profile = makeProfile(widget, [
      { id: "variant-rel-1", widgetType: "relative", templateId: "old-template" },
    ]);
    const design = getOfficialDesign("vantare-racing-essential")!;
    const next = applyOfficialDesignToProfile(profile, widget.id, design);
    expect(next.variants?.some((v) => v.id === "variant-rel-1")).toBe(false);
    expect(next.variants?.some((v) => v.templateId === "relative-vantare-default")).toBe(true);
  });

  it("returns the same profile when widget id is not found", () => {
    const widget = makeWidget();
    const profile = makeProfile(widget);
    const design = getOfficialDesign("vantare-racing-essential")!;
    const next = applyOfficialDesignToProfile(profile, "missing-widget", design);
    expect(next).toBe(profile);
  });

  it("preserves position when replacing an existing variant", () => {
    const widget = makeWidget({
      position: { x: 222, y: 333, w: 444, h: 555 },
    });
    const profile = makeProfile(widget, [
      { id: "variant-rel-1", widgetType: "relative", templateId: "old-template" },
    ]);
    const design = getOfficialDesign("broadcast-pro")!;
    const next = applyOfficialDesignToProfile(profile, widget.id, design);
    const newWidget = next.widgets.find((w) => w.id === widget.id);
    expect(newWidget?.position).toEqual({ x: 222, y: 333, w: 444, h: 555 });
  });
});