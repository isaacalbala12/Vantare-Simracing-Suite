import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { LauncherApp, LauncherSnapshot } from "../launcher/launcher-contract";
import {
  LauncherStoreProvider,
  createLauncherStore,
  type LauncherBridgeLike,
} from "../launcher/launcher-store";
import {
  LauncherOrbitPage,
  LAUNCHER_CONTEXT_SLOT_ID,
  LAUNCHER_TOPBAR_SLOT_ID,
} from "./LauncherOrbitPage";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function app(id: string, patch: Partial<LauncherApp> = {}): LauncherApp {
  return {
    id,
    displayName: id.toUpperCase(),
    abbreviation: id.slice(0, 3).toUpperCase(),
    category: "utility",
    launchMethod: "executable",
    availability: { catalogued: true, found: false, installed: false, launchable: false },
    gradientFrom: "#111111",
    gradientTo: "#222222",
    ...patch,
  };
}

const EMPTY: LauncherSnapshot = {
  revision: 1,
  apps: [],
  vantareProfiles: [],
  userProfiles: [],
  activeChains: [],
  discovery: { scanning: false, lastScanAt: null, error: null },
};

/** La shell reserva los huecos de topbar y columna: el test los monta igual. */
function mountSlots() {
  for (const id of [LAUNCHER_TOPBAR_SLOT_ID, LAUNCHER_CONTEXT_SLOT_ID]) {
    const node = document.createElement("div");
    node.id = id;
    document.body.append(node);
  }
}

function setup(snapshot: LauncherSnapshot) {
  mountSlots();
  const dispatchLauncherCommand = vi.fn();
  let publish: ((value: LauncherSnapshot) => void) | undefined;
  const bridge: LauncherBridgeLike = {
    subscribeSnapshot: (listener) => {
      publish = listener;
      return () => undefined;
    },
    requestSnapshot: () => undefined,
    dispatchLauncherCommand,
  };
  const store = createLauncherStore(bridge);
  const view = render(
    <I18nProvider>
      <LauncherStoreProvider store={store}>
        <LauncherOrbitPage />
      </LauncherStoreProvider>
    </I18nProvider>,
  );
  act(() => publish?.(snapshot));
  return { ...view, dispatchLauncherCommand, publish: (next: LauncherSnapshot) => act(() => publish?.(next)) };
}

const CATALOG: LauncherSnapshot = {
  ...EMPTY,
  apps: [
    app("lmu", {
      displayName: "Le Mans Ultimate",
      abbreviation: "LMU",
      category: "simulator",
      launchMethod: "steam-uri",
      gradientFrom: "#f04755",
      gradientTo: "#77162c",
    }),
    app("obs", {
      displayName: "OBS Studio",
      abbreviation: "OBS",
      category: "streaming",
      availability: { catalogued: true, found: true, installed: false, launchable: true },
    }),
    app("spotify", {
      displayName: "Spotify",
      abbreviation: "SP",
      category: "audio",
      availability: { catalogued: true, found: true, installed: true, launchable: true },
    }),
  ],
  userProfiles: [
    {
      id: "creator",
      name: "Creador de Contenido",
      description: "Simulador, captura y música.",
      isFavorite: true,
      hotkey: "ctrl+alt+l",
      steps: [
        { appId: "lmu", delay: 0 },
        { appId: "obs", delay: 2 },
        { appId: "spotify", delay: 2 },
      ],
      policy: {
        alreadyRunning: "reuse",
        failure: "continue",
        cancel: "ask",
        exit: "leave",
        retry: "failed",
        maxRetries: 2,
      },
    },
    { id: "pro", name: "Pro", steps: [{ appId: "lmu", delay: 0 }] },
  ],
};

describe("Launcher Orbit", () => {
  it("pinta cada aplicación con el degradado del contrato", () => {
    setup(CATALOG);
    const list = screen.getByTestId("orbit-launcher-apps");
    const monogram = within(list).getByText("LMU");
    expect(monogram.getAttribute("style")).toContain("#f04755");
    expect(monogram.getAttribute("style")).toContain("#77162c");
  });

  it("marca el estado de detección de cada aplicación con su chip", () => {
    setup(CATALOG);
    const list = screen.getByTestId("orbit-launcher-apps");
    expect(within(list).getByText("Catálogo")).toBeTruthy();
    expect(within(list).getByText("Detectada")).toBeTruthy();
    expect(within(list).getByText("Instalada")).toBeTruthy();
  });

  it("muestra la cadena real con su orden, sus esperas y sus políticas", () => {
    setup(CATALOG);
    const chain = screen.getByRole("list", { name: "Orden de Creador de Contenido" });
    const steps = within(chain).getAllByTestId("orbit-chain-step");
    expect(steps.map((step) => step.querySelector("b")?.textContent)).toEqual([
      "Le Mans Ultimate",
      "OBS Studio",
      "Spotify",
    ]);
    expect(steps[0].querySelector("b + span")?.textContent).toBe("sin espera");
    expect(steps[1].querySelector("b + span")?.textContent).toBe("+2 s");
    expect(screen.getByText("Ya abierta · reutilizar")).toBeTruthy();
    expect(screen.getByText("Fallo · reintentar ×2")).toBeTruthy();
    expect(screen.getByText("Al salir · dejar abiertas")).toBeTruthy();
  });

  it("lanza la cadena real por el puente del Launcher", () => {
    const { dispatchLauncherCommand } = setup(CATALOG);
    fireEvent.click(screen.getByTestId("orbit-launcher-run-creator"));
    expect(dispatchLauncherCommand).toHaveBeenCalledWith("launcher:profile:launch", {
      id: "creator",
    });
  });

  it("refleja el estado por paso de la cadena activa", () => {
    const { publish } = setup(CATALOG);
    publish({
      ...CATALOG,
      activeChains: [
        {
          profileId: "creator",
          status: "running",
          steps: [
            { appId: "lmu", status: "done" },
            { appId: "obs", status: "launching" },
            { appId: "spotify", status: "failed" },
          ],
        },
      ],
    });
    const chain = screen.getByRole("list", { name: "Orden de Creador de Contenido" });
    const steps = within(chain).getAllByTestId("orbit-chain-step");
    expect(steps.map((step) => step.getAttribute("data-s"))).toEqual([
      "ready",
      "launching",
      "failed",
    ]);
    expect(steps[2].querySelector("b + span")?.textContent).toBe("fallo");
  });

  it("pone el atajo global real del perfil destacado en la fila de estadísticas", () => {
    setup(CATALOG);
    expect(screen.getByText("Ctrl")).toBeTruthy();
    expect(screen.getByText("Alt")).toBeTruthy();
    expect(screen.getByText("L")).toBeTruthy();
  });

  it("filtra el catálogo con la búsqueda de la topbar", () => {
    setup(CATALOG);
    fireEvent.change(screen.getByTestId("orbit-launcher-search"), { target: { value: "spot" } });
    const list = screen.getByTestId("orbit-launcher-apps");
    expect(within(list).queryByText("Le Mans Ultimate")).toBeNull();
    expect(within(list).getByText("Spotify")).toBeTruthy();
  });

  it("explica la página vacía sin aplicaciones ni perfiles y ofrece crear uno", () => {
    const { dispatchLauncherCommand } = setup(EMPTY);
    expect(
      screen.getByText("El catálogo está vacío. Ejecuta la detección para poblarlo."),
    ).toBeTruthy();
    expect(screen.getByText("Todavía no hay perfiles. Crea uno para lanzar tu cadena.")).toBeTruthy();
    expect(screen.getByText("Detección no ejecutada")).toBeTruthy();
    fireEvent.click(screen.getByTestId("orbit-launcher-create"));
    expect(dispatchLauncherCommand).toHaveBeenCalledWith(
      "launcher:profile:save",
      expect.objectContaining({ profile: expect.objectContaining({ steps: [] }) }),
    );
  });

  it("no usa `title` nativo en ningún control de la vista", () => {
    setup(CATALOG);
    expect(screen.getByTestId("orbit-launcher").querySelectorAll("[title]").length).toBe(0);
  });
});
