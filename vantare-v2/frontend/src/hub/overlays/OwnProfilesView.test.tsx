import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { OwnProfilesView } from "./OwnProfilesView";
import type { OverlayStatus, ProfileEntry } from "../state/overlay-workbench";
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

const defaultProps = {
  profiles,
  overlayStatus: null as OverlayStatus | null,
  activeProfileId: null as string | null,
  onStartOverlay: vi.fn(),
  onStopOverlay: vi.fn(),
  onOpenProfile: vi.fn(),
  onCreateProfile: vi.fn(),
  onSetActiveProfile: vi.fn(),
  onOpenActiveOverlay: vi.fn(),
  onBack: vi.fn(),
};

describe("OwnProfilesView", () => {
  it("shows own profiles as cards with a real preview", () => {
    render(<OwnProfilesView {...defaultProps} />);

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

    render(<OwnProfilesView {...defaultProps} profiles={withoutProfile} />);

    expect(screen.getByText("Sin Preview")).toBeTruthy();
    expect(screen.getByText("Preview no disponible")).toBeTruthy();
    expect(screen.queryByTestId("profile-preview")).toBeNull();
  });

  it("shows preview no disponible when a profile entry has malformed widgets", () => {
    const malformedProfile: ProfileEntry[] = [
      {
        id: "app-settings",
        file: "app-settings.json",
        name: "Settings",
        displayMode: "racing",
        widgets: 0,
        profile: {
          id: "app-settings",
          displayMode: "racing",
          monitorIndex: 0,
          widgets: null,
        } as unknown as ProfileConfig,
      },
    ];

    render(<OwnProfilesView {...defaultProps} profiles={malformedProfile} />);

    expect(screen.getByText("Preview no disponible")).toBeTruthy();
    expect(screen.queryByTestId("profile-preview")).toBeNull();
  });

  it("opens a profile and exposes create/back actions", () => {
    const onOpenProfile = vi.fn();
    const onCreateProfile = vi.fn();
    const onBack = vi.fn();

    render(
      <OwnProfilesView
        {...defaultProps}
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

  it("shows Activar button for inactive profiles and calls onSetActiveProfile", () => {
    const onSetActiveProfile = vi.fn();

    render(<OwnProfilesView {...defaultProps} onSetActiveProfile={onSetActiveProfile} />);

    const activateBtn = screen.getByRole("button", { name: /Activar Default Racing/i });
    expect(activateBtn).toBeTruthy();
    fireEvent.click(activateBtn);

    expect(onSetActiveProfile).toHaveBeenCalledWith(profiles[0]);
  });

  it("shows Activo badge and Abrir overlay for the active profile", () => {
    render(<OwnProfilesView {...defaultProps} activeProfileId="default-racing" />);

    expect(screen.getByText("Activo")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir overlay para Default Racing/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Activar/i })).toBeNull();
  });

  it("starts the active profile overlay from a profile card", () => {
    const onStartOverlay = vi.fn();

    render(
      <OwnProfilesView
        {...defaultProps}
        activeProfileId="default-racing"
        onStartOverlay={onStartOverlay}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Abrir overlay para Default Racing/i }));

    expect(onStartOverlay).toHaveBeenCalledWith(profiles[0]);
  });

  it("shows global Abrir overlay button in header when active profile exists", () => {
    const onOpenActiveOverlay = vi.fn();

    render(
      <OwnProfilesView
        {...defaultProps}
        activeProfileId="default-racing"
        onOpenActiveOverlay={onOpenActiveOverlay}
      />,
    );

    const headerBtn = screen.getByRole("button", { name: "Abrir overlay" });
    fireEvent.click(headerBtn);

    expect(onOpenActiveOverlay).toHaveBeenCalledTimes(1);
  });

  it("stops the running active profile overlay from a profile card", () => {
    const onStopOverlay = vi.fn();
    const overlayStatus: OverlayStatus = {
      running: true,
      profileId: "default-racing",
      mode: "racing",
    };

    render(
      <OwnProfilesView
        {...defaultProps}
        activeProfileId="default-racing"
        overlayStatus={overlayStatus}
        onStopOverlay={onStopOverlay}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Detener overlay de Default Racing/i }));

    expect(onStopOverlay).toHaveBeenCalledTimes(1);
  });
});
