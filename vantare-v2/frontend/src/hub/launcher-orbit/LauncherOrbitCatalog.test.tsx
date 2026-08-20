import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `useAppIcon` habla con el puente de Wails; aquí solo hace falta que no falle.
const { eventsOn, eventsEmit } = vi.hoisted(() => ({
  eventsOn: vi.fn(() => () => undefined),
  eventsEmit: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: { On: eventsOn, Off: vi.fn(), Emit: eventsEmit },
}));

import { I18nProvider } from "../../i18n/I18nProvider";
import type { AppPickedListener } from "../launcher/launcher-bridge";
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

const SNAPSHOT: LauncherSnapshot = {
  revision: 1,
  apps: [
    app("obs", { displayName: "OBS Studio", abbreviation: "OBS" }),
    app("lmu", { displayName: "Le Mans Ultimate", abbreviation: "LMU", isFavorite: true }),
    app("custom:mi-app", {
      displayName: "Mi App",
      abbreviation: "MA",
      availability: { catalogued: false, found: true, installed: true, launchable: true },
    }),
  ],
  vantareProfiles: [],
  userProfiles: [],
  activeChains: [],
  discovery: { scanning: false, lastScanAt: "2026-01-01T10:00:00Z", error: null },
};

function mountSlots() {
  for (const id of [LAUNCHER_TOPBAR_SLOT_ID, LAUNCHER_CONTEXT_SLOT_ID]) {
    const node = document.createElement("div");
    node.id = id;
    document.body.append(node);
  }
}

type SetupOptions = { withPicker?: boolean };

function setup(snapshot: LauncherSnapshot, options: SetupOptions = {}) {
  mountSlots();
  const dispatchLauncherCommand = vi.fn();
  const pickedListeners = new Set<AppPickedListener>();
  let publish: ((value: LauncherSnapshot) => void) | undefined;
  const bridge: LauncherBridgeLike = {
    subscribeSnapshot: (listener) => {
      publish = listener;
      return () => undefined;
    },
    requestSnapshot: () => undefined,
    dispatchLauncherCommand,
    ...(options.withPicker === false
      ? {}
      : {
          subscribeAppPicked: (listener: AppPickedListener) => {
            pickedListeners.add(listener);
            return () => pickedListeners.delete(listener);
          },
        }),
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
  return {
    ...view,
    dispatchLauncherCommand,
    pick: (payload: { path: string; suggestedName?: string }) =>
      act(() => pickedListeners.forEach((listener) => listener(payload))),
  };
}

describe("catálogo del Launcher · favoritos", () => {
  it("ordena los favoritos primero", () => {
    setup(SNAPSHOT);
    const rows = screen.getByTestId("orbit-launcher-apps");
    const titles = Array.from(rows.querySelectorAll("button[data-testid^='orbit-launcher-favorite-']"))
      .map((node) => node.getAttribute("data-testid"));
    expect(titles[0]).toBe("orbit-launcher-favorite-lmu");
  });

  it("persiste el favorito por el mismo puente que el resto del launcher", () => {
    const { dispatchLauncherCommand } = setup(SNAPSHOT);
    fireEvent.click(screen.getByTestId("orbit-launcher-favorite-obs"));
    expect(dispatchLauncherCommand).toHaveBeenCalledWith("launcher:app:favorite", {
      id: "obs",
      favorite: true,
    });
  });

  it("desmarca una aplicación ya favorita", () => {
    const { dispatchLauncherCommand } = setup(SNAPSHOT);
    const star = screen.getByTestId("orbit-launcher-favorite-lmu");
    expect(star.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(star);
    expect(dispatchLauncherCommand).toHaveBeenCalledWith("launcher:app:favorite", {
      id: "lmu",
      favorite: false,
    });
  });

  it("lista las favoritas en la columna contextual", () => {
    setup(SNAPSHOT);
    const column = screen.getByTestId("orbit-launcher-context-favorites");
    expect(column.textContent).toContain("Le Mans Ultimate");
    expect(column.textContent).not.toContain("OBS Studio");
  });
});

describe("catálogo del Launcher · aplicaciones personalizadas", () => {
  it("añade una aplicación con la ruta que devuelve el diálogo nativo", () => {
    const { dispatchLauncherCommand, pick } = setup(SNAPSHOT);
    fireEvent.click(screen.getByTestId("orbit-launcher-add-app-open"));
    fireEvent.click(screen.getByTestId("orbit-launcher-add-app-browse"));
    expect(dispatchLauncherCommand).toHaveBeenCalledWith("launcher:app:pick", undefined);

    pick({ path: "C:\\Apps\\MiApp.exe", suggestedName: "MiApp" });
    expect((screen.getByTestId("orbit-launcher-add-app-path") as HTMLInputElement).value).toBe(
      "C:\\Apps\\MiApp.exe",
    );
    // El nombre propuesto solo rellena un campo vacío.
    const name = screen.getByTestId("orbit-launcher-add-app-name") as HTMLInputElement;
    expect(name.value).toBe("MiApp");

    fireEvent.change(name, { target: { value: "Mi App" } });
    fireEvent.click(screen.getByTestId("orbit-launcher-add-app-submit"));
    expect(dispatchLauncherCommand).toHaveBeenCalledWith("launcher:app:addCustom", {
      displayName: "Mi App",
      path: "C:\\Apps\\MiApp.exe",
    });
  });

  it("no pisa el nombre que el usuario ya escribió", () => {
    const { pick } = setup(SNAPSHOT);
    fireEvent.click(screen.getByTestId("orbit-launcher-add-app-open"));
    fireEvent.change(screen.getByTestId("orbit-launcher-add-app-name"), {
      target: { value: "El mío" },
    });
    pick({ path: "C:\\Apps\\MiApp.exe", suggestedName: "MiApp" });
    expect((screen.getByTestId("orbit-launcher-add-app-name") as HTMLInputElement).value).toBe(
      "El mío",
    );
  });

  it("mantiene «Añadir» deshabilitado y con su motivo hasta tener nombre y ruta", () => {
    setup(SNAPSHOT);
    fireEvent.click(screen.getByTestId("orbit-launcher-add-app-open"));
    const submit = screen.getByTestId("orbit-launcher-add-app-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute("data-tip")).toBeTruthy();
  });

  it("deshabilita «Examinar…» con su motivo cuando no hay selector detrás", () => {
    setup(SNAPSHOT, { withPicker: false });
    fireEvent.click(screen.getByTestId("orbit-launcher-add-app-open"));
    const browse = screen.getByTestId("orbit-launcher-add-app-browse") as HTMLButtonElement;
    expect(browse.disabled).toBe(true);
    expect(browse.getAttribute("data-tip")).toBeTruthy();
  });

  it("solo ofrece eliminar las aplicaciones añadidas por el usuario", () => {
    setup(SNAPSHOT);
    expect((screen.getByTestId("orbit-launcher-remove-lmu") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByTestId("orbit-launcher-remove-custom:mi-app") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("elimina tras confirmar en el diálogo del kit, no en un confirm() nativo", () => {
    // El entorno de pruebas no expone `confirm`; se instala uno para que el
    // test falle si alguien lo reintroduce en este camino.
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal("confirm", nativeConfirm);
    const { dispatchLauncherCommand } = setup(SNAPSHOT);
    fireEvent.click(screen.getByTestId("orbit-launcher-remove-custom:mi-app"));
    expect(screen.getByTestId("orbit-launcher-remove-app")).toBeTruthy();
    expect(nativeConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("orbit-launcher-remove-app-confirm"));
    expect(dispatchLauncherCommand).toHaveBeenCalledWith("launcher:app:remove", {
      id: "custom:mi-app",
    });
    vi.unstubAllGlobals();
  });

  it("cancelar la confirmación no elimina nada", () => {
    const { dispatchLauncherCommand } = setup(SNAPSHOT);
    fireEvent.click(screen.getByTestId("orbit-launcher-remove-custom:mi-app"));
    fireEvent.click(screen.getByTestId("orbit-launcher-remove-app-cancel"));
    expect(screen.queryByTestId("orbit-launcher-remove-app")).toBeNull();
    expect(dispatchLauncherCommand).not.toHaveBeenCalledWith(
      "launcher:app:remove",
      expect.anything(),
    );
  });
});
