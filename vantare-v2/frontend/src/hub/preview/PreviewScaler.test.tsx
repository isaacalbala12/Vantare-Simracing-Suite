import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewScaler } from "./PreviewScaler";

const originalResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
});

describe("PreviewScaler", () => {
  it("renders children inside a logical size box", () => {
    render(
      <div style={{ width: 800, height: 600 }}>
        <PreviewScaler logicalSize={{ width: 400, height: 200 }} testId="scaler">
          <div>content</div>
        </PreviewScaler>
      </div>,
    );

    expect(screen.getByText("content")).toBeTruthy();
    const inner = screen.getByTestId("scaler-inner");
    expect(inner.style.width).toBe("400px");
    expect(inner.style.height).toBe("200px");
    expect(inner.style.display).toBe("flex");
    expect(inner.style.alignItems).toBe("center");
    expect(inner.style.justifyContent).toBe("center");
  });

  it("works without ResizeObserver", () => {
    (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      undefined as unknown as typeof ResizeObserver;

    render(
      <PreviewScaler logicalSize={{ width: 300, height: 120 }} testId="scaler">
        <div>fallback</div>
      </PreviewScaler>,
    );

    expect(screen.getByText("fallback")).toBeTruthy();
    expect(screen.getByTestId("scaler-inner")).toBeTruthy();
  });

  it("does not upscale previews by default", async () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.getAttribute("data-testid") === "scaler") {
        return {
          x: 0,
          y: 0,
          width: 1200,
          height: 800,
          top: 0,
          right: 1200,
          bottom: 800,
          left: 0,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      render(
        <PreviewScaler logicalSize={{ width: 400, height: 200 }} testId="scaler">
          <div>content</div>
        </PreviewScaler>,
      );

      expect(screen.getByTestId("scaler-inner").style.transform).toBe("scale(1)");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });
});
