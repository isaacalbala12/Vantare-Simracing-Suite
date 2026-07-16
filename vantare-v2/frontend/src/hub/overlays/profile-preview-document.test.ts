import { describe, expect, it } from "vitest";
import type { ProfileConfig } from "../../lib/profile";
import { widgetTypeRegistry } from "../../overlay/core/widget-registry";
import { deltaDefinition } from "../../overlay/widget-types/delta/delta-definition";
import {
  buildPreviewDocumentFromProfileConfig,
  resolveProfilePreviewDocument,
} from "./profile-preview-document";

const profile: ProfileConfig = {
  id: "preview-test",
  name: "Preview Test",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
    { id: "relative", type: "relative", enabled: true, updateHz: 15, position: { x: 40, y: 600, w: 320, h: 280 } },
    { id: "telemetry", type: "telemetry", enabled: true, updateHz: 30, position: { x: 100, y: 100, w: 200, h: 200 } },
  ],
};

describe("profile-preview-document", () => {
  it("maps only core widgets into a V3 preview document", () => {
    const document = buildPreviewDocumentFromProfileConfig(profile);

    expect(document.schemaVersion).toBe(3);
    expect(document.layouts.general.widgets.map((widget) => widget.type)).toEqual(["delta", "relative"]);
    expect(document.layouts.general.widgets[0].layout).toMatchObject({ x: 760, y: 40, w: 400, h: 48 });
  });

  it("prefers previewDocument when provided", () => {
    const previewDocument = {
      ...buildPreviewDocumentFromProfileConfig(profile),
      layouts: {
        general: {
          type: "general" as const,
          widgets: [deltaDefinition.createDefault("delta-only")],
        },
      },
    };

    const resolved = resolveProfilePreviewDocument(profile, previewDocument);
    expect(resolved?.layouts.general.widgets).toHaveLength(1);
    expect(resolved?.layouts.general.widgets[0].id).toBe("delta-only");
  });

  it("returns null when no profile data is available", () => {
    expect(resolveProfilePreviewDocument(null, null)).toBeNull();
    expect(resolveProfilePreviewDocument({ ...profile, widgets: [] }, null)).toBeNull();
  });

  it("uses registered widget defaults for visual system", () => {
    const document = buildPreviewDocumentFromProfileConfig(profile);
    const delta = document.layouts.general.widgets.find((widget) => widget.type === "delta");
    const defaults = widgetTypeRegistry.get("delta").createDefault("delta");

    expect(delta?.visual.systemId).toBe(defaults.visual.systemId);
  });
});