import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ToastProvider } from "../../ui/orbit/Toast";
import { StrategyOrbitPage, STRATEGY_CONTEXT_SLOT_ID } from "./StrategyOrbitPage";
import type { StrategyRoster } from "./strategy-orbit-bridge";
import { createStrategyEditorRuntime } from "../../strategy/strategy-editor-store";
import type {
  StrategyApplicationCommandV1,
  StrategyApplicationResultV1,
} from "../../strategy/strategy-application-client";
import {
  createDefaultStrategyEditorDocument,
  type StrategyEditorDocument,
} from "../../strategy/strategy-editor";
import { createStrategyEditorDraft } from "../../strategy/strategy-editor-store";

vi.mock("@wailsio/runtime", () => ({
  Events: { Emit: vi.fn(), On: () => () => undefined },
}));

vi.mock("../orbit/use-calendar-starts", () => ({
  useCalendarStarts: () => ({ calendar: null, starts: [], target: null }),
}));

/** Cliente en memoria del editor real: mismos comandos, sin backend. */
function memoryRuntime() {
  const draft = createStrategyEditorDraft();
  let persisted = { ...draft, payload: createDefaultStrategyEditorDocument() };
  let repositoryVersion = 1;
  const client = {
    async execute(command: StrategyApplicationCommandV1<StrategyEditorDocument>) {
      if (command.operation === "save_revision") {
        persisted = structuredClone(command.draft);
        repositoryVersion += 1;
      }
      const result: StrategyApplicationResultV1<StrategyEditorDocument> = {
        protocolVersion: "strategy.application.v1",
        commandId: command.commandId,
        repositoryVersion,
        draft: structuredClone(persisted),
        savedDraft: structuredClone(persisted),
        recoveredFromBackup: false,
        closed: command.operation === "close",
      };
      return result;
    },
    cancel: () => false,
    dispose: () => undefined,
  };
  return createStrategyEditorRuntime(client);
}

const ROSTER: StrategyRoster = {
  event: {
    startMin: 14 * 60,
    durationMin: 240,
    tankL: 90,
    pitS: 64,
    name: "4 Horas de Imola",
    subtitle: "ELMS · Imola",
    monogram: "4H",
    vehicleClass: "LMGT3",
    team: "Vantare Racing · #58",
    dayLabel: "Sáb 12",
  },
  drivers: [
    { id: "isaac", name: "Isaac Albalá", ini: "IA", color: "#ff6a5f", cls: "Gold SR", dry: [104, 2.75], wet: [112, 2.4], eco: [105.1, 2.55] },
    { id: "sol", name: "Sol Martín", ini: "SM", color: "#78d68b", cls: "Gold SR", dry: [104.6, 2.72], wet: [113, 2.38], eco: [105.7, 2.52] },
    { id: "diego", name: "Diego Ferrer", ini: "DF", color: "#5ccbd5", cls: "Silver SR", dry: [105.3, 2.8], wet: [114.2, 2.44], eco: [106.4, 2.58] },
  ],
  strategies: [
    { id: "s1", name: "Estrategia #1", note: "Mínimo tiempo", mode: "dry", order: ["isaac", "sol", "diego"] },
  ],
};

function mount(roster: StrategyRoster | null = ROSTER) {
  const slot = document.createElement("div");
  slot.id = STRATEGY_CONTEXT_SLOT_ID;
  document.body.append(slot);
  return render(
    <I18nProvider>
      <ToastProvider>
        <StrategyOrbitPage roster={roster} runtimeFactory={memoryRuntime} />
      </ToastProvider>
    </I18nProvider>,
  );
}

async function mounted() {
  mount();
  await screen.findByTestId("orbit-stint-0");
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("StrategyOrbitPage · Resumen", () => {
  it("entra directa a la última estrategia con cabecera de evento y stints", async () => {
    await mounted();

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("4 Horas de Imola");
    expect(screen.getByTestId("orbit-strategy-name").textContent).toBe("Estrategia #1");
    expect(screen.getAllByText("Al día").length).toBeGreaterThan(0);
    // 240 min a ~104.6 s ⇒ 138 vueltas en 5 stints (`13.5`).
    expect(screen.getAllByTestId(/^orbit-stint-\d+$/)).toHaveLength(5);
    expect(screen.getByTestId("orbit-pit-0")).toBeTruthy();
  });

  it("cambiar el piloto de un stint recalcula el plan y marca Borrador", async () => {
    await mounted();

    const hourOf = (index: number) =>
      within(screen.getByTestId(`orbit-stint-${index}`)).getAllByText(/–/)[0].textContent;
    const before = hourOf(2);
    const select = screen.getByLabelText("Piloto del stint 2");
    fireEvent.change(select, { target: { value: "diego" } });

    await waitFor(() => expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0));
    expect((select as HTMLSelectElement).value).toBe("diego");
    // El ritmo de Diego es más lento: las horas de los stints siguientes se mueven.
    expect(hourOf(2)).not.toBe(before);
  });

  it("un override de vueltas fija el stint y redistribuye el resto", async () => {
    await mounted();

    const laps = () =>
      screen
        .getAllByTestId(/^orbit-stint-\d+$/)
        .map((card) => Number(card.getAttribute("data-laps")));
    const original = laps();

    fireEvent.click(screen.getByTestId("orbit-stint-edit-0"));
    const input = await screen.findByLabelText("Vueltas");
    fireEvent.blur(input, { target: { value: "20" } });

    await waitFor(() => expect(laps()[0]).toBe(20));
    expect(screen.getByTestId("orbit-stint-manual-0")).toBeTruthy();
    const next = laps();
    expect(next.reduce((sum, value) => sum + value, 0)).toBe(
      original.reduce((sum, value) => sum + value, 0),
    );
    expect(next[1]).toBeGreaterThan(original[1]);
  });

  it("Restablecer devuelve el estado a Al día", async () => {
    await mounted();

    fireEvent.change(screen.getByLabelText("Piloto del stint 2"), { target: { value: "diego" } });
    await waitFor(() => expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByTestId("orbit-strategy-reset"));
    await waitFor(() => expect(screen.getAllByText("Al día").length).toBeGreaterThan(0));
    expect((screen.getByLabelText("Piloto del stint 2") as HTMLSelectElement).value).toBe("sol");
  });
});

describe("StrategyOrbitPage · neumáticos", () => {
  it("la pestaña Neumáticos oculta la de Pilotos", async () => {
    await mounted();

    expect(screen.getByTestId("orbit-strategy-drivers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Neumáticos" }));

    await screen.findByTestId("orbit-strategy-tyres");
    expect(screen.queryByTestId("orbit-strategy-drivers")).toBeNull();
  });

  it("tocar-y-tocar con Enter monta el juego y el segundo uso baja la condición", async () => {
    await mounted();

    fireEvent.click(screen.getByRole("button", { name: "Neumáticos" }));
    const condition = () => {
      const text = screen.getByTestId("orbit-tyre-item-S-05").textContent ?? "";
      return Number(/(\d+) %/.exec(text)?.[1]);
    };
    const before = condition();
    fireEvent.click(await screen.findByTestId("orbit-tyre-item-S-05"));

    fireEvent.click(screen.getByTestId("orbit-stint-edit-0"));
    const fr = await screen.findByTestId("orbit-corner-slot-FR");
    fireEvent.keyDown(fr, { key: "Enter" });

    await waitFor(() => expect(fr.getAttribute("data-state")).toBe("filled"));
    expect(fr.textContent).toContain("S-05");
    // Un uso más: la condición baja 12 puntos (`13.5`).
    await waitFor(() => expect(condition()).toBe(before - 12));

    // Y otro uso más en la misma tarjeta vuelve a bajarla.
    fireEvent.click(screen.getByTestId("orbit-tyre-item-S-05"));
    fireEvent.keyDown(await screen.findByTestId("orbit-corner-slot-RR"), { key: "Enter" });
    await waitFor(() => expect(condition()).toBe(before - 24));
  });

  it("arrastrar un juego a una esquina lo monta", async () => {
    await mounted();

    fireEvent.click(screen.getByTestId("orbit-stint-edit-0"));
    const rl = await screen.findByTestId("orbit-corner-slot-RL");
    fireEvent.drop(rl, {
      dataTransfer: { getData: () => "S-06", types: ["text/plain"] },
    });

    await waitFor(() => expect(rl.textContent).toContain("S-06"));
  });
});

describe("StrategyOrbitPage · ⚙ Ajustes", () => {
  it("el menú abre con el botón y cierra con Esc", async () => {
    await mounted();

    const trigger = screen.getByTestId("orbit-strategy-settings");
    expect(trigger.textContent).toContain("Ajustes");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu", { name: "Ajustes del evento" });
    expect(within(menu).getByText("Exportar plan")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("StrategyOrbitPage · Estrategias", () => {
  async function strategiesTab() {
    await mounted();
    fireEvent.click(screen.getByRole("tab", { name: "Estrategias" }));
    return screen.findByTestId("orbit-strategy-strategies");
  }

  it("con una sola estrategia no hay nada que comparar", async () => {
    await strategiesTab();

    expect(screen.getByTestId("orbit-strat-s1")).toBeTruthy();
    expect(screen.getByTestId("orbit-strategy-verdict").textContent).toContain(
      "no hay nada que comparar",
    );
  });

  it("duplicar crea un borrador y el veredicto compara vueltas", async () => {
    await strategiesTab();

    fireEvent.click(screen.getByTestId("orbit-strat-duplicate-s1"));
    const copy = await screen.findByTestId("orbit-strat-local-1");
    expect(copy.textContent).toContain("Estrategia #1 (copia)");
    expect(within(copy).getByText("Borrador")).toBeTruthy();

    // Mismo modo y mismo orden: empatan en vueltas y nadie ahorra paradas.
    const verdict = screen.getByTestId("orbit-strategy-verdict").textContent ?? "";
    expect(verdict).toContain("completa");
    expect(verdict).toContain("vueltas frente a");
    expect(verdict).toContain("empate");
    expect(verdict).toContain("dobla turno");
  });

  it("Activar cambia la estrategia del panel y del crumb", async () => {
    await strategiesTab();

    fireEvent.click(screen.getByTestId("orbit-strat-duplicate-s1"));
    fireEvent.click(await screen.findByTestId("orbit-strat-activate-local-1"));

    await waitFor(() =>
      expect(screen.getByTestId("orbit-strategy-name").textContent).toBe("Estrategia #1 (copia)"),
    );
    expect(screen.getByTestId("orbit-strat-local-1").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("orbit-strat-s1").getAttribute("data-active")).toBeNull();
    // La activa ya no ofrece Activar, y la anterior sí.
    expect(screen.getByTestId("orbit-strat-activate-s1")).toBeTruthy();
  });

  it("«+ Nueva estrategia» la crea y la deja activa", async () => {
    await strategiesTab();

    fireEvent.click(screen.getByTestId("orbit-strategy-new-card"));

    await waitFor(() =>
      expect(screen.getByTestId("orbit-strategy-name").textContent).toBe("Estrategia #2"),
    );
    expect(screen.getByTestId("orbit-strat-local-1").getAttribute("data-active")).toBe("true");
  });
});

describe("StrategyOrbitPage · Disponibilidad", () => {
  it("añade un tramo y recorta el que solapaba", async () => {
    await mounted();
    fireEvent.click(screen.getByRole("tab", { name: "Disponibilidad de pilotos" }));
    await screen.findByTestId("orbit-strategy-availability");

    // Cada piloto entra con un único tramo disponible de 13:00 a 18:30.
    expect(screen.getAllByTestId("orbit-availability-cell")).toHaveLength(3);

    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "no" } });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "15:00" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "16:00" } });
    fireEvent.submit(screen.getByTestId("orbit-availability-form"));

    // El tramo interior parte el de Isaac en tres (`13.5`).
    await waitFor(() => expect(screen.getAllByTestId("orbit-availability-cell")).toHaveLength(5));
    expect(
      screen.getByLabelText("Isaac Albalá · 15:00–16:00 · no disponible"),
    ).toBeTruthy();
  });

  it("una hora final anterior a la inicial no cambia el tablero", async () => {
    await mounted();
    fireEvent.click(screen.getByRole("tab", { name: "Disponibilidad de pilotos" }));
    await screen.findByTestId("orbit-strategy-availability");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "16:00" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "15:00" } });
    fireEvent.submit(screen.getByTestId("orbit-availability-form"));

    expect(await screen.findByText("Tramo no válido")).toBeTruthy();
    expect(screen.getAllByTestId("orbit-availability-cell")).toHaveLength(3);
  });
});

describe("StrategyOrbitPage · estado vacío", () => {
  it("sin evento muestra «Elige evento y pilotos»", async () => {
    mount(null);

    const empty = await screen.findByTestId("orbit-strategy-empty");
    expect(empty.textContent).toContain("Elige evento y pilotos");
    expect(screen.queryByTestId("orbit-strategy-overview")).toBeNull();
  });
});
