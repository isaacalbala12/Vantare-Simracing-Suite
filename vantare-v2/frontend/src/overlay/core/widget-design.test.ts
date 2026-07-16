import { describe, expect, it } from "vitest";
import type { WidgetInstanceV3 } from "./profile-document";
import { applyWidgetDesign, validateWidgetDesign, type WidgetDesignV1 } from "./widget-design";

function baseWidget(): WidgetInstanceV3 {
  return {
    id: "delta-main",
    type: "delta",
    layout: { x: 10, y: 20, w: 100, h: 50, zIndex: 0, aspectLocked: true },
    behavior: { enabled: true, updateHz: 30, visibleWhen: { inPit: false } },
    content: { keep: true },
    visual: {
      systemId: "vantare-original",
      systemVersion: 1,
      configVersion: 1,
      baseSettings: { old: true },
      appearanceOverrides: { tint: "#fff" },
    },
  };
}

function baseDesign(overrides: Partial<WidgetDesignV1> = {}): WidgetDesignV1 {
  return {
    id: "design-1",
    name: "Design One",
    widgetType: "delta",
    systemId: "vantare-crystal",
    systemVersion: 2,
    configVersion: 3,
    visual: { accentColor: "#abc" },
    content: { columns: [{ id: "position" }] },
    includesContent: true,
    origin: "user",
    ...overrides,
  };
}

describe("applyWidgetDesign", () => {
  it("preserves id layout behavior and type", () => {
    const widget = baseWidget();
    const applied = applyWidgetDesign(widget, baseDesign(), "2026-07-10T00:00:00Z");
    expect(applied.id).toBe(widget.id);
    expect(applied.type).toBe(widget.type);
    expect(applied.layout).toEqual(widget.layout);
    expect(applied.behavior).toEqual(widget.behavior);
  });

  it("replaces visual system settings and clears appearance overrides", () => {
    const applied = applyWidgetDesign(baseWidget(), baseDesign(), "2026-07-10T00:00:00Z");
    expect(applied.visual.systemId).toBe("vantare-crystal");
    expect(applied.visual.systemVersion).toBe(2);
    expect(applied.visual.configVersion).toBe(3);
    expect(applied.visual.baseSettings).toEqual({ accentColor: "#abc" });
    expect(applied.visual.appearanceOverrides).toEqual({});
    expect(applied.visual.provenance).toEqual({
      designId: "design-1",
      designName: "Design One",
      origin: "user",
      appliedAt: "2026-07-10T00:00:00Z",
    });
  });

  it("preserves appearance overrides when applying another design in the same system", () => {
    const applied = applyWidgetDesign(
      baseWidget(),
      baseDesign({ systemId: "vantare-original", visual: { accentColor: "#abc" } }),
      "t1",
    );
    expect(applied.visual.appearanceOverrides).toEqual({ tint: "#fff" });
  });

  it("replaces content only when includesContent is true", () => {
    const withContent = applyWidgetDesign(baseWidget(), baseDesign({ includesContent: true }), "t1");
    expect(withContent.content).toEqual({ columns: [{ id: "position" }] });

    const withoutContent = applyWidgetDesign(
      baseWidget(),
      baseDesign({ includesContent: false, content: { columns: [{ id: "gap" }] } }),
      "t1",
    );
    expect(withoutContent.content).toEqual({ keep: true });
  });

  it("rejects mismatched widget type", () => {
    expect(() =>
      applyWidgetDesign(baseWidget(), baseDesign({ widgetType: "relative" }), "t1"),
    ).toThrow(/widget type mismatch/);
  });

  it("does not alias design mutations back to the widget", () => {
    const design = baseDesign();
    const applied = applyWidgetDesign(baseWidget(), design, "t1");
    design.visual.accentColor = "mutated";
    design.content = { replaced: true };
    expect(applied.visual.baseSettings.accentColor).toBe("#abc");
    expect(applied.content).toEqual({ columns: [{ id: "position" }] });
  });
});

describe("validateWidgetDesign", () => {
  it("accepts valid design", () => {
    const parsed = validateWidgetDesign(baseDesign());
    expect(parsed.id).toBe("design-1");
  });

  it("rejects unsupported widget type", () => {
    expect(() => validateWidgetDesign(baseDesign({ widgetType: "telemetry" as never }))).toThrow();
  });
});
