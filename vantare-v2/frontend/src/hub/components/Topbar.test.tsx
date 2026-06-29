import { render, screen, cleanup } from "@testing-library/react";
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

describe("Topbar source status", () => {
  it("shows 'Fuente pendiente' when no source status is provided", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={vi.fn()}
        version="v0.3.9.1"
        sourceStatus={null}
      />,
    );
    expect(screen.getByText("Fuente pendiente")).toBeTruthy();
  });

  it("shows 'LMU conectado' when live source is available", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={vi.fn()}
        version="v0.3.9.1"
        sourceStatus={{ kind: "lmu", name: "Le Mans Ultimate", live: true, available: true }}
      />,
    );
    expect(screen.getByText("LMU conectado")).toBeTruthy();
  });

  it("shows 'Esperando LMU' when live mode is active but unavailable", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={vi.fn()}
        version="v0.3.9.1"
        sourceStatus={{ kind: "lmu", name: "Le Mans Ultimate", live: true, available: false }}
      />,
    );
    expect(screen.getByText("Esperando LMU")).toBeTruthy();
  });

  it("shows 'Mock' when the active source is mock", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={vi.fn()}
        version="v0.3.9.1"
        sourceStatus={{ kind: "mock", name: "Mock telemetry", live: false, available: true }}
      />,
    );
    expect(screen.getByText("Mock")).toBeTruthy();
  });

  it("has a title attribute on the source chip showing the source name", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={vi.fn()}
        version="v0.3.9.1"
        sourceStatus={{ kind: "lmu", name: "Le Mans Ultimate", live: true, available: true }}
      />,
    );
    const chip = screen.getByText("LMU conectado");
    expect(chip.getAttribute("title")).toBe("Le Mans Ultimate");
  });

  it("has an aria-label on the source chip describing the telemetry source", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={vi.fn()}
        version="v0.3.9.1"
        sourceStatus={{ kind: "mock", name: "Mock telemetry", live: false, available: true }}
      />,
    );
    const chip = screen.getByText("Mock");
    expect(chip.getAttribute("aria-label")).toBe("Fuente de telemetría: Mock");
  });

  it("shows 'Fuente pendiente' as title when sourceStatus is null", () => {
    render(
      <Topbar
        activeSection="profiles"
        onNavigate={vi.fn()}
        version="v0.3.9.1"
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
