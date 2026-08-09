import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ObsOverlayStudioPreview } from "./ObsOverlayStudioPreview";

const originalResizeObserver = globalThis.ResizeObserver;

function installViewportResizeObserver(width: number, height: number): void {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(element: Element): void {
      Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
      Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
      this.callback([], this as unknown as ResizeObserver);
    }

    disconnect(): void {
      return undefined;
    }
  } as unknown as typeof ResizeObserver;
}

describe("ObsOverlayStudioPreview", () => {
  afterEach(() => {
    cleanup();
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("upscales a 1920x1080 scene to a 2K 16:9 viewport", async () => {
    installViewportResizeObserver(2560, 1440);
    render(
      <ObsOverlayStudioPreview>
        <div />
      </ObsOverlayStudioPreview>,
    );

    await waitFor(() => expect(screen.getByTestId("obs-studio-preview-scene")).toBeTruthy());

    const scene = screen.getByTestId("obs-studio-preview-scene");
    expect(Number(scene.getAttribute("data-scale"))).toBeCloseTo(4 / 3, 5);
    expect(scene.parentElement?.style.width).toBe("2560px");
    expect(scene.parentElement?.style.height).toBe("1440px");
  });
});
