import { afterEach, describe, expect, it } from "vitest";
import {
  applyUiAppearance,
  getStoredUiAppearance,
  initializeUiAppearance,
  persistUiAppearance,
} from "./ui-appearance";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.uiPalette;
  delete document.documentElement.dataset.uiScheme;
  delete document.documentElement.dataset.uiResolvedScheme;
});

describe("apariencia de la interfaz", () => {
  it("usa Vantare y sistema para una instalación nueva o preferencias inválidas", () => {
    expect(getStoredUiAppearance()).toEqual({ palette: "vantare", scheme: "system", contrast: 100, glassOpacity: 80, interfaceFont: "inter", monoFont: "cascadia" });
    window.localStorage.setItem("vantare.ui.palette", "otro");
    window.localStorage.setItem("vantare.ui.scheme", "otro");
    window.localStorage.setItem("vantare.ui.contrast", "1000");
    window.localStorage.setItem("vantare.ui.glassOpacity", "NaN");
    window.localStorage.setItem("vantare.ui.interfaceFont", "otro");
    window.localStorage.setItem("vantare.ui.monoFont", "otro");
    expect(getStoredUiAppearance()).toEqual({ palette: "vantare", scheme: "system", contrast: 100, glassOpacity: 80, interfaceFont: "inter", monoFont: "cascadia" });
  });

  it("aplica y recuerda paleta y esquema de forma independiente", () => {
    const appearance = { ...getStoredUiAppearance(), palette: "ocean" as const, scheme: "light" as const };
    applyUiAppearance(appearance, document.documentElement, false);
    persistUiAppearance(appearance);
    expect(document.documentElement.dataset.uiPalette).toBe("ocean");
    expect(document.documentElement.dataset.uiScheme).toBe("light");
    expect(document.documentElement.dataset.uiResolvedScheme).toBe("light");
    expect(getStoredUiAppearance()).toEqual(appearance);
    expect(window.localStorage.getItem("vantare.theme")).toBeNull();
  });

  it.each(["rose", "grove", "ember", "mono"] as const)("recupera la paleta %s con ambas variantes", (palette) => {
    for (const scheme of ["light", "dark"] as const) {
      const appearance = { ...getStoredUiAppearance(), palette, scheme };
      persistUiAppearance(appearance);
      expect(getStoredUiAppearance()).toEqual(appearance);
      applyUiAppearance(appearance, document.documentElement);
      expect(document.documentElement.dataset.uiPalette).toBe(palette);
      expect(document.documentElement.dataset.uiResolvedScheme).toBe(scheme);
    }
  });

  it("aplica y persiste contraste, cristal y tipografías sin tocar los widgets", () => {
    const sheet = document.createElement("style");
    sheet.textContent = '.appearance-test { --orbit-ink: #ffffff; --orbit-canvas: #000000; --orbit-ink-2: #808080; --orbit-line: rgba(255,255,255,.2); --orbit-panel-bg: rgba(10,20,30,.8); }';
    document.head.append(sheet);
    const root = document.createElement("div");
    root.className = "appearance-test";
    document.body.append(root);
    const appearance = { ...getStoredUiAppearance(), contrast: 120, glassOpacity: 100, interfaceFont: "segoe" as const, monoFont: "consolas" as const };
    window.localStorage.setItem("vantare.theme", "vantare-lite");
    applyUiAppearance(appearance, root, true);
    persistUiAppearance(appearance);

    expect(root.style.getPropertyValue("--orbit-ink-2")).toBe("rgba(153, 153, 153, 1)");
    expect(root.style.getPropertyValue("--orbit-line")).toBe("rgba(255, 255, 255, 0.24)");
    expect(root.style.getPropertyValue("--orbit-panel-bg")).toBe("rgba(10, 20, 30, 1)");
    expect(root.style.getPropertyValue("--orbit-font-sans")).toContain("Segoe UI Variable");
    expect(root.style.getPropertyValue("--orbit-font-mono")).toContain("Consolas");
    expect(getStoredUiAppearance()).toEqual(appearance);
    expect(window.localStorage.getItem("vantare.theme")).toBe("vantare-lite");
    root.remove();
    sheet.remove();
  });

  it("resuelve Sistema según Windows y lo actualiza cuando cambia", () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: false,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
    const original = window.matchMedia;
    window.matchMedia = () => media as unknown as MediaQueryList;
    try {
      const stop = initializeUiAppearance();
      expect(document.documentElement.dataset.uiResolvedScheme).toBe("light");
      media.matches = true;
      listeners.forEach((listener) => listener());
      expect(document.documentElement.dataset.uiResolvedScheme).toBe("dark");
      stop();
      expect(listeners.size).toBe(0);
    } finally {
      window.matchMedia = original;
    }
  });
});
