import { describe, expect, it } from "vitest";
import {
  applyThemeToElement,
  cssVarsFromTheme,
  getStoredThemeId,
  persistThemeId,
  type VantareTheme,
} from "./theme";
import vantareV5 from "../themes/vantare-v5.json";
import vantareLite from "../themes/vantare-lite.json";
import vantareOrbit from "../themes/vantare-orbit.json";

const theme: VantareTheme = {
  id: "test",
  name: "Test",
  mode: "full",
  colors: {
    bg: "#000000",
    surface: "#111111",
    panel: "#222222",
    border: "#333333",
    borderHover: "#444444",
    text: "#eeeeee",
    textMuted: "#999999",
    textDim: "#666666",
    red400: "#E63946",
    red500: "#C1121F",
    red600: "#9B2226",
    red700: "#800020",
    red900: "#4A0012",
    red950: "#2A000A",
    wine: "#722F37",
    burgundy: "#4A0E16",
    blood: "#8B0000",
    success: "#34D399",
    warning: "#FFD700",
  },
  effects: {
    glassAlpha: "0.6",
    glassBlur: "20px",
    cardShadow: "none",
    hoverTranslateY: "-2px",
    motionScale: "1",
  },
  fonts: {
    sans: "Inter",
    display: "Rajdhani",
    mono: "Space Mono",
  },
};

describe("theme", () => {
  it("maps theme to CSS variables", () => {
    expect(cssVarsFromTheme(theme)["--v-bg"]).toBe("#000000");
    expect(cssVarsFromTheme(theme)["--v-glass-blur"]).toBe("20px");
  });

  it("applies variables and data attributes", () => {
    const el = document.createElement("div");
    applyThemeToElement(el, theme);
    expect(el.dataset.theme).toBe("test");
    expect(el.dataset.visualMode).toBe("full");
    expect(el.style.getPropertyValue("--v-bg")).toBe("#000000");
  });

  it("real themes expose required CSS variables", () => {
    expect(cssVarsFromTheme(vantareV5 as VantareTheme)["--v-bg"]).toBe(
      "#080808",
    );
    expect(
      cssVarsFromTheme(vantareLite as VantareTheme)["--v-glass-blur"],
    ).toBe("0px");
    expect(cssVarsFromTheme(vantareOrbit as VantareTheme)).toMatchObject({
      "--v-bg": "#08090b",
      "--v-red-500": "#f04755",
      "--v-coral": "#ff6a5f",
      "--v-radius": "18px",
      "--v-row": "49px",
    });
  });

  it("uses Orbit defaults for optional extension fields", () => {
    expect(cssVarsFromTheme(vantareV5 as VantareTheme)).toMatchObject({
      "--v-coral": "#ff6a5f",
      "--v-primary-bg": "#f3eeee",
      "--v-radius": "18px",
      "--v-topbar-height": "70px",
    });
  });

  it("applies the Orbit acceptance variables to an element", () => {
    const el = document.createElement("html");
    applyThemeToElement(el, vantareOrbit as VantareTheme);

    expect(el.style.getPropertyValue("--v-bg")).toBe("#08090b");
    expect(el.style.getPropertyValue("--v-red-500")).toBe("#f04755");
    expect(el.style.getPropertyValue("--v-coral")).toBe("#ff6a5f");
    expect(el.style.getPropertyValue("--v-radius")).toBe("18px");
  });

  it("does not emit empty CSS variable values for real themes", () => {
    for (const realTheme of [
      vantareV5 as VantareTheme,
      vantareLite as VantareTheme,
      vantareOrbit as VantareTheme,
    ]) {
      for (const value of Object.values(cssVarsFromTheme(realTheme))) {
        expect(value).toBeTypeOf("string");
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("falls back to v5 when localStorage read fails", () => {
    const originalLocalStorage = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("storage disabled");
        },
      },
    });

    expect(getStoredThemeId()).toBe("vantare-orbit");

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it("recognizes a stored Orbit theme", () => {
    const storage = { getItem: () => "vantare-orbit" } as Storage;
    expect(getStoredThemeId(storage)).toBe("vantare-orbit");
  });

  it("ignores localStorage write failures", () => {
    const originalLocalStorage = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        setItem: () => {
          throw new Error("storage disabled");
        },
      },
    });

    expect(() => persistThemeId("vantare-lite")).not.toThrow();

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  });
});
