import { describe, expect, it } from "vitest";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "./profile-document";
import { upgradeProfileVisualConfigs } from "./visual-config-migration";

function buildDocument(visualOverrides: Partial<ProfileDocumentV3["layouts"]["general"]["widgets"][0]["visual"]> = {}): ProfileDocumentV3 {
  const widget = deltaDefinition.createDefault("delta-main");
  widget.visual = {
    ...widget.visual,
    ...visualOverrides,
  };
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [widget],
        preservedWidgets: [
          {
            id: "legacy-standings",
            type: "standings",
            source: { layout: { x: 0, y: 0 } },
          },
        ],
      },
    },
  };
}

describe("upgradeProfileVisualConfigs", () => {
  it("returns the original document when no migration is required", () => {
    const document = buildDocument();
    const result = upgradeProfileVisualConfigs(document);
    expect(result.document).toBe(document);
    expect(result.migratedWidgetIds).toEqual([]);
  });

  it("migrates registered widget visuals without touching other fields", () => {
    const document = buildDocument({
      systemVersion: 0,
      configVersion: 0,
      baseSettings: { legacy: true },
    });
    const beforeLayout = structuredClone(document.layouts.general.widgets[0].layout);
    const beforeBehavior = structuredClone(document.layouts.general.widgets[0].behavior);
    const beforeContent = structuredClone(document.layouts.general.widgets[0].content);
    const beforePreserved = structuredClone(document.layouts.general.preservedWidgets);

    const result = upgradeProfileVisualConfigs(document);

    expect(result.document).not.toBe(document);
    expect(result.migratedWidgetIds).toEqual(["delta-main"]);
    const migrated = result.document.layouts.general.widgets[0];
    expect(migrated.visual.systemVersion).toBe(1);
    expect(migrated.visual.configVersion).toBe(1);
    expect(migrated.visual.baseSettings).toEqual({ showHeader: true, legacy: true });
    expect(migrated.layout).toEqual(beforeLayout);
    expect(migrated.behavior).toEqual(beforeBehavior);
    expect(migrated.content).toEqual(beforeContent);
    expect(result.document.layouts.general.preservedWidgets).toEqual(beforePreserved);
  });

});