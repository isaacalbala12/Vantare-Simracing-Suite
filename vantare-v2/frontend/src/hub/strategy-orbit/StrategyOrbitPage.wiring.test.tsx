import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ToastProvider } from "../../ui/orbit/Toast";
import { StrategyOrbitPage, STRATEGY_CONTEXT_SLOT_ID } from "./StrategyOrbitPage";
import type { StrategyRoster } from "./strategy-orbit-bridge";
import orbitGolden from "./testdata/orbit-go-golden.json";
import type {
  StrategyApplicationClient,
  StrategyApplicationCommandV1,
  StrategyApplicationResultV1,
  StrategyOrbitCalculationResultV1,
} from "../../strategy/strategy-application-client";

vi.mock("@wailsio/runtime", () => ({
  Events: { Emit: vi.fn(), On: () => () => undefined },
}));

// El selector de series se alimenta del calendario real.
vi.mock("../orbit/use-calendar-starts", () => ({
  useCalendarStarts: () => ({
    calendar: null,
    target: null,
    starts: [
      {
        seriesId: "gt3-sprint",
        name: "GT3 Sprint Series",
        track: "Spa-Francorchamps",
        at: new Date("2030-01-01T14:00:00Z"),
        tier: "advanced",
        vehicleClass: "GT3",
        durationMin: 45,
        followed: true,
      },
    ],
  }),
}));

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
    {
      id: "isaac",
      name: "Isaac Albalá",
      ini: "IA",
      color: "#ff6a5f",
      cls: "Gold SR",
      dry: [104, 2.75],
      wet: [112, 2.4],
      eco: [105.1, 2.55],
    },
    { id: "sol", name: "Sol Martín", ini: "SM", color: "#78d68b", cls: "Gold", dry: [104, 2.75], wet: [112, 2.4], eco: [105, 2.55] },
    { id: "diego", name: "Diego Ferrer", ini: "DF", color: "#5ccbd5", cls: "Silver", dry: [104, 2.75], wet: [112, 2.4], eco: [105, 2.55] },
    { id: "marta", name: "Marta Ruiz", ini: "MR", color: "#d59b5c", cls: "Silver", dry: [104, 2.75], wet: [112, 2.4], eco: [105, 2.55] },
  ],
  strategies: [
    { id: "s1", name: "Estrategia #1", note: "Mínimo tiempo", mode: "dry", order: ["isaac", "sol", "diego", "marta"] },
  ],
};

const goldenClient: StrategyApplicationClient<unknown> = {
  async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
    if (command.operation !== "calculate_orbit") throw new Error(`unexpected ${command.operation}`);
    expect(command.input.event).toEqual({ durationMinutes: 240, tankLiters: 90, pitLossSeconds: 64 });
    expect(command.input.variants[0].order).toEqual(["isaac", "sol", "diego", "marta"]);
    return {
      protocolVersion: "strategy.application.v1",
      commandId: command.commandId,
      repositoryVersion: 0,
      orbitCalculation: orbitGolden as StrategyOrbitCalculationResultV1,
      recoveredFromBackup: false,
      closed: false,
    };
  },
  cancel: () => false,
  dispose: () => undefined,
};

function mount() {
  const slot = document.createElement("div");
  slot.id = STRATEGY_CONTEXT_SLOT_ID;
  document.body.append(slot);
  render(
    <I18nProvider>
      <ToastProvider>
        <StrategyOrbitPage applicationClient={goldenClient} roster={ROSTER} />
      </ToastProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("StrategyOrbitPage · cableado auditado", () => {
  it("muestra exactamente el golden producido por manual+solver Go", async () => {
    window.localStorage.clear();
    mount();
    const stints = await screen.findAllByTestId(/^orbit-stint-\d+$/);
    expect(stints).toHaveLength(5);
    expect(stints.map((stint) => Number(stint.getAttribute("data-laps")))).toEqual([28, 28, 28, 28, 27]);
    expect(stints.reduce((sum, stint) => sum + Number(stint.getAttribute("data-laps")), 0)).toBe(139);

    fireEvent.click(screen.getByRole("tab", { name: "Estrategias" }));
    expect(await screen.findByText("4:05:12")).toBeTruthy();
  });

  it("la columna «Eventos» lista el evento del puente y ya no explica un límite", async () => {
    window.localStorage.clear();
    mount();
    const events = await screen.findByTestId("orbit-strategy-events");
    // El roster entra como un evento más, no como el único posible.
    expect(within(events).getByText("4 Horas de Imola")).toBeTruthy();
    expect(screen.queryByTestId("orbit-strategy-others")).toBeNull();
    expect(screen.getByTestId("orbit-strategy-migrate").textContent).toContain("Migrar");

    // Y «Mis estrategias» devuelve al menú de entrada (ISA-377).
    fireEvent.click(screen.getByTestId("orbit-strategy-new-event"));
    const home = await screen.findByTestId("orbit-strategy-home");
    // El evento que estaba abierto es el que ofrece «Continuar».
    expect(within(home).getByTestId("orbit-strategy-continue").textContent).toContain(
      "4 Horas de Imola",
    );
  });
});
