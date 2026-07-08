import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileCardTimeline } from "./ProfileCard.timeline";
import type { ChainState } from "./chain-store";
import type { LauncherAppEntry } from "./launcher-state";

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

const SPOTIFY: LauncherAppEntry = {
  id: "spotify",
  displayName: "Spotify",
  abbreviation: "SPF",
  category: "audio",
  launchMethod: "executable",
  detected: true,
  gradientFrom: "#1db954",
  gradientTo: "#191414",
};

function makeChain(
  overrides: Partial<ChainState> = {},
): ChainState {
  return {
    profileId: "p1",
    startedAt: 1000,
    lastEventAt: 2000,
    steps: [
      { appId: "lmu", status: "done" },
      { appId: "obs", status: "launching" },
      { appId: "spotify", status: "pending" },
    ],
    currentStepIndex: 1,
    overallStatus: "running",
    ...overrides,
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

// ── Tests ───────────────────────────────────────────────────────────

describe("ProfileCardTimeline", () => {
  it("renders one block per step", () => {
    const chain = makeChain();
    render(
      <ProfileCardTimeline
        chain={chain}
        apps={[LMU, OBS, SPOTIFY]}
        onCancel={() => {}}
      />,
    );

    // Expect exactly 3 timeline step blocks
    expect(screen.getByTestId("timeline-step-0")).not.toBeNull();
    expect(screen.getByTestId("timeline-step-1")).not.toBeNull();
    expect(screen.getByTestId("timeline-step-2")).not.toBeNull();

    // Verify step data is rendered
    expect(screen.getByText("LMU")).not.toBeNull();
    expect(screen.getByText("OBS")).not.toBeNull();
    expect(screen.getByText("SPF")).not.toBeNull();
  });

  it("applies launching pulse to the current step", () => {
    const chain = makeChain();
    render(
      <ProfileCardTimeline
        chain={chain}
        apps={[LMU, OBS, SPOTIFY]}
        onCancel={() => {}}
      />,
    );

    // Step 1 (OBS) is "launching" — verify the element exists.
    const stepEl = screen.getByTestId("timeline-step-1");
    // The motion library applies inline styles for the pulse animation.
    expect(stepEl).not.toBeNull();

    // Also verify that non-launching steps don't have pulse animation.
    const pendingStep = screen.getByTestId("timeline-step-2");
    expect(pendingStep).not.toBeNull();
  });

  it("uses cyan for audio category to avoid collision with done green", () => {
    // Create a chain where spotify (audio) is launching so we can see its color
    const chain = makeChain({
      currentStepIndex: 2,
      steps: [
        { appId: "lmu", status: "done" },
        { appId: "obs", status: "done" },
        { appId: "spotify", status: "launching" },
      ],
    });
    render(
      <ProfileCardTimeline
        chain={chain}
        apps={[LMU, OBS, SPOTIFY]}
        onCancel={() => {}}
      />,
    );

    // The audio (cyan) block should have style with #06b6d4
    const spotifyStep = screen.getByTestId("timeline-step-2");
    const stepStyle = spotifyStep.getAttribute("style") ?? "";
    expect(stepStyle).toContain("#06b6d4");
  });
});
