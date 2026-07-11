import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { ChainRunnerProvider } from "../launcher/chain-store";
import { LauncherStoreProvider } from "../launcher/launcher-store";
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
      <LauncherStoreProvider>
        <LauncherPage />
      </LauncherStoreProvider>
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

function dispatchSnapshot() {
  dispatch("launcher:snapshot", {
    revision: 1,
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
        availability: {
          catalogued: true,
          found: true,
          installed: true,
          launchable: true,
        },
      },
    ],
    vantareProfiles: [
      {
        id: "creator",
        name: "Creador de Contenido",
        description: "LMU + OBS + Spotify",
        steps: [{ appId: "lmu", delay: 0 }],
      },
    ],
    userProfiles: [],
    activeChains: [],
    discovery: { scanning: false, lastScanAt: null, error: null },
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

  it("requests one shared snapshot and lists apps from it", () => {
    renderPage();
    expect(Events.Emit).toHaveBeenCalledTimes(1);
    expect(Events.Emit).toHaveBeenCalledWith("launcher:snapshot:get");
    dispatchSnapshot();
    expect(screen.getByTestId("app-row-lmu")).toBeTruthy();
  });

  it("lists profiles from the shared snapshot", () => {
    renderPage();
    dispatchSnapshot();
    expect(screen.getByTestId("profile-card-creator")).toBeTruthy();
    expect(
      screen.getByTestId("profile-launch-creator"),
    ).toBeTruthy();
  });
});
