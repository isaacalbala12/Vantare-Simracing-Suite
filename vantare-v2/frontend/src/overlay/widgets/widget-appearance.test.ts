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
});


