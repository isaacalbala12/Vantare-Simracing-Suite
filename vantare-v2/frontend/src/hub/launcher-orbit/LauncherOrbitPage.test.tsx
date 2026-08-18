import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `useAppIcon` habla con el backend por el puente de Wails: aquí se captura lo
// que emite para comprobar que pide el icono real de cada ejecutable.
const { emitted, eventsOn, eventsEmit } = vi.hoisted(() => {
  const emitted: [string, unknown][] = [];
  return {
    emitted,
    eventsOn: vi.fn(() => () => undefined),
    eventsEmit: vi.fn((name: string, payload?: unknown) => {
      emitted.push([name, payload]);
    }),
  };
});

vi.mock("@wailsio/runtime", () => ({
  Events: { On: eventsOn, Off: vi.fn(), Emit: eventsEmit },
}));
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
import { resetAppIconCache } from "../launcher/use-app-icon";

beforeEach(() => {
  emitted.length = 0;
  eventsEmit.mockClear();
  resetAppIconCache();
});

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

describe("LauncherOrbitPage · iconos reales, creación y carga", () => {
  it("pinta el icono real de la aplicación cuando el contrato trae `iconUrl`", () => {
    setup({
      ...CATALOG,
      apps: [
        app("lmu", { displayName: "Le Mans Ultimate", iconUrl: "/icons/lmu.png" }),
        app("obs", { displayName: "OBS Studio" }),
      ],
    });
    const list = screen.getByTestId("orbit-launcher-apps");
    const images = list.querySelectorAll("img");
    expect(images.length).toBe(1);
    expect(images[0].getAttribute("src")).toBe("/icons/lmu.png");
    // La aplicación sin icono conserva su monograma de iniciales.
    expect(within(list).getByText("OBS")).toBeTruthy();
  });

  it("pide al backend el icono de las aplicaciones con ejecutable y sin `iconUrl`", () => {
    setup({
      ...CATALOG,
      apps: [app("obs", { displayName: "OBS Studio", executablePath: "C:/obs/obs.exe" })],
    });
    expect(emitted).toContainEqual([
      "launcher:app:icon",
      { id: "obs", executablePath: "C:/obs/obs.exe" },
    ]);
  });

  it("vuelve a las iniciales si el icono no carga", () => {
    setup({
      ...CATALOG,
      apps: [app("lmu", { displayName: "Le Mans Ultimate", iconUrl: "/roto.png" })],
    });
    const list = screen.getByTestId("orbit-launcher-apps");
    const image = list.querySelector("img");
    expect(image).toBeTruthy();
    fireEvent.error(image!);
    expect(screen.getByTestId("orbit-launcher-apps").querySelector("img")).toBeNull();
    expect(within(screen.getByTestId("orbit-launcher-apps")).getByText("LMU")).toBeTruthy();
  });

  it("«Crear perfil» abre el editor real en el mismo clic, sin esperar al backend", () => {
    const { dispatchLauncherCommand } = setup(CATALOG);
    expect(screen.queryByTestId("launcher-profile-editor")).toBeNull();
    fireEvent.click(screen.getByTestId("orbit-launcher-create"));
    expect(dispatchLauncherCommand).toHaveBeenCalledWith(
      "launcher:profile:save",
      expect.objectContaining({ profile: expect.objectContaining({ steps: [] }) }),
    );
    // El perfil nuevo no está en la instantánea (el backend no ha respondido) y
    // aun así el editor está montado: antes el clic no hacía nada.
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("enseña carga y filas de relleno mientras no llega la instantánea", () => {
    mountSlots();
    const bridge: LauncherBridgeLike = {
      subscribeSnapshot: () => () => undefined,
      requestSnapshot: () => undefined,
      dispatchLauncherCommand: vi.fn(),
    };
    render(
      <I18nProvider>
        <LauncherStoreProvider store={createLauncherStore(bridge)}>
          <LauncherOrbitPage />
        </LauncherStoreProvider>
      </I18nProvider>,
    );
    expect(screen.getByTestId("orbit-launcher-apps-loading")).toBeTruthy();
    expect(screen.getAllByText("Detectando aplicaciones…").length).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(".orbit-launcher__skeleton").length,
    ).toBeGreaterThan(0);
    // Nada de «el catálogo está vacío» antes de tener respuesta.
    expect(
      screen.queryByText("El catálogo está vacío. Ejecuta la detección para poblarlo."),
    ).toBeNull();
  });

  it("con la instantánea vacía sí dice la verdad: catálogo vacío, sin relleno", () => {
    setup(EMPTY);
    expect(screen.queryByTestId("orbit-launcher-apps-loading")).toBeNull();
    expect(
      screen.getByText("El catálogo está vacío. Ejecuta la detección para poblarlo."),
    ).toBeTruthy();
  });
});
