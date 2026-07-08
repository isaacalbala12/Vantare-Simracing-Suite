import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileCard } from "./ProfileCard";
import type { LauncherAppEntry, LaunchProfile } from "./launcher-state";
import type { ChainState } from "./chain-store";

// ── Mocks ───────────────────────────────────────────────────────────

const mockUseChainState = vi.fn();
const mockUseLastResult = vi.fn();

vi.mock("./chain-store", () => ({
  useChainState: (id: string) => mockUseChainState(id),
  useLastResult: (id: string) => mockUseLastResult(id),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(() => vi.fn()),
    Emit: vi.fn(),
  },
}));

// ── Fixtures ────────────────────────────────────────────────────────

const LMU: LauncherAppEntry = {
  id: "lmu",
  displayName: "Le Mans Ultimate",
  abbreviation: "LMU",
  category: "simulator",
  launchMethod: "steam-uri",
  steamAppId: 2399420,
  detected: true,
  gradientFrom: "#ff3b3b",
  gradientTo: "#9a0606",
};

const OBS: LauncherAppEntry = {
  id: "obs",
  displayName: "OBS Studio",
  abbreviation: "OBS",
  category: "streaming",
  launchMethod: "executable",
  detected: true,
  gradientFrom: "#302e31",
  gradientTo: "#111",
};

const fullProfile: LaunchProfile = {
  id: "creator",
  name: "Creador de Contenido",
  description: "Perfil para crear contenido de simracing",
  steps: [
    { appId: "lmu", delay: 0 },
    { appId: "obs", delay: 2 },
  ],
  isFavorite: true,
  launchCount: 5,
  lastLaunchedAt: new Date(Date.now() - 60000 * 10).toISOString(),
  avgChainDurationMs: 8000,
};

// ── Setup ───────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────

describe("ProfileCard", () => {
  it("renders full card with name, description, time, apps, lastResult badge", () => {
    mockUseLastResult.mockReturnValue("success");

    render(<ProfileCard profile={fullProfile} apps={[LMU, OBS]} />);

    // Name: element exists and contains the display name
    const nameEl = screen.getByTestId("profile-name-creator");
    expect(nameEl).not.toBeNull();
    expect(nameEl.textContent).toContain("Creador de Contenido");

    // Description
    const descEl = screen.getByTestId("profile-description-creator");
    expect(descEl).not.toBeNull();
    expect(descEl.textContent).toContain("Perfil para crear contenido de simracing");

    // Time (avgChainDurationMs=8000 → ≈8s)
    const timeEl = screen.getByTestId("profile-time-creator");
    expect(timeEl).not.toBeNull();
    expect(timeEl.textContent).toContain("≈8s");

    // Steps rendered
    expect(screen.getByTestId("profile-step-row-0")).not.toBeNull();
    expect(screen.getByTestId("profile-step-row-1")).not.toBeNull();

    // LastResult badge present and green (success)
    const lastResultBadge = screen.getByTestId("profile-lastresult-creator");
    expect(lastResultBadge).not.toBeNull();
    expect(lastResultBadge.className).toContain("bg-emerald-500");

    // Favorite badge present
    const favBadge = screen.getByTestId("profile-favorite-badge-creator");
    expect(favBadge).not.toBeNull();
    expect(favBadge.textContent).toContain("★");

    // Launch button present
    expect(screen.getByTestId("profile-launch-creator")).not.toBeNull();

    // Last launched telemetry present
    const lastEl = screen.getByTestId("profile-last-creator");
    expect(lastEl).not.toBeNull();
    expect(lastEl.textContent).toContain("Último:");
  });

  it("renders early return to ProfileCardTimeline when chain active", () => {
    const mockChain: ChainState = {
      profileId: "creator",
      startedAt: Date.now() - 1000,
      lastEventAt: Date.now(),
      steps: [
        { appId: "lmu", status: "done" },
        { appId: "obs", status: "launching" },
      ],
      currentStepIndex: 1,
      overallStatus: "running",
    };
    mockUseChainState.mockReturnValue(mockChain);

    render(<ProfileCard profile={fullProfile} apps={[LMU, OBS]} />);

    // The early return renders ProfileCardTimeline which has data-testid="profile-timeline"
    const timelineEl = screen.getByTestId("profile-timeline");
    expect(timelineEl).not.toBeNull();

    // When chain is active, the normal card elements should NOT be present
    expect(screen.queryByTestId("profile-name-creator")).toBeNull();
  });

  it("count appears in tooltip on hover, not on the face", () => {
    render(<ProfileCard profile={fullProfile} apps={[LMU, OBS]} />);

    const countSpan = screen.getByTestId("profile-count-creator");
    expect(countSpan).not.toBeNull();

    // The descriptive sentence "Lanzado N veces" is in the title attribute,
    // NOT in the visible text content.
    expect(countSpan.getAttribute("title")).toBe("Lanzado 5 veces");

    // The visible text only has the compact count marker ("5×"), not the
    // full descriptive text.
    expect(countSpan.textContent).not.toContain("Lanzado");
  });

  it("renders favorite badge in header when isFavorite", () => {
    render(<ProfileCard profile={fullProfile} apps={[LMU, OBS]} />);

    const badge = screen.getByTestId("profile-favorite-badge-creator");
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain("★");
  });
});
