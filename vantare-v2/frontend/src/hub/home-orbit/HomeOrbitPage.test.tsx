import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { RaceStart } from "../orbit/race-starts";
import type { OrbitOverlayState } from "../orbit/use-overlay-state";
import type { ProfileEntry } from "../state/overlay-workbench";
import { greetingSlot } from "./greeting";
import { HomeOrbitPage } from "./HomeOrbitPage";

vi.mock("./HomeMiniStage", () => ({
  HomeMiniStage: () => <div data-testid="orbit-home-mini-stage" />,
}));

const NOW = new Date("2026-07-07T18:07:30Z");

function race(overrides: Partial<RaceStart> & Pick<RaceStart, "seriesId" | "name">): RaceStart {
  return {
    track: "Sebring (School)",
    tier: "beginner",
    licenseTier: "bronze",
    licenseLabel: "Bronze SR",
    note: "Cada 15 min",
    intervalMin: 15,
    at: new Date("2026-07-07T18:15:00Z"),
    followed: false,
    ...overrides,
  };
}

const RACES: RaceStart[] = [
  race({ seriesId: "a", name: "LMGT3 Fixed" }),
  race({ seriesId: "b", name: "LMGT3 Sprint Cup", at: new Date("2026-07-07T18:30:00Z") }),
  race({ seriesId: "c", name: "One Stint Sprint", at: new Date("2026-07-07T18:45:00Z") }),
  race({ seriesId: "d", name: "WEC Weekly", at: new Date("2026-07-07T19:00:00Z") }),
];

function profile(id: string, name: string, widgets: number): ProfileEntry {
  return { id, file: `${id}.json`, name, displayMode: "edit", widgets };
}

const ACTIVE = profile("clean", "Clean Overlay", 3);
const OTHER = profile("basic", "Le Mans Ultimate - Basic", 4);

const OVERLAY: OrbitOverlayState = {
  profiles: [ACTIVE, OTHER],
  activeProfileId: ACTIVE.id,
  status: { running: false },
  running: false,
  active: ACTIVE,
  recommended: OTHER,
};

const EMPTY_OVERLAY: OrbitOverlayState = {
  profiles: [],
  activeProfileId: null,
  status: null,
  running: false,
  active: null,
  recommended: null,
};

function renderPage(overrides: Partial<React.ComponentProps<typeof HomeOrbitPage>> = {}) {
  const onNavigate = vi.fn();
  const onOpenPalette = vi.fn();
  const onToggleOverlay = vi.fn();
  const onActivateProfile = vi.fn();
  render(
    <I18nProvider>
      <HomeOrbitPage
        now={NOW}
        onActivateProfile={onActivateProfile}
        onNavigate={onNavigate}
        onOpenPalette={onOpenPalette}
        onToggleOverlay={onToggleOverlay}
        overlay={OVERLAY}
        races={RACES}
        simStatus="connected"
        target={RACES[0]}
        userName="Isaac"
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onNavigate, onOpenPalette, onToggleOverlay, onActivateProfile };
}

afterEach(() => {
  cleanup();
});

describe("greetingSlot", () => {
  it("reparte el día en mañana, tarde y noche", () => {
    expect(greetingSlot(new Date(2026, 6, 7, 8, 0))).toBe("morning");
    expect(greetingSlot(new Date(2026, 6, 7, 11, 59))).toBe("morning");
    expect(greetingSlot(new Date(2026, 6, 7, 12, 0))).toBe("afternoon");
    expect(greetingSlot(new Date(2026, 6, 7, 19, 59))).toBe("afternoon");
    expect(greetingSlot(new Date(2026, 6, 7, 20, 0))).toBe("evening");
    expect(greetingSlot(new Date(2026, 6, 7, 3, 0))).toBe("morning");
  });
});

describe("HomeOrbitPage con datos", () => {
  it("saluda por franja con el nombre del usuario", () => {
    renderPage({ now: new Date(2026, 6, 7, 9, 0) });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Buenos días, Isaac.");
  });

  it("el dial muestra antetítulo, reloj con prefijo y abre la serie en Carreras", () => {
    const { onNavigate } = renderPage();
    const card = screen.getByTestId("orbit-dial-card");
    expect(card.textContent).toContain("Próxima serie");
    expect(card.textContent).toContain("LMGT3 Fixed · Sebring (School)");
    // El reloj del dial corre con la hora real: basta con el prefijo y el formato.
    expect(card.textContent).toMatch(/en \d/);
    expect(card.textContent).toContain("Cada 15 min · Bronze SR");
    fireEvent.click(screen.getByRole("button", { name: "Abrir la serie en Carreras" }));
    expect(onNavigate).toHaveBeenCalledWith("carreras", "a");
  });

  it("muestra el perfil activo con sus widgets y el estado del overlay", () => {
    renderPage();
    const focal = screen.getByTestId("orbit-home-focal");
    expect(within(focal).getByRole("heading", { level: 2 }).textContent).toBe("Clean Overlay");
    expect(focal.textContent).toContain("3 widgets visibles");
    expect(focal.textContent).toContain("1920 × 1080");
    expect(screen.getByTestId("orbit-home-overlay-state").textContent).toBe("Overlay detenido");
    expect(screen.getByTestId("orbit-home-mini-stage")).toBeTruthy();
  });

  it("refleja el overlay en marcha en la focal", () => {
    renderPage({ overlay: { ...OVERLAY, running: true, status: { running: true } } });
    expect(screen.getByTestId("orbit-home-overlay-state").textContent).toBe("Overlay activo");
    expect(screen.getByTestId("orbit-home-overlay-toggle").textContent).toContain("Detener overlay");
  });

  it("pinta las cuatro próximas salidas con su hora", () => {
    renderPage();
    const rows = within(screen.getByTestId("orbit-home-races")).getAllByRole("button");
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain("LMGT3 Fixed");
    expect(rows[0].textContent).toContain("Bronze SR");
    expect(rows[0].className).toContain("orbit-row--next");
  });

  it("lista los perfiles con el activo marcado", () => {
    renderPage();
    const rows = within(screen.getByTestId("orbit-home-profiles")).getAllByRole("button");
    expect(rows[0].textContent).toContain("Clean Overlay");
    expect(rows[0].textContent).toContain("Activo");
    expect(rows[1].textContent).toContain("Activar");
  });

  it("no usa el atributo `title` nativo en ninguna parte", () => {
    renderPage();
    expect(screen.getByTestId("orbit-home").querySelectorAll("[title]")).toHaveLength(0);
  });
});

describe("HomeOrbitPage · navegación y acciones", () => {
  it("la fila de carrera navega a Carreras con la serie seleccionada", () => {
    const { onNavigate } = renderPage();
    fireEvent.click(within(screen.getByTestId("orbit-home-races")).getAllByRole("button")[1]);
    expect(onNavigate).toHaveBeenCalledWith("carreras", "b");
  });

  it("«Ver todas» navega a Carreras sin serie", () => {
    const { onNavigate } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Ver todas" }));
    expect(onNavigate).toHaveBeenCalledWith("carreras");
  });

  it("«Gestionar» navega al Studio", () => {
    const { onNavigate } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    expect(onNavigate).toHaveBeenCalledWith("studio");
  });

  it("la superficie de comando abre la paleta", () => {
    const { onOpenPalette } = renderPage();
    fireEvent.click(screen.getByTestId("orbit-home-command"));
    expect(onOpenPalette).toHaveBeenCalled();
  });

  it("la focal conmuta el overlay", () => {
    const { onToggleOverlay } = renderPage();
    fireEvent.click(screen.getByTestId("orbit-home-overlay-toggle"));
    expect(onToggleOverlay).toHaveBeenCalled();
  });

  it("un perfil no activo se activa desde la lista", () => {
    const { onActivateProfile } = renderPage();
    fireEvent.click(within(screen.getByTestId("orbit-home-profiles")).getAllByRole("button")[1]);
    expect(onActivateProfile).toHaveBeenCalledWith(OTHER);
  });

  it("las acciones rápidas llevan a Estrategia y al Launcher", () => {
    const { onNavigate } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Crear plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Lanzar perfil" }));
    expect(onNavigate).toHaveBeenCalledWith("estrategia");
    expect(onNavigate).toHaveBeenCalledWith("launcher");
  });
});

describe("HomeOrbitPage vacía", () => {
  it("sin perfiles, sin carreras y sin objetivo mantiene la estructura con estados honestos", () => {
    renderPage({ overlay: EMPTY_OVERLAY, races: [], target: null });
    expect(screen.getByTestId("orbit-home-no-dial").textContent).toContain(
      "Sin salidas próximas en el calendario",
    );
    expect(screen.getByText("Sin salidas próximas")).toBeTruthy();
    expect(screen.getByText("Sin perfiles todavía")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Sin perfil activo");
    expect(screen.queryByTestId("orbit-home-races")).toBeNull();
    expect(screen.queryByTestId("orbit-home-profiles")).toBeNull();
  });

  it("no muestra Actividad reciente mientras el feed está vacío", () => {
    renderPage({ overlay: EMPTY_OVERLAY, races: [], target: null });
    expect(screen.queryByText("Actividad reciente")).toBeNull();
  });
});
