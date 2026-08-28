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

function wheelEvent(deltaY: number, ctrlKey = true, deltaMode = 0): WheelEvent {
  const event = new Event("wheel", { cancelable: true }) as WheelEvent;
  Object.defineProperties(event, {
    altKey: { value: false },
    ctrlKey: { value: ctrlKey },
    deltaMode: { value: deltaMode },
    deltaY: { value: deltaY },
    metaKey: { value: false },
  });
  return event;
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

  it("compone la preferencia guardada con el factor responsive", () => {
    localStorage.setItem(ORBIT_KEYS.appZoom, "1.25");
    resizeTo(1000, 700);
    render(<Probe />);
    expect(Number.parseFloat(zoomVar())).toBeCloseTo((1000 / 1180) * 1.25, 3);
    expect(root().dataset.orbitZoomFloored).toBe("true");
  });

  it("los atajos cambian, restablecen y persisten el zoom", () => {
    render(<Probe />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", ctrlKey: true }));
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(1.1, 3);
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBe("1.1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", ctrlKey: true }));
    expect(zoomVar()).toBe("1");
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBe("1");
  });

  it("no roba atajos mientras el usuario escribe en un campo", () => {
    render(<Probe />);
    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "+", ctrlKey: true, bubbles: true, cancelable: true }),
    );

    expect(zoomVar()).toBe("1");
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBeNull();
    input.remove();
  });

  it("sube y baja un paso con Ctrl y la rueda, sin delegar el zoom a WebView", () => {
    render(<Probe />);

    const up = wheelEvent(-100);
    window.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(1.1, 3);
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBe("1.1");

    const down = wheelEvent(100);
    window.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(zoomVar()).toBe("1");
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBe("1");
  });

  it("acumula deltas pequeños de trackpad antes de cambiar un paso", () => {
    render(<Probe />);

    for (let index = 0; index < 4; index += 1) {
      const event = wheelEvent(-10);
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }

    expect(zoomVar()).toBe("1");
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBeNull();

    window.dispatchEvent(wheelEvent(-10));
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(1.1, 3);
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBe("1.1");
  });

  it("separa gestos pequeños tras el reposo y acepta una muesca en modo linea", () => {
    render(<Probe />);

    window.dispatchEvent(wheelEvent(-30));
    vi.advanceTimersByTime(181);
    window.dispatchEvent(wheelEvent(-30));
    expect(zoomVar()).toBe("1");

    const lineNotch = wheelEvent(-3, true, WheelEvent.DOM_DELTA_LINE);
    window.dispatchEvent(lineNotch);
    expect(lineNotch.defaultPrevented).toBe(true);
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(1.1, 3);
  });

  it("consume el gesto en el limite pero ignora un delta cero", () => {
    localStorage.setItem(ORBIT_KEYS.appZoom, "1.5");
    render(<Probe />);

    const atMaximum = wheelEvent(-100);
    window.dispatchEvent(atMaximum);
    expect(atMaximum.defaultPrevented).toBe(true);
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(1.5, 3);
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBe("1.5");

    const zero = wheelEvent(0);
    window.dispatchEvent(zero);
    expect(zero.defaultPrevented).toBe(false);
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(1.5, 3);
  });

  it("conserva el scroll normal sin modificador y limpia la rueda al desmontar", () => {
    const view = render(<Probe />);
    const plain = wheelEvent(-100, false);
    window.dispatchEvent(plain);

    expect(plain.defaultPrevented).toBe(false);
    expect(zoomVar()).toBe("1");
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBeNull();

    view.unmount();
    const afterUnmount = wheelEvent(-100);
    window.dispatchEvent(afterUnmount);

    expect(afterUnmount.defaultPrevented).toBe(false);
    expect(localStorage.getItem(ORBIT_KEYS.appZoom)).toBeNull();
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
