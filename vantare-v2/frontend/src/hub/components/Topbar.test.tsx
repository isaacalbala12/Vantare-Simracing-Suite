import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { Topbar } from "./Topbar";

afterEach(() => {
  cleanup();
});

vi.mock("../../lib/theme", () => ({
  applyTheme: vi.fn(),
  getStoredThemeId: vi.fn(() => "vantare-v5"),
  persistThemeId: vi.fn(),
}));

const mockUseAccess = vi.fn(() => ({
  planLabel: "free",
  planStatus: "free",
  roles: [] as string[],
  isBlocked: false,
  isUnconfigured: false,
}));

vi.mock("../../lib/access", () => ({
  useAccess: () => mockUseAccess(),
}));

describe("Topbar source status", () => {
  it("shows 'Fuente pendiente' when no source status is provided", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.2"
        sourceStatus={null}
      />,
    );
    expect(screen.getByText("Fuente pendiente")).toBeTruthy();
  });

  it("shows 'LMU conectado' when live source is available", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.2"
        sourceStatus={{ kind: "lmu", name: "LMU", live: true, available: true }}
      />,
    );
    expect(screen.getByText("LMU conectado")).toBeTruthy();
  });

  it("shows 'Esperando LMU' when live mode is active but unavailable", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.2"
        sourceStatus={{ kind: "lmu", name: "LMU", live: true, available: false }}
      />,
    );
    expect(screen.getByText("Esperando LMU")).toBeTruthy();
  });

  it("shows 'Mock' when the active source is mock", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.2"
        sourceStatus={{ kind: "mock", name: "Mock", live: false, available: false }}
      />,
    );
    expect(screen.getByText("Mock")).toBeTruthy();
  });

  it("has a title attribute on the source chip showing the source name", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.2"
        sourceStatus={{ kind: "lmu", name: "LMU", live: true, available: true }}
      />,
    );
    const chip = screen.getByText("LMU conectado");
    expect(chip.getAttribute("title")).toBe("LMU");
  });

  it("has an aria-label on the source chip describing the telemetry source", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.2"
        sourceStatus={{ kind: "lmu", name: "LMU", live: true, available: true }}
      />,
    );
    const chip = screen.getByText("LMU conectado");
    expect(chip.getAttribute("aria-label")).toBe("Fuente de telemetría: LMU conectado");
  });

  it("shows 'Fuente pendiente' as title when sourceStatus is null", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.2"
        sourceStatus={null}
      />,
    );
    const chip = screen.getByText("Fuente pendiente");
    expect(chip.getAttribute("title")).toBe("Fuente pendiente");
  });
});

describe("Topbar user display", () => {
  it("does not show hardcoded user name 'Isaac Albala'", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.2"
        sourceStatus={null}
      />,
    );
    expect(screen.queryByText(/Isaac Albala/i)).toBeNull();
  });
});

describe("Topbar v5.2 navigation", () => {
  it("renders Launcher in the top navigation", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.3"
        sourceStatus={null}
      />,
    );
    expect(screen.getByText("Launcher")).toBeTruthy();
  });

  it("navigates to launcher when clicking Launcher", () => {
    const onNavigate = vi.fn();
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={onNavigate}
        version="v0.1.0.3"
        sourceStatus={null}
      />,
    );
    fireEvent.click(screen.getByText("Launcher"));
    expect(onNavigate).toHaveBeenCalledWith("launcher");
  });

  it("uses Ajustes (not Setup) as the settings section label", () => {
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.3"
        sourceStatus={null}
      />,
    );
    expect(screen.getByText("Ajustes")).toBeTruthy();
    expect(screen.queryByText("Setup")).toBeNull();
  });
});

describe("Topbar gated navigation", () => {
  it("shows public sections as enabled for free user", () => {
    mockUseAccess.mockReturnValue({
      planLabel: "free",
      planStatus: "free",
      roles: [],
      isBlocked: false,
      isUnconfigured: false,
    });
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.3"
        sourceStatus={null}
      />,
    );
    const dashboard = screen.getByTestId("topbar-nav-dashboard");
    expect(dashboard.getAttribute("aria-disabled")).toBeNull();
    expect(dashboard.className).not.toContain("cursor-not-allowed");
  });

  it("shows premium sections as disabled for free user", () => {
    mockUseAccess.mockReturnValue({
      planLabel: "free",
      planStatus: "free",
      roles: [],
      isBlocked: false,
      isUnconfigured: false,
    });
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.3"
        sourceStatus={null}
      />,
    );
    const engineer = screen.getByTestId("topbar-nav-engineer");
    expect(engineer.getAttribute("aria-disabled")).toBe("true");
    expect(engineer.className).toContain("cursor-not-allowed");
    expect(engineer.className).toContain("opacity-40");
  });

  it("shows premium sections as enabled for tester user", () => {
    mockUseAccess.mockReturnValue({
      planLabel: "free",
      planStatus: "free",
      roles: ["tester"],
      isBlocked: false,
      isUnconfigured: false,
    });
    render(
      <Topbar
        activeSection="dashboard"
        onNavigate={vi.fn()}
        version="v0.1.0.3"
        sourceStatus={null}
      />,
    );
    const engineer = screen.getByTestId("topbar-nav-engineer");
    expect(engineer.getAttribute("aria-disabled")).toBeNull();
    expect(engineer.className).not.toContain("cursor-not-allowed");
  });
});
