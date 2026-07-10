import { describe, expect, it } from "vitest";
import {
  DesignSystemResolutionError,
  designSystemRegistry,
  migrateConfigSettings,
  migrateSystemSettings,
} from "./design-system-registry";

describe("designSystemRegistry", () => {
  it("registers Original and Crystal at version 1", () => {
    expect(designSystemRegistry.list().map((system) => system.id)).toEqual([
      "vantare-original",
      "vantare-crystal",
    ]);
    expect(designSystemRegistry.list().every((system) => system.version === 1)).toBe(true);
  });

  it("resolves Delta for supported design systems", () => {
    expect(designSystemRegistry.resolve("vantare-crystal", 1, "delta").widgetType).toBe("delta");
    expect(designSystemRegistry.resolve("vantare-original", 1, "delta").widgetType).toBe("delta");
  });

  it("rejects unsupported widget and system pairs", () => {
    expect(() => designSystemRegistry.resolve("vantare-crystal", 1, "standings")).toThrow(
      /unsupported/i,
    );
  });

  it("rejects unknown system versions", () => {
    expect(() => designSystemRegistry.resolve("vantare-crystal", 99, "delta")).toThrow(
      DesignSystemResolutionError,
    );
  });
});

describe("sequential design-system migrations", () => {
  const system = designSystemRegistry.resolve("vantare-original", 1, "delta");

  it("migrates config settings from version 0 to 1", () => {
    const migrated = migrateConfigSettings(system, 0, 1, {});
    expect(migrated).toEqual({ showHeader: true });
  });

  it("throws when a migration step is missing", () => {
    expect(() => migrateConfigSettings(system, 0, 2, {})).toThrow(DesignSystemResolutionError);
    expect(() =>
      migrateSystemSettings(
        designSystemRegistry.get("vantare-original", 1),
        "delta",
        0,
        2,
        {},
      ),
    ).toThrow(DesignSystemResolutionError);
  });
});