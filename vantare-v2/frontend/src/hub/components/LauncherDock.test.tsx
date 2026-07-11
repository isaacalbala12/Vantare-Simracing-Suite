import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { LauncherDock } from "./LauncherDock";
import * as chainStore from "../launcher/chain-store";
import { LauncherStoreProvider } from "../launcher/launcher-store";

// ---------------------------------------------------------------------------
// Mock Wails runtime events
// ---------------------------------------------------------------------------

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

function renderDock() {
  return render(
    <LauncherStoreProvider>
      <LauncherDock onNavigate={vi.fn()} />
    </LauncherStoreProvider>,
  );
}

function dispatchProfiles(profiles: Array<Record<string, unknown>>) {
  dispatch("launcher:snapshot", {
    revision: 1,
    apps: [],
    vantareProfiles: profiles,
    userProfiles: [],
    activeChains: [],
    discovery: { scanning: false, lastScanAt: null, error: null },
  });
}

// ---------------------------------------------------------------------------
// Mock chain-store hooks – each test sets its own return values
// ---------------------------------------------------------------------------

vi.mock("../launcher/chain-store", () => ({
  useChainState: vi.fn(),
  useLastResult: vi.fn(),
}));

const mockUseChainState = vi.mocked(chainStore.useChainState);
const mockUseLastResult = vi.mocked(chainStore.useLastResult);

// Helper: profiles fixture
const CREATOR_PROFILE = {
  id: "creator",
  name: "Creador de Contenido",
  steps: [],
  isFavorite: false,
  launchCount: 3,
  lastLaunchedAt: new Date(Date.now() - 7200000).toISOString(), // 2h ago
};

describe("LauncherDock", () => {
  it("requests the profile list on mount", () => {
    renderDock();
    expect(Events.Emit).toHaveBeenCalledWith("launcher:snapshot:get");
  });

  it("renders one button per profile received via event", () => {
    renderDock();
    dispatchProfiles([
        { id: "creator", name: "Creador de Contenido", steps: [] },
        { id: "pro", name: "Pro", steps: [] },
    ]);
    expect(screen.getByTestId("dock-profile-creator")).toBeTruthy();
    expect(screen.getByTestId("dock-profile-pro")).toBeTruthy();
  });

  it("emits launcher:profile:launch when a profile button is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <LauncherStoreProvider>
        <LauncherDock onNavigate={onNavigate} />
      </LauncherStoreProvider>,
    );
    dispatchProfiles([{ id: "creator", name: "Creador de Contenido", steps: [] }]);
    fireEvent.click(screen.getByTestId("dock-profile-creator"));
    expect(Events.Emit).toHaveBeenCalledWith("launcher:profile:launch", {
      id: "creator",
    });
  });

  it("navigates to the launcher page from the list button", () => {
    const onNavigate = vi.fn();
    render(
      <LauncherStoreProvider>
        <LauncherDock onNavigate={onNavigate} />
      </LauncherStoreProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /ir a launcher/i }));
    expect(onNavigate).toHaveBeenCalledWith("launcher");
  });

  // ----- New tests for Cut 6 -----

  it("renders lastResult badge when no chain active but profile has last result", () => {
    mockUseChainState.mockReturnValue(undefined); // no active chain
    mockUseLastResult.mockReturnValue("success");

    renderDock();
    dispatchProfiles([CREATOR_PROFILE]);

    // Should have the success border badge element
    expect(
      screen.getByTestId("dock-lastresult-success-creator"),
    ).toBeTruthy();
  });

  it("count appears in tooltip on hover", () => {
    mockUseChainState.mockReturnValue(undefined);
    mockUseLastResult.mockReturnValue(undefined);

    renderDock();
    dispatchProfiles([CREATOR_PROFILE]);

    const btn = screen.getByTestId("dock-profile-creator") as HTMLButtonElement;
    // The title attribute should include the count
    expect(btn.title).toBeTruthy();
    expect(btn.title).toContain("3 veces");
  });

  it("renders SVG ring during active chain", () => {
    // Simulate an active chain
    mockUseChainState.mockReturnValue({
      profileId: "creator",
      startedAt: 1000,
      lastEventAt: 2000,
      steps: [
        { appId: "lmu", status: "launching" },
        { appId: "obs", status: "pending" },
      ],
      currentStepIndex: 0,
      overallStatus: "running",
    });
    mockUseLastResult.mockReturnValue(undefined);

    renderDock();
    dispatchProfiles([CREATOR_PROFILE]);

    // Should render the SVG ring element
    expect(screen.getByTestId("dock-ring-creator")).toBeTruthy();
    // And the progress arc element
    expect(
      screen.getByTestId("dock-ring-progress-creator"),
    ).toBeTruthy();
  });

  it("favorites first, alphabetical after", () => {
    mockUseChainState.mockReturnValue(undefined);
    mockUseLastResult.mockReturnValue(undefined);

    renderDock();
    dispatchProfiles([
        { id: "zulu", name: "Zulu", steps: [], isFavorite: false },
        { id: "alpha", name: "Alpha", steps: [], isFavorite: true },
        { id: "beta", name: "Beta", steps: [], isFavorite: false },
    ]);

    const buttons = screen.getAllByTestId(/^dock-profile-/);
    // alpha (favorite) first, then beta, then zulu (alphabetical among non-favorites)
    expect(buttons[0].getAttribute("data-testid")).toBe("dock-profile-alpha");
    expect(buttons[1].getAttribute("data-testid")).toBe("dock-profile-beta");
    expect(buttons[2].getAttribute("data-testid")).toBe("dock-profile-zulu");
  });
});
