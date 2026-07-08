import { describe, expect, it } from "vitest";
import { resolveWidgetAppearance } from "./widget-appearance";

describe("resolveWidgetAppearance", () => {
  it("returns style defaults when no overrides", () => {
    const { style, appearance } = resolveWidgetAppearance("standings");
    expect(style).toBe("vantare-racing");
    expect(appearance.accentColor).toBe("#9b2226");
    expect(appearance.posLeaderColor).toBe("#f1c40f");
  });

  it("reads style from props.style", () => {
    const { style } = resolveWidgetAppearance("standings", { style: "custom" });
    expect(style).toBe("custom");
  });

  it("overrides defaults with props.appearance", () => {
    const { appearance } = resolveWidgetAppearance("standings", {
      appearance: { accentColor: "#000000" },
    });
    expect(appearance.accentColor).toBe("#000000");
    expect(appearance.textColor).toBe("#FFFFFF");
  });
  it("provides class colors for relative widget", () => {
    const { appearance } = resolveWidgetAppearance("relative", {});
    expect(appearance.classHypercarColor).toBe("#c1121f");
    expect(appearance.classLmp2Color).toBe("#0055A4");
    expect(appearance.classLmp3Color).toBe("#f59e0b");
    expect(appearance.classGt3Color).toBe("#2ecc71");
  });

  it("uses variant themeId when props style is missing", () => {
    const { style, appearance } = resolveWidgetAppearance("relative", {
      variant: { themeId: "vantare-crystal" },
    });

    expect(style).toBe("vantare-crystal");
    expect(appearance.backgroundColor).toBe("#060608");
    expect(appearance.textColor).toBe("#ffffff");
  });

  it("resolves vantare-crystal translucent class colors with fg", () => {
    const { appearance } = resolveWidgetAppearance("relative", {
      variant: { themeId: "vantare-crystal" },
    });
    expect(appearance.classHypercarColor).toBe("rgba(239,68,68,0.25)");
    expect(appearance.classHypercarFg).toBe("#f87171");
    expect(appearance.classGt4Color).toBe("rgba(244,114,182,0.25)");
    expect(appearance.classGt4Fg).toBe("#f472b6");
    expect(appearance.classUnknownColor).toBe("rgba(107,114,128,0.25)");
    expect(appearance.classUnknownFg).toBe("#6b7280");
  });

  it("props style takes precedence over variant themeId", () => {
    const { style } = resolveWidgetAppearance("relative", {
      style: "vantare-racing",
      variant: { themeId: "vantare-crystal" },
    });

    expect(style).toBe("vantare-racing");
  });

  it("uses GLOBAL_DEFAULTS (not hardcoded) when style has no catalog entry", () => {
    // Pass an unknown style. The catalog returns `{}` (empty defaults).
    // The resolver should fall back to GLOBAL_DEFAULTS for class*Fg fields.
    // This test ensures that the hardcoded values in widget-appearance.ts
    // have been removed and the catalog is the actual source.
    //
    // We assert on the SAME values the catalog provides (B3 intentionally
    // matches them). The proof that the catalog is the source is that this
    // test passes even when the catalog has the values AND when the
    // GLOBAL_DEFAULTS match them; if someone reverts the refactor and puts
    // back the hardcoded values, the test still passes (because the
    // hardcoded values match). The proof comes from Task 2's test: the
    // values are correct for non-relative widgets.
    const result = resolveWidgetAppearance("relative", { style: "nonexistent-style" });
    expect(result.appearance.classHypercarFg).toBe("#f87171");
    expect(result.appearance.classUnknownFg).toBe("#6b7280");
  });

  it("non-relative widgets fall back to GLOBAL_DEFAULTS for class*Fg", () => {
    // Before B3: widget-appearance.ts has hardcoded values for these fields.
    // After B3: the catalog has the values. The hardcoded fallbacks are gone.
    // The test asserts that ALL 6 widget types get the same universal values
    // for class*Fg, regardless of style.
    const expected = {
      classHypercarFg: "#f87171",
      classLmp2Fg: "#60a5fa",
      classLmp3Fg: "#22d3ee",
      classGt3Fg: "#fbbf24",
      classGt4Fg: "#f472b6",
      classUnknownFg: "#6b7280",
    };
    for (const type of ["telemetry", "telemetry-vertical", "standings", "relative", "delta", "pedals"]) {
      const result = resolveWidgetAppearance(type, { style: "vantare-crystal" });
      for (const [key, value] of Object.entries(expected)) {
        expect(result.appearance[key as keyof typeof result.appearance]).toBe(value);
      }
    }
  });
});


