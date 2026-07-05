import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HubErrorBoundary } from "./HubErrorBoundary";

let shouldThrow = false;
let errorMessage = "test crash message";

function ThrowingChild() {
  if (shouldThrow) throw new Error(errorMessage);
  return <div data-testid="child">ok</div>;
}

afterEach(() => {
  cleanup();
  shouldThrow = false;
  errorMessage = "test crash message";
});

describe("HubErrorBoundary", () => {
  it("renders children when no error", () => {
    shouldThrow = false;
    render(
      <HubErrorBoundary>
        <div data-testid="child">ok</div>
      </HubErrorBoundary>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.queryByTestId("hub-error-boundary")).toBeNull();
  });

  it("shows fallback when child throws", () => {
    shouldThrow = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <HubErrorBoundary>
        <ThrowingChild />
      </HubErrorBoundary>,
    );

    expect(screen.getByTestId("hub-error-boundary")).toBeTruthy();
    expect(screen.queryByTestId("child")).toBeNull();

    spy.mockRestore();
  });

  it("fallback shows error message", () => {
    shouldThrow = true;
    errorMessage = "test crash message";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <HubErrorBoundary>
        <ThrowingChild />
      </HubErrorBoundary>,
    );

    const detail = screen.getByTestId("hub-error-detail");
    expect(detail.textContent).toContain("test crash message");

    spy.mockRestore();
  });

  it("retry resets boundary", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Phase 1: throw on render → fallback
    shouldThrow = true;
    render(
      <HubErrorBoundary>
        <ThrowingChild />
      </HubErrorBoundary>,
    );

    expect(screen.getByTestId("hub-error-boundary")).toBeTruthy();
    expect(screen.queryByTestId("child")).toBeNull();

    // Phase 2: stop throwing, then click retry on the same boundary
    shouldThrow = false;
    fireEvent.click(screen.getByTestId("hub-error-retry"));

    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.queryByTestId("hub-error-boundary")).toBeNull();

    spy.mockRestore();
  });

  it("logs error to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    shouldThrow = true;
    render(
      <HubErrorBoundary>
        <ThrowingChild />
      </HubErrorBoundary>,
    );

    expect(spy).toHaveBeenCalledWith(
      "[HubErrorBoundary]",
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );

    spy.mockRestore();
  });
});
