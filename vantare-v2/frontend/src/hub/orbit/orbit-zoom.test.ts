import { describe, expect, it } from "vitest";
import {
  orbitZoomRequiresScroll,
  isOrbitZoomFloored,
  resolveOrbitContentMax,
  resolveOrbitZoom,
  ORBIT_CONTENT_MAX,
  ORBIT_CONTENT_MAX_ULTRAWIDE,
  ORBIT_REF_HEIGHT,
  ORBIT_REF_WIDTH,
  ORBIT_ZOOM_FLOOR,
} from "./orbit-zoom";

describe("resolveOrbitZoom", () => {
  it("no escala en el tamaño de diseño ni por encima", () => {
    expect(resolveOrbitZoom({ width: 1920, height: 1080 })).toBe(1);
    expect(resolveOrbitZoom({ width: 1600, height: 900 })).toBe(1);
    expect(resolveOrbitZoom({ width: 3440, height: 1440 })).toBe(1);
    expect(resolveOrbitZoom({ width: 5120, height: 1440 })).toBe(1);
  });

  it("no escala justo en los suelos de referencia", () => {
    expect(resolveOrbitZoom({ width: ORBIT_REF_WIDTH, height: ORBIT_REF_HEIGHT })).toBe(1);
  });

  it("escala por el eje más apretado", () => {
    // Ancho corto, alto de sobra → manda el ancho.
    expect(resolveOrbitZoom({ width: 870, height: 780 })).toBeCloseTo(870 / 1180, 5);
    // Alto corto, ancho de sobra → manda el alto.
    expect(resolveOrbitZoom({ width: 1920, height: 640 })).toBeCloseTo(640 / 790, 5);
  });

  it("la ventana de escritorio de ~870x780 cabe entera una vez escalada", () => {
    const viewport = { width: 870, height: 780 };
    const factor = resolveOrbitZoom(viewport);
    // El ancho de maquetación resultante llega justo al mínimo de diseño: nada
    // se recorta por la derecha, que era el fallo reportado.
    expect(viewport.width / factor).toBeGreaterThanOrEqual(ORBIT_REF_WIDTH - 0.5);
    expect(viewport.height / factor).toBeGreaterThanOrEqual(ORBIT_REF_HEIGHT - 0.5);
  });

  it("respeta el suelo del factor", () => {
    expect(resolveOrbitZoom({ width: 320, height: 240 })).toBe(ORBIT_ZOOM_FLOOR);
    expect(resolveOrbitZoom({ width: 600, height: 400 })).toBe(ORBIT_ZOOM_FLOOR);
  });

  it("devuelve 1 ante medidas no válidas", () => {
    expect(resolveOrbitZoom({ width: 0, height: 0 })).toBe(1);
    expect(resolveOrbitZoom({ width: Number.NaN, height: 800 })).toBe(1);
    expect(resolveOrbitZoom({ width: -100, height: 800 })).toBe(1);
  });

  it("es monótono: encoger la ventana nunca agranda el factor", () => {
    const widths = [1920, 1600, 1366, 1280, 1024, 900, 800, 700, 600];
    const factors = widths.map((width) => resolveOrbitZoom({ width, height: 900 }));
    for (let index = 1; index < factors.length; index += 1) {
      expect(factors[index]).toBeLessThanOrEqual(factors[index - 1]);
    }
  });
});

describe("isOrbitZoomFloored", () => {
  it("solo marca suelo cuando la ventana ya no cabe ni escalada", () => {
    expect(isOrbitZoomFloored({ width: 870, height: 780 })).toBe(false);
    expect(isOrbitZoomFloored({ width: 1024, height: 640 })).toBe(false);
    expect(isOrbitZoomFloored({ width: 600, height: 400 })).toBe(true);
  });

  it("no marca suelo ante medidas no válidas", () => {
    expect(isOrbitZoomFloored({ width: 0, height: 0 })).toBe(false);
  });
});

describe("orbitZoomRequiresScroll", () => {
  it("activa desplazamiento cuando el zoom manual ya no deja caber el suelo", () => {
    expect(orbitZoomRequiresScroll({ width: 1920, height: 1080 }, 1.25)).toBe(false);
    expect(orbitZoomRequiresScroll({ width: 1366, height: 768 }, 1.25)).toBe(true);
  });

  it("no lo activa cuando alejar permite que la shell vuelva a caber", () => {
    expect(orbitZoomRequiresScroll({ width: 600, height: 400 }, 0.48)).toBe(false);
    expect(orbitZoomRequiresScroll({ width: 0, height: 0 }, 1)).toBe(false);
  });
});

describe("resolveOrbitContentMax", () => {
  it("mantiene el tope calibrado hasta las ultrapanorámicas", () => {
    expect(resolveOrbitContentMax(1366)).toBe(ORBIT_CONTENT_MAX);
    expect(resolveOrbitContentMax(1920)).toBe(ORBIT_CONTENT_MAX);
    expect(resolveOrbitContentMax(2199)).toBe(ORBIT_CONTENT_MAX);
  });

  it("ensancha el tope en 21:9 y 32:9", () => {
    expect(resolveOrbitContentMax(2560)).toBe(ORBIT_CONTENT_MAX_ULTRAWIDE);
    expect(resolveOrbitContentMax(3440)).toBe(ORBIT_CONTENT_MAX_ULTRAWIDE);
    expect(resolveOrbitContentMax(5120)).toBe(ORBIT_CONTENT_MAX_ULTRAWIDE);
  });

  it("el tope nunca se acerca al ancho de la ventana en ultrapanorámicas", () => {
    // Lo que Isaac pregunta: a 32:9 no hay rejillas de 3000 px.
    expect(resolveOrbitContentMax(5120)).toBeLessThan(5120 / 2);
    expect(resolveOrbitContentMax(1920)).toBe(ORBIT_CONTENT_MAX);
  });
});
