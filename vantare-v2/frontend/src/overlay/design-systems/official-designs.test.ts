import { describe, expect, it } from "vitest";
import { designSystemRegistry } from "../core/design-system-registry";
import {
  getOfficialDesign,
  listOfficialDesigns,
  OFFICIAL_DESIGNS_SECTION_LABEL,
} from "./official-designs";

describe("official-designs", () => {
  it("exposes the Vantare section label", () => {
    expect(OFFICIAL_DESIGNS_SECTION_LABEL).toBe("Diseños de Vantare");
  });

  it("lists validated Delta official designs only in phase 5", () => {
    const designs = listOfficialDesigns("delta");
    expect(designs.map((design) => design.id)).toEqual([
      "delta-original-base",
      "delta-crystal-base",
      "delta-time-attack",
    ]);
    for (const design of designs) {
      expect(design.origin).toBe("vantare");
      expect(design.includesContent).toBe(false);
    }
  });

  it("uses manifest-compatible visual defaults", () => {
    for (const design of listOfficialDesigns("delta")) {
      const registration = designSystemRegistry.resolve(
        design.systemId,
        design.systemVersion,
        design.widgetType,
      );
      expect(() => registration.parseSettings(design.visual)).not.toThrow();
    }
  });

  it("resolves official designs by id", () => {
    const design = getOfficialDesign("delta-time-attack");
    expect(design?.name).toBe("Time Attack");
    expect(design?.systemId).toBe("vantare-original");
    expect(design?.visual).toEqual({ showHeader: false, accent: "amber" });
  });
});