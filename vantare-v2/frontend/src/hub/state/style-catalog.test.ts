import { describe, expect, it } from "vitest";
import {
  getStylesForType,
  getDefaultAppearance,
} from "./style-catalog";

describe("style-catalog", () => {
  it("lists at least one style for each known widget type", () => {
    const types = ["telemetry", "telemetry-vertical", "standings", "relative", "delta", "pedals"];
    for (const type of types) {
      const styles = getStylesForType(type);
      expect(styles.length).toBeGreaterThan(0);
    }
  });

  it("returns vantare-racing as the default style for standings", () => {
    const styles = getStylesForType("standings");
    const vr = styles.find((s) => s.id === "vantare-racing");
    expect(vr).toBeTruthy();
    expect(vr!.name).toBe("Vantare Racing");
  });

  it("returns default appearance for a style", () => {
    const appearance = getDefaultAppearance("standings", "vantare-racing");
    expect(appearance.accentColor).toBe("#9b2226");
    expect(appearance.textColor).toBe("#FFFFFF");
  });

  it("returns fallback appearance for unknown style", () => {
    const appearance = getDefaultAppearance("standings", "unknown-style");
    expect(appearance.accentColor).toBeTruthy();
  });

  it("includes glassmorphism-pro for existing widget types", () => {
    for (const type of ["relative", "standings", "delta", "pedals", "telemetry", "telemetry-vertical"]) {
      expect(getStylesForType(type).some((style) => style.id === "glassmorphism-pro")).toBe(true);
    }
  });

  it("returns glassmorphism-pro defaults", () => {
    const appearance = getDefaultAppearance("relative", "glassmorphism-pro");
    expect(appearance.backgroundColor).toBe("#121216");
    expect(appearance.textColor).toBe("#ffffff");
    expect(appearance.classHypercarColor).toBe("#ff2a3b");
  });
});
