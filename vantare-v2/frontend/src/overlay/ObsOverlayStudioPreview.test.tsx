import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import previewSource from "./ObsOverlayStudioPreview.tsx?raw";
import { ObsOverlayStudioPreview } from "./ObsOverlayStudioPreview";

const originalResizeObserver = globalThis.ResizeObserver;

type ObserverHarness = {
  trigger(width: number, height: number, contentRectWidth?: number, contentRectHeight?: number): void;
  triggerContentRect(width: number, height: number): void;
  disconnect: ReturnType<typeof vi.fn>;
};

let observers: ObserverHarness[] = [];

function installResizeObserver(): void {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;
    private target: Element | null = null;
    readonly disconnect = vi.fn();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.push(this);
    }

    observe(target: Element): void {
      this.target = target;
    }

    unobserve(): void {}

    trigger(width: number, height: number, contentRectWidth = width, contentRectHeight = height): void {
      if (!this.target) return;
      this.callback(
        [{
          target: this.target,
          contentBoxSize: [{ inlineSize: width, blockSize: height }],
          contentRect: { width: contentRectWidth, height: contentRectHeight },
        } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }

    triggerContentRect(width: number, height: number): void {
      if (!this.target) return;
      this.callback(
        [{ target: this.target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
  } as unknown as typeof ResizeObserver;
}

beforeEach(() => {
  observers = [];
  installResizeObserver();
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
});

describe("ObsOverlayStudioPreview", () => {
  it.each([
    ["legacy", { width: 1920, height: 1080 }, { width: 2560, height: 1440 }, 4 / 3, 0, 0],
    ["ultrawide", { width: 3440, height: 1440 }, { width: 1920, height: 1080 }, 1920 / 3440, 0, (1080 - 1440 * (1920 / 3440)) / 2],
    ["custom", { width: 1000, height: 1000 }, { width: 1600, height: 900 }, 0.9, 350, 0],
  ])("fits the %s document surface with the shared centered transform", (_label, layoutViewport, output, scale, offsetX, offsetY) => {
    render(
      <ObsOverlayStudioPreview layoutViewport={layoutViewport}>
        <div />
      </ObsOverlayStudioPreview>,
    );

    expect(screen.queryByTestId("obs-studio-preview-scene")).toBeNull();
    act(() => observers[0].trigger(output.width, output.height));

    const scene = screen.getByTestId("obs-studio-preview-scene") as HTMLElement;
    expect(scene.style.width).toBe(`${layoutViewport.width}px`);
    expect(scene.style.height).toBe(`${layoutViewport.height}px`);
    expect(Number(scene.dataset.scale)).toBeCloseTo(scale);
    expect(Number(scene.dataset.offsetX)).toBeCloseTo(offsetX);
    expect(Number(scene.dataset.offsetY)).toBeCloseTo(offsetY);
    expect(scene.style.transform).toBe(`translate(${offsetX}px, ${offsetY}px) scale(${scale})`);
  });

  it("uses fractional content-box measurements, ignores zero sizes and disconnects cleanly", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const view = render(
      <ObsOverlayStudioPreview layoutViewport={{ width: 1000, height: 1000 }}>
        <div />
      </ObsOverlayStudioPreview>,
    );

    act(() => observers[0].trigger(1000, 1000));
    expect((view.getByTestId("obs-studio-preview-scene") as HTMLElement).dataset.scale).toBe("1");

    act(() => observers[0].trigger(0, 0));
    expect(view.queryByTestId("obs-studio-preview-scene")).toBeNull();

    act(() => observers[0].trigger(1000.5, 500.25, 400, 200));
    expect(Number((view.getByTestId("obs-studio-preview-scene") as HTMLElement).dataset.scale)).toBeCloseTo(0.50025);
    act(() => observers[0].triggerContentRect(800, 600));
    expect(Number((view.getByTestId("obs-studio-preview-scene") as HTMLElement).dataset.scale)).toBeCloseTo(0.6);
    expect(addEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(0);

    view.unmount();
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(removeEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(0);
  });

  it("falls back to the client box and window resize only without ResizeObserver", () => {
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: undefined });
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    const clientHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(900);
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    const view = render(
      <ObsOverlayStudioPreview layoutViewport={{ width: 1000, height: 1000 }}>
        <div />
      </ObsOverlayStudioPreview>,
    );

    expect((view.getByTestId("obs-studio-preview-scene") as HTMLElement).style.transform).toBe(
      "translate(350px, 0px) scale(0.9)",
    );
    expect(addEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(1);
    view.unmount();
    expect(removeEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(1);
    clientWidth.mockRestore();
    clientHeight.mockRestore();
  });

  it("does not depend on Studio canvas constants or geometry helpers", () => {
    expect(previewSource).not.toContain("hub/overlay-studio");
    expect(previewSource).not.toContain("CANVAS_WIDTH");
    expect(previewSource).not.toContain("CANVAS_HEIGHT");
    expect(previewSource).not.toContain("resolveCanvasScale");
    expect(previewSource).not.toContain("getBoundingClientRect");
  });
});
