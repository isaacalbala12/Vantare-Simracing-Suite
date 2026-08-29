import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../designs/widget-design-client", () => ({
  createWailsWidgetDesignClient: () => ({
    list: vi.fn(async () => []),
    save: vi.fn(async (design: unknown) => design),
    delete: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
  }),
}));

const wails = vi.hoisted(() => ({
  handlers: new Map<string, Array<(event: { data?: unknown }) => void>>(),
  emit: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, handler: (event: { data?: unknown }) => void) => {
      const listeners = wails.handlers.get(name) ?? [];
      listeners.push(handler);
      wails.handlers.set(name, listeners);
      return () => wails.handlers.set(name, listeners.filter((item) => item !== handler));
    }),
    Emit: wails.emit,
  },
}));

import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { standingsDefinition } from "../../../overlay/widget-types/standings/standings-definition";
import { I18nProvider } from "../../../i18n/I18nProvider";
import { StudioTelemetryProvider } from "../canvas/StudioTelemetryProvider";
import { StudioConfirmProvider } from "../components/StudioConfirmProvider";
import { StudioProvider } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { createTestTelemetryCoordinator } from "../test-helpers";
import { ORBIT_KEYS, orbitStore } from "../../orbit/orbit-store";
import { OrbitSimStatusContext } from "../../orbit/sim-status-context";
import type { SimStatus } from "../../orbit/views";
import { StudioOrbitLayout } from "./StudioOrbitLayout";
import { STUDIO_CONTEXT_SLOT_ID, STUDIO_TOPBAR_SLOT_ID } from "./studio-orbit-slots";

function widget(id: string, overrides: Partial<WidgetInstanceV3> = {}): WidgetInstanceV3 {
  const base = id.startsWith("standings")
    ? standingsDefinition.createDefault(id)
    : deltaDefinition.createDefault(id);
  return { ...base, name: id === "delta-main" ? "Delta principal" : id, ...overrides };
}

function buildDocument(widgets: WidgetInstanceV3[]): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Perfil de prueba",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: { general: { type: "general", widgets } },
  };
}

function createClient(document: ProfileDocumentV3): StudioProfileClient {
  return {
    load: vi.fn(async () => ({ document: structuredClone(document), revision: "rev-1" })),
    save: vi.fn(async (input) => ({
      status: "saved" as const,
      document: structuredClone(input.document),
      revision: "rev-2",
    })),
  };
}

function renderStudio(
  document = buildDocument([widget("delta-main"), widget("standings-main")]),
  simStatus: SimStatus | null = null,
) {
  const context = window.document.createElement("div");
  context.id = STUDIO_CONTEXT_SLOT_ID;
  const topbar = window.document.createElement("div");
  topbar.id = STUDIO_TOPBAR_SLOT_ID;
  window.document.body.append(context, topbar);

  const tree = (
    <I18nProvider>
      <StudioProvider client={createClient(document)} initialFile="profile.json">
        <StudioTelemetryProvider coordinator={createTestTelemetryCoordinator()} liveAvailable={false}>
          <StudioConfirmProvider>
            <StudioOrbitLayout
              activeFile="profile.json"
              onRequestProfileChange={vi.fn()}
              profiles={[{ id: "profile-1", name: "Perfil de prueba", file: "profile.json" }]}
            />
          </StudioConfirmProvider>
        </StudioTelemetryProvider>
      </StudioProvider>
    </I18nProvider>
  );

  return render(
    simStatus === null ? (
      tree
    ) : (
      <OrbitSimStatusContext.Provider value={simStatus}>{tree}</OrbitSimStatusContext.Provider>
    ),
  );
}

/** Boton `Live` del selector de fuente de la toolbar. */
function liveOption(): HTMLButtonElement {
  const group = screen.getByRole("group", { name: "Fuente de preview" });
  return within(group).getByRole("button", { name: "Live" }) as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
  window.document.getElementById(STUDIO_CONTEXT_SLOT_ID)?.remove();
  window.document.getElementById(STUDIO_TOPBAR_SLOT_ID)?.remove();
});

beforeEach(() => {
  wails.handlers.clear();
  wails.emit.mockClear();
  window.localStorage.clear();
  // Ventana ancha: por debajo de `STUDIO_AUTO_FOLD_INSPECTOR_WIDTH` el
  // inspector se pliega solo (D-R4-4) y estas pruebas van sobre el desplegado.
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
});

describe("StudioOrbitLayout", () => {
  it("sincroniza la selección entre lista, lienzo e inspector", async () => {
    renderStudio();
    const row = await screen.findByTestId("orbit-studio-widget-item-delta-main");
    fireEvent.click(within(row).getByRole("option"));

    await waitFor(() => {
      expect(
        screen.getByTestId("orbit-studio-inspector").getAttribute("data-widget-id"),
      ).toBe("delta-main");
    });
    expect(screen.getByTestId("orbit-studio-inspector-name").textContent).toContain(
      "Delta principal",
    );
    expect(screen.getByTestId("studio-widget-frame-delta-main").className).toContain(
      "osv3-widget-frame--selected",
    );
    expect(screen.getByTestId("orbit-studio-status-selection").textContent).toContain("1");

    // La fila seleccionada lleva el fondo y la barra carmín del kit, y su grip.
    const selectedRow = within(row).getByRole("option");
    expect(selectedRow.className).toContain("orbit-row--sel");
    expect(selectedRow.querySelector(".orbit-studio-witem__grip")).toBeTruthy();
  });

  it("el botón de añadir widget lleva la cruz delante de la copia", async () => {
    renderStudio();
    const add = await screen.findByTestId("orbit-studio-widget-add");
    expect(add.querySelector(".orbit-studio-wlist__plus")).toBeTruthy();
    expect(add.textContent).toContain("Añadir widget");
  });

  it("el ojo de la lista oculta el widget y tacha su nombre", async () => {
    renderStudio();
    const eye = await screen.findByTestId("orbit-studio-widget-eye-delta-main");
    fireEvent.click(eye);

    await waitFor(() => {
      expect(
        screen.getByTestId("orbit-studio-widget-item-delta-main").getAttribute("data-enabled"),
      ).toBe("false");
    });
    // La marca de oculto del lienzo es el badge que ya pinta el host V3; el
    // 12 % de opacidad cuelga de él en `orbit-studio.css`.
    expect(screen.getByTestId("studio-widget-hidden-badge-delta-main")).toBeTruthy();
  });

  it("marca la frecuencia heredada como sustituida por la política del perfil", async () => {
    renderStudio();
    fireEvent.click(
      within(await screen.findByTestId("orbit-studio-widget-item-delta-main")).getByRole("option"),
    );
    const inspector = await screen.findByTestId("orbit-studio-inspector");
    const summaries = () =>
      [...inspector.querySelectorAll(".orbit-acc__sum")].map((node) => node.textContent ?? "");

    await waitFor(() => expect(summaries().join(" ")).toContain("política del perfil"));
    expect(screen.getByTestId("studio-behavior-performance-policy").textContent).toContain(
      "Ajustes › Rendimiento",
    );
    expect(screen.queryByRole("combobox", { name: "Frecuencia" })).toBeNull();
  });

  it("pinta los campos del inspector con los controles del kit y rótulos humanos", async () => {
    renderStudio();
    fireEvent.click(
      within(await screen.findByTestId("orbit-studio-widget-item-delta-main")).getByRole("option"),
    );
    const inspector = await screen.findByTestId("orbit-studio-inspector");

    // Diseño: dos `Select` del kit y los dos botones ghost del prototipo.
    expect(screen.getByRole("combobox", { name: "Sistema" }).className).toContain("orbit-select");
    expect(screen.getByRole("combobox", { name: "Diseño" })).toBeTruthy();
    expect(screen.getByTestId("studio-design-save-open").textContent).toContain(
      "Guardar como diseño",
    );

    // Comportamiento: sesiones como `Seg` multi-selección con nombres reales.
    const sessions = screen.getByRole("group", { name: "Sesiones visibles" });
    expect(within(sessions).getByRole("button", { name: "Carrera" })).toBeTruthy();
    expect(within(sessions).getByRole("button", { name: "Clasificación" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Visible en boxes" })).toBeTruthy();

    // Layout: cuatro numéricos en fila y el toggle de proporción.
    for (const name of ["Posición X", "Posición Y", "Ancho", "Alto"]) {
      expect(screen.getByRole("textbox", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Bloquear proporción" })).toBeTruthy();

    // Ni checkboxes ni claves crudas dentro del inspector.
    expect(inspector.querySelectorAll("input[type='checkbox']").length).toBe(0);
    expect(inspector.textContent).not.toContain("SHOW-");
    expect(inspector.textContent).not.toMatch(/studio\.v3\./);
  });

  it("las sesiones visibles se marcan y desmarcan desde el Seg", async () => {
    renderStudio();
    fireEvent.click(
      within(await screen.findByTestId("orbit-studio-widget-item-delta-main")).getByRole("option"),
    );
    const sessions = await screen.findByRole("group", { name: "Sesiones visibles" });
    const race = within(sessions).getByRole("button", { name: "Carrera" });

    expect(race.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(race);
    await waitFor(() => expect(race.getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(race);
    await waitFor(() => expect(race.getAttribute("aria-pressed")).toBe("false"));
  });

  it("los numéricos de layout escriben X/Y/W/H al confirmar", async () => {
    renderStudio();
    fireEvent.click(
      within(await screen.findByTestId("orbit-studio-widget-item-delta-main")).getByRole("option"),
    );
    const x = await screen.findByRole("textbox", { name: "Posición X" });
    fireEvent.change(x, { target: { value: "420" } });
    fireEvent.blur(x);

    const inspector = screen.getByTestId("orbit-studio-inspector");
    await waitFor(() => {
      const summaries = [...inspector.querySelectorAll(".orbit-acc__sum")].map(
        (node) => node.textContent ?? "",
      );
      expect(summaries.join(" ")).toContain("420");
    });
  });

  it("pliega el inspector con la preferencia rightDock", async () => {
    orbitStore.set(ORBIT_KEYS.rightDock, "closed");
    renderStudio();
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio").getAttribute("data-right-dock")).toBe("closed");
    });
    expect(screen.getByTestId("orbit-studio-dock").hasAttribute("hidden")).toBe(true);

    fireEvent.click(screen.getByTestId("orbit-studio-dock-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio").getAttribute("data-right-dock")).toBe("open");
    });
    expect(orbitStore.get(ORBIT_KEYS.rightDock)).toBe("open");
  });

  it("pliega el inspector solo cuando la ventana es estrecha y lo avisa", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    renderStudio();
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio").getAttribute("data-right-dock")).toBe("closed");
    });
    // El conmutador no puede desplegarlo y la statusbar dice por que.
    expect(screen.getByTestId("orbit-studio-dock-toggle").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("orbit-studio-status-inspector-locked")).toBeTruthy();
    // Y no se ha tocado la preferencia guardada.
    expect(orbitStore.get(ORBIT_KEYS.rightDock)).toBeFalsy();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
    fireEvent(window, new Event("resize"));
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio").getAttribute("data-right-dock")).toBe("open");
    });
    expect(screen.queryByTestId("orbit-studio-status-inspector-locked")).toBeNull();
  });

  it("la topbar refleja el estado real de guardado", async () => {
    renderStudio();
    const save = await screen.findByTestId("orbit-studio-save");
    expect(save.getAttribute("data-s")).toBe("saved");

    fireEvent.click(
      within(await screen.findByTestId("orbit-studio-widget-item-delta-main")).getByRole("option"),
    );
    fireEvent.click(await screen.findByTestId("studio-layout-center"));

    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio-save").getAttribute("data-s")).toBe("dirty");
    });

    fireEvent.click(screen.getByTestId("orbit-studio-save"));
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio-save").getAttribute("data-s")).toBe("saved");
    });
  });

  it("guarda la política v4 del perfil y muestra el nivel efectivo", async () => {
    renderStudio();

    for (const handler of wails.handlers.get("performance:level") ?? []) {
      handler({ data: { level: 3, hz: 30, sourceHz: 0, effects: "noBlur" } });
    }
    await waitFor(() => {
      expect(screen.getByTestId("studio-performance-badge").textContent).toContain("Equilibrado");
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Política del perfil" }));
    fireEvent.click(screen.getByRole("option", { name: "Personalizado" }));

    await waitFor(() => {
      expect(wails.emit).toHaveBeenCalledWith(
        "studio:profile:performance:save",
        expect.objectContaining({
          performance: { mode: "custom", level: 3, overrides: {} },
        }),
      );
    });
    expect(screen.getByTestId("studio-performance-level")).toBeTruthy();
  });

  it("habilita `Live` cuando la shell da el sim por conectado", async () => {
    // Misma fuente que el Pill LMU de la columna: si la columna dice
    // «LMU conectado», el selector no puede decir lo contrario.
    renderStudio(undefined, "connected");
    await screen.findByTestId("orbit-studio-toolbar");

    const live = liveOption();
    expect(live.disabled).toBe(false);
    expect(live.getAttribute("data-tip")).toBeNull();

    fireEvent.click(live);
    await waitFor(() => expect(live.getAttribute("aria-pressed")).toBe("true"));
  });

  it("deshabilita `Live` con su motivo cuando el sim no está conectado", async () => {
    renderStudio(undefined, "disconnected");
    await screen.findByTestId("orbit-studio-toolbar");

    const live = liveOption();
    expect(live.disabled).toBe(true);
    expect(live.getAttribute("data-tip")).toBe("Live necesita el simulador conectado");
  });

  it("busca el sim conectado sin darlo por disponible", async () => {
    renderStudio(undefined, "searching");
    await screen.findByTestId("orbit-studio-toolbar");
    expect(liveOption().disabled).toBe(true);
  });

  it("el color del inspector se cambia y se restablece al valor del diseño", async () => {
    renderStudio();
    const row = await screen.findByTestId("orbit-studio-widget-item-standings-main");
    fireEvent.click(within(row).getByRole("option"));
    await screen.findByTestId("studio-inspector-section-appearance");

    const gt3 = screen.getByTestId(
      "studio-inspector-control-class-gt3-color",
    ) as HTMLInputElement;
    const original = gt3.value;
    // Sin override no hay nada que restablecer: el boton no se pinta.
    expect(screen.queryByTestId("studio-inspector-control-class-gt3-color-reset")).toBeNull();
    expect(screen.queryByTestId("studio-appearance-reset-all")).toBeNull();

    fireEvent.change(gt3, { target: { value: "#ff00aa" } });
    await waitFor(() => {
      expect(
        (screen.getByTestId("studio-inspector-control-class-gt3-color") as HTMLInputElement).value,
      ).toBe("#ff00aa");
    });
    // El aviso del acordeón de diseño deja de mentir sobre el diseño aplicado.
    expect(screen.getByTestId("studio-design-overridden-hint")).toBeTruthy();

    fireEvent.click(screen.getByTestId("studio-inspector-control-class-gt3-color-reset"));
    await waitFor(() => {
      expect(
        (screen.getByTestId("studio-inspector-control-class-gt3-color") as HTMLInputElement).value,
      ).toBe(original);
    });
    expect(screen.queryByTestId("studio-design-overridden-hint")).toBeNull();
  });

  it("cambiar de sistema visual aplica el diseño, no solo filtra la lista", async () => {
    renderStudio();
    const row = await screen.findByTestId("orbit-studio-widget-item-standings-main");
    fireEvent.click(within(row).getByRole("option"));
    const inspector = await screen.findByTestId("orbit-studio-inspector");

    // El `Select` del kit no es un `<select>` nativo: se abre y se elige.
    fireEvent.click(within(inspector).getByRole("combobox", { name: "Sistema" }));
    fireEvent.click(
      within(screen.getByRole("listbox", { name: "Sistema" })).getByRole("option", {
        name: "Vantare Endurance",
      }),
    );

    // El widget se lleva el diseño por defecto del sistema destino, no se queda
    // en el suyo con la lista filtrada.
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio-inspector-meta").textContent).toContain(
        "Endurance Redline",
      );
    });
    expect(
      within(screen.getByTestId("orbit-studio-widget-item-standings-main")).getByRole("option")
        .textContent,
    ).toContain("Vantare Endurance");
  });

  it("cada sección del inspector explica qué hace al dejar el ratón encima", async () => {
    renderStudio();
    const row = await screen.findByTestId("orbit-studio-widget-item-standings-main");
    fireEvent.click(within(row).getByRole("option"));
    const inspector = await screen.findByTestId("orbit-studio-inspector");

    const heads = [...inspector.querySelectorAll(".orbit-studio-acc > summary")];
    expect(heads).toHaveLength(4);
    for (const head of heads) {
      const tip = head.getAttribute("data-tip") ?? "";
      // Una frase, no la clave sin traducir ni el propio título.
      expect(tip.length).toBeGreaterThan(20);
      expect(tip).not.toMatch(/^studio\./);
      expect(head.getAttribute("data-tip-hold")).toBe("true");
    }
  });

  it("los pasos de ancho y alineación de columna llevan su nombre completo", async () => {
    renderStudio();
    const row = await screen.findByTestId("orbit-studio-widget-item-standings-main");
    fireEvent.click(within(row).getByRole("option"));
    const columns = await screen.findByTestId("studio-standings-column-width-driverName");

    // `SM`/`MD`/`LG` no le dicen nada a nadie fuera del código.
    const labels = [...columns.querySelectorAll(".orbit-seg__option")].map((option) =>
      option.textContent?.trim(),
    );
    expect(labels).toEqual(["Estrecha", "Media", "Ancha"]);
    expect(
      [
        ...screen
          .getByTestId("studio-standings-column-align-driverName")
          .querySelectorAll(".orbit-seg__option"),
      ].map((option) => option.textContent?.trim()),
    ).toEqual(["Izquierda", "Derecha"]);
  });

  it("no usa el `title` nativo en ninguno de sus controles", async () => {
    renderStudio();
    await screen.findByTestId("orbit-studio-toolbar");
    expect(screen.getByTestId("orbit-studio").querySelectorAll("[title]").length).toBe(0);
    expect(
      screen.getByTestId("orbit-studio-widget-list").querySelectorAll("[title]").length,
    ).toBe(0);
  });
});
