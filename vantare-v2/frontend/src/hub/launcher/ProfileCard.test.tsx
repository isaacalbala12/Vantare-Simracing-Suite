import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { ProfileCard } from "./ProfileCard";
import type { LauncherAppEntry, LaunchProfile } from "./launcher-state";

const emitCalls: { name: string; data: unknown }[] = [];

afterEach(() => {
  cleanup();
  emitCalls.length = 0;
  vi.clearAllMocks();
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(() => vi.fn()),
    Emit: vi.fn((name: string, data: unknown) => {
      emitCalls.push({ name, data });
    }),
  },
}));

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

const profile: LaunchProfile = {
  id: "creator",
  name: "Creador de Contenido",
  steps: [{ appId: "lmu", delay: 0 }],
};

describe("ProfileCard", () => {
  it("emits launcher:profile:launch when the Iniciar button is clicked", () => {
    render(<ProfileCard profile={profile} apps={[LMU]} />);
    fireEvent.click(screen.getByTestId("profile-launch-creator"));
    expect(Events.Emit).toHaveBeenCalledWith("launcher:profile:launch", {
      id: "creator",
    });
  });

  it("emits launcher:profile:delete when Eliminar is clicked", () => {
    render(<ProfileCard profile={profile} apps={[LMU]} />);
    fireEvent.click(screen.getByTestId("profile-delete-creator"));
    expect(Events.Emit).toHaveBeenCalledWith("launcher:profile:delete", {
      id: "creator",
    });
  });

  it("emits launcher:profile:duplicate with a unique id and suffixed name", () => {
    render(<ProfileCard profile={profile} apps={[LMU]} />);
    fireEvent.click(screen.getByTestId("profile-duplicate-creator"));
    const dup = emitCalls.find((c) => c.name === "launcher:profile:duplicate");
    expect(dup).toBeDefined();
    const payload = dup!.data as { id: string; newId: string; newName: string };
    // The new id must be different from the source so the backend can persist
    // the copy without overwriting the original.
    expect(payload.newId).not.toBe("creator");
    expect(payload.newId.length).toBeGreaterThan(0);
    // And the name must be a localized copy.
    expect(payload.newName).toMatch(/copia/i);
  });

  it("does not emit launcher:profile:save for duplicate (avoids id collision on backend)", () => {
    render(<ProfileCard profile={profile} apps={[LMU]} />);
    fireEvent.click(screen.getByTestId("profile-duplicate-creator"));
    const saveCall = emitCalls.find((c) => c.name === "launcher:profile:save");
    expect(saveCall).toBeUndefined();
  });

  it("disables the Iniciar button when the profile has no resolvable steps", () => {
    const broken: LaunchProfile = {
      id: "broken",
      name: "Broken",
      steps: [{ appId: "missing-app", delay: 0 }],
    };
    render(<ProfileCard profile={broken} apps={[LMU]} />);
    const btn = screen.getByTestId("profile-launch-broken") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("disables the Iniciar button when the profile has zero steps", () => {
    const empty: LaunchProfile = { id: "empty", name: "Empty", steps: [] };
    render(<ProfileCard profile={empty} apps={[LMU]} />);
    const btn = screen.getByTestId("profile-launch-empty") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables the Iniciar button when all steps are resolvable", () => {
    render(<ProfileCard profile={profile} apps={[LMU]} />);
    const btn = screen.getByTestId("profile-launch-creator") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("renders favorite badge when profile.isFavorite is true", () => {
    const favProfile: LaunchProfile = {
      id: "creator",
      name: "Creator",
      steps: [],
      isFavorite: true,
    };
    render(<ProfileCard profile={favProfile} apps={[]} />);
    expect(
      screen.queryByTestId("profile-favorite-badge-creator"),
    ).not.toBeNull();
  });
});
