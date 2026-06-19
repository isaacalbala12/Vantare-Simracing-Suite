import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { OwnProfilesView } from "./OwnProfilesView";
import type { ProfileEntry } from "../state/overlay-workbench";
import type { ProfileConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
});

const activeProfile: ProfileConfig = {
  id: "default-racing",
  name: "Default Racing",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
  ],
};

const profiles: ProfileEntry[] = [
  {
    id: "default-racing",
    file: "example-racing.json",
    name: "Default Racing",
    displayMode: "racing",
    widgets: 1,
    profile: activeProfile,
  },
];

describe("OwnProfilesView", () => {
  it("shows own profiles as cards with a real preview", () => {
    render(
      <OwnProfilesView
        profiles={profiles}
        onOpenProfile={vi.fn()}
        onCreateProfile={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByText("Default Racing")).toBeTruthy();
    expect(screen.getByTestId("profile-preview")).toBeTruthy();
    expect(screen.queryByText("Perfiles específicos")).toBeNull();
  });

  it("shows preview no disponible when profile config is missing", () => {
    const withoutProfile: ProfileEntry[] = [
      {
        id: "no-preview",
        file: "no-preview.json",
        name: "Sin Preview",
        displayMode: "racing",
        widgets: 2,
      },
    ];

    render(
      <OwnProfilesView
        profiles={withoutProfile}
        onOpenProfile={vi.fn()}
        onCreateProfile={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Sin Preview")).toBeTruthy();
    expect(screen.getByText("Preview no disponible")).toBeTruthy();
    expect(screen.queryByTestId("profile-preview")).toBeNull();
  });

  it("opens a profile and exposes create/back actions", () => {
    const onOpenProfile = vi.fn();
    const onCreateProfile = vi.fn();
    const onBack = vi.fn();

    render(
      <OwnProfilesView
        profiles={profiles}
        onOpenProfile={onOpenProfile}
        onCreateProfile={onCreateProfile}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Editar Default Racing/i }));
    fireEvent.click(screen.getByRole("button", { name: /Nuevo perfil/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));

    expect(onOpenProfile).toHaveBeenCalledWith(profiles[0]);
    expect(onCreateProfile).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
