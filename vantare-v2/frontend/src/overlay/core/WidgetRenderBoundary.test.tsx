import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetRenderBoundary } from "./WidgetRenderBoundary";

afterEach(() => cleanup());

function ThrowingChild(): null {
  throw new Error("renderer exploded");
}

describe("WidgetRenderBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <WidgetRenderBoundary widgetId="delta-1" widgetType="delta" systemId="vantare-original">
        <span>ok</span>
      </WidgetRenderBoundary>,
    );
    expect(screen.getByText("ok")).toBeTruthy();
  });

  it("isolates renderer exceptions with a stable diagnostic card", () => {
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <WidgetRenderBoundary
        widgetId="delta-1"
        widgetType="delta"
        systemId="vantare-original"
        onError={onError}
      >
        <ThrowingChild />
      </WidgetRenderBoundary>,
    );
    const diagnostic = screen.getByTestId("widget-render-diagnostic");
    expect(diagnostic.getAttribute("data-widget-id")).toBe("delta-1");
    expect(diagnostic.getAttribute("data-widget-type")).toBe("delta");
    expect(diagnostic.getAttribute("data-system-id")).toBe("vantare-original");
    expect(diagnostic.textContent).toMatch(/renderer exploded/i);
    expect(onError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});