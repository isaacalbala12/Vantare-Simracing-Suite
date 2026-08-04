import { describe, expect, it } from "vitest";
import { designSystemRegistry } from "../core/design-system-registry";
import { widgetTypeRegistry } from "../core/widget-registry";
import {
  checkOfficialWidgetDesignDeclarations,
  type OfficialWidgetDesignDeclaration,
} from "./official-design-declaration";
import {
  getOfficialDesign,
  OFFICIAL_WIDGET_DESIGN_DECLARATIONS,
} from "./official-designs";
import { deltaCrystalSimpleDesign } from "./vantare-crystal/delta/official-designs";

const REQUIRED_PILOT_IDS = ["delta-crystal-simple"] as const;

function check(declarations: readonly OfficialWidgetDesignDeclaration[]) {
  return checkOfficialWidgetDesignDeclarations({
    declarations,
    requiredIds: REQUIRED_PILOT_IDS,
    officialDesigns: declarations.map((declaration) => declaration.design),
    resolveSystem: (design) => designSystemRegistry.get(design.systemId, design.systemVersion),
    resolveDefaultSize: (widgetType) => widgetTypeRegistry.get(widgetType).capabilities.defaultSize,
  });
}

describe("official widget design declarations", () => {
  it("co-locates the Delta Crystal pilot metadata without changing the public design", () => {
    expect(OFFICIAL_WIDGET_DESIGN_DECLARATIONS).toContain(deltaCrystalSimpleDesign);
    expect(deltaCrystalSimpleDesign).toMatchObject({
      design: {
        id: "delta-crystal-simple",
        widgetType: "delta",
        systemId: "vantare-crystal",
        systemVersion: 1,
        configVersion: 2,
        visual: { templateId: "delta-simple", showHeader: true },
      },
      registration: {
        widgetType: "delta",
        configVersion: 2,
      },
      defaultSize: { width: 280, height: 96 },
      scenarios: ["ready", "stale", "disconnected", "error"],
    });
    expect(getOfficialDesign("delta-crystal-simple")).toEqual(deltaCrystalSimpleDesign.design);
  });

  it("accepts the real renderer, parser, dimensions and catalog entry", () => {
    expect(check(OFFICIAL_WIDGET_DESIGN_DECLARATIONS)).toEqual({
      declarationCount: 1,
      designIds: ["delta-crystal-simple"],
    });
  });

  it("fails honestly when the required pilot declaration is removed", () => {
    expect(() => check([])).toThrow("missing required official design declaration: delta-crystal-simple");
  });

  it("rejects duplicate IDs", () => {
    expect(() => check([deltaCrystalSimpleDesign, deltaCrystalSimpleDesign])).toThrow(
      "duplicate official design declaration: delta-crystal-simple",
    );
  });

  it("rejects declarations incompatible with the registered renderer", () => {
    const incompatible = {
      ...deltaCrystalSimpleDesign,
      registration: {
        ...deltaCrystalSimpleDesign.registration,
        Renderer: () => null,
      },
    };
    expect(() => check([incompatible])).toThrow(
      "unregistered widget-system declaration: delta-crystal-simple",
    );
  });

  it("rejects declarations incompatible with the registered parser", () => {
    const incompatible = {
      ...deltaCrystalSimpleDesign,
      registration: {
        ...deltaCrystalSimpleDesign.registration,
        parseSettings: () => ({}),
      },
    };
    expect(() => check([incompatible])).toThrow(
      "unregistered widget-system declaration: delta-crystal-simple",
    );
  });

  it("rejects declarations incompatible with the registered config version", () => {
    const incompatible = {
      ...deltaCrystalSimpleDesign,
      design: { ...deltaCrystalSimpleDesign.design, configVersion: 1 },
    };
    expect(() => check([incompatible])).toThrow(
      "config version mismatch for official design declaration: delta-crystal-simple",
    );
  });

  it("rejects declarations that duplicate rather than reference registered defaults", () => {
    const incompatible = {
      ...deltaCrystalSimpleDesign,
      registration: {
        ...deltaCrystalSimpleDesign.registration,
        defaultSettings: { ...deltaCrystalSimpleDesign.registration.defaultSettings },
      },
    };
    expect(() => check([incompatible])).toThrow(
      "unregistered widget-system declaration: delta-crystal-simple",
    );
  });

  it("rejects declarations that duplicate rather than reference registered migrations", () => {
    const incompatible = {
      ...deltaCrystalSimpleDesign,
      registration: {
        ...deltaCrystalSimpleDesign.registration,
        configMigrations: { ...deltaCrystalSimpleDesign.registration.configMigrations },
      },
    };
    expect(() => check([incompatible])).toThrow(
      "unregistered widget-system declaration: delta-crystal-simple",
    );
  });
});
