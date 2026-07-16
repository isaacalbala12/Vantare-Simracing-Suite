import { describe, expect, it } from "vitest";
import { widgetTypeRegistry } from "../../core/widget-registry";
import { upgradeProfileVisualConfigs } from "../../core/visual-config-migration";
import { designSystemRegistry, migrateConfigSettings } from "../../core/design-system-registry";
import { vantareCrystalManifest } from "./manifest";

type WidgetType = "delta" | "pedals" | "relative" | "standings";
const widgetTypes: readonly WidgetType[] = ["delta", "pedals", "relative", "standings"];

function buildLegacyDocument() {
  const widgets = widgetTypes.map((type) => {
    const widget = widgetTypeRegistry.get(type).createDefault(`${type}-legacy`);
    widget.visual = {
      ...widget.visual,
      systemId: "vantare-crystal",
      systemVersion: 1,
      configVersion: 1,
      baseSettings: type === "delta" ? { showHeader: false } : {},
      appearanceOverrides: { showHeader: false, preservedOverride: `${type}-value` },
    };
    return widget;
  });
  return {
    schemaVersion: 3,
    id: "profile-crystal-legacy",
    name: "Crystal legacy",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: { type: "general", widgets, preservedWidgets: [] },
    },
  };
}

describe("Vantare Crystal manifest v2", () => {
  it("publishes config v2 for all core widgets", () => {
    expect(vantareCrystalManifest.version).toBe(1);
    for (const type of widgetTypes) {
      const registration = designSystemRegistry.resolve("vantare-crystal", 1, type);
      expect(registration.configVersion).toBe(2);
    }
  });

  it("maps each v1 widget to its canonical template", () => {
    const expected = {
      delta: "delta-bar",
      pedals: "pedals",
      relative: "relative-vertical",
      standings: "standings-vertical",
    } as const;
    for (const type of widgetTypes) {
      const registration = designSystemRegistry.resolve("vantare-crystal", 1, type);
      const migrated = migrateConfigSettings(
        registration,
        1,
        2,
        type === "delta" ? { showHeader: false } : {},
        "vantare-crystal",
      );
      expect(migrated.templateId).toBe(expected[type]);
      if (type === "delta") {
        expect(migrated.showHeader).toBe(false);
      }
    }
  });

  it("migrates legacy visuals once and keeps document-owned fields and overrides", () => {
    const document = buildLegacyDocument();
    const originalFields = document.layouts.general.widgets.map((widget) => ({
      id: widget.id,
      layout: structuredClone(widget.layout),
      behavior: structuredClone(widget.behavior),
      content: structuredClone(widget.content),
      overrides: structuredClone(widget.visual.appearanceOverrides),
    }));

    const first = upgradeProfileVisualConfigs(document);
    expect(first.migratedWidgetIds).toEqual(widgetTypes.map((type) => `${type}-legacy`));
    for (const [index, widget] of first.document.layouts.general.widgets.entries()) {
      expect(widget.visual.systemId).toBe("vantare-crystal");
      expect(widget.visual.systemVersion).toBe(1);
      expect(widget.visual.configVersion).toBe(2);
      expect(widget.visual.appearanceOverrides).toEqual(originalFields[index]?.overrides);
      expect(widget.layout).toEqual(originalFields[index]?.layout);
      expect(widget.behavior).toEqual(originalFields[index]?.behavior);
      expect(widget.content).toEqual(originalFields[index]?.content);
    }

    const second = upgradeProfileVisualConfigs(first.document);
    expect(second.document).toBe(first.document);
    expect(second.migratedWidgetIds).toEqual([]);
  });
});
