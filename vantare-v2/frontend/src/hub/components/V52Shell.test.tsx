import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V52Shell } from "./V52Shell";

afterEach(() => cleanup());

describe("V52Shell", () => {
  it("renders shared navigation and children", () => {
    render(
      <V52Shell
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.3"
        sourceStatus={null}
      >
        <div data-testid="child-content">content</div>
      </V52Shell>,
    );
    // Topbar exposes "Hub" and "Launcher" in the top nav; sidebar mirrors
    // them. Either copy is fine — we just want to confirm the shared
    // navigation contract reaches the shell.
    expect(screen.getAllByText("Hub").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Launcher").length).toBeGreaterThan(0);
    expect(screen.getByTestId("child-content")).toBeTruthy();
  });

  it("marks current sidebar section as active", () => {
    render(
      <V52Shell
        activeSection="launcher"
        onNavigate={vi.fn()}
        version="v0.1.0.3"
        sourceStatus={null}
      >
        <div />
      </V52Shell>,
    );
    expect(screen.getByTestId("v52-sidebar-launcher").getAttribute("aria-current")).toBe("page");
  });

  it("navigates from sidebar", () => {
    const onNavigate = vi.fn();
    render(
      <V52Shell
        activeSection="dashboard"
        onNavigate={onNavigate}
        version="v0.1.0.3"
        sourceStatus={null}
      >
        <div />
      </V52Shell>,
    );
    fireEvent.click(screen.getByTestId("v52-sidebar-launcher"));
    expect(onNavigate).toHaveBeenCalledWith("launcher");
  });
});
