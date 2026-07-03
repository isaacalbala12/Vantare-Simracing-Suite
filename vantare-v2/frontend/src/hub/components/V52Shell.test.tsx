import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V52Shell } from "./V52Shell";

afterEach(() => cleanup());

describe("V52Shell", () => {
  it("renders top navigation and children", () => {
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
    expect(screen.getByText("Hub")).toBeTruthy();
    expect(screen.getByText("Launcher")).toBeTruthy();
    expect(screen.getByTestId("child-content")).toBeTruthy();
  });

  it("does not render a sidebar navigation panel", () => {
    render(
      <V52Shell
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.3"
        sourceStatus={null}
      >
        <div />
      </V52Shell>,
    );
    expect(screen.queryByText("Navegación")).toBeNull();
    expect(screen.queryByTestId("v52-sidebar-dashboard")).toBeNull();
  });

  it("keeps the quick access dock", () => {
    render(
      <V52Shell
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.3"
        sourceStatus={null}
      >
        <div />
      </V52Shell>,
    );
    expect(screen.getByLabelText("Abrir launcher LMU")).toBeTruthy();
    expect(screen.getByLabelText("Configurar OBS")).toBeTruthy();
  });
});
