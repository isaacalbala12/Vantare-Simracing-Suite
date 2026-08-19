import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORBIT_KEYS } from "./orbit-store";
import { useOrbitResponsiveZoom } from "./use-orbit-responsive-zoom";

function Probe() {
  useOrbitResponsiveZoom();
  return null;
}

const root = () => document.documentElement;
const zoomVar = () => root().style.getPropertyValue("--orbit-zoom");

function resizeTo(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

/** `requestAnimationFrame` sincrono: cada frame encolado se ejecuta al pedirlo. */
function useImmediateFrames() {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(performance.now());
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resizeTo(1920, 1080);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useOrbitResponsiveZoom", () => {
  it("aplica el factor al montar sin esperar a ningun temporizador", () => {
    resizeTo(1000, 700);
    render(<Probe />);
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(1000 / 1180, 3);
  });

  it("sigue cada paso del gesto: un escalado por evento, sin quedarse atras", () => {
    useImmediateFrames();
    render(<Probe />);

    // Ráfaga como la del arrastre real del borde en WebView2. El contrato de
    // D-R4-5 es que el contenido no se descuadre del marco: tras cada paso el
    // factor ya es el que pide la ventana, sin esperar a soltar.
    for (let step = 1; step <= 40; step += 1) {
      const width = 1900 - step * 25;
      const height = 1020 - step * 8;
      resizeTo(width, height);
      vi.advanceTimersByTime(17);
      const expected = Math.min(Math.max(Math.min(width / 1180, height / 790), 0.6), 1);
      expect(Number.parseFloat(zoomVar())).toBeCloseTo(expected, 2);
    }
  });

  it("funde en una sola escritura los resize que caen en el mismo frame", () => {
    let queued: FrameRequestCallback | null = null;
    let requests = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      requests += 1;
      queued = cb;
      return 1;
    });
    render(<Probe />);

    resizeTo(1100, 760);
    resizeTo(1000, 720);
    resizeTo(950, 700);
    // Tres eventos en el mismo frame: un unico escalado encolado.
    expect(requests).toBe(1);

    queued?.(0);
    // Y el valor que se aplica es el del ultimo evento, no el del primero.
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(Math.min(950 / 1180, 700 / 790), 3);
  });

  it("marca la raiz mientras dura la rafaga y la limpia al soltar", () => {
    useImmediateFrames();
    render(<Probe />);
    resizeTo(900, 700);
    expect(root().dataset.orbitResizing).toBe("true");
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(900 / 1180, 3);

    vi.advanceTimersByTime(10);
    resizeTo(880, 690);
    expect(root().dataset.orbitResizing).toBe("true");
    vi.advanceTimersByTime(400);

    expect(root().dataset.orbitResizing).toBeUndefined();
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(880 / 1180, 3);
  });

  it("no escala nada con el interruptor de diagnostico activo", () => {
    localStorage.setItem(ORBIT_KEYS.zoomOff, "1");
    resizeTo(900, 700);
    render(<Probe />);
    expect(zoomVar()).toBe("");
    resizeTo(880, 690);
    expect(root().dataset.orbitResizing).toBeUndefined();
  });

  it("limpia zoom, variable y marcas al desmontar", () => {
    useImmediateFrames();
    const view = render(<Probe />);
    resizeTo(900, 700);
    vi.advanceTimersByTime(400);
    view.unmount();

    expect(zoomVar()).toBe("");
    expect(root().dataset.orbitResizing).toBeUndefined();
    expect(root().dataset.orbitZoomFloored).toBeUndefined();
  });
});
