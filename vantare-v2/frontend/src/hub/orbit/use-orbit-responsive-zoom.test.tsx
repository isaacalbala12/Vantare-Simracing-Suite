import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  vi.useFakeTimers();
  resizeTo(1920, 1080);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useOrbitResponsiveZoom", () => {
  it("aplica el factor al montar sin esperar a ningun temporizador", () => {
    resizeTo(1000, 700);
    render(<Probe />);
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(1000 / 1180, 3);
  });

  it("no reescribe el factor mas de una vez por ventana de throttling", () => {
    render(<Probe />);
    const writes: string[] = [];
    const observer = new MutationObserver(() => writes.push(zoomVar()));
    observer.observe(root(), { attributes: true, attributeFilter: ["style"] });

    // Rafaga de 60 eventos, como el arrastre del borde de la ventana en
    // WebView2: sin throttling serian 60 reescalados del documento entero.
    for (let step = 1; step <= 60; step += 1) {
      resizeTo(1920 - step * 10, 1080 - step * 5);
      vi.advanceTimersByTime(8);
    }
    observer.disconnect();

    // 60 eventos en ~480 ms: como mucho un puñado de escrituras.
    expect(writes.length).toBeLessThanOrEqual(6);
  });

  it("marca la raiz mientras dura la rafaga y aplica el valor final al soltar", () => {
    render(<Probe />);
    resizeTo(900, 700);
    expect(root().dataset.orbitResizing).toBe("true");

    // Ultimo evento de la rafaga, dentro de la ventana de throttling: el valor
    // no se ha escrito todavia y tiene que llegar igualmente al soltar.
    vi.advanceTimersByTime(10);
    resizeTo(880, 690);
    vi.advanceTimersByTime(400);

    expect(root().dataset.orbitResizing).toBeUndefined();
    expect(Number.parseFloat(zoomVar())).toBeCloseTo(880 / 1180, 3);
  });

  it("limpia zoom, variable y marcas al desmontar", () => {
    const view = render(<Probe />);
    resizeTo(900, 700);
    vi.advanceTimersByTime(400);
    view.unmount();

    expect(zoomVar()).toBe("");
    expect(root().dataset.orbitResizing).toBeUndefined();
    expect(root().dataset.orbitZoomFloored).toBeUndefined();
  });
});
