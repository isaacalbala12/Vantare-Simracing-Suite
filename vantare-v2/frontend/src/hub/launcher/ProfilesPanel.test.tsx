import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { ProfilesPanel } from "./ProfilesPanel";
import { LauncherStoreProvider } from "./launcher-store";

const listeners = new Map<string, Array<(event: { data: unknown }) => void>>();

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, cb: (event: { data: unknown }) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), cb]);
      return () => {};
    }),
    Emit: vi.fn(),
  },
}));

vi.mock("./ProfileCard", () => ({
  ProfileCard: ({ profile }: { profile: { id: string; name: string } }) => (
    <article data-testid={`mock-profile-${profile.id}`}>{profile.name}</article>
  ),
}));

afterEach(() => {
  cleanup();
  listeners.clear();
  vi.clearAllMocks();
});

function dispatchSnapshot() {
  act(() => {
    for (const listener of listeners.get("launcher:snapshot") ?? []) {
      listener({
        data: {
          revision: 1,
          apps: [],
          vantareProfiles: [{ id: "creator", name: "Creator", steps: [] }],
          userProfiles: [{ id: "custom", name: "Custom", steps: [] }],
          activeChains: [],
          discovery: { scanning: false, lastScanAt: null, error: null },
        },
      });
    }
  });
}

describe("ProfilesPanel", () => {
  it("separates Vantare and user profile sections from one snapshot", () => {
    render(
      <LauncherStoreProvider>
        <ProfilesPanel />
      </LauncherStoreProvider>,
    );
    dispatchSnapshot();
    expect(screen.getByTestId("profiles-section-vantare")).toBeTruthy();
    expect(screen.getByTestId("profiles-section-user")).toBeTruthy();
    expect(screen.getByTestId("mock-profile-creator")).toBeTruthy();
    expect(screen.getByTestId("mock-profile-custom")).toBeTruthy();
    expect(Events.Emit).toHaveBeenCalledWith("launcher:snapshot:get");
  });
});
