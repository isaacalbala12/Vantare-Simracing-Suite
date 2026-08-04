import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_WIDGET_TYPES } from "./profile-document";
import { designSystemRegistry } from "./design-system-registry";
import { listOfficialDesigns } from "../design-systems/official-designs";
import historicalCrystalManifest from "../../../testdata/crystal-reference/manifest.json";

const sourceRoot = join(process.cwd(), "src");
const hostConsumers = [
  "hub/overlay-studio/canvas/StudioWidgetFrame.tsx",
  "overlay/runtime/RuntimeWidgetFrame.tsx",
  "hub/overlays/ProfilePreview.tsx",
] as const;

describe("Overlay Workshop characterization", () => {
  it("derives the current catalog and keeps Engineer distinct from historical Crystal parity", () => {
    const designs = listOfficialDesigns();
    const crystal = designs.filter((design) => design.systemId === "vantare-crystal");
    const historical = historicalCrystalManifest.entries;

    expect(ALL_WIDGET_TYPES).toHaveLength(19);
    expect(designSystemRegistry.list().map((system) => [system.id, system.widgets.length])).toEqual([
      ["vantare-original", 18], ["vantare-crystal", 19],
    ]);
    expect(designs).toHaveLength(41);
    expect(crystal).toHaveLength(22);
    expect(new Set(crystal.map((design) => design.widgetType)).size).toBe(19);
    expect(crystal.find((design) => design.id === "engineer-radio-crystal")?.widgetType).toBe("engineer-radio");
    expect(historical).toHaveLength(21);
    expect(new Set(historical.map((entry) => entry.widgetType)).size).toBe(18);
    expect(historical.some((entry) => entry.widgetType === "engineer-radio")).toBe(false);
  });

  it("keeps Studio and production runtime frames on the sole WidgetVisualHost boundary", () => {
    for (const consumer of hostConsumers) {
      const source = readFileSync(join(sourceRoot, consumer), "utf8");
      expect(source).toMatch(/import\s+\{\s*WidgetVisualHost\s*\}/);
      expect(source).toMatch(/<(?:(?:Memo)?WidgetVisualHost)\b/);
    }
    const host = readFileSync(join(sourceRoot, "overlay/core/WidgetVisualHost.tsx"), "utf8");
    expect(host).toMatch(/prepareWidgetVisualSettings/);
    const resolver = readFileSync(join(sourceRoot, "overlay/core/widget-visual-settings.ts"), "utf8");
    expect(resolver).toMatch(/designSystemRegistry\.resolve/);
  });
});
