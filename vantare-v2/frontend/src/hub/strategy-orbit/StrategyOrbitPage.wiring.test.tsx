import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ToastProvider } from "../../ui/orbit/Toast";
import { StrategyOrbitPage, STRATEGY_CONTEXT_SLOT_ID } from "./StrategyOrbitPage";
import type { StrategyRoster } from "./strategy-orbit-bridge";

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
  ],
  strategies: [
    { id: "s1", name: "Estrategia #1", note: "Mínimo tiempo", mode: "dry", order: ["isaac"] },
  ],
};

function mount() {
  const slot = document.createElement("div");
  slot.id = STRATEGY_CONTEXT_SLOT_ID;
  document.body.append(slot);
  render(
    <I18nProvider>
      <ToastProvider>
        <StrategyOrbitPage roster={ROSTER} />
      </ToastProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("StrategyOrbitPage · cableado auditado", () => {
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
