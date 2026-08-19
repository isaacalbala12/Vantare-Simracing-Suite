import { afterEach, describe, expect, it } from "vitest";
import { layoutViewport, orbitZoomFactor, toLayoutPx } from "./layout-scale";

afterEach(() => {
  document.documentElement.style.removeProperty("--orbit-zoom");
});

describe("orbitZoomFactor", () => {
  it("es 1 cuando la shell no está escalada", () => {
    expect(orbitZoomFactor()).toBe(1);
  });

  it("lee el factor publicado por la shell", () => {
    document.documentElement.style.setProperty("--orbit-zoom", "0.75");
    expect(orbitZoomFactor()).toBeCloseTo(0.75, 5);
  });

  it("ignora valores corruptos y vuelve a 1", () => {
    document.documentElement.style.setProperty("--orbit-zoom", "sin-sentido");
    expect(orbitZoomFactor()).toBe(1);
    document.documentElement.style.setProperty("--orbit-zoom", "0");
    expect(orbitZoomFactor()).toBe(1);
  });
});

describe("toLayoutPx", () => {
  it("no toca las medidas sin escalado", () => {
    expect(toLayoutPx(200, 1)).toBe(200);
  });

  it("convierte px reales a px de maquetación", () => {
    // A factor 0.5, 200 px reales ocupan 400 px de maquetación.
    expect(toLayoutPx(200, 0.5)).toBe(400);
  });

  it("es la inversa del escalado: convertir y volver a escalar devuelve el valor original", () => {
    const factor = 870 / 1180;
    expect(toLayoutPx(300, factor) * factor).toBeCloseTo(300, 5);
  });
});

describe("layoutViewport", () => {
  it("devuelve la ventana en px de maquetación", () => {
    const factor = 0.5;
    const viewport = layoutViewport(factor);
    expect(viewport.width).toBeCloseTo(window.innerWidth / factor, 5);
    expect(viewport.height).toBeCloseTo(window.innerHeight / factor, 5);
  });

  it("sin escalado es la ventana tal cual", () => {
    expect(layoutViewport(1)).toEqual({ width: window.innerWidth, height: window.innerHeight });
  });
});
