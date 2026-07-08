import { describe, it, expect, beforeEach } from "vitest";
import {
  registerBuiltinDesignSystems,
  _resetBuiltinRegistration,
} from "./builtin-systems";
import {
  lookupDesignSystem,
  listDesignSystems,
  clearDesignSystemRegistry,
} from "./design-system-registry";

describe("registerBuiltinDesignSystems", () => {
  beforeEach(() => {
    clearDesignSystemRegistry();
    _resetBuiltinRegistration();
  });

  it("registers base, vantare-crystal, and vantare-v3", () => {
    registerBuiltinDesignSystems();
    const systems = listDesignSystems();
    const ids = systems.map((s) => s.id).sort();
    expect(ids).toEqual(["base", "vantare-crystal", "vantare-v3"]);
  });

  it("is idempotent (safe to call multiple times)", () => {
    registerBuiltinDesignSystems();
    registerBuiltinDesignSystems();
    registerBuiltinDesignSystems();
    const systems = listDesignSystems();
    expect(systems).toHaveLength(3);
  });

  it("the vantare-v3 system contributes a custom Header for standings", () => {
    registerBuiltinDesignSystems();
    const v3 = lookupDesignSystem("vantare-v3");
    expect(v3).not.toBeNull();
    expect(v3!.components.standings?.Header).toBeDefined();
    expect(v3!.components.standings?.Row).toBeUndefined();
    expect(v3!.components.standings?.Footer).toBeUndefined();
  });

  it("the base system does not contribute any components", () => {
    registerBuiltinDesignSystems();
    const base = lookupDesignSystem("base");
    expect(base).not.toBeNull();
    expect(Object.keys(base!.components)).toHaveLength(0);
  });

  it("all 3 systems have non-empty perWidgetAppearance for all widget types", () => {
    registerBuiltinDesignSystems();
    for (const system of listDesignSystems()) {
      const types = Object.keys(system.perWidgetAppearance);
      expect(types.length).toBeGreaterThan(0);
      for (const type of types) {
        const appearance = system.perWidgetAppearance[type as keyof typeof system.perWidgetAppearance];
        expect(appearance).toBeDefined();
        expect(appearance!.accentColor).toBeDefined();
      }
    }
  });
});
