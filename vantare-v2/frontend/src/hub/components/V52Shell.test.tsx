import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V52Shell } from "./V52Shell";

const listeners = new Map<string, ((event: { data: unknown }) => void)[]>();

afterEach(() => {
  cleanup();
  listeners.clear();
  vi.clearAllMocks();
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, cb: (event: { data: unknown }) => void) => {
      const existing = listeners.get(name) ?? [];
      existing.push(cb);
      listeners.set(name, existing);
      return vi.fn();
    }),
    Off: vi.fn(),
    Emit: vi.fn(),
  },
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of listeners.get(name) ?? []) {
      handler({ data });
    }
  });
}

vi.mock("../../lib/access", () => ({
  useAccess: () => ({
    planLabel: "free",
    planStatus: "free",
    roles: [],
    isBlocked: false,
    isUnconfigured: false,
  }),
}));

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

  it("keeps the quick access dock with dynamic profile buttons", () => {
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
    // Botón de navegación a la página Launcher
    expect(screen.getByLabelText("Ir a Launcher")).toBeTruthy();
    // El dock pide perfiles y renderiza uno por perfil (auto-suscripción)
    dispatch("launcher:profiles:updated", {
      profiles: [{ id: "creator", name: "Creador de Contenido", steps: [] }],
    });
    expect(screen.getByTestId("dock-profile-creator")).toBeTruthy();
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

});
