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
    expect(getStoredUiAppearance()).toEqual({ palette: "vantare", scheme: "system" });
    window.localStorage.setItem("vantare.ui.palette", "otro");
    window.localStorage.setItem("vantare.ui.scheme", "otro");
    expect(getStoredUiAppearance()).toEqual({ palette: "vantare", scheme: "system" });
  });

  it("aplica y recuerda paleta y esquema de forma independiente", () => {
    applyUiAppearance({ palette: "ocean", scheme: "light" }, document.documentElement, false);
    persistUiAppearance({ palette: "ocean", scheme: "light" });
    expect(document.documentElement.dataset.uiPalette).toBe("ocean");
    expect(document.documentElement.dataset.uiScheme).toBe("light");
    expect(document.documentElement.dataset.uiResolvedScheme).toBe("light");
    expect(getStoredUiAppearance()).toEqual({ palette: "ocean", scheme: "light" });
    expect(window.localStorage.getItem("vantare.theme")).toBeNull();
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
