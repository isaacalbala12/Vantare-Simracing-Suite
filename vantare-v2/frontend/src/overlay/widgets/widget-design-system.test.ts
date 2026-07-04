import { describe, expect, it } from "vitest";
import { resolveWidgetDesignSystem } from "./widget-design-system";

describe("resolveWidgetDesignSystem", () => {
  it("returns correct accent color for vantare-crystal", () => {
    const ds = resolveWidgetDesignSystem("vantare-crystal");
    expect(ds.colors.accent).toBe("#ff3b3b");
  });

  it("returns correct badge colors for vantare-crystal", () => {
    const ds = resolveWidgetDesignSystem("vantare-crystal");
    expect(ds.badges.free.text).toBe("#22c55e");
    expect(ds.badges.free.bg).toBe("rgba(34,197,94,.12)");
    expect(ds.badges.free.border).toBe("rgba(34,197,94,.25)");
    expect(ds.badges.pro.text).toBe("#ff3b3b");
    expect(ds.badges.pro.bg).toBe("rgba(255,59,59,.1)");
    expect(ds.badges.pro.border).toBe("rgba(255,59,59,.25)");
    expect(ds.badges.tester.text).toBe("#f59e0b");
    expect(ds.badges.experimental.text).toBe("#a855f7");
  });

  it("returns correct accent color for base", () => {
    const ds = resolveWidgetDesignSystem("base");
    expect(ds.colors.accent).toBe("#9b2226");
  });

  it("falls back to base when themeId is undefined", () => {
    const ds = resolveWidgetDesignSystem(undefined);
    expect(ds.colors.accent).toBe("#9b2226");
    expect(ds.id).toBe("base");
  });

  it("falls back to base for unknown theme", () => {
    const ds = resolveWidgetDesignSystem("unknown-theme");
    expect(ds.colors.accent).toBe("#9b2226");
    expect(ds.id).toBe("base");
  });

  it("contains no position/x/y/w/h properties", () => {
    const ds = resolveWidgetDesignSystem("vantare-crystal");
    const keys = Object.keys(ds);
    expect(keys).not.toContain("x");
    expect(keys).not.toContain("y");
    expect(keys).not.toContain("w");
    expect(keys).not.toContain("h");
    expect(keys).not.toContain("position");

    // Deep check: no position-like keys anywhere in the object
    function findPositionKeys(obj: Record<string, unknown>): string[] {
      const found: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        if (["x", "y", "w", "h", "position", "width", "height"].includes(k)) {
          found.push(k);
        }
        if (v && typeof v === "object" && !Array.isArray(v)) {
          found.push(...findPositionKeys(v as Record<string, unknown>));
        }
      }
      return found;
    }
    expect(findPositionKeys(ds)).toEqual([]);
  });

  it("has all 7 badge types", () => {
    const ds = resolveWidgetDesignSystem("vantare-crystal");
    const badgeKeys = Object.keys(ds.badges);
    expect(badgeKeys).toEqual(
      expect.arrayContaining([
        "free",
        "pro",
        "tester",
        "experimental",
        "dataOk",
        "dataPartial",
        "dataPending",
      ]),
    );
    expect(badgeKeys.length).toBe(7);
  });

  it("has all 7 surface types", () => {
    const ds = resolveWidgetDesignSystem("vantare-crystal");
    const surfaceKeys = Object.keys(ds.surfaces);
    expect(surfaceKeys).toEqual(
      expect.arrayContaining([
        "card",
        "panel",
        "header",
        "rowEven",
        "rowOdd",
        "playerHighlight",
        "lockedOverlay",
      ]),
    );
    expect(surfaceKeys.length).toBe(7);
  });

  it("has typography with all three font families", () => {
    const ds = resolveWidgetDesignSystem("vantare-crystal");
    expect(ds.typography.displayFont).toContain("Plus Jakarta Sans");
    expect(ds.typography.bodyFont).toContain("Inter");
    expect(ds.typography.monoFont).toContain("JetBrains Mono");
  });
});
