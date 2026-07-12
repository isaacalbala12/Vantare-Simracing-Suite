import { describe, expect, it } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { WidgetDesignV1 } from "../../../overlay/core/widget-design";
import { applyStudioCommand, StudioCommandError, type StudioCommand } from "./studio-command";

function buildDocument(widgets: WidgetInstanceV3[] = [deltaDefinition.createDefault("delta-1")]): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets,
      },
    },
  };
}

function widget(id: string, overrides: Partial<WidgetInstanceV3> = {}): WidgetInstanceV3 {
  const base = deltaDefinition.createDefault(id);
  return {
    ...base,
    ...overrides,
    layout: { ...base.layout, ...overrides.layout },
    behavior: { ...base.behavior, ...overrides.behavior },
    content: overrides.content ?? base.content,
    visual: {
      ...base.visual,
      ...overrides.visual,
      baseSettings: { ...base.visual.baseSettings, ...overrides.visual?.baseSettings },
      appearanceOverrides: {
        ...base.visual.appearanceOverrides,
        ...overrides.visual?.appearanceOverrides,
      },
    },
  };
}

describe("applyStudioCommand", () => {
  it("materializes a missing session before the first mutation", () => {
    const document = buildDocument();
    const added = widget("delta-race");
    const next = applyStudioCommand(document, {
      type: "widget/add",
      session: "race",
      widget: added,
    });
    expect(next.layouts.race?.type).toBe("race");
    expect(next.layouts.race?.widgets.map((entry) => entry.id)).toEqual(["delta-1", "delta-race"]);
    expect(document.layouts.race).toBeUndefined();
  });

  it("rejects duplicate widget ids on add", () => {
    const document = buildDocument();
    expect(() =>
      applyStudioCommand(document, {
        type: "widget/add",
        session: "general",
        widget: widget("delta-1"),
      }),
    ).toThrow(StudioCommandError);
  });

  it("duplicates widgets with offset position and adjacent z-order", () => {
    const source = widget("delta-1", {
      layout: { x: 40, y: 80, w: 280, h: 96, zIndex: 1, aspectLocked: true },
      content: {},
      visual: {
        systemId: "vantare-crystal",
        systemVersion: 1,
        configVersion: 2,
        baseSettings: { accent: "blue" },
        appearanceOverrides: { opacity: 0.8 },
      },
    });
    const blocker = widget("delta-2", { layout: { x: 0, y: 0, w: 100, h: 50, zIndex: 2, aspectLocked: true } });
    const document = buildDocument([widget("delta-0", { layout: { x: 0, y: 0, w: 100, h: 50, zIndex: 0, aspectLocked: true } }), source, blocker]);

    const next = applyStudioCommand(document, {
      type: "widget/duplicate",
      session: "general",
      widgetIds: ["delta-1"],
      newIds: ["delta-copy"],
    });

    const copy = next.layouts.general.widgets.find((entry) => entry.id === "delta-copy");
    expect(copy?.layout).toEqual({
      x: 56,
      y: 96,
      w: 280,
      h: 96,
      zIndex: 2,
      aspectLocked: true,
    });
    expect(copy?.content).toEqual(source.content);
    expect(copy?.visual).toEqual(source.visual);
    expect(next.layouts.general.widgets.map((entry) => entry.id)).toEqual(["delta-0", "delta-1", "delta-copy", "delta-2"]);
    expect(next.layouts.general.widgets.map((entry) => entry.layout.zIndex)).toEqual([0, 1, 2, 3]);
  });

  it("allows deleting every widget in a layout", () => {
    const document = buildDocument();
    const next = applyStudioCommand(document, {
      type: "widget/delete",
      session: "general",
      widgetIds: ["delta-1"],
    });
    expect(next.layouts.general.widgets).toEqual([]);
  });

  it("patches layout without touching content, visual or behavior", () => {
    const source = widget("delta-1", {
      content: { marker: true },
      visual: { appearanceOverrides: { glow: true } } as WidgetInstanceV3["visual"],
      behavior: { enabled: false, updateHz: 12 },
    });
    const document = buildDocument([source]);
    const next = applyStudioCommand(document, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-1"],
      patch: { x: 120, y: 240 },
    });
    const updated = next.layouts.general.widgets[0];
    expect(updated.layout.x).toBe(120);
    expect(updated.layout.y).toBe(240);
    expect(updated.content).toEqual(source.content);
    expect(updated.visual).toEqual(source.visual);
    expect(updated.behavior).toEqual(source.behavior);
  });

  it("replaces content without editing layout", () => {
    const source = widget("delta-1", { layout: { x: 10, y: 20, w: 280, h: 96, zIndex: 0, aspectLocked: true } });
    const document = buildDocument([source]);
    const next = applyStudioCommand(document, {
      type: "widget/content",
      session: "general",
      widgetIds: ["delta-1"],
      content: { replaced: true },
    });
    const updated = next.layouts.general.widgets[0];
    expect(updated.content).toEqual({ replaced: true });
    expect(updated.layout).toEqual(source.layout);
  });

  it("reorders widgets and normalizes z-index values", () => {
    const document = buildDocument([
      widget("a", { layout: { x: 0, y: 0, w: 100, h: 50, zIndex: 0, aspectLocked: true } }),
      widget("b", { layout: { x: 0, y: 0, w: 100, h: 50, zIndex: 1, aspectLocked: true } }),
      widget("c", { layout: { x: 0, y: 0, w: 100, h: 50, zIndex: 2, aspectLocked: true } }),
    ]);
    const next = applyStudioCommand(document, {
      type: "widget/order",
      session: "general",
      widgetIds: ["b"],
      direction: "forward",
    });
    expect(next.layouts.general.widgets.map((entry) => entry.id)).toEqual(["a", "c", "b"]);
    expect(next.layouts.general.widgets.map((entry) => entry.layout.zIndex)).toEqual([0, 1, 2]);
  });

  it("resets only the requested design fields from the saved snapshot", () => {
    const savedWidget = widget("delta-1", {
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: { saved: true },
        appearanceOverrides: { savedGlow: true },
        provenance: {
          designId: "design-1",
          designName: "Saved",
          origin: "vantare",
          appliedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      content: { saved: true },
      behavior: { enabled: false, updateHz: 10 },
      layout: { x: 5, y: 6, w: 100, h: 50, zIndex: 0, aspectLocked: true },
    });
    const current = widget("delta-1", {
      visual: {
        systemId: "vantare-crystal",
        systemVersion: 9,
        configVersion: 9,
        baseSettings: { current: true },
        appearanceOverrides: { currentGlow: true },
      },
      content: { current: true },
      behavior: { enabled: true, updateHz: 30 },
      layout: { x: 99, y: 99, w: 200, h: 120, zIndex: 4, aspectLocked: false },
    });
    const document = buildDocument([current]);
    const saved = buildDocument([savedWidget]);

    const next = applyStudioCommand(document, {
      type: "widget/reset-section",
      session: "general",
      widgetIds: ["delta-1"],
      section: "design",
      saved,
    });

    const updated = next.layouts.general.widgets[0];
    expect(updated.visual.systemId).toBe("vantare-original");
    expect(updated.visual.systemVersion).toBe(1);
    expect(updated.visual.configVersion).toBe(1);
    expect(updated.visual.baseSettings).toEqual({ saved: true });
    expect(updated.visual.provenance).toEqual(savedWidget.visual.provenance);
    expect(updated.visual.appearanceOverrides).toEqual({ currentGlow: true });
    expect(updated.content).toEqual({ current: true });
    expect(updated.behavior).toEqual(current.behavior);
    expect(updated.layout).toEqual(current.layout);
  });

  it("resets only appearance overrides from the saved snapshot", () => {
    const savedWidget = widget("delta-1", {
      visual: {
        appearanceOverrides: { savedGlow: true },
      } as WidgetInstanceV3["visual"],
    });
    const current = widget("delta-1", {
      visual: {
        systemId: "vantare-crystal",
        systemVersion: 9,
        configVersion: 9,
        baseSettings: { current: true },
        appearanceOverrides: { currentGlow: true },
      },
    });
    const document = buildDocument([current]);
    const saved = buildDocument([savedWidget]);

    const next = applyStudioCommand(document, {
      type: "widget/reset-section",
      session: "general",
      widgetIds: ["delta-1"],
      section: "appearance",
      saved,
    });

    const updated = next.layouts.general.widgets[0];
    expect(updated.visual.appearanceOverrides).toEqual({ savedGlow: true });
    expect(updated.visual.systemId).toBe("vantare-crystal");
    expect(updated.visual.baseSettings).toEqual({ current: true });
  });

  it("leaves the document unchanged when the saved snapshot lacks the widget", () => {
    const document = buildDocument([widget("delta-1")]);
    const saved = buildDocument([widget("delta-other")]);
    const before = structuredClone(document);

    const next = applyStudioCommand(document, {
      type: "widget/reset-section",
      session: "general",
      widgetIds: ["delta-1"],
      section: "layout",
      saved,
    });

    expect(next).toEqual(before);
  });

  it("restores defaults for the requested widget ids", () => {
    const current = widget("delta-1", { layout: { x: 99, y: 99, w: 200, h: 120, zIndex: 4, aspectLocked: false } });
    const document = buildDocument([current]);
    const defaults = [deltaDefinition.createDefault("delta-1")];

    const next = applyStudioCommand(document, {
      type: "widget/restore-defaults",
      session: "general",
      widgetIds: ["delta-1"],
      defaults,
    });

    expect(next.layouts.general.widgets[0]).toEqual(defaults[0]);
  });

  it("applies a design to multiple widgets in one command", () => {
    const document = buildDocument([
      widget("delta-1", {
        visual: {
          systemId: "vantare-original",
          systemVersion: 1,
          configVersion: 1,
          baseSettings: { showHeader: true },
          appearanceOverrides: { tint: "#111" },
        },
      }),
      widget("delta-2", {
        layout: { x: 40, y: 50, w: 280, h: 96, zIndex: 1, aspectLocked: true },
        visual: {
          systemId: "vantare-original",
          systemVersion: 1,
          configVersion: 1,
          baseSettings: { showHeader: false },
          appearanceOverrides: { tint: "#222" },
        },
      }),
    ]);

    const next = applyStudioCommand(document, {
      type: "widget/apply-design",
      session: "general",
      widgetIds: ["delta-1", "delta-2"],
      appliedAt: "2026-07-10T12:00:00Z",
      design: {
        id: "delta-crystal-base",
        name: "Crystal Base",
        widgetType: "delta",
        systemId: "vantare-crystal",
        systemVersion: 1,
        configVersion: 1,
        visual: { showHeader: true, accent: "cyan" },
        includesContent: false,
        origin: "vantare",
        isDefault: true,
      },
    });

    for (const applied of next.layouts.general.widgets) {
      expect(applied.visual.systemId).toBe("vantare-crystal");
      expect(applied.visual.baseSettings).toEqual({ showHeader: true, accent: "cyan" });
      expect(applied.visual.appearanceOverrides).toEqual({});
      expect(applied.visual.provenance?.designId).toBe("delta-crystal-base");
    }
    expect(next.layouts.general.widgets[0]?.layout).toEqual(document.layouts.general.widgets[0]?.layout);
    expect(next.layouts.general.widgets[1]?.layout.x).toBe(40);
    expect(next.layouts.general.widgets[1]?.layout.zIndex).toBe(1);
  });

  it("switches visual systems atomically and restores each system memory", () => {
    const source = widget("delta-1", {
      layout: { x: 77, y: 88, w: 280, h: 96, zIndex: 3, aspectLocked: false },
      behavior: { enabled: false, updateHz: 12 },
      content: { keep: "functional" },
      visual: {
        systemId: "vantare-original",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: { originalOnly: true },
        appearanceOverrides: { tint: "#fff" },
      },
    });
    const document = buildDocument([source]);
    const crystalDesign: WidgetDesignV1 = {
      id: "delta-crystal-base",
      name: "Crystal Base",
      widgetType: "delta",
      systemId: "vantare-crystal",
      systemVersion: 1,
      configVersion: 1,
      visual: { showHeader: true },
      includesContent: true,
      content: { mustNotReplace: true },
      origin: "vantare",
      isDefault: true,
    };
    const originalDesign: WidgetDesignV1 = {
      id: "delta-original-base",
      name: "Original Base",
      widgetType: "delta",
      systemId: "vantare-original",
      systemVersion: 1,
      configVersion: 1,
      visual: { showHeader: true },
      includesContent: false,
      origin: "vantare",
    };

    const crystal = applyStudioCommand(document, {
      type: "widget/apply-design",
      session: "general",
      widgetIds: ["delta-1"],
      design: crystalDesign,
      appliedAt: "2026-07-12T00:00:00Z",
    }).layouts.general.widgets[0]!;
    expect(crystal.visual.systemId).toBe("vantare-crystal");
    expect(crystal.visual.baseSettings).toEqual({ showHeader: true });
    expect(crystal.visual.systemMemories?.["vantare-original"]).toMatchObject({
      baseSettings: { originalOnly: true },
      appearanceOverrides: { tint: "#fff" },
    });
    expect(crystal.content).toEqual({ keep: "functional" });
    expect(crystal.layout).toEqual(source.layout);
    expect(crystal.behavior).toEqual(source.behavior);

    const original = applyStudioCommand(
      { ...document, layouts: { general: { ...document.layouts.general, widgets: [crystal] } } },
      {
        type: "widget/apply-design",
        session: "general",
        widgetIds: ["delta-1"],
        design: originalDesign,
        appliedAt: "2026-07-12T00:01:00Z",
      },
    ).layouts.general.widgets[0]!;
    expect(original.visual.baseSettings).toEqual({ originalOnly: true });
    expect(original.visual.appearanceOverrides).toEqual({ tint: "#fff" });
    expect(original.visual.provenance?.designId).toBeUndefined();

    const restoredCrystal = applyStudioCommand(
      { ...document, layouts: { general: { ...document.layouts.general, widgets: [original] } } },
      {
        type: "widget/apply-design",
        session: "general",
        widgetIds: ["delta-1"],
        design: crystalDesign,
        appliedAt: "2026-07-12T00:02:00Z",
      },
    ).layouts.general.widgets[0]!;
    expect(restoredCrystal.visual.baseSettings).toEqual({ showHeader: true });
    expect(restoredCrystal.visual.provenance?.designId).toBe("delta-crystal-base");
    expect(restoredCrystal.content).toEqual({ keep: "functional" });
  });

  it("fails atomically when a target system has no official default", () => {
    const document = buildDocument([widget("broadcast-1", { type: "broadcast-tower" })]);
    const before = structuredClone(document);
    expect(() =>
      applyStudioCommand(document, {
        type: "widget/apply-design",
        session: "general",
        widgetIds: ["broadcast-1"],
        design: {
          id: "broadcast-crystal",
          name: "Broadcast Crystal",
          widgetType: "broadcast-tower",
          systemId: "vantare-crystal",
          systemVersion: 1,
          configVersion: 1,
          visual: {},
          includesContent: false,
          origin: "vantare",
        },
        appliedAt: "2026-07-12T00:00:00Z",
      }),
    ).toThrow(/no official default/i);
    expect(document).toEqual(before);
  });

  it("copies one session layout onto another", () => {
    const document = buildDocument([widget("delta-1", { layout: { x: 12, y: 34, w: 280, h: 96, zIndex: 0, aspectLocked: true } })]);
    const withRace = applyStudioCommand(document, {
      type: "widget/layout",
      session: "race",
      widgetIds: ["delta-1"],
      patch: { x: 500 },
    });

    const next = applyStudioCommand(withRace, {
      type: "session/copy",
      source: "race",
      target: "qualifying",
    });

    expect(next.layouts.qualifying?.widgets[0].layout.x).toBe(500);
    expect(next.layouts.race?.widgets[0].layout.x).toBe(500);
    expect(next.layouts.general.widgets[0].layout.x).toBe(12);
  });

  it("throws a typed error for unknown widget ids", () => {
    const document = buildDocument();
    try {
      applyStudioCommand(document, {
        type: "widget/delete",
        session: "general",
        widgetIds: ["missing"],
      });
      throw new Error("expected command error");
    } catch (error) {
      expect(error).toBeInstanceOf(StudioCommandError);
      expect((error as StudioCommandError).commandType).toBe("widget/delete");
    }
  });

  it("does not mutate the input document", () => {
    const document = buildDocument([
      widget("delta-1", { layout: { x: 1, y: 2, w: 280, h: 96, zIndex: 0, aspectLocked: true } }),
    ]);
    const before = structuredClone(document);
    const command: StudioCommand = {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-1"],
      patch: { x: 44 },
    };
    applyStudioCommand(document, command);
    expect(document).toEqual(before);
  });
});
