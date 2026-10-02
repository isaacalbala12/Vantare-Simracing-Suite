import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SideRaces } from "./SideRaces";
import type { RaceStart } from "../../orbit/race-starts";

const labels = {
  title: "Próximas carreras",
  seeAll: "Ver todas",
  in: "en {{time}}",
  empty: "Sin salidas",
};

function raceStart(at: number, seriesId = "weekly"): RaceStart {
  return {
    seriesId,
    name: "Serie semanal",
    track: "Circuito",
    tier: "weekly",
    licenseLabel: "",
    note: "",
    intervalMin: 60,
    vehicleClass: "",
    durationMin: 20,
    at: new Date(at),
    followed: false,
  };
}

function renderSideRaces(starts: RaceStart[], now?: Date) {
  return render(
    <SideRaces
      starts={starts}
      onSeeAll={() => {}}
      onSelect={() => {}}
      labels={labels}
      {...(now ? { now } : {})}
    />,
  );
}

/** Delays con los que el componente armó `window.setTimeout`. */
function armedDelays(spy: ReturnType<typeof vi.spyOn>): number[] {
  return spy.mock.calls.map(([, ms]) => ms as number);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SideRaces", () => {
  it("muestra la cuenta atrás de la salida más próxima", () => {
    const now = new Date("2026-09-10T12:00:00");
    renderSideRaces([raceStart(now.getTime() + 2 * 3_600_000)], now);
    expect(screen.getByText("en 2h 00m")).toBeTruthy();
  });

  it("tickea cada 30 s cuando la próxima salida está a más de 1 h", () => {
    vi.useFakeTimers();
    const arm = vi.spyOn(window, "setTimeout");
    renderSideRaces([raceStart(Date.now() + 2 * 3_600_000)]);
    expect(armedDelays(arm)).toContain(30_000);
    expect(armedDelays(arm)).not.toContain(1_000);
  });

  it("tickea cada 1 s cuando la próxima salida está a menos de 1 h", () => {
    vi.useFakeTimers();
    const arm = vi.spyOn(window, "setTimeout");
    renderSideRaces([raceStart(Date.now() + 30 * 60_000)]);
    expect(armedDelays(arm)).toContain(1_000);
  });

  it("reevalúa la cadencia en cada tic y cruza a 1 s al entrar en la última hora", () => {
    vi.useFakeTimers();
    const arm = vi.spyOn(window, "setTimeout");
    // Salida a 1 h 45 s: empieza lejos; al avanzar 60 s queda dentro de la ventana.
    renderSideRaces([raceStart(Date.now() + 3_600_000 + 45_000)]);
    expect(armedDelays(arm)).toEqual([30_000]);

    act(() => {
      vi.advanceTimersByTime(30_000); // tic lejano: aún faltan 1 h 15 s
    });
    expect(armedDelays(arm).at(-1)).toBe(30_000);

    act(() => {
      vi.advanceTimersByTime(30_000); // tic lejano: ya faltan 45 s
    });
    expect(armedDelays(arm).at(-1)).toBe(1_000);
  });

  it("con `now` inyectado no arma reloj: el reloj queda congelado para el test", () => {
    vi.useFakeTimers();
    renderSideRaces([raceStart(Date.now() + 30 * 60_000)], new Date());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("desmontar cancela el tic pendiente", () => {
    vi.useFakeTimers();
    const { unmount } = renderSideRaces([raceStart(Date.now() + 30 * 60_000)]);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
