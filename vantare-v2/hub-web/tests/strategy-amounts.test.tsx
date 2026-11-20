// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostError, Request } from "../src/contract/generated/contract";
import type { StrategyView } from "../src/contract/generated/strategy";
import { createMockHost } from "../src/mock/host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { HostFailure } from "../src/renderer/bridge/client";
import {
  amountMessage,
  parseAmount,
  pitTime,
} from "../src/renderer/screens/strategy/stopAmounts";
import { StrategyScreen } from "../src/renderer/ui/strategy/StrategyScreen";

afterEach(cleanup);

// Fixing the fuel and the energy of a stop by hand, seen from the screen. The mock
// host answers like the real one: `plannedFuji` is Opus' Fuji case (236 laps,
// stops on laps 43, 85, 127, 170 and 212) with the limits the crate gives for it.
// Nothing here works a limit out: every number on screen is the host's.

function clientFor(
  scene: string,
  override?: (request: Request) => HostError | undefined,
  mapView?: (view: StrategyView) => StrategyView,
) {
  const host = createMockHost(`strategy-${scene}`);
  const request = vi.fn(async (request: Request) => {
    const error = override?.(request);
    if (error) throw new HostFailure(error);
    const reply = host({ kind: "request", id: 1, request });
    if (reply?.kind === "failure") throw new HostFailure(reply.error);
    if (reply?.kind === "response") {
      const value = reply.result;
      return mapView &&
        (value.method === "strategy.open" ||
          value.method === "strategy.view" ||
          value.method === "strategy.setStopService" ||
          value.method === "strategy.clearStopServices")
        ? { ...value, value: mapView(value.value as StrategyView) }
        : value;
    }
    throw Error("Missing strategy response");
  });
  return Object.assign(request, { host });
}
type Client = ReturnType<typeof clientFor>;
function mount(...args: Parameters<typeof clientFor>) {
  const request = clientFor(...args);
  render(
    <SectionChromeProvider>
      <SectionTabsSlot />
      <StrategyScreen client={{ request }} />
    </SectionChromeProvider>,
  );
  return request;
}
const button = (name: string) => screen.getByRole("button", { name });
const click = (name: string) => fireEvent.click(button(name));
const tab = (name: string) => screen.getByRole("tab", { name });
const heading = (name: string) => screen.findByRole("heading", { name });
const status = () => screen.getByRole("status").textContent;
const calls = <M extends Request["method"]>(request: Client, method: M) =>
  request.mock.calls
    .map(([r]) => r)
    .filter((r): r is Extract<Request, { method: M }> => r.method === method);
async function lastView(request: Client) {
  let seen: StrategyView | undefined;
  for (const result of request.mock.results) {
    try {
      seen = ((await result.value) as { value: StrategyView }).value;
    } catch {
      // a refusal sends no view
    }
  }
  if (!seen) throw Error("no view yet");
  return seen;
}

async function stops(
  scene = "plannedFuji",
  override?: Parameters<typeof clientFor>[1],
  mapView?: Parameters<typeof clientFor>[2],
) {
  const request = mount(scene, override, mapView);
  await screen.findByRole("heading", { name: "Tus estrategias" });
  click("Continuar");
  fireEvent.click(tab("Plan"));
  await heading("Plan calculado");
  click("Ajustar paradas");
  await heading("Ajustar paradas");
  return request;
}
function pick(stop: number, lap: number) {
  fireEvent.click(
    screen.getByRole("radio", {
      name: new RegExp(`^Parada ${stop}, vuelta ${lap}`),
    }),
  );
}
const mode = (what: "Combustible" | "Energía", stop: number) =>
  screen.getByRole("group", {
    name: `${what} de la parada ${stop}: cómo se decide`,
  });
const manual = (what: "Combustible" | "Energía", stop: number) =>
  fireEvent.click(
    within(mode(what, stop)).getByRole("radio", { name: "A mano" }),
  );
const automatic = (what: "Combustible" | "Energía", stop: number) =>
  fireEvent.click(
    within(mode(what, stop)).getByRole("radio", { name: "Automático" }),
  );
const amount = (what: "Combustible" | "Energía", stop: number) =>
  screen.getByRole("textbox", {
    name: `${what} de la parada ${stop}`,
  }) as HTMLInputElement;
function type(input: HTMLInputElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}
async function fix(
  what: "Combustible" | "Energía",
  stop: number,
  text: string,
) {
  manual(what, stop);
  const input = await waitFor(() => amount(what, stop));
  type(input, text);
}

describe("the amounts of a stop", () => {
  it("shows what the calculation loads and what the host says a stop admits", async () => {
    await stops();
    pick(2, 85);
    const fuel = mode("Combustible", 2);
    expect(
      (
        within(fuel).getByRole("radio", {
          name: "Automático",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(screen.getByText("+77 L")).toBeTruthy();
    expect(screen.getByText("+97 %")).toBeTruthy();
    // the limits of the host for the second stop: 73–81 L, not the 77 of the sketch
    expect(screen.getByText("Puedes fijar de 73 a 81 L.")).toBeTruthy();
    expect(screen.queryByText(/77 L\./)).toBeNull();
    // arriving is a stretch of the model, not a figure
    expect(screen.getByText("Se llega con entre 0,4 y 4,4 L.")).toBeTruthy();
    expect(screen.getByText("Puedes fijar de 96 a 99 %.")).toBeTruthy();
    expect(screen.getAllByText("lo decide el cálculo")).toHaveLength(2);
    // the pit time of the stop, as the host sends it
    expect(screen.getByText("Tiempo en boxes")).toBeTruthy();
    expect(screen.getByText("1:02,0")).toBeTruthy();
    // nothing is fixed: no pin, no way to go back
    expect(screen.queryByText("fijado por ti")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Volver todo a automático" }),
    ).toBeNull();
    // tyres are not an amount to fix (#2691)
    expect(screen.queryByText(/Cambiar neumáticos/)).toBeNull();
    expect(screen.queryByRole("group", { name: /Neumáticos/ })).toBeNull();
  });

  it("fixes the fuel at what the plan loads when «A mano» is chosen, keeping the energy automatic", async () => {
    const request = await stops();
    pick(2, 85);
    manual("Combustible", 2);
    await heading("Plan modificado");
    const view = await lastView(request);
    expect(calls(request, "strategy.setStopService")).toEqual([
      {
        method: "strategy.setStopService",
        revision: calls(request, "strategy.setStopService")[0].revision,
        computeId: view.plan.computeId,
        index: 1,
        fuelLiters: 77,
        vePercent: null,
        changeTyres: null,
      },
    ]);
    expect(amount("Combustible", 2).value).toBe("77");
    expect(view.plan.edit?.stops[1].fixed).toEqual({
      fuelLiters: 77,
      vePercent: null,
      changeTyres: null,
    });
    // the pin is where the host says something is fixed
    expect(screen.getAllByText("fijado por ti")).toHaveLength(1);
    expect(
      screen.getByRole("radio", {
        name: "Parada 2, vuelta 85, con cantidades fijadas por ti",
      }),
    ).toBeTruthy();
    // the file does not change with it
    expect(
      document
        .querySelector(".strategy-file-state")
        ?.getAttribute("data-state"),
    ).toBe("saved");
  });

  it("sends both amounts of the stop each time and null for the automatic one", async () => {
    const request = await stops();
    pick(2, 85);
    await fix("Combustible", 2, "75");
    await waitFor(() =>
      expect(calls(request, "strategy.setStopService")).toHaveLength(2),
    );
    await fix("Energía", 2, "98");
    await waitFor(() =>
      expect(calls(request, "strategy.setStopService")).toHaveLength(4),
    );
    const sent = calls(request, "strategy.setStopService");
    expect(sent[1]).toMatchObject({
      index: 1,
      fuelLiters: 75,
      vePercent: null,
    });
    expect(sent[3]).toMatchObject({ index: 1, fuelLiters: 75, vePercent: 98 });
    // back to automatic for the fuel only
    automatic("Combustible", 2);
    await waitFor(() =>
      expect(calls(request, "strategy.setStopService")).toHaveLength(5),
    );
    expect(calls(request, "strategy.setStopService")[4]).toMatchObject({
      fuelLiters: null,
      vePercent: 98,
    });
    expect(
      screen.queryByRole("textbox", { name: "Combustible de la parada 2" }),
    ).toBeNull();
  });

  it("accepts a decimal comma and a decimal point", async () => {
    const request = await stops();
    pick(2, 85);
    manual("Combustible", 2);
    const input = await waitFor(() => amount("Combustible", 2));
    type(input, "74,0");
    await waitFor(() =>
      expect(calls(request, "strategy.setStopService")).toHaveLength(2),
    );
    expect(calls(request, "strategy.setStopService")[1].fuelLiters).toBe(74);
  });

  it("moves by the step of the grid with the buttons and says the stop it acts on", async () => {
    const request = await stops();
    pick(2, 85);
    manual("Combustible", 2);
    await waitFor(() => amount("Combustible", 2));
    click("Añadir 1 L al combustible de la parada 2");
    await waitFor(() =>
      expect(calls(request, "strategy.setStopService")).toHaveLength(2),
    );
    expect(calls(request, "strategy.setStopService")[1].fuelLiters).toBe(78);
    await waitFor(() => expect(amount("Combustible", 2).value).toBe("78"));
    click("Quitar 1 L al combustible de la parada 2");
    await waitFor(() =>
      expect(calls(request, "strategy.setStopService")).toHaveLength(3),
    );
    expect(calls(request, "strategy.setStopService")[2].fuelLiters).toBe(77);
  });

  it("warns, without blocking, when a valid amount leaves no plan, with the lap the host gives", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "60");
    const warning = await screen.findByText(
      /^Con 60 L no hay plan: te quedarías sin combustible en la vuelta 121/,
    );
    expect(warning.textContent).toContain("Hace falta al menos 73 L.");
    // a warning is not an alert, and the amount is kept
    expect(warning.closest('[role="alert"]')).toBeNull();
    expect(amount("Combustible", 2).value).toBe("60");
    // the lap is the host's, not worked out here
    expect(warning.textContent).not.toContain("parada 3");
  });

  it("does not make up a lap when the host sends none", async () => {
    await stops("plannedFuji", undefined, (view: StrategyView) => {
      for (const stop of view.plan.edit?.stops ?? []) {
        if (stop.limits.kind === "exact" && stop.limits.fuel.kind === "used")
          stop.limits.fuel.failLap = null;
      }
      return view;
    });
    pick(2, 85);
    await fix("Combustible", 2, "72");
    const warning = await screen.findByText(/^Con 72 L llegas a meta/);
    expect(warning.textContent).toContain("sin la reserva que pediste");
    expect(warning.textContent).not.toMatch(/vuelta \d/);
  });

  it("names the amounts the host would take when one is off the grid", async () => {
    const request = await stops();
    pick(2, 85);
    manual("Combustible", 2);
    await heading("Plan modificado");
    const held = (await lastView(request)).plan.edit?.stops[1].fixed;
    expect(held).toEqual({
      fuelLiters: 77,
      vePercent: null,
      changeTyres: null,
    });
    type(await waitFor(() => amount("Combustible", 2)), "70,5");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Escribe litros enteros: el cálculo carga de 1 L en 1 L. Puedes poner 70 o 71.",
    );
    const input = amount("Combustible", 2);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      input.getAttribute("aria-describedby")?.split(" ").includes(alert.id),
    ).toBe(true);
    // nothing changed: the host keeps the last valid amount it had
    const view = await lastView(request);
    expect(view.plan.edit?.stops[1].fixed).toEqual(held);
    expect(screen.getAllByText("fijado por ti")).toHaveLength(1);
    // what was typed stays to be corrected, and fixing it clears the error
    expect(input.value).toBe("70,5");
    // it says what the plan keeps meanwhile
    expect(screen.getByText("El plan se queda con 77 L.")).toBeTruthy();
    fireEvent.change(input, { target: { value: "71" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    await heading("Plan modificado");
    expect(calls(request, "strategy.setStopService").at(-1)).toMatchObject({
      fuelLiters: 71,
    });
  });

  it("refuses what does not fit in the tank or the energy, and what is negative", async () => {
    const request = await stops();
    pick(2, 85);
    await fix("Combustible", 2, "90");
    await screen.findByRole("alert");
    await fix("Energía", 2, "103");
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    const alerts = screen.getAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      "No cabe: el depósito no admite más de 82 L.",
      "No cabe: la energía no puede pasar de 100 %.",
    ]);
    type(amount("Combustible", 2), "-3");
    await screen.findByText("No puede ser menos de 0.");
    // not a number: said here, without asking the host
    const asked = calls(request, "strategy.setStopService").length;
    type(amount("Energía", 2), "mucha");
    await screen.findByText("Escribe solo un número, por ejemplo 70.");
    expect(calls(request, "strategy.setStopService")).toHaveLength(asked);
    // nothing was applied: the host still holds what the buttons «A mano» set
    expect((await lastView(request)).plan.edit?.stops[1].fixed).toEqual({
      fuelLiters: 77,
      vePercent: 97,
      changeTyres: null,
    });
    // the single status line stays quiet: errors have their own alert
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("announces what it did in the single status line", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "75");
    await waitFor(() =>
      expect(status()).toBe("Parada 2: combustible fijado en 75 L."),
    );
    automatic("Combustible", 2);
    await waitFor(() =>
      expect(status()).toBe("Parada 2: combustible en automático."),
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("reads the limits again from the last view when another stop is fixed", async () => {
    await stops("plannedFuji", undefined, (view: StrategyView) => {
      // the host moves the limits of the stop as another one is fixed
      const stop = view.plan.edit?.stops[2];
      if (
        stop?.limits.kind === "exact" &&
        stop.limits.fuel.kind === "used" &&
        view.plan.edit?.stops[1].fixed.fuelLiters !== null
      )
        stop.limits.fuel.range = { min: 75, max: 77 };
      return view;
    });
    pick(3, 127);
    expect(screen.getByText("Puedes fijar de 75 a 81 L.")).toBeTruthy();
    pick(2, 85);
    await fix("Combustible", 2, "75");
    await heading("Plan modificado");
    pick(3, 127);
    expect(screen.getByText("Puedes fijar de 75 a 77 L.")).toBeTruthy();
  });

  it("is generic with fine steps: no limits and no number made up", async () => {
    await stops("plannedFuji", undefined, (view: StrategyView) => {
      for (const stop of view.plan.edit?.stops ?? [])
        stop.limits = { kind: "unavailable" };
      return view;
    });
    pick(2, 85);
    expect(screen.queryByText(/Puedes fijar de/)).toBeNull();
    expect(screen.queryByText(/Se llega con/)).toBeNull();
    expect(
      screen.getAllByText(
        "Aquí el cálculo no puede decir cuánto cabe. Lo sabrás al recalcular.",
      ),
    ).toHaveLength(2);
    // it can still be fixed: the host validates the grid and the tank
    await fix("Combustible", 2, "75");
    await heading("Plan modificado");
  });

  it("says the car does not use the energy and offers nothing to fix there", async () => {
    await stops("plannedFuji", undefined, (view: StrategyView) => {
      for (const stop of view.plan.edit?.stops ?? [])
        if (stop.limits.kind === "exact") stop.limits.ve = { kind: "unused" };
      if (view.plan.result) view.plan.result.steps.vePercent = null;
      return view;
    });
    pick(2, 85);
    expect(screen.getByText("Este coche no usa energía virtual.")).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: /Energía de la parada 2/ }),
    ).toBeNull();
    expect(mode("Combustible", 2)).toBeTruthy();
  });

  it("takes the pin from what the host says is fixed, not from the plan's marks", async () => {
    await stops("plannedFuji", undefined, (view: StrategyView) => {
      for (const pit of view.plan.result?.timeline?.pits ?? [])
        pit.pinned.fuelLiters = true;
      return view;
    });
    pick(2, 85);
    expect(screen.queryByText("fijado por ti")).toBeNull();
    expect(
      screen.getByRole("radio", { name: "Parada 2, vuelta 85" }),
    ).toBeTruthy();
  });

  it("goes back to automatic with «Volver todo a automático»", async () => {
    const request = await stops();
    pick(2, 85);
    await fix("Combustible", 2, "75");
    await heading("Plan modificado");
    pick(5, 212);
    await fix("Energía", 5, "80");
    await waitFor(() =>
      expect(screen.getAllByText("fijado por ti").length).toBeGreaterThan(0),
    );
    click("Volver todo a automático");
    await waitFor(() =>
      expect(calls(request, "strategy.clearStopServices")).toHaveLength(1),
    );
    const view = await lastView(request);
    expect(calls(request, "strategy.clearStopServices")[0]).toEqual({
      method: "strategy.clearStopServices",
      revision: expect.any(String),
      computeId: view.plan.computeId,
    });
    await waitFor(() => expect(screen.queryByText("fijado por ti")).toBeNull());
    expect(status()).toBe(
      "Todo vuelve a automático. Recalcula para ver el plan.",
    );
    expect(
      screen.queryByRole("button", { name: "Volver todo a automático" }),
    ).toBeNull();
  });

  it("says what Restablecer does with what is fixed: the last valid plan's", async () => {
    const request = await stops();
    pick(2, 85);
    await fix("Combustible", 2, "75");
    await heading("Plan modificado");
    expect(
      screen.getByText(
        /«Restablecer» vuelve al último plan válido, con las cantidades que tuviera fijadas/,
      ),
    ).toBeTruthy();
    click("Restablecer");
    await waitFor(() => expect(status()).toBe("Ajustes restablecidos."));
    expect(calls(request, "strategy.resetEdit")).toHaveLength(1);
    expect(screen.queryByText("fijado por ti")).toBeNull();
  });

  it("drops what was typed and shows the host's plan on a conflict", async () => {
    let current: StrategyView | undefined;
    await stops(
      "plannedFuji",
      (request: Request) =>
        request.method === "strategy.setStopService" && current
          ? { kind: "strategyConflict", current }
          : undefined,
      (view: StrategyView) => {
        current ??= (() => {
          const next = structuredClone(view);
          next.plan.computeId = 9;
          if (next.plan.edit) next.plan.edit.stops[1].fixed.fuelLiters = 79;
          return next;
        })();
        return view;
      },
    );
    pick(2, 85);
    manual("Combustible", 2);
    await waitFor(() =>
      expect(status()).toBe("El plan ha cambiado. Te mostramos el actual."),
    );
    // the host's view replaced ours: what it holds is what is drawn
    await waitFor(() => expect(amount("Combustible", 2).value).toBe("79"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a recalculation with something fixed", () => {
  async function recalculated(scene = "plannedFuji") {
    const request = await stops(scene);
    pick(5, 212);
    await fix("Energía", 5, "80");
    await heading("Plan modificado");
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    return request;
  }

  it("compares with the automatic plan when the host gives its figures", async () => {
    await recalculated();
    click("Resumen");
    expect(
      screen.getByText(
        "Lo que fijaste hace el plan 2,0 s más lento que el plan automático (6:01:04).",
      ),
    ).toBeTruthy();
    expect(screen.getByText("2,0 s más que el automático")).toBeTruthy();
    expect(screen.getByText("1 con cantidades fijadas")).toBeTruthy();
    // the stop with something fixed carries the pin in the list
    const list = screen.getByRole("list", { name: "Stints y paradas" });
    expect(within(list).getAllByText("fijado por ti")).toHaveLength(1);
    expect(
      within(list.querySelectorAll("li")[9] as HTMLElement).getByText(
        "fijado por ti",
      ),
    ).toBeTruthy();
    expect(button("Volver todo a automático")).toBeTruthy();
  });

  it("says nothing of the automatic plan when the host has none to compare with", async () => {
    await stops("plannedFuji", undefined, (view: StrategyView) => {
      if (view.plan.edit) view.plan.edit.automatic = null;
      return view;
    });
    pick(5, 212);
    await fix("Energía", 5, "80");
    await heading("Plan modificado");
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    click("Resumen");
    expect(screen.queryByText(/más lento que el plan automático/)).toBeNull();
    expect(screen.queryByText(/más que el automático/)).toBeNull();
    expect(screen.getByText("1 con cantidades fijadas")).toBeTruthy();
  });

  it("says the plan is the fastest respecting what was fixed only when it is proven", async () => {
    await recalculated("plannedFujiFixedProven");
    click("Resumen");
    expect(
      screen.getByText(
        "Comprobado: con estas paradas y lo que fijaste, es el plan más rápido",
      ),
    ).toBeTruthy();
  });

  it("tells the finish of the last stop against the automatic one", async () => {
    await recalculated();
    expect(
      screen.getByText(
        "Llegarás a meta con 4 % de energía, igual que con el automático.",
      ),
    ).toBeTruthy();
  });

  it("says which stop leaves no plan and offers the way out", async () => {
    const request = await stops();
    pick(2, 85);
    await fix("Combustible", 2, "40");
    await heading("Plan modificado");
    click("Recalcular");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ningún plan cumple lo que fijaste");
    expect(alert.textContent).toContain(
      "Con lo que fijaste en la parada 2 no hay plan que termine la carrera.",
    );
    expect(status()).toBe(
      "Ningún plan cumple lo que fijaste: mira la parada 2.",
    );
    // the stop the host points at is the one the editor opens on, with its amount
    expect(amount("Combustible", 2).value).toBe("40");
    expect(
      screen.getByText(
        /Con 40 L no hay plan: te quedarías sin combustible en la vuelta 110/,
      ),
    ).toBeTruthy();
    click("Volver la parada 2 a automático");
    await waitFor(() =>
      expect(calls(request, "strategy.setStopService").at(-1)).toMatchObject({
        index: 1,
        fuelLiters: null,
        vePercent: null,
      }),
    );
    // back to automatic, it can be recalculated
    await waitFor(() => expect(button("Recalcular")).toBeTruthy());
    expect(screen.queryByText("Ningún plan cumple lo que fijaste")).toBeNull();
    click("Restablecer");
    await waitFor(() => expect(status()).toBe("Ajustes restablecidos."));
    await heading("Ajustar paradas");
  });

  it("is generic when the crate names no stop", async () => {
    await stops("plannedFuji", undefined, (view: StrategyView) => {
      if (view.plan.edit?.cause) view.plan.edit.cause = null;
      return view;
    });
    pick(2, 85);
    await fix("Combustible", 2, "40");
    await heading("Plan modificado");
    click("Recalcular");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ningún plan cumple lo que fijaste");
    expect(alert.textContent).not.toMatch(/parada \d/);
  });
});

describe("«Calcular de nuevo» with something fixed", () => {
  async function withFixed() {
    const request = await stops();
    pick(5, 212);
    await fix("Energía", 5, "80");
    await heading("Plan modificado");
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    click("Resumen");
    return request;
  }

  it("asks first, in line, with the focus on «Cancelar»", async () => {
    const request = await withFixed();
    const before = calls(request, "strategy.compute").length;
    click("Calcular de nuevo");
    const question = await screen.findByRole("group", {
      name: "¿Calcular de nuevo y perder lo que fijaste?",
    });
    expect(question.textContent).toContain(
      "Se pierden las cantidades que fijaste a mano en 1 parada",
    );
    expect(document.activeElement).toBe(
      within(question).getByRole("button", { name: "Cancelar" }),
    );
    // nothing was sent
    expect(calls(request, "strategy.compute")).toHaveLength(before);
    // Escape cancels and gives the focus back
    fireEvent.keyDown(question, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("group", {
          name: "¿Calcular de nuevo y perder lo que fijaste?",
        }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(button("Calcular de nuevo"));
    expect(calls(request, "strategy.compute")).toHaveLength(before);
    expect(
      screen.getByRole("heading", { name: /Plan recalculado|Plan/ }),
    ).toBeTruthy();
  });

  it("calculates only once it is confirmed", async () => {
    const request = await withFixed();
    click("Calcular de nuevo");
    const question = await screen.findByRole("group", {
      name: "¿Calcular de nuevo y perder lo que fijaste?",
    });
    fireEvent.click(
      within(question).getByRole("button", { name: "Calcular de nuevo" }),
    );
    await waitFor(() =>
      expect(calls(request, "strategy.compute")).toHaveLength(1),
    );
  });

  it("does not ask when nothing is fixed", async () => {
    const request = await stops();
    click("Resumen");
    click("Calcular de nuevo");
    await waitFor(() =>
      expect(calls(request, "strategy.compute")).toHaveLength(1),
    );
    expect(
      screen.queryByRole("group", {
        name: "¿Calcular de nuevo y perder lo que fijaste?",
      }),
    ).toBeNull();
  });
});

describe("the accepted plan keeps what was fixed", () => {
  it("shows the pins of the accepted plan and not those of the proposal's edit", async () => {
    const request = await stops();
    pick(5, 212);
    await fix("Energía", 5, "80");
    await heading("Plan modificado");
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    click("Resumen");
    click("Aceptar propuesta");
    await heading("Plan aceptado");
    const [accept] = calls(request, "strategy.accept");
    expect(accept).toBeTruthy();
    const view = await lastView(request);
    expect(view.plan.accepted?.result.timeline?.pits[4].pinned).toEqual({
      fuelLiters: false,
      vePercent: true,
      changeTyres: false,
    });
    const list = screen.getByRole("list", { name: "Stints y paradas" });
    expect(within(list).getAllByText("fijado por ti")).toHaveLength(1);
  });
});

describe("the texts of the amounts", () => {
  it("reads a number with a comma or a point and nothing else", () => {
    expect(parseAmount("70")).toBe(70);
    expect(parseAmount(" 70,5 ")).toBe(70.5);
    expect(parseAmount("70.5")).toBe(70.5);
    expect(parseAmount("-3")).toBe(-3);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("mucha")).toBeNull();
    expect(parseAmount("7 0")).toBeNull();
    expect(parseAmount("1e3")).toBeNull();
    expect(parseAmount("1,2,3")).toBeNull();
  });

  it("writes the pit time as minutes, seconds and tenths", () => {
    expect(pitTime(62)).toBe("1:02,0");
    expect(pitTime(63.8)).toBe("1:03,8");
    expect(pitTime(57)).toBe("0:57,0");
  });

  it("turns each refusal into a sentence that says how to fix it", () => {
    const refusal = (
      amountName: "fuelLiters" | "vePercent",
      reason: "negative" | "aboveCapacity" | "offGrid" | "notInUse",
      below: number | null,
      above: number | null,
    ) =>
      ({
        kind: "strategyInvalidStopService",
        amount: amountName,
        reason,
        below,
        above,
      }) as const;
    expect(amountMessage(refusal("fuelLiters", "offGrid", 70, 71), 1)).toBe(
      "Escribe litros enteros: el cálculo carga de 1 L en 1 L. Puedes poner 70 o 71.",
    );
    expect(amountMessage(refusal("fuelLiters", "offGrid", 70, 72), 2)).toBe(
      "El cálculo carga de 2 L en 2 L. Puedes poner 70 o 72.",
    );
    expect(amountMessage(refusal("vePercent", "offGrid", 98, null), 1)).toBe(
      "Escribe porcentajes enteros: el cálculo carga de 1 % en 1 %. Lo más cercano que puedes poner es 98.",
    );
    expect(
      amountMessage(refusal("fuelLiters", "aboveCapacity", 82, null), 1),
    ).toBe("No cabe: el depósito no admite más de 82 L.");
    expect(
      amountMessage(refusal("vePercent", "aboveCapacity", 100, null), 1),
    ).toBe("No cabe: la energía no puede pasar de 100 %.");
    expect(amountMessage(refusal("fuelLiters", "negative", null, 0), 1)).toBe(
      "No puede ser menos de 0.",
    );
    expect(
      amountMessage(refusal("vePercent", "notInUse", null, null), null),
    ).toBe("Este coche no usa energía virtual: no se puede fijar.");
  });
});

// ---- the review of #2723 ----

const noMetrics = (view: StrategyView) => {
  const { result } = view.plan;
  if (result) {
    result.certificate = "not_proven";
    result.reason = "searchBudgetExhausted";
    result.metrics = null;
    result.timeline = null;
  }
  return view;
};
const withFixed = (view: StrategyView) => {
  if (view.plan.edit) view.plan.edit.stops[1].fixed.fuelLiters = 77;
  return view;
};
const question = "¿Calcular de nuevo y perder lo que fijaste?";

describe("«Calcular de nuevo» in every state that offers it", () => {
  it("asks in «Cálculo sin terminar» too, and sends nothing until it is confirmed", async () => {
    const request = mount("plannedFuji", undefined, (view) =>
      withFixed(noMetrics(view)),
    );
    await screen.findByRole("heading", { name: "Tus estrategias" });
    click("Continuar");
    fireEvent.click(tab("Plan"));
    await heading("Cálculo sin terminar");
    click("Calcular de nuevo");
    const ask = await screen.findByRole("group", { name: question });
    expect(document.activeElement).toBe(
      within(ask).getByRole("button", { name: "Cancelar" }),
    );
    expect(calls(request, "strategy.compute")).toHaveLength(0);
    fireEvent.keyDown(ask, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: question })).toBeNull(),
    );
    expect(document.activeElement).toBe(button("Calcular de nuevo"));
    click("Calcular de nuevo");
    fireEvent.click(
      within(await screen.findByRole("group", { name: question })).getByRole(
        "button",
        { name: "Calcular de nuevo" },
      ),
    );
    await waitFor(() =>
      expect(calls(request, "strategy.compute")).toHaveLength(1),
    );
  });

  // the scene of the mock itself (QA): the same question, with no mapping of the view
  it("asks in the scene «plannedFujiUnfinishedFixed» of the mock", async () => {
    const request = mount("plannedFujiUnfinishedFixed");
    await screen.findByRole("heading", { name: "Tus estrategias" });
    click("Continuar");
    fireEvent.click(tab("Plan"));
    await heading("Cálculo sin terminar");
    click("Calcular de nuevo");
    const ask = await screen.findByRole("group", { name: question });
    expect(document.activeElement).toBe(
      within(ask).getByRole("button", { name: "Cancelar" }),
    );
    expect(calls(request, "strategy.compute")).toHaveLength(0);
  });

  it("does not offer it while a recalculation runs", async () => {
    await stops("plannedFujiRecalculating");
    pick(2, 85);
    await fix("Combustible", 2, "75");
    await heading("Plan modificado");
    click("Recalcular");
    await heading("Recalculando…");
    expect(
      screen.queryByRole("button", { name: "Calcular de nuevo" }),
    ).toBeNull();
  });

  it("does not offer it when no plan fits what was fixed: there are other ways out", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "40");
    await heading("Plan modificado");
    click("Recalcular");
    await heading("Sin plan con lo que fijaste");
    expect(
      screen.queryByRole("button", { name: "Calcular de nuevo" }),
    ).toBeNull();
  });

  it("does not ask when the accepted plan is on its own: nothing is fixed in the session there", async () => {
    const request = mount("acceptedFujiStale");
    await screen.findByRole("heading", { name: "Tus estrategias" });
    click("Continuar");
    fireEvent.click(tab("Plan"));
    await heading("Plan aceptado");
    // the accepted plan has no edit, so no fixed amount to lose
    const view = await lastView(request);
    expect(view.plan.edit).toBeNull();
    click("Calcular con los datos nuevos");
    await waitFor(() =>
      expect(calls(request, "strategy.compute")).toHaveLength(1),
    );
    expect(screen.queryByRole("group", { name: question })).toBeNull();
  });

  it("has nothing fixed in the session after a failed calculation, so retrying asks nothing", async () => {
    const request = mount("computeFailed");
    await screen.findByRole("heading", { name: "Tus estrategias" });
    click("Continuar");
    fireEvent.click(tab("Plan"));
    click("Calcular plan");
    await screen.findByRole("alert");
    const view = await lastView(request);
    expect(view.plan.edit).toBeNull();
    click("Reintentar");
    await waitFor(() =>
      expect(calls(request, "strategy.compute").length).toBeGreaterThan(1),
    );
    expect(screen.queryByRole("group", { name: question })).toBeNull();
  });
});

describe("the plan with no plan and what was fixed", () => {
  it("is not the fixed screen when nothing was ever fixed, even if it is edited", async () => {
    await stops("plannedFuji", undefined, (view) => {
      const { result, edit } = view.plan;
      if (result && edit) {
        result.certificate = "no_solution";
        result.reason = "constraintsUnsatisfiable";
        result.metrics = null;
        result.timeline = null;
        view.plan.state = "edited";
      }
      return view;
    }).catch(() => undefined);
    await heading("Sin plan posible");
    expect(
      screen.queryByRole("heading", { name: "Sin plan con lo que fijaste" }),
    ).toBeNull();
  });

  // `Result` is unmounted with the tab: what it remembers must not be lost with it
  it("keeps «Recalcular» after going back to automatic, also when the tab is left and come back to", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "40");
    await heading("Plan modificado");
    click("Recalcular");
    await heading("Sin plan con lo que fijaste");
    click("Volver la parada 2 a automático");
    await waitFor(() => expect(button("Recalcular")).toBeTruthy());
    expect(
      screen.getByRole("heading", { name: "Sin plan con lo que fijaste" }),
    ).toBeTruthy();
    fireEvent.click(tab("Carrera"));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Sin plan con lo que fijaste" }),
      ).toBeNull(),
    );
    fireEvent.click(tab("Plan"));
    await heading("Sin plan con lo que fijaste");
    expect(button("Recalcular")).toBeTruthy();
    expect(button("Restablecer")).toBeTruthy();
  });

  it("keeps the stop selector on the one the host points at, also when it changes", async () => {
    const { FixedNoPlan } = await import(
      "../src/renderer/ui/strategy/FixedNoPlan"
    );
    const host = createMockHost("strategy-plannedFuji");
    const opened = host({
      kind: "request",
      id: 1,
      request: { method: "strategy.open" },
    });
    const edit =
      opened?.kind === "response"
        ? (opened.result as unknown as { value: StrategyView }).value.plan.edit
        : null;
    if (!edit) throw Error("no edit");
    for (const stop of edit.stops) stop.fixed.fuelLiters = 70;
    const props = {
      steps: { fuelLiters: 1, vePercent: 1 },
      edited: false,
      locked: false,
      set: async () => undefined,
      back: () => undefined,
    };
    const cause = (stop: number) =>
      ({
        ...edit,
        cause: { kind: "fixedAmountUnreachable", stop },
      }) as typeof edit;
    const view = render(<FixedNoPlan {...props} edit={cause(1)} />);
    const selected = (stop: number) =>
      (
        screen.getByRole("radio", {
          name: new RegExp(`^Parada ${stop}, vuelta`),
        }) as HTMLInputElement
      ).checked;
    expect(selected(2)).toBe(true);
    view.rerender(<FixedNoPlan {...props} edit={cause(3)} />);
    await waitFor(() => expect(selected(4)).toBe(true));
  });
});

describe("what the host says, said as it says it", () => {
  it("says a fixed amount above what the others admit, with the most the host gives", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "82");
    expect(
      await screen.findByText(
        "Con 82 L no hay plan: aquí se puede fijar como mucho 81 L.",
      ),
    ).toBeTruthy();
  });

  it("says no amount gives a plan «with what is as it is», not that other stops are fixed", async () => {
    await stops("plannedFuji", undefined, (view) => {
      const limits = view.plan.edit?.stops[1].limits;
      if (limits?.kind === "exact" && limits.fuel.kind === "used") {
        limits.fuel.range = null;
        if (view.plan.edit?.stops[1].fixed.fuelLiters !== null)
          limits.fuel.issue = "noRange";
      }
      return view;
    });
    pick(2, 85);
    expect(
      screen.getByText(
        "Con lo demás como está, aquí no sirve ninguna cantidad.",
      ),
    ).toBeTruthy();
    await fix("Combustible", 2, "75");
    const note = await screen.findByText(
      /^Con lo demás como está, aquí no hay ninguna cantidad que dé plan\./,
    );
    expect(note.textContent).not.toContain("fijado en las otras paradas");
  });

  it("says that only the automatic stops before are loaded to the most", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "60");
    expect(
      (
        await screen.findByText(
          /^Con 60 L no hay plan: te quedarías sin combustible/,
        )
      ).textContent,
    ).toContain("aunque las paradas automáticas de antes carguen lo máximo");
  });

  it("says no arrival when the stop is not reached", async () => {
    await stops("plannedFuji", undefined, (view) => {
      const limits = view.plan.edit?.stops[1].limits;
      if (limits?.kind === "exact" && limits.fuel.kind === "used")
        limits.fuel.arrival = null;
      return view;
    });
    pick(2, 85);
    expect(
      screen.getByText(
        "Con lo que fijaste en las paradas de antes, no se llega a esta parada.",
      ),
    ).toBeTruthy();
  });

  it("says the car does not use fuel, and the energy line stays", async () => {
    await stops("plannedFuji", undefined, (view) => {
      for (const stop of view.plan.edit?.stops ?? [])
        if (stop.limits.kind === "exact") stop.limits.fuel = { kind: "unused" };
      if (view.plan.result) view.plan.result.steps.fuelLiters = null;
      return view;
    });
    pick(2, 85);
    expect(screen.getByText("Este coche no usa combustible.")).toBeTruthy();
    expect(screen.queryByText("Este coche no usa energía virtual.")).toBeNull();
    expect(
      screen.queryByRole("group", { name: /Combustible de la parada 2/ }),
    ).toBeNull();
    expect(mode("Energía", 2)).toBeTruthy();
  });

  it("describes a box only by what is drawn", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "60");
    await screen.findByText(/^Con 60 L no hay plan/);
    const described = () =>
      (amount("Combustible", 2).getAttribute("aria-describedby") ?? "")
        .split(" ")
        .filter(Boolean);
    for (const id of described())
      expect(document.getElementById(id)).not.toBeNull();
    // refused: the issue of the held amount is not drawn, so it is not described
    type(amount("Combustible", 2), "90");
    await screen.findByRole("alert");
    expect(described().length).toBeGreaterThan(0);
    for (const id of described())
      expect(document.getElementById(id)).not.toBeNull();
  });
});

describe("the certificate with what was fixed", () => {
  it("says it is the fastest with these stops: a plan with fixed amounts always has its stops fixed", async () => {
    await stops("plannedFujiFixedProven");
    pick(5, 212);
    await fix("Energía", 5, "80");
    await heading("Plan modificado");
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    click("Resumen");
    expect(
      screen.getByText(
        "Comprobado: con estas paradas y lo que fijaste, es el plan más rápido",
      ),
    ).toBeTruthy();
  });
});

describe("what is announced when the stop goes back to automatic", () => {
  it("announces both amounts of the stop", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "40");
    await screen.findByText(/^Con 40 L no hay plan/);
    await fix("Energía", 2, "98");
    await waitFor(() =>
      expect(status()).toMatch(/^Parada 2: energía fijada en 98 %/),
    );
    await heading("Plan modificado");
    click("Recalcular");
    await screen.findByRole("alert");
    click("Volver la parada 2 a automático");
    await waitFor(() =>
      expect(status()).toBe(
        "Parada 2: combustible en automático. Parada 2: energía en automático.",
      ),
    );
  });
});

describe("the steps of the buttons", () => {
  async function withSteps(fuelStep: number | null) {
    const request = await stops("plannedFuji", undefined, (view) => {
      if (view.plan.result) view.plan.result.steps.fuelLiters = fuelStep;
      return view;
    });
    pick(2, 85);
    return request;
  }

  it.each([0.5, 2])("moves by the step the host says (%s)", async (step) => {
    const request = await withSteps(step);
    manual("Combustible", 2);
    await waitFor(() => amount("Combustible", 2));
    click(
      `Añadir ${String(step).replace(".", ",")} L al combustible de la parada 2`,
    );
    await waitFor(() =>
      expect(calls(request, "strategy.setStopService").at(-1)?.fuelLiters).toBe(
        77 + step,
      ),
    );
  });

  it("offers no buttons, and invents no step, when the host gives none", async () => {
    await withSteps(null);
    manual("Combustible", 2);
    await waitFor(() => amount("Combustible", 2));
    expect(
      screen.queryByRole("button", { name: /Añadir .* al combustible/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Quitar .* al combustible/ }),
    ).toBeNull();
  });
});

describe("«A mano» says what it does", () => {
  it("says that choosing it fixes the value the calculation gave", async () => {
    await stops();
    pick(2, 85);
    expect(
      screen.getByText(
        /Al pasar a «A mano» se fija el valor que ha calculado Vantare; luego puedes cambiarlo\./,
      ),
    ).toBeTruthy();
  });
});

describe("what the host refuses of a fixed amount", () => {
  it.each(["busy", "protected", "rejected"] as const)(
    "%s changes nothing and says it in the screen, not in the box",
    async (kind) => {
      const request = await stops("plannedFuji", (req) =>
        req.method === "strategy.setStopService" ? { kind } : undefined,
      );
      pick(2, 85);
      manual("Combustible", 2);
      await screen.findAllByRole("alert");
      expect(screen.queryByText("fijado por ti")).toBeNull();
      expect(
        screen.queryByRole("textbox", { name: "Combustible de la parada 2" }),
      ).toBeNull();
      const view = await lastView(request);
      expect(view.plan.edit?.stops[1].fixed).toEqual({
        fuelLiters: null,
        vePercent: null,
        changeTyres: null,
      });
    },
  );
});

describe("the focus asked for Recalcular", () => {
  // the host answers a «back to automatic» with a view that has no edit pending, so
  // there is no «Recalcular» to take the focus: the request must not wait for a
  // «Recalcular» that shows up later, after another edit, and take the focus then
  it("is dropped when «Recalcular» is not on screen, so the next one is not swallowed", async () => {
    let notEdited = false;
    await stops("plannedFuji", undefined, (view) => {
      if (notEdited) view.plan.state = "calculated";
      return view;
    });
    pick(2, 85);
    await fix("Combustible", 2, "75");
    await heading("Plan modificado");
    notEdited = true;
    click("Volver todo a automático");
    await waitFor(() => expect(screen.queryByText("fijado por ti")).toBeNull());
    expect(screen.queryByRole("button", { name: "Recalcular" })).toBeNull();
    // a new edit brings «Recalcular»; the focus stays where the person is
    notEdited = false;
    pick(2, 85);
    await fix("Combustible", 2, "76");
    await heading("Plan modificado");
    expect(button("Recalcular")).toBeTruthy();
    expect(document.activeElement).not.toBe(button("Recalcular"));
    // and the next real «back to automatic» still takes the focus to «Recalcular»
    // (a request left over from before would swallow it)
    click("Volver todo a automático");
    await waitFor(() => expect(screen.queryByText("fijado por ti")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(button("Recalcular")),
    );
  });
});

describe("«Restablecer» when the last valid plan had amounts fixed", () => {
  it("goes back to what that plan had fixed", async () => {
    const request = await stops();
    pick(5, 212);
    await fix("Energía", 5, "80");
    await heading("Plan modificado");
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    click("Ajustar paradas");
    pick(2, 85);
    await fix("Combustible", 2, "75");
    await heading("Plan modificado");
    click("Restablecer");
    await waitFor(() => expect(status()).toBe("Ajustes restablecidos."));
    const fixed = (await lastView(request)).plan.edit?.stops.map(
      (stop) => stop.fixed,
    );
    const automatic = { fuelLiters: null, vePercent: null, changeTyres: null };
    expect(fixed?.[1]).toEqual(automatic);
    expect(fixed?.[4]).toEqual({ ...automatic, vePercent: 80 });
  });
});

describe("the focus after going back to automatic", () => {
  it("goes to Recalcular when «Volver todo a automático» disappears", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "75");
    await heading("Plan modificado");
    const clear = button("Volver todo a automático");
    clear.focus();
    fireEvent.click(clear);
    await waitFor(() => expect(screen.queryByText("fijado por ti")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(button("Recalcular")),
    );
  });

  it("goes to Recalcular when «Volver la parada N a automático» disappears", async () => {
    await stops();
    pick(2, 85);
    await fix("Combustible", 2, "40");
    await heading("Plan modificado");
    click("Recalcular");
    await screen.findByRole("alert");
    const back = button("Volver la parada 2 a automático");
    back.focus();
    fireEvent.click(back);
    await waitFor(() =>
      expect(document.activeElement).toBe(button("Recalcular")),
    );
  });
});
