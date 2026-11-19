// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostError, Request } from "../src/contract/generated/contract";
import type { StrategyView } from "../src/contract/generated/strategy";
import { createMockHost } from "../src/mock/host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { HostFailure } from "../src/renderer/bridge/client";
import { StrategyScreen } from "../src/renderer/ui/strategy/StrategyScreen";

afterEach(cleanup);

// Accepting the plan, seen from the screen. The mock host answers like the real
// one (E5a): `plannedFuji` is a proposal, `acceptedFuji*` are files that already
// hold an accepted plan, as it was or from entries that have changed since.

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
        (value.method === "strategy.open" || value.method === "strategy.view")
        ? { ...value, value: mapView(value.value) }
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
const maybe = (name: string) => screen.queryByRole("button", { name });
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
const fileState = () =>
  document.querySelector(".strategy-file-state")?.getAttribute("data-state");
// the tag of the state, next to the title of the plan
const stateTag = () =>
  document.querySelector(".strategy-plan .strategy-state")?.textContent ?? null;
const cardTag = () =>
  document.querySelector(".strategy-plan-card .strategy-state")?.textContent ??
  null;

async function openRace() {
  await screen.findByRole("heading", { name: "Tus estrategias" });
  click("Continuar");
}
async function openPlan(title = "Plan calculado") {
  await openRace();
  fireEvent.click(tab("Plan"));
  await heading(title);
}
const proposalLine =
  "Es una propuesta: no se guarda en el archivo hasta que la aceptes.";
const unsavedLine =
  "Plan aceptado. Guarda el archivo para conservarlo; hasta entonces es solo de esta sesión.";

// ---- a proposal ----

describe("a proposal", () => {
  it("says it is only a proposal and offers to accept it", async () => {
    mount("plannedFuji");
    await openPlan();
    expect(stateTag()).toBe("Propuesta");
    expect(screen.getByText(proposalLine)).toBeTruthy();
    expect(button("Aceptar propuesta")).toBeTruthy();
    // the Ingeniero is not there yet (the export has its own tests)
    expect(screen.queryByText(/Ingeniero/)).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("accepts with the revision and the id of the plan it shows, and says so", async () => {
    const request = mount("plannedFuji");
    await openPlan();
    const before = await lastView(request);
    click("Aceptar propuesta");
    await heading("Plan aceptado");
    expect(calls(request, "strategy.accept")).toEqual([
      {
        method: "strategy.accept",
        revision: before.revision,
        computeId: before.plan.computeId,
      },
    ]);
    expect(status()).toBe("Plan aceptado.");
    expect(stateTag()).toBe("Aceptado");
    // the file is «Sin guardar» until it is saved, and says what that means
    expect(fileState()).toBe("dirty");
    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === "SPAN" && node.textContent === unsavedLine,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(proposalLine)).toBeNull();
    expect(maybe("Aceptar propuesta")).toBeNull();
    expect(screen.queryByText(/Ingeniero/)).toBeNull();
    // the plan stays as it was
    expect(screen.getByText("6:01:04")).toBeTruthy();
    // the heading takes the focus the pressed button leaves
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Plan aceptado" }),
    );
  });

  it("goes back to a proposal with Deshacer, and the file is as it was", async () => {
    const request = mount("plannedFuji");
    await openPlan();
    click("Aceptar propuesta");
    await heading("Plan aceptado");
    const accepted = await lastView(request);
    click("Deshacer");
    await heading("Plan calculado");
    expect(calls(request, "strategy.unaccept")).toEqual([
      { method: "strategy.unaccept", revision: accepted.revision },
    ]);
    expect(status()).toBe("Plan aceptado quitado.");
    expect(stateTag()).toBe("Propuesta");
    expect(button("Aceptar propuesta")).toBeTruthy();
    expect(screen.getByText("6:01:04")).toBeTruthy();
  });

  it("says when it was accepted once the file is saved", async () => {
    mount("plannedFuji");
    await openPlan();
    click("Aceptar propuesta");
    await heading("Plan aceptado");
    expect(maybe("Deshacer")).toBeTruthy();
    click("Guardar");
    await waitFor(() => expect(fileState()).toBe("saved"));
    // the time zone is the machine's; the day and the hour are written as one line
    const line = await screen.findByText(
      /^Aceptado el \d{1,2} \p{L}+\.? 2026 a las \d{2}:\d{2}\.$/u,
    );
    expect(line.closest("p")?.className).toBe("strategy-line");
    expect(maybe("Deshacer")).toBeNull();
    expect(screen.queryByText(/Ingeniero/)).toBeNull();
  });

  it("can be accepted with no guarantee, and says so before and after", async () => {
    const request = mount("plannedFujiPartial");
    await openPlan();
    expect(stateTag()).toBe("Propuesta");
    expect(
      screen.getByText("Puedes aceptarla aunque no tenga garantía"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Plan válido, pero sin garantía de que sea el más rápido",
      ),
    ).toBeTruthy();
    click("Aceptar propuesta");
    await heading("Plan aceptado");
    expect(calls(request, "strategy.accept")).toHaveLength(1);
    expect(
      screen.getByText(
        "Plan válido, pero sin garantía de que sea el más rápido",
      ),
    ).toBeTruthy();
  });

  it("cannot be accepted while it has changes to recalculate, and says how", async () => {
    mount("plannedFuji");
    await openPlan();
    click("Ajustar paradas");
    click("+ 1 vuelta");
    await heading("Plan modificado");
    expect(maybe("Aceptar propuesta")).toBeNull();
    expect(
      screen.getByText("Recalcula para poder aceptar el plan."),
    ).toBeTruthy();
    expect(
      screen.getAllByText(
        "Estos ajustes son de prueba hasta que recalcules y aceptes el plan.",
      ),
    ).toHaveLength(1);
    // the old words are gone
    expect(screen.queryByText(/Estos ajustes son para probar/)).toBeNull();
    expect(screen.queryByText(/de prueba: no se guarda/)).toBeNull();
  });

  it("has nothing to accept without a solution", async () => {
    mount("plannedFujiNoSolution");
    await openPlan();
    click("Ajustar paradas");
    click("+ 1 vuelta");
    await heading("Plan modificado");
    click("Recalcular");
    await heading("Sin plan posible");
    expect(maybe("Aceptar propuesta")).toBeNull();
    expect(stateTag()).toBeNull();
  });
});

// ---- the accepted plan alone, as when the strategy is opened ----

describe("the accepted plan of an opened file", () => {
  it("is what the Plan tab shows, as accepted and saved", async () => {
    mount("acceptedFuji");
    await openPlan("Plan aceptado");
    expect(stateTag()).toBe("Aceptado");
    expect(screen.getByText("6:01:04")).toBeTruthy();
    expect(
      screen.getByText("Comprobado: es el plan más rápido con estos datos"),
    ).toBeTruthy();
    expect(maybe("Aceptar propuesta")).toBeNull();
    expect(button("Calcular de nuevo")).toBeTruthy();
    expect(screen.queryByText(proposalLine)).toBeNull();
    expect(
      screen.getByText(
        /^Aceptado el \d{1,2} \p{L}+\.? 2026 a las \d{2}:\d{2}\.$/u,
      ),
    ).toBeTruthy();
    expect(fileState()).toBe("saved");
    // a plan taken from the file has no schedule to adjust, and says how to get one
    expect(screen.queryByRole("group", { name: "Vista del plan" })).toBeNull();
    expect(
      screen.getByText("Para ajustar las paradas, calcula el plan de nuevo."),
    ).toBeTruthy();
    expect(screen.queryByText(/Ingeniero/)).toBeNull();
  });

  it("is also what the plan of a file with a plan accepted without guarantee says", async () => {
    mount("acceptedFujiPartial");
    await openPlan("Plan aceptado");
    expect(stateTag()).toBe("Aceptado");
    expect(
      screen.getByText(
        "Plan válido, pero sin garantía de que sea el más rápido",
      ),
    ).toBeTruthy();
  });

  it("is removed from the menu after asking in the same place, and brings the plan back with Descartar", async () => {
    const user = userEvent.setup();
    const request = mount("acceptedFuji");
    await openPlan("Plan aceptado");
    await user.click(button("Más acciones del plan aceptado"));
    const item = await screen.findByRole("menuitem", {
      name: /Quitar plan aceptado/,
    });
    expect(item.textContent).toContain("No se borra nada de la carrera");
    await user.click(item);
    // nothing is sent yet: the plan would disappear from the screen
    expect(calls(request, "strategy.unaccept")).toHaveLength(0);
    const confirmation = screen.getByRole("group", {
      name: "¿Quitar el plan aceptado?",
    });
    expect(
      within(confirmation).getByText(
        "El plan aceptado (6:01:04 · 5 paradas) se pierde cuando guardes el archivo. Hasta entonces, «Descartar cambios» lo recupera.",
      ),
    ).toBeTruthy();
    // the focus goes to the safe button
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(confirmation).getByRole("button", { name: "Cancelar" }),
      ),
    );
    const shown = await lastView(request);
    await user.click(
      within(confirmation).getByRole("button", {
        name: "Quitar plan aceptado",
      }),
    );
    await heading("Calcula tu plan");
    expect(calls(request, "strategy.unaccept")).toEqual([
      { method: "strategy.unaccept", revision: shown.revision },
    ]);
    expect(status()).toBe("Plan aceptado quitado.");
    expect(fileState()).toBe("dirty");
    // the file still has it: «Descartar cambios» brings it back
    await user.click(button("Más acciones de archivo"));
    await user.click(
      await screen.findByRole("menuitem", { name: "Descartar cambios" }),
    );
    await heading("Plan aceptado");
  });

  it("keeps the plan if the question is cancelled, with Cancelar or Escape, and the focus goes back", async () => {
    const user = userEvent.setup();
    const request = mount("acceptedFuji");
    await openPlan("Plan aceptado");
    const menu = button("Más acciones del plan aceptado");
    await user.click(menu);
    await user.click(
      await screen.findByRole("menuitem", { name: /Quitar plan aceptado/ }),
    );
    const confirmation = screen.getByRole("group", {
      name: "¿Quitar el plan aceptado?",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "Cancelar" }),
    );
    expect(
      screen.queryByRole("group", { name: "¿Quitar el plan aceptado?" }),
    ).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(menu));
    await user.click(menu);
    await user.click(
      await screen.findByRole("menuitem", { name: /Quitar plan aceptado/ }),
    );
    await screen.findByRole("group", { name: "¿Quitar el plan aceptado?" });
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "¿Quitar el plan aceptado?" }),
      ).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(menu));
    expect(calls(request, "strategy.unaccept")).toHaveLength(0);
    expect(stateTag()).toBe("Aceptado");
  });

  it("opens the menu with the keys and closes it with Escape, back on its button", async () => {
    const user = userEvent.setup();
    mount("acceptedFuji");
    await openPlan("Plan aceptado");
    const menu = button("Más acciones del plan aceptado");
    menu.focus();
    await user.keyboard("{ArrowDown}");
    const item = await screen.findByRole("menuitem", {
      name: /Quitar plan aceptado/,
    });
    await waitFor(() => expect(document.activeElement).toBe(item));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(menu));
  });

  it("calculates again from the heading and then compares with the accepted plan", async () => {
    const request = mount("acceptedFuji");
    await openPlan("Plan aceptado");
    click("Calcular de nuevo");
    await heading("Plan calculado");
    expect(calls(request, "strategy.compute")).toHaveLength(1);
  });
});

// ---- a proposal that is not the accepted plan ----

describe("a new proposal next to a plan accepted before", () => {
  it("says what is accepted and how far the proposal is", async () => {
    mount("acceptedFujiNew");
    await openPlan();
    expect(stateTag()).toBe("Propuesta");
    const card = screen.getByRole("region", {
      name: "Ya tienes un plan aceptado",
    });
    expect(card.textContent).toMatch(
      /Plan aceptado: 6:01:04 · 5 paradas · aceptado el \d{1,2} \p{L}+\.? 2026/u,
    );
    expect(card.textContent).toContain(
      "Esta propuesta: 6:01:06 · 5 paradas · 2,0 s más lenta",
    );
    // the figure says it too
    expect(screen.getByText("2,0 s más que tu plan aceptado")).toBeTruthy();
    expect(
      within(card).getByRole("button", { name: "Volver al plan aceptado" }),
    ).toBeTruthy();
    expect(button("Aceptar propuesta")).toBeTruthy();
  });

  it("goes back to the accepted plan, dropping the proposal, with the revision it shows", async () => {
    const request = mount("acceptedFujiNew");
    await openPlan();
    const before = await lastView(request);
    click("Volver al plan aceptado");
    await heading("Plan aceptado");
    expect(calls(request, "strategy.showAccepted")).toEqual([
      { method: "strategy.showAccepted", revision: before.revision },
    ]);
    expect(status()).toBe("Mostrando el plan aceptado.");
    expect(screen.getByText("6:01:04")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Ya tienes un plan aceptado" }),
    ).toBeNull();
    expect(fileState()).toBe("saved");
  });

  it("asks in the same place before replacing, and moves the focus", async () => {
    const user = userEvent.setup();
    const request = mount("acceptedFujiNew");
    await openPlan();
    const replace = button("Aceptar propuesta");
    await user.click(replace);
    const confirmation = screen.getByRole("group", {
      name: "¿Sustituir tu plan aceptado por esta propuesta?",
    });
    expect(
      within(confirmation).getByText(
        "El plan aceptado de ahora (6:01:04 · 5 paradas) se pierde cuando guardes el archivo. Hasta entonces, «Descartar cambios» lo recupera.",
      ),
    ).toBeTruthy();
    // nothing was sent, the card with the comparison gives its place, and no second Aceptar
    expect(calls(request, "strategy.accept")).toHaveLength(0);
    expect(
      screen.queryByRole("region", { name: "Ya tienes un plan aceptado" }),
    ).toBeNull();
    expect(maybe("Aceptar propuesta")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(confirmation).getByRole("button", { name: "Cancelar" }),
      ),
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("goes back to the button when the question is cancelled, with Cancelar or Escape", async () => {
    const user = userEvent.setup();
    const request = mount("acceptedFujiNew");
    await openPlan();
    await user.click(button("Aceptar propuesta"));
    await user.click(
      within(
        screen.getByRole("group", {
          name: "¿Sustituir tu plan aceptado por esta propuesta?",
        }),
      ).getByRole("button", { name: "Cancelar" }),
    );
    expect(
      screen.queryByRole("group", {
        name: "¿Sustituir tu plan aceptado por esta propuesta?",
      }),
    ).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(button("Aceptar propuesta")),
    );
    expect(
      screen.getByRole("region", { name: "Ya tienes un plan aceptado" }),
    ).toBeTruthy();
    await user.click(button("Aceptar propuesta"));
    await screen.findByRole("group", {
      name: "¿Sustituir tu plan aceptado por esta propuesta?",
    });
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(document.activeElement).toBe(button("Aceptar propuesta")),
    );
    expect(calls(request, "strategy.accept")).toHaveLength(0);
  });

  it("replaces the plan when the question is confirmed, with the revision and id it shows", async () => {
    const user = userEvent.setup();
    const request = mount("acceptedFujiNew");
    await openPlan();
    const before = await lastView(request);
    await user.click(button("Aceptar propuesta"));
    await user.click(button("Sustituir plan aceptado"));
    await heading("Plan aceptado");
    expect(calls(request, "strategy.accept")).toEqual([
      {
        method: "strategy.accept",
        revision: before.revision,
        computeId: before.plan.computeId,
      },
    ]);
    expect(status()).toBe("Plan sustituido.");
    expect(stateTag()).toBe("Aceptado");
    expect(screen.getByText("6:01:06")).toBeTruthy();
    expect(fileState()).toBe("dirty");
    // it was not the first plan: there is no Deshacer that would leave none
    expect(maybe("Deshacer")).toBeNull();
    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === "SPAN" && node.textContent === unsavedLine,
      ),
    ).toBeTruthy();
  });
});

// ---- an accepted plan that the data have left behind ----

describe("an outdated accepted plan", () => {
  it("says which data changed, that it still reaches the finish and offers the way out", async () => {
    const request = mount("acceptedFujiStale");
    await openPlan("Plan aceptado");
    expect(stateTag()).toBe("Desactualizado");
    const notice = screen.getByRole("region", {
      name: "Los datos de la carrera han cambiado desde que aceptaste este plan",
    });
    expect(
      within(notice).getByText("Ritmo por vuelta: 1:30,472 → 1:30,900"),
    ).toBeTruthy();
    expect(notice.textContent).toContain(
      "Con los datos nuevos, este plan sigue llegando a meta, pero puede que ya no sea el más rápido.",
    );
    // no figure of the new data: the host sends none
    expect(notice.textContent).not.toMatch(/6:02/);
    // the figures are those of the old data
    expect(screen.getAllByText("datos antiguos")).toHaveLength(4);
    // the plan is not touched
    expect(screen.getByText("6:01:04")).toBeTruthy();
    within(notice).getByRole("button", {
      name: "Calcular con los datos nuevos",
    });
    click("Calcular con los datos nuevos");
    await heading("Plan calculado");
    const [compute] = calls(request, "strategy.compute");
    expect(compute.form.inputs.basePaceSeconds).toBe("90.9");
  });

  it("goes to Carrera to review the data", async () => {
    mount("acceptedFujiStale");
    await openPlan("Plan aceptado");
    click("Revisar datos");
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Fuji 6 Horas");
  });

  it("says it does not reach the finish, with the cause and no lap", async () => {
    mount("acceptedFujiUnreachable");
    await openPlan("Plan aceptado");
    expect(stateTag()).toBe("No llega a meta");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "Con los datos nuevos, este plan no llega a meta",
    );
    expect(alert.textContent).toContain("Consumo por vuelta: 1,83 L → 1,85 L");
    expect(alert.textContent).toContain(
      "Se quedaría sin combustible, energía o neumáticos antes de llegar a meta.",
    );
    // the host does not say the lap yet: nothing is made up
    expect(alert.textContent).not.toMatch(/vuelta \d/);
    expect(screen.queryByText(/sin combustible en la vuelta/)).toBeNull();
    expect(screen.getAllByText("datos antiguos")).toHaveLength(4);
  });

  it("says the lap when the host sends it", async () => {
    mount("acceptedFujiUnreachable", undefined, (view) => {
      const next = structuredClone(view);
      if (next.plan.accepted?.unreachable)
        next.plan.accepted.unreachable.failLap = 170;
      return next;
    });
    await openPlan("Plan aceptado");
    expect(screen.getByRole("alert").textContent).toContain(
      "Se quedaría sin combustible, energía o neumáticos en la vuelta 170.",
    );
  });

  it("keeps only the first changes of a long list", async () => {
    mount("acceptedFujiStale", undefined, (view) => {
      const next = structuredClone(view);
      if (next.plan.accepted)
        next.plan.accepted.changes = [
          "basePaceSeconds",
          "fuelPerLapLiters",
          "raceLaps",
          "reserveLaps",
          "refuelRate",
          "veRate",
          "fuelStep",
          "veStep",
        ].map((field) => ({
          field: field as never,
          before: "1",
          after: "2",
        }));
      return next;
    });
    await openPlan("Plan aceptado");
    const notice = screen.getByRole("region", {
      name: "Los datos de la carrera han cambiado desde que aceptaste este plan",
    });
    expect(within(notice).getAllByRole("listitem")).toHaveLength(6);
    expect(within(notice).getByText("y otros 2 datos")).toBeTruthy();
  });
});

// ---- the card of Carrera ----

describe("the card of the plan in Carrera", () => {
  async function race(scene: string) {
    const request = mount(scene);
    await openRace();
    return request;
  }

  it("says a proposal is one and accepts it from there when nothing is lost", async () => {
    const request = await race("plannedFuji");
    expect(cardTag()).toBe("Propuesta");
    expect(screen.getByText("Calculado · 6:01:04 · 5 paradas")).toBeTruthy();
    expect(screen.getByText(proposalLine)).toBeTruthy();
    click("Aceptar propuesta");
    await waitFor(() => expect(cardTag()).toBe("Aceptado"));
    expect(calls(request, "strategy.accept")).toHaveLength(1);
    expect(status()).toBe("Plan aceptado.");
    expect(screen.getByText("6:01:04 · 5 paradas")).toBeTruthy();
    expect(maybe("Aceptar propuesta")).toBeNull();
    // the card keeps the focus where the pressed button was
    expect(document.activeElement).toBe(button("Ver plan"));
    expect(fileState()).toBe("dirty");
  });

  it("does not accept from there a plan with no guarantee, nor one that replaces another", async () => {
    await race("plannedFujiPartial");
    expect(cardTag()).toBe("Propuesta");
    expect(maybe("Aceptar propuesta")).toBeNull();
    expect(button("Ver plan")).toBeTruthy();
    cleanup();
    await race("acceptedFujiNew");
    expect(cardTag()).toBe("Propuesta");
    expect(maybe("Aceptar propuesta")).toBeNull();
    expect(
      screen.getByText("Es distinta de tu plan aceptado: 2,0 s más lenta."),
    ).toBeTruthy();
  });

  it("says the plan is accepted, outdated or does not arrive, and marks the datum that changed", async () => {
    await race("acceptedFuji");
    expect(cardTag()).toBe("Aceptado");
    expect(screen.getByText("6:01:04 · 5 paradas")).toBeTruthy();
    expect(document.querySelectorAll("mark")).toHaveLength(0);
    cleanup();
    await race("acceptedFujiStale");
    expect(cardTag()).toBe("Desactualizado");
    expect(screen.getByText("Aceptado · 6:01:04 · 5 paradas")).toBeTruthy();
    expect(
      screen.getByText("Has cambiado «Ritmo por vuelta»: 1:30,472 → 1:30,900."),
    ).toBeTruthy();
    expect(
      Array.from(document.querySelectorAll("mark")).map(
        (mark) => mark.textContent,
      ),
    ).toEqual(["1:30,900 por vuelta"]);
    cleanup();
    await race("acceptedFujiUnreachable");
    expect(cardTag()).toBe("No llega a meta");
    expect(
      Array.from(document.querySelectorAll("mark")).map(
        (mark) => mark.textContent,
      ),
    ).toEqual(["82 L · 1,85 L/v"]);
    expect(
      screen.getByText(
        /Se quedaría sin combustible, energía o neumáticos antes de llegar a meta\. Calcula de nuevo y acepta la nueva propuesta\./,
      ),
    ).toBeTruthy();
    // «Ver plan» leads to the plan
    click("Ver plan");
    await heading("Plan aceptado");
  });
});

// ---- the collection ----

describe("the collection of strategies", () => {
  it("says on each row whether its plan is accepted or outdated", async () => {
    mount("acceptedFujiList");
    await screen.findByRole("heading", { name: "Tus estrategias" });
    const rows = screen.getAllByRole("button", {
      name: /Fuji 6 Horas|Le Mans|Spa/,
    });
    const textOf = (name: RegExp) =>
      rows.find((row) => name.test(row.textContent ?? ""))?.textContent ?? "";
    expect(textOf(/Fuji 6 Horas/)).toContain("Desactualizado");
    expect(textOf(/Le Mans/)).toContain("Plan aceptado");
    expect(textOf(/Spa/)).not.toMatch(/Plan aceptado|Desactualizado/);
  });

  it("says Plan aceptado for a file whose plan is up to date", async () => {
    mount("acceptedFuji");
    await screen.findByRole("heading", { name: "Tus estrategias" });
    const row = screen.getByRole("button", { name: /Fuji 6 Horas/ });
    expect(row.textContent).toContain("Plan aceptado");
    expect(row.textContent).not.toContain("Desactualizado");
  });
});

// ---- when the host says no ----

describe("when the host refuses", () => {
  async function refused(
    method: Request["method"],
    error: HostError,
    scene = "plannedFuji",
    act = () => click("Aceptar propuesta"),
  ) {
    const request = mount(scene, (r) =>
      r.method === method ? error : undefined,
    );
    await openPlan();
    act();
    return request;
  }

  it.each([
    [
      { kind: "strategyNotAcceptable" } as HostError,
      "Este plan no se puede aceptar: no tiene un calendario de paradas. Calcula el plan de nuevo.",
    ],
    [
      { kind: "strategyEditPending" } as HostError,
      "Tienes ajustes del plan sin recalcular. Recalcula o restablece antes de continuar.",
    ],
    [
      { kind: "protected" } as HostError,
      "Este archivo es de una versión más nueva de Vantare: no se puede cambiar el plan aceptado.",
    ],
    [
      { kind: "busy" } as HostError,
      "El archivo está ocupado. Vuelve a intentarlo.",
    ],
  ])(
    "says %j in an alert and leaves the plan as it was",
    async (error, text) => {
      await refused("strategy.accept", error);
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(text);
      expect(stateTag()).toBe("Propuesta");
      expect(button("Aceptar propuesta")).toBeTruthy();
      expect(fileState()).toBe("saved");
    },
  );

  it("says there is no accepted plan to remove or to show", async () => {
    const user = userEvent.setup();
    mount("acceptedFuji", (request) =>
      request.method === "strategy.unaccept"
        ? { kind: "strategyNoAcceptedPlan" }
        : undefined,
    );
    await openPlan("Plan aceptado");
    await user.click(button("Más acciones del plan aceptado"));
    await user.click(
      await screen.findByRole("menuitem", { name: /Quitar plan aceptado/ }),
    );
    await user.click(
      within(
        screen.getByRole("group", { name: "¿Quitar el plan aceptado?" }),
      ).getByRole("button", { name: "Quitar plan aceptado" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Ya no hay un plan aceptado en esta estrategia.",
    );
  });

  it("shows the host's plan when it answers a conflict, and says the plan changed", async () => {
    let current: StrategyView | undefined;
    const request = mount(
      "plannedFuji",
      (request) =>
        request.method === "strategy.accept" && current
          ? { kind: "strategyConflict", current }
          : undefined,
      (view) => {
        current ??= (() => {
          // the host's view: another plan, already accepted
          const next = structuredClone(view);
          next.plan.computeId = 9;
          next.revision = "b".repeat(64);
          if (next.plan.result?.metrics)
            next.plan.result.metrics.totalSeconds += 10;
          return next;
        })();
        return view;
      },
    );
    await openPlan();
    click("Aceptar propuesta");
    await waitFor(() =>
      expect(status()).toBe("El plan ha cambiado. Te mostramos el actual."),
    );
    // the view of the host replaced the screen's: its plan is what is on view
    await screen.findByText("6:01:14");
    expect(calls(request, "strategy.accept")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    // and the next press goes with what that view says
    click("Aceptar propuesta");
    await waitFor(() =>
      expect(calls(request, "strategy.accept")).toHaveLength(2),
    );
    expect(calls(request, "strategy.accept")[1]).toMatchObject({
      revision: "b".repeat(64),
      computeId: 9,
    });
  });

  it("shows the plan that was on view when a conflict comes while showing the accepted one", async () => {
    let current: StrategyView | undefined;
    mount(
      "acceptedFujiNew",
      (request) =>
        request.method === "strategy.showAccepted" && current
          ? { kind: "strategyConflict", current }
          : undefined,
      (view) => {
        current ??= structuredClone(view);
        return view;
      },
    );
    await openPlan();
    click("Volver al plan aceptado");
    await waitFor(() =>
      expect(status()).toBe("El plan ha cambiado. Te mostramos el actual."),
    );
    expect(stateTag()).toBe("Propuesta");
  });
});

// ---- the words of the screen ----

describe("the words of the screen", () => {
  it("never show a path, nor the Ingeniero", async () => {
    for (const scene of [
      "plannedFuji",
      "acceptedFujiNew",
      "acceptedFujiStale",
      "acceptedFujiUnreachable",
    ]) {
      cleanup();
      mount(scene);
      await openRace();
      const race =
        document.querySelector(".strategy-screen")?.textContent ?? "";
      fireEvent.click(tab("Plan"));
      await waitFor(() =>
        expect(document.querySelector(".strategy-plan")).not.toBeNull(),
      );
      const plan =
        document.querySelector(".strategy-screen")?.textContent ?? "";
      for (const text of [race, plan]) {
        expect(text, scene).not.toMatch(
          /[a-z]:[\\/]|\\\\|(^|\s)\/(?:[^\s]+\/)+/im,
        );
        expect(text, scene).not.toMatch(/Ingeniero/);
      }
    }
  });

  it("has a single status line whatever the state", async () => {
    for (const scene of ["plannedFuji", "acceptedFuji", "acceptedFujiNew"]) {
      cleanup();
      mount(scene);
      await openPlan(
        scene === "plannedFuji" || scene === "acceptedFujiNew"
          ? "Plan calculado"
          : "Plan aceptado",
      );
      expect(screen.getAllByRole("status"), scene).toHaveLength(1);
    }
  });
});

// ---- a recalculated plan is a proposal too ----

describe("a recalculated plan", () => {
  async function recalculate() {
    await openPlan();
    click("Ajustar paradas");
    fireEvent.click(screen.getByRole("radio", { name: "Parada 1, vuelta 43" }));
    click("− 1 vuelta");
    await heading("Plan modificado");
    click("Recalcular");
    await waitFor(() =>
      expect(status()).toBe(
        "Plan recalculado sin garantía de ser el más rápido.",
      ),
    );
    click("Resumen");
  }

  it("is a proposal that is not in the file, in the plan and in the card of Carrera", async () => {
    mount("plannedFuji");
    await recalculate();
    expect(stateTag()).toBe("Propuesta");
    expect(
      screen.getByText("Puedes aceptarla aunque no tenga garantía"),
    ).toBeTruthy();
    expect(button("Aceptar propuesta")).toBeTruthy();
    // moving and recalculating do not touch the file
    expect(fileState()).toBe("saved");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(tab("Carrera"));
    expect(cardTag()).toBe("Propuesta");
    expect(screen.getByText("Calculado · 6:01:06 · 5 paradas")).toBeTruthy();
    // it has no guarantee: the card does not accept it, the plan does after saying so
    expect(maybe("Aceptar propuesta")).toBeNull();
  });

  it("is accepted with its own calendar, and a new adjustment leaves the accepted plan alone", async () => {
    const request = mount("plannedFuji");
    await recalculate();
    click("Aceptar propuesta");
    await heading("Plan aceptado");
    expect(fileState()).toBe("dirty");
    click("Ajustar paradas");
    click("+ 1 vuelta");
    await heading("Plan modificado");
    // no accept while the plan is adjusted, no tag, and the plan accepted stays in the file
    expect(maybe("Aceptar propuesta")).toBeNull();
    expect(stateTag()).toBeNull();
    expect(fileState()).toBe("dirty");
    expect(calls(request, "strategy.unaccept")).toHaveLength(0);
    click("Restablecer");
    await waitFor(() => expect(status()).toBe("Ajustes restablecidos."));
    click("Resumen");
    await heading("Plan aceptado");
    expect(stateTag()).toBe("Aceptado");
  });

  it("goes back to the plan of the file when the accepted plan is shown again", async () => {
    mount("acceptedFujiNew");
    await openPlan();
    click("Ajustar paradas");
    click("+ 1 vuelta");
    await heading("Plan modificado");
    // adjusting hides the comparison; Restablecer brings the proposal back with it
    expect(
      screen.queryByRole("region", { name: "Ya tienes un plan aceptado" }),
    ).toBeNull();
    click("Restablecer");
    click("Resumen");
    await screen.findByRole("region", { name: "Ya tienes un plan aceptado" });
  });
});

// ---- a new proposal with the same calendar as an OUTDATED accepted plan ----
// The host compares the calendar only: after a change of pace the stops come out
// the same, so `compare.same` is true while the accepted plan is still `stale`.

describe("a proposal with the same calendar as an outdated accepted plan", () => {
  it("is a proposal, with its own certificate and figures, next to the outdated plan", async () => {
    mount("acceptedFujiStaleSame");
    await openPlan();
    expect(stateTag()).toBe("Propuesta");
    // the certificate of the new plan, not the notice of the outdated one
    expect(
      screen.getByText("Comprobado: es el plan más rápido con estos datos"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", {
        name: "Los datos de la carrera han cambiado desde que aceptaste este plan",
      }),
    ).toBeNull();
    // the figures are those of this proposal: nothing is «datos antiguos»
    expect(screen.queryByText("datos antiguos")).toBeNull();
    expect(screen.getByText("6:02:45")).toBeTruthy();
    expect(
      screen.getByText("1 min 41 s más que tu plan aceptado"),
    ).toBeTruthy();
    // the outdated plan is shown apart, with what changed and the way back
    const card = screen.getByRole("region", {
      name: "Ya tienes un plan aceptado",
    });
    expect(card.textContent).toContain("6:01:04 · 5 paradas · desactualizado");
    expect(card.textContent).toContain(
      "Esta propuesta: 6:02:45 · 5 paradas · mismas paradas",
    );
    expect(
      within(card).getByText("Ritmo por vuelta: 1:30,472 → 1:30,900"),
    ).toBeTruthy();
    expect(
      within(card).getByRole("button", { name: "Volver al plan aceptado" }),
    ).toBeTruthy();
    // and it can be accepted: it is the way out
    expect(button("Aceptar propuesta")).toBeTruthy();
    expect(maybe("Calcular con los datos nuevos")).toBeNull();
  });

  it("is accepted at once, with no question: it brings the plan up to date and loses nothing", async () => {
    const request = mount("acceptedFujiStaleSame");
    await openPlan();
    const before = await lastView(request);
    click("Aceptar propuesta");
    await heading("Plan aceptado");
    expect(
      screen.queryByRole("group", {
        name: "¿Sustituir tu plan aceptado por esta propuesta?",
      }),
    ).toBeNull();
    expect(calls(request, "strategy.accept")).toEqual([
      {
        method: "strategy.accept",
        revision: before.revision,
        computeId: before.plan.computeId,
      },
    ]);
    expect(status()).toBe("Plan aceptado.");
    expect(stateTag()).toBe("Aceptado");
    expect(screen.queryByText("datos antiguos")).toBeNull();
    expect(screen.getByText("6:02:45")).toBeTruthy();
    // the file had a plan: «Deshacer» would leave none, so it is not offered
    expect(maybe("Deshacer")).toBeNull();
    expect(fileState()).toBe("dirty");
  });

  it("goes back to the outdated plan with its notice", async () => {
    const request = mount("acceptedFujiStaleSame");
    await openPlan();
    click("Volver al plan aceptado");
    await heading("Plan aceptado");
    expect(calls(request, "strategy.showAccepted")).toHaveLength(1);
    expect(stateTag()).toBe("Desactualizado");
    expect(
      screen.getByRole("region", {
        name: "Los datos de la carrera han cambiado desde que aceptaste este plan",
      }),
    ).toBeTruthy();
  });

  it("says in the card of Carrera that it brings the outdated plan up to date", async () => {
    mount("acceptedFujiStaleSame");
    await openRace();
    expect(cardTag()).toBe("Propuesta");
    expect(
      screen.getByText(
        "Tu plan aceptado está desactualizado; esta propuesta lo pone al día.",
      ),
    ).toBeTruthy();
    expect(maybe("Aceptar propuesta")).toBeNull();
  });
});

// ---- the words of the question tell the truth about «Descartar cambios» ----
// `strategy.discard` goes back to the FILE: it brings back a plan only if the
// file holds it (`accepted.saved`).

describe("what the question says about getting the plan back", () => {
  const recover = "Hasta entonces, «Descartar cambios» lo recupera.";
  async function acceptThenRecalculate() {
    await openPlan();
    click("Aceptar propuesta");
    await heading("Plan aceptado");
    click("Ajustar paradas");
    fireEvent.click(screen.getByRole("radio", { name: "Parada 1, vuelta 43" }));
    click("− 1 vuelta");
    await heading("Plan modificado");
    click("Recalcular");
    await waitFor(() =>
      expect(status()).toBe(
        "Plan recalculado sin garantía de ser el más rápido.",
      ),
    );
    click("Resumen");
  }

  it("says «Descartar cambios» brings it back when the file holds the plan", async () => {
    const user = userEvent.setup();
    mount("acceptedFujiNew");
    await openPlan();
    await user.click(button("Aceptar propuesta"));
    const question = screen.getByRole("group", {
      name: "¿Sustituir tu plan aceptado por esta propuesta?",
    });
    expect(question.textContent).toContain(recover);
    expect(question.textContent).not.toContain("no se puede recuperar");
  });

  it("does not say it when the plan to replace was never saved", async () => {
    const user = userEvent.setup();
    mount("plannedFuji");
    await acceptThenRecalculate();
    expect(fileState()).toBe("dirty");
    await user.click(button("Aceptar propuesta"));
    const question = screen.getByRole("group", {
      name: "¿Sustituir tu plan aceptado por esta propuesta?",
    });
    expect(question.textContent).toContain(
      "El plan aceptado de ahora (6:01:04 · 5 paradas) se pierde y no se puede recuperar: todavía no está guardado en el archivo.",
    );
    expect(question.textContent).not.toContain("Descartar cambios");
  });

  it("does not say it when removing a plan that was never saved, and says it when it was", async () => {
    const user = userEvent.setup();
    mount("plannedFuji");
    await acceptThenRecalculate();
    click("Volver al plan aceptado");
    await heading("Plan aceptado");
    await user.click(button("Más acciones del plan aceptado"));
    await user.click(
      await screen.findByRole("menuitem", { name: /Quitar plan aceptado/ }),
    );
    const question = screen.getByRole("group", {
      name: "¿Quitar el plan aceptado?",
    });
    expect(question.textContent).toContain(
      "El plan aceptado (6:01:04 · 5 paradas) se pierde y no se puede recuperar: todavía no está guardado en el archivo.",
    );
    expect(question.textContent).not.toContain("Descartar cambios");
    // saved, the old words are true
    cleanup();
    mount("acceptedFuji");
    await openPlan("Plan aceptado");
    await user.click(button("Más acciones del plan aceptado"));
    await user.click(
      await screen.findByRole("menuitem", { name: /Quitar plan aceptado/ }),
    );
    expect(
      screen.getByRole("group", { name: "¿Quitar el plan aceptado?" })
        .textContent,
    ).toContain(recover);
  });
});

// ---- the accepted plan is never out of reach ----

describe("the way back to the accepted plan", () => {
  it("is offered when the proposal has no plan", async () => {
    const request = mount("plannedFuji");
    await openPlan();
    click("Aceptar propuesta");
    await heading("Plan aceptado");
    click("Ajustar paradas");
    fireEvent.click(screen.getByRole("radio", { name: "Parada 2, vuelta 85" }));
    click("+ 1 vuelta");
    await heading("Plan modificado");
    click("Recalcular");
    await heading("Sin plan posible");
    click("Volver al plan aceptado");
    await heading("Plan aceptado");
    expect(calls(request, "strategy.showAccepted")).toHaveLength(1);
    expect(status()).toBe("Mostrando el plan aceptado.");
    expect(stateTag()).toBe("Aceptado");
  });

  it("is offered when the calculation did not finish a plan", async () => {
    const request = mount("acceptedFuji", undefined, (view) => {
      const next = structuredClone(view);
      if (next.plan.accepted) {
        next.plan.state = "partial";
        next.plan.computeId = 5;
        next.plan.result = {
          certificate: null,
          steps: { fuelLiters: 1, vePercent: 1 },
          degraded: false,
          reason: "searchBudgetExhausted",
          metrics: null,
          timeline: null,
        };
        next.plan.accepted.compare = null;
      }
      return next;
    });
    await openPlan("Cálculo sin terminar");
    click("Volver al plan aceptado");
    await heading("Plan aceptado");
    expect(calls(request, "strategy.showAccepted")).toHaveLength(1);
  });

  it("is offered when the calculation failed", async () => {
    const request = mount("acceptedFuji", undefined, (view) => {
      const next = structuredClone(view);
      next.plan.state = "error";
      next.plan.error = "failed";
      next.plan.computeId = 5;
      return next;
    });
    await openRace();
    fireEvent.click(tab("Plan"));
    await heading("No se pudo calcular");
    click("Volver al plan aceptado");
    await heading("Plan aceptado");
    expect(calls(request, "strategy.showAccepted")).toHaveLength(1);
  });

  it("is not offered when there is no accepted plan", async () => {
    mount("plannedFujiNoSolution");
    await openPlan();
    click("Ajustar paradas");
    click("+ 1 vuelta");
    await heading("Plan modificado");
    click("Recalcular");
    await heading("Sin plan posible");
    expect(maybe("Volver al plan aceptado")).toBeNull();
  });
});

// ---- small words ----

describe("the small words of the accepted plan", () => {
  it("says «y otro dato más» when one change is left out of the list", async () => {
    mount("acceptedFujiStale", undefined, (view) => {
      const next = structuredClone(view);
      if (next.plan.accepted)
        next.plan.accepted.changes = [
          "basePaceSeconds",
          "fuelPerLapLiters",
          "raceLaps",
          "reserveLaps",
          "refuelRate",
          "veRate",
          "fuelStep",
        ].map((field) => ({ field: field as never, before: "1", after: "2" }));
      return next;
    });
    await openPlan("Plan aceptado");
    expect(screen.getByText("y otro dato más")).toBeTruthy();
  });
});
