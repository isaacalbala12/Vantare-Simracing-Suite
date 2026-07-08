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

  it("includes vantare-crystal for existing widget types", () => {
    for (const type of ["relative", "standings", "delta", "pedals", "telemetry", "telemetry-vertical"]) {
      expect(getStylesForType(type).some((style) => style.id === "vantare-crystal")).toBe(true);
    }
  });

  it("returns vantare-crystal defaults", () => {
    const appearance = getDefaultAppearance("relative", "vantare-crystal");
    expect(appearance.backgroundColor).toBe("#060608");
    expect(appearance.textColor).toBe("#ffffff");
    expect(appearance.classHypercarColor).toBe("rgba(239,68,68,0.25)");
  });

  it("relative vantare-crystal has translucent class colors with fg", () => {
    const appearance = getDefaultAppearance("relative", "vantare-crystal");
    expect(appearance.classHypercarColor).toBe("rgba(239,68,68,0.25)");
    expect(appearance.classHypercarFg).toBe("#f87171");
  });

  it("vantare-crystal has invented tokens for HTML gaps", () => {
    const standings = getDefaultAppearance("standings", "vantare-crystal");
    const telemetry = getDefaultAppearance("telemetry", "vantare-crystal");
    const relative = getDefaultAppearance("relative", "vantare-crystal");
    expect(standings.tireHardColor).toBe("#e5e7eb");
    expect(telemetry.rpmBlue).toBe("#38bdf8");
    expect(relative.classUnknownColor).toBe("rgba(107,114,128,0.25)");
  });
});
