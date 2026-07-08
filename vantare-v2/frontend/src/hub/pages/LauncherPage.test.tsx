import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { ChainRunnerProvider } from "../launcher/chain-store";
import { LauncherPage } from "./LauncherPage";

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

function renderPage() {
  return render(
    <ChainRunnerProvider>
      <LauncherPage />
    </ChainRunnerProvider>,
  );
}

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of listeners.get(name) ?? []) {
      handler({ data });
    }
  });
}

describe("LauncherPage", () => {
  it("renders the launcher heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Launcher" })).toBeTruthy();
  });

  it("renders the apps panel and profiles panel (no placeholders)", () => {
    renderPage();
    expect(screen.getByTestId("apps-panel")).toBeTruthy();
    expect(screen.getByTestId("profiles-panel")).toBeTruthy();
    expect(screen.queryByText(/próximamente/i)).toBeNull();
  });

  it("discovers apps and lists detected apps from the backend", () => {
    renderPage();
    expect(Events.Emit).toHaveBeenCalledWith("launcher:apps:discover");
    dispatch("launcher:apps:detected", {
      apps: [
        {
          id: "lmu",
          displayName: "Le Mans Ultimate",
          abbreviation: "LMU",
          category: "simulator",
          launchMethod: "steam-uri",
          steamAppId: 2399420,
          detected: true,
          gradientFrom: "#ff3b3b",
          gradientTo: "#9a0606",
        },
      ],
    });
    expect(screen.getByTestId("app-row-lmu")).toBeTruthy();
  });

  it("lists profiles from the backend", () => {
    renderPage();
    expect(Events.Emit).toHaveBeenCalledWith("launcher:profiles:list");
    dispatch("launcher:profiles:updated", {
      profiles: [
        {
          id: "creator",
          name: "Creador de Contenido",
          description: "LMU + OBS + Spotify",
          steps: [{ appId: "lmu", delay: 0 }],
        },
      ],
    });
    expect(screen.getByTestId("profile-card-creator")).toBeTruthy();
    expect(
      screen.getByTestId("profile-launch-creator"),
    ).toBeTruthy();
  });
});
