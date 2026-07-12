import { describe, expect, it } from "vitest";
import { designSystemRegistry } from "../core/design-system-registry";
import { widgetTypeRegistry } from "../core/widget-registry";
import {
  getOfficialDesign,
  listOfficialDesigns,
  OFFICIAL_DESIGNS_SECTION_LABEL,
} from "./official-designs";

describe("official-designs", () => {
  it("exposes the Vantare section label", () => {
    expect(OFFICIAL_DESIGNS_SECTION_LABEL).toBe("Diseños de Vantare");
  });

  it("lists base official designs for every core widget and system", () => {
    for (const type of ["delta", "standings", "relative", "pedals"] as const) {
      const designs = listOfficialDesigns(type);
      expect(designs.some((design) => design.systemId === "vantare-original")).toBe(true);
      expect(designs.some((design) => design.systemId === "vantare-crystal")).toBe(true);
      for (const design of designs) {
        expect(design.origin).toBe("vantare");
        expect(design.includesContent).toBe(false);
        expect(design.widgetType).toBe(type);
      }
    }
  });

  it("keeps the legacy Delta time-attack design", () => {
    expect(getOfficialDesign("delta-time-attack")).toMatchObject({
      name: "Time Attack",
      systemId: "vantare-original",
      visual: { showHeader: false, accent: "amber" },
    });
  });

  it("registers both canonical Delta Crystal compositions", () => {
    expect(getOfficialDesign("delta-crystal-bar")).toMatchObject({
      widgetType: "delta",
      systemId: "vantare-crystal",
      visual: { templateId: "delta-bar" },
    });
    expect(getOfficialDesign("delta-crystal-simple")).toMatchObject({
      widgetType: "delta",
      systemId: "vantare-crystal",
      visual: { templateId: "delta-simple" },
    });
  });

  it("uses manifest-compatible visual defaults for every official design", () => {
    for (const design of listOfficialDesigns()) {
      const registration = designSystemRegistry.resolve(
        design.systemId,
        design.systemVersion,
        design.widgetType,
      );
      expect(() => registration.parseSettings(design.visual)).not.toThrow();
    }
  });

  it("covers every implemented widget/system registration with a base official design", () => {
    const pairs = new Set<string>();
    for (const design of listOfficialDesigns()) {
      if (design.isDefault || design.id === "delta-crystal-bar") {
        pairs.add(`${design.widgetType}:${design.systemId}`);
      }
    }
    expect([...pairs].sort()).toEqual([
      "broadcast-tower:vantare-crystal",
      "broadcast-tower:vantare-original",
      "delta:vantare-crystal",
      "delta:vantare-original",
      "head-to-head:vantare-crystal",
      "head-to-head:vantare-original",
      "input-telemetry:vantare-crystal",
      "input-telemetry:vantare-original",
      "pedals-telemetry-compact:vantare-crystal",
      "pedals-telemetry-compact:vantare-original",
      "pedals-telemetry:vantare-crystal",
      "pedals-telemetry:vantare-original",
      "pedals:vantare-crystal",
      "pedals:vantare-original",
      "racing-flags:vantare-crystal",
      "racing-flags:vantare-original",
      "relative:vantare-crystal",
      "relative:vantare-original",
      "standings:vantare-crystal",
      "standings:vantare-original",
    ]);
  });

  it("marks exactly one default design for every widget/system pair", () => {
    for (const type of ["delta", "standings", "relative", "pedals"] as const) {
      for (const systemId of ["vantare-original", "vantare-crystal"] as const) {
        expect(
          listOfficialDesigns(type).filter((design) => design.systemId === systemId && design.isDefault),
        ).toHaveLength(1);
      }
    }
  });

  it("aligns official designs with registered widget capabilities", () => {
    for (const design of listOfficialDesigns()) {
      const definition = widgetTypeRegistry.get(design.widgetType);
      expect(definition.capabilities.defaultSize.width).toBeGreaterThan(0);
      expect(definition.capabilities.defaultSize.height).toBeGreaterThan(0);
    }
  });
});
