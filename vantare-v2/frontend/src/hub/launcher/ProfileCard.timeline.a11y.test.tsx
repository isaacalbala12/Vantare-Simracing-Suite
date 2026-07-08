import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileCardTimeline } from "./ProfileCard.timeline";
import type { ChainState } from "./chain-store";

// ── Fixture ─────────────────────────────────────────────────────────

const mockChain: ChainState = {
  profileId: "p1",
  startedAt: 1000,
  lastEventAt: 2000,
  steps: [{ appId: "lmu", status: "launching" }],
  currentStepIndex: 0,
  overallStatus: "running",
};

// ── Cleanup ─────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
});

// ── Tests ───────────────────────────────────────────────────────────

describe("ProfileCardTimeline a11y", () => {
  it("has role=status and aria-live=polite on the timeline container", () => {
    render(
      <ProfileCardTimeline chain={mockChain} apps={[]} onCancel={() => {}} />,
    );

    const timeline = screen.getByTestId("profile-timeline");
    expect(timeline.getAttribute("role")).toBe("status");
    expect(timeline.getAttribute("aria-live")).toBe("polite");
  });

  it("cancel button has aria-label", () => {
    render(
      <ProfileCardTimeline chain={mockChain} apps={[]} onCancel={() => {}} />,
    );

    const cancelButton = screen.getByTestId("profile-cancel");
    expect(cancelButton.getAttribute("aria-label")).toBeTruthy();
  });
});
