import { describe, it, expect, beforeEach } from "vitest";
import {
  registerDesignSystem,
  lookupDesignSystem,
  listDesignSystems,
  clearDesignSystemRegistry,
} from "./design-system-registry";
import type { DesignSystem } from "./design-system";

const fakeSystem: DesignSystem = {
  id: "test-system",
  name: "Test System",
  tokens: {
    id: "test-system",
    name: "Test",
    colors: { accent: "#000", background: "#000", surface: "#000", border: "#000", text: "#000", textMuted: "#000", textDim: "#000", positive: "#000", negative: "#000", warning: "#000", info: "#000", purple: "#000" },
    badges: { free: { bg: "#000", text: "#000", border: "#000" }, pro: { bg: "#000", text: "#000", border: "#000" }, tester: { bg: "#000", text: "#000", border: "#000" }, experimental: { bg: "#000", text: "#000", border: "#000" }, dataOk: { bg: "#000", text: "#000", border: "#000" }, dataPartial: { bg: "#000", text: "#000", border: "#000" }, dataPending: { bg: "#000", text: "#000", border: "#000" } },
    surfaces: { card: "#000", panel: "#000", header: "#000", rowEven: "#000", rowOdd: "#000", playerHighlight: "#000", lockedOverlay: "#000" },
    typography: { displayFont: "Inter", bodyFont: "Inter", monoFont: "JetBrains Mono" },
    radius: { sm: "4px", md: "8px", lg: "12px", xl: "16px" },
    glow: { accent: "none", none: "none" },
  },
  perWidgetAppearance: {},
  components: {},
};

describe("design-system-registry", () => {
  beforeEach(() => {
    clearDesignSystemRegistry();
  });

  it("returns null for unknown id", () => {
    expect(lookupDesignSystem("nope")).toBeNull();
  });

  it("returns null for undefined id", () => {
    expect(lookupDesignSystem(undefined)).toBeNull();
    expect(lookupDesignSystem(null)).toBeNull();
    expect(lookupDesignSystem("")).toBeNull();
  });

  it("registers and looks up a system", () => {
    registerDesignSystem(fakeSystem);
    expect(lookupDesignSystem("test-system")).toBe(fakeSystem);
  });

  it("throws when registering duplicate id", () => {
    registerDesignSystem(fakeSystem);
    expect(() => registerDesignSystem(fakeSystem)).toThrow(/already registered/);
  });

  it("lists all registered systems", () => {
    const a = { ...fakeSystem, id: "a" };
    const b = { ...fakeSystem, id: "b" };
    registerDesignSystem(a);
    registerDesignSystem(b);
    const all = listDesignSystems();
    expect(all).toHaveLength(2);
    expect(all).toContain(a);
    expect(all).toContain(b);
  });

  it("clearDesignSystemRegistry empties the registry", () => {
    registerDesignSystem(fakeSystem);
    clearDesignSystemRegistry();
    expect(lookupDesignSystem("test-system")).toBeNull();
    expect(listDesignSystems()).toHaveLength(0);
  });
});
