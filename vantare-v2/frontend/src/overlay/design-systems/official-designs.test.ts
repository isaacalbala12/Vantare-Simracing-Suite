import { describe, expect, it } from "vitest";
import { designSystemRegistry } from "../core/design-system-registry";
import { widgetTypeRegistry } from "../core/widget-registry";
import {
  getOfficialDesign,
  listOfficialDesigns,
  OFFICIAL_DESIGNS_SECTION_LABEL,
} from "./official-designs";
import crystalReferenceManifest from "../../../testdata/crystal-reference/manifest.json";
import type { WidgetType } from "../core/profile-document";

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

  it("uses canonical Crystal IDs for every currently registered widget type", () => {
    const registeredTypes = new Set(widgetTypeRegistry.list().map((definition) => definition.type));
    const expectedIds = crystalReferenceManifest.entries
      .filter((entry) => registeredTypes.has(entry.widgetType as WidgetType))
      .map((entry) => entry.designId)
      .sort();
    const actualIds = listOfficialDesigns()
      .filter((design) => design.systemId === "vantare-crystal")
      .filter((design) => design.id !== "engineer-radio-crystal")
      .map((design) => design.id)
      .sort();

    expect(actualIds).toEqual(expectedIds);
  });

  it("registers Engineer radio as its own functional widget outside the HTML reference manifest", () => {
    expect(getOfficialDesign("engineer-radio-crystal")).toMatchObject({
      widgetType: "engineer-radio",
      systemId: "vantare-crystal",
      origin: "vantare",
      isDefault: true,
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
    const expectedPairs = widgetTypeRegistry.list().flatMap((definition) =>
      definition.type === "engineer-radio"
        ? [`${definition.type}:vantare-crystal`]
        : [`${definition.type}:vantare-crystal`, `${definition.type}:vantare-original`],
    );
    expect([...pairs].sort()).toEqual(expectedPairs.sort());
  });

  it("uses a unique stable ID for every official design", () => {
    const ids = listOfficialDesigns().map((design) => design.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks exactly one default design for every registered widget/system pair", () => {
    const expectedPairs = designSystemRegistry.list().flatMap((system) =>
      system.widgets.map((widget) => [widget.widgetType, system.id] as const),
    );

    for (const [widgetType, systemId] of expectedPairs) {
      expect(
        listOfficialDesigns(widgetType).filter(
          (design) => design.systemId === systemId && design.isDefault,
        ),
        `${widgetType}:${systemId} must have exactly one default design`,
      ).toHaveLength(1);
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
