import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ProfilesOrbitPage } from "./ProfilesOrbitPage";
import type { ProfileEntry } from "../state/overlay-workbench";

// El mini-lienzo real monta el sistema de widgets V3 y un `ResizeObserver`: en
// esta prueba interesa la piel Orbit, no el render de los widgets.
vi.mock("../home-orbit/HomeMiniStage", () => ({
  HomeMiniStage: ({ profile }: { profile: ProfileEntry | null }) => (
    <div data-testid={`mini-stage-${profile?.id ?? "none"}`} />
  ),
}));

const profiles: ProfileEntry[] = [
  { id: "p1", file: "p1.json", name: "Endurance", displayMode: "general", widgets: 4 },
  { id: "p2", file: "p2.json", name: "Sprint", displayMode: "general", widgets: 2 },
];

function renderPage(overrides: Partial<Parameters<typeof ProfilesOrbitPage>[0]> = {}) {
  const props = {
    profiles,
    overlayStatus: null,
    activeProfileId: null as string | null,
    onStartOverlay: vi.fn(),
    onStopOverlay: vi.fn(),
    onOpenProfile: vi.fn(),
    onCreateProfile: vi.fn(),
    onSetActiveProfile: vi.fn(),
    onOpenActiveOverlay: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <ProfilesOrbitPage {...props} />
    </I18nProvider>,
  );
  return props;
}

describe("ProfilesOrbitPage", () => {
  beforeEach(() => {
    cleanup();
  });

  it("pinta la cabecera Orbit y una tarjeta con mini-lienzo por perfil", () => {
    renderPage();
    expect(screen.getByTestId("orbit-profiles")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByText("Overlays Studio")).toBeTruthy();
    expect(screen.getByTestId("orbit-profiles-card-p1")).toBeTruthy();
    expect(screen.getByTestId("orbit-profiles-card-p2")).toBeTruthy();
    expect(screen.getByTestId("mini-stage-p1")).toBeTruthy();
    expect(screen.getByText("general · 4 widgets")).toBeTruthy();
  });

  it("«Activar» llama al store real con el perfil de la tarjeta", () => {
    const props = renderPage();
    fireEvent.click(screen.getByTestId("orbit-profiles-activate-p2"));
    expect(props.onSetActiveProfile).toHaveBeenCalledWith(profiles[1]);
  });

  it("«Editar layout» navega al editor con ese perfil", () => {
    const props = renderPage();
    fireEvent.click(screen.getByTestId("orbit-profiles-edit-p1"));
    expect(props.onOpenProfile).toHaveBeenCalledWith(profiles[0]);
  });

  it("el perfil activo enseña el chip y deja «Activar» deshabilitado", () => {
    renderPage({ activeProfileId: "p1" });
    expect(screen.getAllByText("Activo").length).toBeGreaterThan(0);
    const activate = screen.getByTestId("orbit-profiles-activate-p1") as HTMLButtonElement;
    expect(activate.disabled).toBe(true);
    // El otro perfil sigue siendo activable.
    expect((screen.getByTestId("orbit-profiles-activate-p2") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("con el overlay en marcha ofrece detenerlo en vez de abrirlo", () => {
    const props = renderPage({
      activeProfileId: "p1",
      overlayStatus: { running: true, profileId: "p1" },
    });
    fireEvent.click(screen.getByTestId("orbit-profiles-stop-p1"));
    expect(props.onStopOverlay).toHaveBeenCalled();
    expect(screen.queryByTestId("orbit-profiles-start-p1")).toBeNull();
  });

  it("«Nuevo perfil» y «Volver» usan los mismos callbacks que la vista legada", () => {
    const props = renderPage();
    fireEvent.click(screen.getByTestId("orbit-profiles-create"));
    expect(props.onCreateProfile).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("orbit-profiles-back"));
    expect(props.onBack).toHaveBeenCalled();
  });

  it("sin perfiles enseña el vacío honesto y no dibuja la rejilla", () => {
    renderPage({ profiles: [] });
    expect(screen.getByTestId("orbit-profiles-empty")).toBeTruthy();
    expect(screen.queryByTestId("orbit-profiles-grid")).toBeNull();
  });

  it("rellena la columna de Studio con la lista de perfiles y abre el editor", () => {
    cleanup();
    const slot = document.createElement("div");
    slot.id = "orbit-studio-context-slot";
    document.body.appendChild(slot);
    const props = renderPage({ activeProfileId: "p1" });
    const list = screen.getByTestId("orbit-profiles-context");
    expect(list.textContent).toContain("Endurance");
    expect(list.textContent).toContain("Sprint");
    fireEvent.click(within(list).getByText("Sprint"));
    expect(props.onOpenProfile).toHaveBeenCalledWith(profiles[1]);
    slot.remove();
  });
});
