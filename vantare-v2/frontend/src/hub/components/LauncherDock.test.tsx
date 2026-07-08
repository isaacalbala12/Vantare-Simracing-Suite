import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { LauncherDock } from "./LauncherDock";

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

describe("LauncherDock", () => {
  it("requests the profile list on mount", () => {
    render(<LauncherDock onNavigate={vi.fn()} />);
    expect(Events.Emit).toHaveBeenCalledWith("launcher:profiles:list");
  });

  it("renders one button per profile received via event", () => {
    render(<LauncherDock onNavigate={vi.fn()} />);
    dispatch("launcher:profiles:updated", {
      profiles: [
        { id: "creator", name: "Creador de Contenido", steps: [] },
        { id: "pro", name: "Pro", steps: [] },
      ],
    });
    expect(screen.getByTestId("dock-profile-creator")).toBeTruthy();
    expect(screen.getByTestId("dock-profile-pro")).toBeTruthy();
  });

  it("emits launcher:profile:launch when a profile button is clicked", () => {
    const onNavigate = vi.fn();
    render(<LauncherDock onNavigate={onNavigate} />);
    dispatch("launcher:profiles:updated", {
      profiles: [{ id: "creator", name: "Creador de Contenido", steps: [] }],
    });
    fireEvent.click(screen.getByTestId("dock-profile-creator"));
    expect(Events.Emit).toHaveBeenCalledWith("launcher:profile:launch", {
      id: "creator",
    });
  });

  it("navigates to the launcher page from the list button", () => {
    const onNavigate = vi.fn();
    render(<LauncherDock onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /ir a launcher/i }));
    expect(onNavigate).toHaveBeenCalledWith("launcher");
  });
});
