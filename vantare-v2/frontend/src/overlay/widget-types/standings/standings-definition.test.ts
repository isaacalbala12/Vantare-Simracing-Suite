import { describe, expect, it } from "vitest";
import { standingsDefinition } from "./standings-definition";

describe("standingsDefinition", () => {
  it("creates a default standings widget with planned size and update rate", () => {
    const widget = standingsDefinition.createDefault("standings-main");
    expect(widget).toMatchObject({
      id: "standings-main",
      type: "standings",
      layout: { w: 520, h: 560, aspectLocked: true },
      behavior: { enabled: true, updateHz: 15 },
      visual: { systemId: "vantare-original" },
    });
    expect(widget.content.columns?.length).toBeGreaterThan(0);
  });

  it("declares a custom content inspector", () => {
    expect(standingsDefinition.inspector.CustomContentInspector).toBeDefined();
    expect(standingsDefinition.capabilities.requiredFeature).toBe("overlays.basic");
    expect(standingsDefinition.capabilities.supportsAspectUnlock).toBe(true);
  });

  it("parses migrated column content", () => {
    const parsed = standingsDefinition.parseContent({
      columns: [{ id: "gap", metricId: "gap", enabled: true, width: 70 }],
    });
    expect(parsed.columns).toHaveLength(1);
    expect(parsed.columns[0]?.widthPreset).toBe("md");
  });
});