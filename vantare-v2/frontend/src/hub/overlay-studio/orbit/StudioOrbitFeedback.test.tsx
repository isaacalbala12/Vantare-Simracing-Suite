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

vi.mock("@wailsio/runtime", () => ({
  Events: { On: vi.fn(() => () => undefined), Emit: vi.fn() },
}));

import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { standingsDefinition } from "../../../overlay/widget-types/standings/standings-definition";
import { parseStandingsContent } from "../../../overlay/widget-types/standings/standings-content";
import { I18nProvider } from "../../../i18n/I18nProvider";
import { StudioTelemetryProvider } from "../canvas/StudioTelemetryProvider";
import { StudioConfirmProvider } from "../components/StudioConfirmProvider";
import { StudioProvider } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { createTestTelemetryCoordinator } from "../test-helpers";
import { StudioOrbitLayout } from "./StudioOrbitLayout";
import { STUDIO_CONTEXT_SLOT_ID, STUDIO_TOPBAR_SLOT_ID } from "./studio-orbit-slots";

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

function renderStudio(document: ProfileDocumentV3) {
  const context = window.document.createElement("div");
  context.id = STUDIO_CONTEXT_SLOT_ID;
  const topbar = window.document.createElement("div");
  topbar.id = STUDIO_TOPBAR_SLOT_ID;
  window.document.body.append(context, topbar);

  return render(
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
    </I18nProvider>,
  );
}

async function select(widgetId: string) {
  const row = await screen.findByTestId(`orbit-studio-widget-item-${widgetId}`);
  fireEvent.click(within(row).getByRole("option"));
  await waitFor(() => {
    expect(screen.getByTestId("orbit-studio-inspector").getAttribute("data-widget-id")).toBe(
      widgetId,
    );
  });
  return row;
}

afterEach(() => {
  cleanup();
  window.document.getElementById(STUDIO_CONTEXT_SLOT_ID)?.remove();
  window.document.getElementById(STUDIO_TOPBAR_SLOT_ID)?.remove();
});

beforeEach(() => {
  window.localStorage.clear();
  // Ventana ancha: por debajo de `STUDIO_AUTO_FOLD_INSPECTOR_WIDTH` el
  // inspector se pliega solo (D-R4-4) y estas pruebas van sobre el desplegado.
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
});

/** A1 — el marco, los tiradores y el ancla de la etiqueta cuelgan de una sola caja. */
describe("marco de seleccion cenido al widget", () => {
  it("agrupa marco y los ocho tiradores bajo el envoltorio de seleccion", async () => {
    renderStudio(buildDocument([standingsDefinition.createDefault("standings-1")]));
    await select("standings-1");

    const selection = screen.getByTestId("studio-widget-selection-standings-1");
    expect(within(selection).getByTestId("studio-widget-frame-chrome-standings-1")).toBeTruthy();
    for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      expect(
        within(selection).getByTestId(`studio-resize-handle-${handle}-standings-1`),
      ).toBeTruthy();
    }
  });

  it("cine la seleccion a la caja pintada en dos disenos y tamanos distintos", async () => {
    const standings = standingsDefinition.createDefault("standings-1");
    standings.layout = { ...standings.layout, w: 380, h: 540 };
    const delta = deltaDefinition.createDefault("delta-1");
    delta.layout = { ...delta.layout, w: 90, h: 100 };
    renderStudio(buildDocument([standings, delta]));

    for (const id of ["standings-1", "delta-1"]) {
      await select(id);
      const selection = screen.getByTestId(`studio-widget-selection-${id}`);
      // El envoltorio es el ancla unica: la etiqueta lo lee para colocarse.
      expect(selection.getAttribute("data-widget-selection")).toBe("true");
      expect(selection.parentElement?.getAttribute("data-testid")).toBe(
        `studio-widget-frame-${id}`,
      );
    }
  });
});

/** A2 — la etiqueta se ancla al widget y vive dentro de su caja de seleccion. */
describe("etiqueta de seleccion", () => {
  it("se pinta dentro de la caja de seleccion y sin contra-escala", async () => {
    renderStudio(buildDocument([standingsDefinition.createDefault("standings-1")]));
    await select("standings-1");

    const tag = screen.getByTestId("orbit-studio-selection-tag");
    expect(tag.className).toContain("orbit-studio-stage__tag");
    // Hija de la caja de seleccion via portal: el navegador la mueve con el
    // marco durante el arrastre imperativo (movimiento atomico).
    expect(tag.closest("[data-widget-selection]")).toBeTruthy();
    // Nada de contra-escalas: coords logicas locales; la escena ya escala.
    expect(tag.style.transform).toBe("");
    expect(tag.style.left.endsWith("px")).toBe(true);
    expect(tag.style.top.endsWith("px")).toBe(true);
  });

  it("lleva el nombre y el tamano del widget seleccionado", async () => {
    const standings = standingsDefinition.createDefault("standings-1");
    standings.name = "Clasificacion";
    standings.layout = { ...standings.layout, w: 380, h: 540 };
    renderStudio(buildDocument([standings]));
    await select("standings-1");

    const copy = screen.getByTestId("orbit-studio-selection-tag-copy").textContent ?? "";
    expect(copy).toContain("Clasificacion");
    expect(copy).toContain("380");
    expect(copy).toContain("540");
  });
});

/** A3 — el Select "Diseno" refleja el diseno realmente aplicado. */
describe("diseno aplicado en el inspector", () => {
  it("no dice 'Sin diseno aplicado' en un widget con el diseno por defecto", async () => {
    renderStudio(buildDocument([standingsDefinition.createDefault("standings-1")]));
    await select("standings-1");

    // El `Select` del kit es un combobox propio: lo que ve el usuario es la
    // copia del disparador, no un `<option>` seleccionado.
    const variant = await screen.findByRole("combobox", { name: "Diseño" });
    await waitFor(() => {
      expect(variant.textContent?.trim()).not.toBe("Sin diseño aplicado");
    });
    expect(variant.textContent?.trim()).toBeTruthy();

    // Y el catalogo ya no ofrece la entrada vacia: hay un diseno puesto.
    fireEvent.click(variant);
    const list = await screen.findByRole("listbox");
    const labels = within(list)
      .getAllByRole("option")
      .map((option) => option.textContent?.trim() ?? "");
    expect(labels).not.toContain("Sin diseño aplicado");
    // El diseno del disparador es una de las opciones, y ademas es la marcada
    // (el kit le anade el check). Es "Original Base" en un standings recien
    // creado, que es justo lo que el Select negaba.
    const current = variant.textContent?.trim() ?? "";
    expect(current).toBe("Original Base");
    expect(labels.some((label) => label.startsWith(current))).toBe(true);
    expect(
      within(list)
        .getAllByRole("option")
        .find((option) => option.getAttribute("aria-selected") === "true")
        ?.textContent,
    ).toContain(current);
  });
});

/** A4 — un widget oculto se ve, se selecciona y se puede volver a mostrar. */
describe("widget oculto", () => {
  it("mantiene el ojo accionable en la lista y lo devuelve a visible", async () => {
    const standings = standingsDefinition.createDefault("standings-1");
    standings.behavior = { ...standings.behavior, enabled: false };
    renderStudio(buildDocument([standings]));

    const row = await screen.findByTestId("orbit-studio-widget-item-standings-1");
    expect(row.getAttribute("data-enabled")).toBe("false");

    const eye = screen.getByTestId("orbit-studio-widget-eye-standings-1");
    expect(eye.getAttribute("data-tip")).toContain("Mostrar");
    expect(eye.hasAttribute("disabled")).toBe(false);
    expect(eye.hasAttribute("hidden")).toBe(false);

    // La fila oculta sigue siendo seleccionable.
    fireEvent.click(within(row).getByRole("option"));
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio-inspector").getAttribute("data-widget-id")).toBe(
        "standings-1",
      );
    });

    fireEvent.click(eye);
    await waitFor(() => {
      expect(
        screen.getByTestId("orbit-studio-widget-item-standings-1").getAttribute("data-enabled"),
      ).toBe("true");
    });
  });

  it("marca 'oculto' en la etiqueta del lienzo y ofrece ahi mismo Mostrar", async () => {
    const standings = standingsDefinition.createDefault("standings-1");
    standings.behavior = { ...standings.behavior, enabled: false };
    renderStudio(buildDocument([standings]));
    await select("standings-1");

    const tag = screen.getByTestId("orbit-studio-selection-tag");
    expect(tag.getAttribute("data-hidden")).toBe("true");
    expect(screen.getByTestId("orbit-studio-selection-tag-copy").textContent).toContain("oculto");

    fireEvent.click(screen.getByTestId("orbit-studio-selection-show"));
    await waitFor(() => {
      expect(
        screen.getByTestId("orbit-studio-selection-tag").getAttribute("data-hidden"),
      ).toBeNull();
    });
    expect(screen.queryByTestId("orbit-studio-selection-show")).toBeNull();
  });

  it("la cabecera del inspector refleja el estado y permite mostrar", async () => {
    const standings = standingsDefinition.createDefault("standings-1");
    standings.behavior = { ...standings.behavior, enabled: false };
    renderStudio(buildDocument([standings]));
    await select("standings-1");

    const toggle = screen.getByTestId("orbit-studio-inspector-visibility");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.getAttribute("data-tip")).toBe("Mostrar widget");

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(
        screen.getByTestId("orbit-studio-inspector-visibility").getAttribute("aria-pressed"),
      ).toBe("false");
    });
  });
});

/** A5 — la seccion de contenido de standings, sin controles nativos. */
describe("contenido de standings en piel Orbit", () => {
  it("no deja ni un checkbox ni un select nativo en la seccion", async () => {
    renderStudio(buildDocument([standingsDefinition.createDefault("standings-1")]));
    await select("standings-1");

    const section = await screen.findByTestId("studio-inspector-section-content");
    expect(section.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(section.querySelectorAll("select").length).toBe(0);
    expect(section.querySelectorAll("[title]").length).toBe(0);
    // Controles del kit: Check (role checkbox) y Seg (role group).
    expect(section.querySelectorAll('[role="checkbox"].orbit-check').length).toBeGreaterThan(0);
    expect(section.querySelectorAll(".orbit-seg").length).toBeGreaterThan(0);
  });

  it("cambia el numero de filas con el Seg y lo escribe en el documento", async () => {
    renderStudio(buildDocument([standingsDefinition.createDefault("standings-1")]));
    await select("standings-1");

    const rows = await screen.findByTestId("studio-standings-row-count");
    const five = within(rows).getByRole("button", { name: "5" });
    expect(five.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(five);
    await waitFor(() => {
      expect(
        within(screen.getByTestId("studio-standings-row-count"))
          .getByRole("button", { name: "5" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });
  });

  it("mantiene los handlers reales: visibilidad y orden de columnas", async () => {
    const standings = standingsDefinition.createDefault("standings-1");
    const initial = parseStandingsContent(standings.content);
    const first = initial.columns[0];
    const second = initial.columns[1];
    renderStudio(buildDocument([standings]));
    await select("standings-1");

    // El Check apaga la columna.
    const toggle = await screen.findByTestId(`studio-standings-column-toggle-${first.id}`);
    expect(toggle.getAttribute("aria-checked")).toBe(String(first.enabled));
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(
        screen
          .getByTestId(`studio-standings-column-toggle-${first.id}`)
          .getAttribute("aria-checked"),
      ).toBe(String(!first.enabled));
    });

    // El boton de subir reordena: la segunda columna pasa a ser la primera.
    fireEvent.click(screen.getByTestId(`studio-standings-column-down-${first.id}`));
    await waitFor(() => {
      const items = Array.from(
        screen.getByTestId("studio-standings-columns").querySelectorAll("li"),
      );
      expect(items[0]?.getAttribute("data-testid")).toBe(`studio-standings-column-${second.id}`);
    });
  });

  it("desactiva subir en la primera columna y bajar en la ultima", async () => {
    const standings = standingsDefinition.createDefault("standings-1");
    const content = parseStandingsContent(standings.content);
    const first = content.columns[0];
    const last = content.columns[content.columns.length - 1];
    renderStudio(buildDocument([standings]));
    await select("standings-1");

    expect(
      (await screen.findByTestId(`studio-standings-column-up-${first.id}`)).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
    expect(
      screen.getByTestId(`studio-standings-column-down-${last.id}`).hasAttribute("disabled"),
    ).toBe(true);
  });
});
