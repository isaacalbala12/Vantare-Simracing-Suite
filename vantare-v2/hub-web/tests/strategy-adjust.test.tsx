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
import {
  editSummary,
  movedStops,
  planAnnouncement,
  planCard,
  scheduleTimeline,
} from "../src/renderer/screens/strategy/planText";
import { StrategyScreen } from "../src/renderer/ui/strategy/StrategyScreen";

afterEach(cleanup);

// What the adjusting of the plan does, seen from the screen. The mock host answers
// like the real one: `plannedFuji` is Opus' Fuji case with its editable schedule
// (236 laps, 6 stints, stops on laps 43, 85, 127, 170 and 212).

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
const click = (name: string) => fireEvent.click(button(name));
const tab = (name: string) => screen.getByRole("tab", { name });
const heading = (name: string) => screen.findByRole("heading", { name });
const status = () => screen.getByRole("status").textContent;
const calls = <M extends Request["method"]>(request: Client, method: M) =>
  request.mock.calls
    .map(([r]) => r)
    .filter((r): r is Extract<Request, { method: M }> => r.method === method);
// The last view the host sent so far.
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
const slider = () => screen.getByRole("slider") as HTMLInputElement;
const lap = () =>
  screen.getByRole("textbox", {
    name: "Termina en la vuelta",
  }) as HTMLInputElement;

async function openRace() {
  await screen.findByRole("heading", { name: "Tus estrategias" });
  click("Continuar");
}
async function openPlan() {
  await openRace();
  fireEvent.click(tab("Plan"));
  await heading("Plan calculado");
}
async function stints() {
  await openPlan();
  click("Ajustar stints");
}
async function stops() {
  await openPlan();
  click("Ajustar paradas");
}
// Moves the end of stint 2 (the second stop, lap 85) to lap 90.
async function moveSecondBoundary() {
  fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 42 vueltas" }));
  fireEvent.change(slider(), { target: { value: "90" } });
  await heading("Plan modificado");
}
async function moveSecondStop() {
  fireEvent.click(screen.getByRole("radio", { name: "Parada 2, vuelta 85" }));
  click("+ 1 vuelta");
  await heading("Plan modificado");
}
// Brings the first stop one lap forward (lap 43 to 42). The crate test
// `fuji_with_virtual_energy_recalculates_the_edited_schedule_with_the_fallback`
// shows the solver gives a plan for it, and not for the second stop one lap
// later (`an_edit_that_needs_an_extra_stop_is_refused_with_max_stops`).
async function moveFirstStopEarlier() {
  fireEvent.click(screen.getByRole("radio", { name: "Parada 1, vuelta 43" }));
  click("− 1 vuelta");
  await heading("Plan modificado");
}
const notSaved =
  "Estos ajustes son de prueba hasta que recalcules y aceptes el plan.";

// ---- the selector ----

describe("the view selector", () => {
  it("offers Resumen, Ajustar stints and Ajustar paradas when the plan has a schedule", async () => {
    mount("plannedFuji");
    await openPlan();
    const group = screen.getByRole("group", { name: "Vista del plan" });
    const choices = within(group).getAllByRole("button");
    expect(choices.map((item) => item.textContent)).toEqual([
      "Resumen",
      "Ajustar stints",
      "Ajustar paradas",
    ]);
    expect(button("Resumen").getAttribute("aria-pressed")).toBe("true");
    expect(button("Ajustar stints").getAttribute("aria-pressed")).toBe("false");
    // the summary has nothing to adjust yet
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText(notSaved)).toBeNull();
  });

  it("is not there when the plan cannot be adjusted by hand, and says why", async () => {
    mount("plannedFujiNoEdit");
    await openPlan();
    expect(screen.queryByRole("group", { name: "Vista del plan" })).toBeNull();
    expect(
      screen.getByText("Este plan no se puede ajustar a mano."),
    ).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
    for (const name of [/Recalcular/, /Restablecer/, /Ajustar/])
      expect(screen.queryByRole("button", { name })).toBeNull();
    // the plan itself is all there
    expect(screen.getByText("6:01:04")).toBeTruthy();
  });

  it("is not there without a calculation", async () => {
    mount("ready");
    await openRace();
    fireEvent.click(tab("Plan"));
    await heading("Sin calcular");
    expect(screen.queryByRole("group", { name: "Vista del plan" })).toBeNull();
  });

  it("is not there when the plan has no stop to move", async () => {
    mount("plannedFuji", undefined, (view) => {
      const { plan } = view;
      if (plan.result?.timeline && plan.edit) {
        const [first] = plan.result.timeline.stints;
        plan.result.timeline.stints = [{ ...first, toLap: 236 }];
        plan.result.timeline.pits = [];
        plan.edit = {
          stints: [{ fromLap: 1, toLap: 236 }],
          stops: [],
          canReset: false,
          error: null,
        };
      }
      return view;
    });
    await openPlan();
    expect(screen.queryByRole("group", { name: "Vista del plan" })).toBeNull();
    expect(
      screen.getByText("Este plan no tiene paradas que ajustar."),
    ).toBeTruthy();
  });
});

// ---- adjusting stints ----

describe("adjusting a stint", () => {
  it("picks the stint in a group of radio buttons the arrows walk through", async () => {
    mount("plannedFuji");
    await stints();
    const group = screen.getByRole("group", { name: "Elige el stint" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "Stint 1, 43 vueltas",
      "Stint 2, 42 vueltas",
      "Stint 3, 42 vueltas",
      "Stint 4, 43 vueltas",
      "Stint 5, 42 vueltas",
      "Stint 6, 24 vueltas",
    ]);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
    const user = userEvent.setup();
    radios[0].focus();
    await user.keyboard("{ArrowRight}");
    expect((radios[1] as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(radios[1]);
    expect(slider().value).toBe("85");
  });

  it("gives the slider the range of its stop and says what is left in each stint", async () => {
    mount("plannedFuji");
    await stints();
    fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 42 vueltas" }));
    const range = slider();
    expect(range.getAttribute("min")).toBe("44");
    expect(range.getAttribute("max")).toBe("126");
    expect(range.value).toBe("85");
    expect(range.getAttribute("aria-valuetext")).toBe(
      "Vuelta 85: el stint 2 tiene 42 vueltas y el stint 3, 42 vueltas",
    );
    expect(range.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Termina en la vuelta" })).toBe(
      range,
    );
    expect(lap().value).toBe("85");
    // the proposal is on view
    expect(screen.getByText("propuesta: 85")).toBeTruthy();
    // a keyboard user is told how to move it
    expect(
      screen.getByText(/Cada stint conserva al menos 1 vuelta/),
    ).toBeTruthy();
  });

  it("moves the end of the stint with the plan it acts on, and shows the plan as modified", async () => {
    const request = mount("plannedFuji");
    await stints();
    const view = await lastView(request);
    await moveSecondBoundary();
    expect(calls(request, "strategy.moveBoundary")).toEqual([
      {
        method: "strategy.moveBoundary",
        computeId: view.plan.computeId,
        revision: view.revision,
        index: 1,
        lap: 90,
      },
    ]);
    expect(
      screen.getByText("La parada 2 pasa de la vuelta 85 a la 90."),
    ).toBeTruthy();
    expect(slider().value).toBe("90");
    expect(slider().getAttribute("aria-valuetext")).toBe(
      "Vuelta 90: el stint 2 tiene 47 vueltas y el stint 3, 37 vueltas",
    );
    expect(status()).toBe(
      "Parada 2 en la vuelta 90. Cambios pendientes de recalcular.",
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("takes a typed lap with Enter and keeps it inside the range of its stop", async () => {
    const request = mount("plannedFuji");
    await stints();
    fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 42 vueltas" }));
    fireEvent.change(lap(), { target: { value: "500" } });
    fireEvent.keyDown(lap(), { key: "Enter" });
    await heading("Plan modificado");
    expect(calls(request, "strategy.moveBoundary").map((r) => r.lap)).toEqual([
      126,
    ]);
    expect(lap().value).toBe("126");
    fireEvent.change(lap(), { target: { value: "0" } });
    fireEvent.keyDown(lap(), { key: "Enter" });
    await waitFor(() => expect(slider().value).toBe("44"));
    expect(calls(request, "strategy.moveBoundary").map((r) => r.lap)).toEqual([
      126, 44,
    ]);
  });

  it("ignores what is not a lap when typed, and goes back to the lap it had", async () => {
    const request = mount("plannedFuji");
    await stints();
    fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 42 vueltas" }));
    fireEvent.change(lap(), { target: { value: "abc" } });
    fireEvent.blur(lap());
    expect(lap().value).toBe("85");
    fireEvent.change(lap(), { target: { value: "12,5" } });
    fireEvent.blur(lap());
    expect(lap().value).toBe("85");
    expect(calls(request, "strategy.moveBoundary")).toHaveLength(0);
  });

  it("asks only for the latest lap when the slider moves faster than the host answers", async () => {
    const request = mount("plannedFuji");
    await stints();
    fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 42 vueltas" }));
    for (const value of ["86", "87", "88", "89"])
      fireEvent.change(slider(), { target: { value } });
    await waitFor(() => expect(slider().value).toBe("89"));
    await waitFor(() => expect(status()).toContain("vuelta 89"));
    const laps = calls(request, "strategy.moveBoundary").map((r) => r.lap);
    expect(laps[0]).toBe(86);
    expect(laps.at(-1)).toBe(89);
    expect(laps.length).toBeLessThan(4);
  });

  it("goes back to the host's lap when the host refuses the move", async () => {
    mount("plannedFuji", (request) =>
      request.method === "strategy.moveBoundary"
        ? { kind: "rejected" }
        : undefined,
    );
    await stints();
    fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 42 vueltas" }));
    fireEvent.change(slider(), { target: { value: "90" } });
    await screen.findByRole("alert");
    expect(slider().value).toBe("85");
    expect(
      screen.queryByRole("heading", { name: "Plan modificado" }),
    ).toBeNull();
  });

  it("does not offer a slider for the last stint, which ends with the race", async () => {
    const request = mount("plannedFuji");
    await stints();
    fireEvent.click(screen.getByRole("radio", { name: "Stint 6, 24 vueltas" }));
    expect(screen.queryByRole("slider")).toBeNull();
    expect(
      screen.getByText(/El último stint termina con la carrera/),
    ).toBeTruthy();
    expect(calls(request, "strategy.moveBoundary")).toHaveLength(0);
  });

  it("says the edits are for trying and do not go to the file, before and after the first one", async () => {
    mount("plannedFuji");
    await stints();
    expect(screen.getAllByText(notSaved)).toHaveLength(1);
    await moveSecondBoundary();
    expect(screen.getAllByText(notSaved)).toHaveLength(1);
  });

  it("marks the amounts of the stop that ends the stint as the previous ones once it moved", async () => {
    mount("plannedFuji");
    await stints();
    fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 42 vueltas" }));
    expect(screen.queryByText("valor anterior")).toBeNull();
    await moveSecondBoundary();
    // the four figures of the plan and what the stop loads
    expect(screen.getAllByText("valor anterior")).toHaveLength(5);
    // the laps are the adjusted ones, not the previous ones
    expect(screen.getByText("44–90")).toBeTruthy();
  });
});

// ---- adjusting stops ----

describe("adjusting a stop", () => {
  it("picks the stop in a group of radio buttons and moves it one lap with the plan it acts on", async () => {
    const request = mount("plannedFuji");
    await stops();
    const group = screen.getByRole("group", { name: "Elige la parada" });
    expect(within(group).getAllByRole("radio")).toHaveLength(5);
    const view = await lastView(request);
    await moveSecondStop();
    expect(calls(request, "strategy.moveStop")).toEqual([
      {
        method: "strategy.moveStop",
        computeId: view.plan.computeId,
        revision: view.revision,
        index: 1,
        delta: 1,
      },
    ]);
    expect(screen.getByText("Vuelta 86")).toBeTruthy();
    expect(
      screen.getByText("antes en la 85 · pendiente de recalcular"),
    ).toBeTruthy();
    expect(status()).toBe(
      "Parada 2 en la vuelta 86. Cambios pendientes de recalcular.",
    );
    click("− 1 vuelta");
    await waitFor(() =>
      expect(calls(request, "strategy.moveStop").map((r) => r.delta)).toEqual([
        1, -1,
      ]),
    );
    await waitFor(() => expect(screen.getByText("Vuelta 85")).toBeTruthy());
  });

  it("shows what the stop loads and says it is the plan's, not the adjusted one, once it moved", async () => {
    mount("plannedFuji");
    await stops();
    fireEvent.click(screen.getByRole("radio", { name: "Parada 2, vuelta 85" }));
    expect(screen.getByText("+77 L")).toBeTruthy();
    expect(screen.getByText("+97 %")).toBeTruthy();
    expect(screen.getByText("Nuevos")).toBeTruthy();
    expect(screen.queryByText("valor anterior")).toBeNull();
    click("+ 1 vuelta");
    await heading("Plan modificado");
    // four figures of the plan and four values of the stop
    expect(screen.getAllByText("valor anterior")).toHaveLength(8);
  });

  it("sends a single request for a double click on + 1 vuelta", async () => {
    const request = mount("plannedFuji");
    await stops();
    fireEvent.click(screen.getByRole("radio", { name: "Parada 2, vuelta 85" }));
    const plus = button("+ 1 vuelta");
    fireEvent.click(plus);
    fireEvent.click(plus);
    await heading("Plan modificado");
    expect(calls(request, "strategy.moveStop")).toHaveLength(1);
  });

  it("keeps the button focusable at the end of its range, does nothing and says why", async () => {
    // the first stop can go to lap 1 at the earliest; here it is already there
    const request = mount("plannedFuji", undefined, (view) => {
      const { edit, result } = view.plan;
      if (edit && result?.timeline) {
        edit.stops[0].lap = edit.stops[0].minLap;
        edit.stints[0].toLap = edit.stops[0].lap;
        edit.stints[1].fromLap = edit.stops[0].lap + 1;
        result.timeline.pits[0].lap = edit.stops[0].lap;
        result.timeline.stints[0].toLap = edit.stops[0].lap;
        result.timeline.stints[1].fromLap = edit.stops[0].lap + 1;
      }
      return view;
    });
    await stops();
    const earlier = button("− 1 vuelta");
    expect(earlier.getAttribute("aria-disabled")).toBe("true");
    expect((earlier as HTMLButtonElement).disabled).toBe(false);
    expect(earlier.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      screen.getByText(
        "No se puede adelantar más: el stint anterior se quedaría sin vueltas.",
      ),
    ).toBeTruthy();
    earlier.focus();
    fireEvent.click(earlier);
    expect(calls(request, "strategy.moveStop")).toHaveLength(0);
    expect(document.activeElement).toBe(earlier);
    expect(button("+ 1 vuelta").getAttribute("aria-disabled")).not.toBe("true");
  });

  it("disables + 1 vuelta at the last lap its stint allows", async () => {
    const request = mount("plannedFuji");
    await stops();
    fireEvent.click(screen.getByRole("radio", { name: "Parada 2, vuelta 85" }));
    // 126 is the last lap before stop 3 (127)
    for (let step = 0; step < 41; step++) {
      await waitFor(() =>
        expect(button("+ 1 vuelta").getAttribute("aria-disabled")).not.toBe(
          "true",
        ),
      );
      click("+ 1 vuelta");
    }
    await waitFor(() =>
      expect(button("+ 1 vuelta").getAttribute("aria-disabled")).toBe("true"),
    );
    expect(screen.getByText("Vuelta 126")).toBeTruthy();
    expect(
      screen.getByText(
        "No se puede retrasar más: el stint siguiente se quedaría sin vueltas.",
      ),
    ).toBeTruthy();
    const sent = calls(request, "strategy.moveStop").length;
    click("+ 1 vuelta");
    expect(calls(request, "strategy.moveStop")).toHaveLength(sent);
  });
});

// ---- the edited plan ----

describe("a plan with pending changes", () => {
  it("is called Plan modificado, marks its figures as the previous ones and offers Recalcular and Restablecer", async () => {
    mount("plannedFuji");
    await stops();
    expect(screen.queryByRole("button", { name: "Restablecer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Recalcular" })).toBeNull();
    await moveSecondStop();
    const figures = screen.getByRole("list", { name: "Cifras del plan" });
    expect(within(figures).getAllByText("valor anterior")).toHaveLength(4);
    expect(within(figures).getByText("6:01:04")).toBeTruthy();
    expect(button("Recalcular")).toBeTruthy();
    expect(button("Restablecer")).toBeTruthy();
    // the old guarantee is not said of a plan that no longer is that one
    expect(screen.queryByText(/Comprobado: es el plan más rápido/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Calcular de nuevo" }),
    ).toBeNull();
    expect(
      screen.getByText(/Las cifras de abajo son del plan anterior/),
    ).toBeTruthy();
    expect(screen.getAllByText(notSaved)).toHaveLength(1);
  });

  it("does not mark the file as unsaved by moving, recalculating or resetting", async () => {
    const request = mount("plannedFuji");
    await stops();
    const fileState = () =>
      document
        .querySelector(".strategy-file-state")
        ?.getAttribute("data-state");
    expect(fileState()).toBe("saved");
    await moveFirstStopEarlier();
    expect(fileState()).toBe("saved");
    expect((button("Guardar") as HTMLButtonElement).disabled).toBe(true);
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    expect(fileState()).toBe("saved");
    click("− 1 vuelta");
    await heading("Plan modificado");
    click("Restablecer");
    await waitFor(() => expect(status()).toBe("Ajustes restablecidos."));
    expect(fileState()).toBe("saved");
    expect(calls(request, "strategy.save")).toHaveLength(0);
  });

  it("recalculates with the plan it acts on, keeps the plan on view and can cancel", async () => {
    const request = mount("plannedFujiRecalculating");
    await stops();
    await moveSecondStop();
    const edited = await lastView(request);
    click("Recalcular");
    await heading("Recalculando…");
    expect(calls(request, "strategy.recalculate")).toEqual([
      {
        method: "strategy.recalculate",
        computeId: edited.plan.computeId,
        revision: edited.revision,
      },
    ]);
    expect(status()).toBe("Recalculando el plan.");
    // the plan and its edit stay on view, but nothing can be moved meanwhile
    expect(screen.getByText("6:01:04")).toBeTruthy();
    expect(button("+ 1 vuelta").getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("button", { name: "Recalcular" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restablecer" })).toBeNull();
    const calculating = await lastView(request);
    click("Cancelar");
    await heading("Plan modificado");
    expect(calls(request, "strategy.cancel")).toEqual([
      { method: "strategy.cancel", computeId: calculating.plan.computeId },
    ]);
    expect(status()).toBe(
      "Recálculo cancelado. Tus ajustes siguen pendientes.",
    );
    // the adjusted schedule is still there
    expect(screen.getByText("Vuelta 86")).toBeTruthy();
    expect(button("Recalcular")).toBeTruthy();
  });

  it("locks the stint slider while the host recalculates", async () => {
    mount("plannedFujiRecalculating");
    await stints();
    await moveSecondBoundary();
    click("Recalcular");
    await heading("Recalculando…");
    expect(slider().disabled).toBe(true);
    expect(lap().disabled).toBe(true);
  });

  it("applies the recalculated plan: new figures, announced, with no Restablecer left", async () => {
    mount("plannedFuji");
    await stops();
    await moveFirstStopEarlier();
    click("Recalcular");
    // the solver does not prove a recalculated Fuji calendar: it says so
    await waitFor(() =>
      expect(status()).toBe(
        "Plan recalculado sin garantía de ser el más rápido.",
      ),
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByText("valor anterior")).toBeNull();
    expect(screen.queryByRole("button", { name: "Restablecer" })).toBeNull();
    // the adjusted schedule is now the plan's, and no faster than the proven one
    expect(screen.getByText("Vuelta 42")).toBeTruthy();
    expect(screen.queryByText(/pendiente de recalcular/)).toBeNull();
    // it can be adjusted again and the new ids are the ones the requests carry
    expect(
      screen.getByRole("heading", { name: "Ajustar paradas" }),
    ).toBeTruthy();
    expect(screen.getAllByText(notSaved)).toHaveLength(1);
  });

  it("says a recalculated plan has no guarantee, with the same words as a calculated one", async () => {
    mount("plannedFujiPartial");
    await stops();
    await moveFirstStopEarlier();
    click("Recalcular");
    await waitFor(() =>
      expect(status()).toBe(
        "Plan recalculado sin garantía de ser el más rápido.",
      ),
    );
    click("Resumen");
    expect(
      screen.getByText(
        "Plan válido, pero sin garantía de que sea el más rápido",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("La búsqueda se detuvo antes de poder comprobarlo."),
    ).toBeTruthy();
  });

  it("uses the id of the recalculated plan for the next move", async () => {
    const request = mount("plannedFuji");
    await stops();
    await moveFirstStopEarlier();
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    const [recalculated] = calls(request, "strategy.recalculate");
    click("− 1 vuelta");
    await waitFor(() =>
      expect(calls(request, "strategy.moveStop")).toHaveLength(2),
    );
    const [first, second] = calls(request, "strategy.moveStop");
    expect(first.computeId).toBe(recalculated.computeId);
    expect(second.computeId).not.toBe(recalculated.computeId);
  });

  it("sends a single request for a double click on Recalcular", async () => {
    const request = mount("plannedFuji");
    await stops();
    await moveFirstStopEarlier();
    const recalculate = button("Recalcular");
    fireEvent.click(recalculate);
    fireEvent.click(recalculate);
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    expect(calls(request, "strategy.recalculate")).toHaveLength(1);
  });

  it("resets to the plan the calculation gave, with the plan it acts on", async () => {
    const request = mount("plannedFuji");
    await stops();
    await moveSecondStop();
    const edited = await lastView(request);
    click("Restablecer");
    await waitFor(() => expect(status()).toBe("Ajustes restablecidos."));
    expect(calls(request, "strategy.resetEdit")).toEqual([
      {
        method: "strategy.resetEdit",
        computeId: edited.plan.computeId,
        revision: edited.revision,
      },
    ]);
    expect(screen.getByText("Vuelta 85")).toBeTruthy();
    expect(screen.queryByText("valor anterior")).toBeNull();
    expect(screen.queryByRole("button", { name: "Restablecer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Recalcular" })).toBeNull();
  });

  it("leaves Restablecer to go back when the recalculation finds no plan", async () => {
    mount("plannedFujiNoSolution");
    await stops();
    await moveSecondStop();
    click("Recalcular");
    await heading("Sin plan posible");
    expect(
      screen.getByText(
        "Las reglas del evento o el calendario editado no lo permiten.",
      ),
    ).toBeTruthy();
    expect(status()).toBe("Ningún plan termina la carrera con estos datos.");
    click("Restablecer");
    await heading("Ajustar paradas");
    expect(screen.getByText("Vuelta 85")).toBeTruthy();
    click("Resumen");
    expect(screen.getByText("6:01:04")).toBeTruthy();
  });

  it("shows the host's plan when it answers a conflict on the plan", async () => {
    let current: StrategyView | undefined;
    mount(
      "plannedFuji",
      (request) =>
        request.method === "strategy.moveStop" && current
          ? { kind: "strategyConflict", current }
          : undefined,
      (view) => {
        current ??= (() => {
          const next = structuredClone(view);
          next.plan.computeId = 9;
          if (next.plan.edit) {
            next.plan.edit.stops[1].lap = 100;
            next.plan.edit.stints[1].toLap = 100;
            next.plan.edit.stints[2].fromLap = 101;
          }
          return next;
        })();
        return view;
      },
    );
    await stops();
    fireEvent.click(screen.getByRole("radio", { name: "Parada 2, vuelta 85" }));
    click("+ 1 vuelta");
    await waitFor(() => expect(screen.getByText("Vuelta 100")).toBeTruthy());
    expect(status()).toBe("El plan ha cambiado. Te mostramos el actual.");
  });
});

// ---- when the recalculation fails ----

describe("a failed recalculation", () => {
  it.each([
    [
      "plannedFujiInvalidSchedule",
      "Ese calendario no es válido",
      "Las paradas no se pueden colocar así. Mueve alguna parada o pulsa «Restablecer».",
    ],
    [
      "plannedFujiEventRules",
      "Las reglas del evento no permiten este calendario",
      "El número de paradas choca con el mínimo o el máximo que pide el evento. Pulsa «Restablecer» para volver al plan calculado.",
    ],
    [
      "plannedFujiNotPreserved",
      "El cálculo no ha respetado tus ajustes",
      "El resultado no coincide con las paradas que pediste, así que no se ha aplicado. Puedes recalcular otra vez o pulsar «Restablecer».",
    ],
    [
      "plannedFujiEditFailed",
      "No se pudo recalcular",
      "Algo falló durante el recálculo. Tus ajustes siguen ahí. Prueba otra vez o pulsa «Restablecer».",
    ],
  ])(
    "%s says what happened and never leaves Recalcular stuck",
    async (scene, title, detail) => {
      const request = mount(scene);
      await stops();
      await moveSecondStop();
      click("Recalcular");
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(title);
      expect(alert.textContent).toContain(detail);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      // the plan stays modified, with its way out
      expect(
        screen.getByRole("heading", { name: "Plan modificado" }),
      ).toBeTruthy();
      expect(button("Restablecer")).toBeTruthy();
      const recalculate = button("Recalcular") as HTMLButtonElement;
      expect(recalculate.disabled).toBe(false);
      expect(recalculate.getAttribute("aria-disabled")).not.toBe("true");
      // a new try is a new request
      click("Recalcular");
      await waitFor(() =>
        expect(calls(request, "strategy.recalculate")).toHaveLength(2),
      );
      // and moving a stop clears the failure
      await screen.findByRole("alert");
      click("+ 1 vuelta");
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    },
  );
});

// ---- busy ----

describe("a busy host", () => {
  it.each([
    ["strategy.resetEdit", "Restablecer", "Ajustes restablecidos."],
    ["strategy.recalculate", "Recalcular", "Recalculando el plan."],
  ] as const)(
    "retries %s once after reading the next view, with no alarm and no fixed wait",
    async (method, label, said) => {
      let refused = false;
      const request = mount("plannedFuji", (next) => {
        if (next.method !== method || refused) return undefined;
        refused = true;
        return { kind: "busy" };
      });
      await stops();
      await moveSecondStop();
      const before = request.mock.calls.length;
      click(label);
      await waitFor(() => expect(status()).toBe(said));
      const after = request.mock.calls.slice(before).map(([r]) => r.method);
      expect(after.slice(0, 3)).toEqual([method, "strategy.view", method]);
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );

  it("shows the error when the host stays busy after the retry, and the button works again", async () => {
    const request = mount("plannedFuji", (next) =>
      next.method === "strategy.moveStop" ? { kind: "busy" } : undefined,
    );
    await stops();
    fireEvent.click(screen.getByRole("radio", { name: "Parada 2, vuelta 85" }));
    click("+ 1 vuelta");
    await screen.findByRole("alert");
    expect(calls(request, "strategy.moveStop")).toHaveLength(2);
    expect(button("+ 1 vuelta").getAttribute("aria-disabled")).not.toBe("true");
  });
});

// ---- the Plan card in the Carrera tab ----

describe("the plan card in Carrera", () => {
  it("says what the plan is in a line and leads to the Plan tab", async () => {
    mount("plannedFuji");
    await openRace();
    expect(screen.getByText("Calculado · 6:01:04 · 5 paradas")).toBeTruthy();
    expect(
      screen.getByText("Comprobado: es el plan más rápido con estos datos."),
    ).toBeTruthy();
    click("Ver plan");
    await heading("Plan calculado");
    expect(tab("Plan").getAttribute("aria-selected")).toBe("true");
  });

  it("says the plan is not the calculated one while it has changes, and what a partial one is", async () => {
    mount("plannedFuji");
    await stops();
    await moveSecondStop();
    fireEvent.click(tab("Carrera"));
    expect(
      screen.getByText("Plan modificado · pendiente de recalcular"),
    ).toBeTruthy();
    expect(screen.queryByText(/Comprobado/)).toBeNull();
  });

  it("is there for a plan with no guarantee, with its warning", async () => {
    mount("plannedFujiPartial");
    await openRace();
    expect(screen.getByText("Calculado · 6:01:04 · 5 paradas")).toBeTruthy();
    expect(
      screen.getByText(
        "Plan válido, pero sin garantía de que sea el más rápido.",
      ),
    ).toBeTruthy();
  });

  it("is not there without a plan, and nothing in its place does nothing", async () => {
    mount("ready");
    await openRace();
    expect(screen.queryByRole("button", { name: "Ver plan" })).toBeNull();
    expect(screen.queryByText(/Calculado ·/)).toBeNull();
  });

  it("says when a calculation found no plan", async () => {
    mount("reasonNoFeasiblePlan");
    await openRace();
    // the scene starts with no plan until it is calculated
    fireEvent.click(tab("Plan"));
    click("Calcular plan");
    await heading("Sin plan posible");
    fireEvent.click(tab("Carrera"));
    expect(screen.getByText("Sin plan posible")).toBeTruthy();
    expect(
      screen.getAllByText("Ningún plan termina la carrera con estos datos.")
        .length,
    ).toBeGreaterThan(0);
    click("Ver plan");
    await heading("Sin plan posible");
  });
});

// ---- a plan that changed is not a file that changed ----

describe("a conflict on the plan", () => {
  it.each([
    "strategy.moveBoundary",
    "strategy.moveStop",
    "strategy.recalculate",
    "strategy.resetEdit",
  ] as const)("%s says the plan changed, not the file", async (method) => {
    let current: StrategyView | undefined;
    let armed = false;
    mount(
      "plannedFuji",
      (request) =>
        armed && request.method === method && current
          ? { kind: "strategyConflict", current }
          : undefined,
      (view) => {
        current ??= (() => {
          const next = structuredClone(view);
          next.plan.computeId = 9;
          if (next.plan.edit) {
            next.plan.edit.stops[1].lap = 100;
            next.plan.edit.stints[1].toLap = 100;
            next.plan.edit.stints[2].fromLap = 101;
          }
          return next;
        })();
        return view;
      },
    );
    await stops();
    fireEvent.click(screen.getByRole("radio", { name: "Parada 2, vuelta 85" }));
    if (method === "strategy.recalculate" || method === "strategy.resetEdit")
      await moveSecondStop();
    armed = true;
    if (method === "strategy.moveStop") click("+ 1 vuelta");
    else if (method === "strategy.moveBoundary") {
      click("Ajustar stints");
      fireEvent.change(slider(), { target: { value: "90" } });
    } else
      click(method === "strategy.recalculate" ? "Recalcular" : "Restablecer");
    await waitFor(() =>
      expect(status()).toBe("El plan ha cambiado. Te mostramos el actual."),
    );
    // nothing was lost and the file is as it was: the text says no such thing
    expect(screen.queryByText(/No se ha guardado/)).toBeNull();
    expect(screen.queryByText(/archivo ha cambiado/)).toBeNull();
  });
});

// ---- the failure of a recalculation is not shown while it recalculates ----

// The host does not answer `strategy.view` until it is released.
function mountGated(
  scene: string,
  held: Request["method"],
  override?: (request: Request) => HostError | undefined,
) {
  const base = clientFor(scene, override);
  let release = () => {};
  let gate: Promise<void> | undefined;
  const request = Object.assign(
    vi.fn(async (next: Request) => {
      if (gate && next.method === held) await gate;
      return base(next);
    }),
    { host: base.host },
  );
  render(
    <SectionChromeProvider>
      <SectionTabsSlot />
      <StrategyScreen client={{ request }} />
    </SectionChromeProvider>,
  );
  return {
    request,
    hold: () => {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release: () => {
      gate = undefined;
      release();
    },
  };
}

describe("the failure of a recalculation while it recalculates again", () => {
  it("is hidden during the new attempt and shown again, as a new alert, if it fails again", async () => {
    const { hold, release } = mountGated(
      "plannedFujiNotPreserved",
      "strategy.view",
    );
    await stops();
    await moveSecondStop();
    click("Recalcular");
    const first = await screen.findByRole("alert");
    hold();
    click("Recalcular");
    await heading("Recalculando…");
    // the host keeps the failure of the last attempt in the edit; the screen does not show it now
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByText(/El cálculo no ha respetado tus ajustes/),
    ).toBeNull();
    release();
    const second = await screen.findByRole("alert");
    expect(second.textContent).toContain(
      "El cálculo no ha respetado tus ajustes",
    );
    expect(second).not.toBe(first);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

// ---- an end of stint that cannot move ----

// The plan of the Fuji scene with its stops on these laps (what the host sends is
// only read: these tests do not move anything).
function withSchedule(stopLaps: number[], raceLaps = 236) {
  return (view: StrategyView) => {
    const { plan } = view;
    const timeline = plan.result?.timeline;
    if (!timeline || !plan.edit) return view;
    const bounds = [0, ...stopLaps, raceLaps];
    const stints = bounds.slice(1).map((toLap, index) => ({
      fromLap: bounds[index] + 1,
      toLap,
    }));
    timeline.stints = stints;
    timeline.pits = stopLaps.map((lap) => ({ ...timeline.pits[0], lap }));
    if (plan.result?.metrics) plan.result.metrics.pitCount = stopLaps.length;
    plan.edit.stints = stints;
    plan.edit.stops = stopLaps.map((lap, index) => ({
      lap,
      minLap: (stopLaps[index - 1] ?? 0) + 1,
      maxLap: (stopLaps[index + 1] ?? raceLaps) - 1,
      fuelLiters: 78,
      vePercent: 99,
    }));
    return view;
  };
}

describe("an end of stint with no lap to move to", () => {
  it("is not a control that does nothing: it is off and says why", async () => {
    const request = mount("plannedFuji", undefined, withSchedule([1, 2]));
    await stints();
    // stints of one lap on both sides: the only lap it can have is the one it has
    expect(slider().getAttribute("min")).toBe("1");
    expect(slider().getAttribute("max")).toBe("1");
    expect(slider().disabled).toBe(true);
    expect(lap().disabled).toBe(true);
    const reason =
      "Este final de stint no se puede mover: los stints vecinos se quedarían sin vueltas.";
    expect(screen.getByText(reason)).toBeTruthy();
    const described = slider().getAttribute("aria-describedby");
    expect(
      described && document.getElementById(described)?.textContent,
    ).toContain(reason);
    fireEvent.change(slider(), { target: { value: "2" } });
    expect(calls(request, "strategy.moveBoundary")).toHaveLength(0);
    // the next one has room
    fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 1 vuelta" }));
    expect(slider().disabled).toBe(false);
    expect(slider().getAttribute("min")).toBe("2");
    expect(screen.queryByText(reason)).toBeNull();
  });

  it("works with the most stints a plan can have (17)", async () => {
    mount(
      "plannedFuji",
      undefined,
      withSchedule(Array.from({ length: 16 }, (_, index) => 10 + index * 10)),
    );
    await stints();
    const group = screen.getByRole("group", { name: "Elige el stint" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(17);
    fireEvent.click(radios[15]);
    expect(slider().disabled).toBe(false);
    expect(slider().getAttribute("min")).toBe("151");
    expect(slider().getAttribute("max")).toBe("235");
    fireEvent.click(radios[16]);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(
      screen.getByText(/El último stint termina con la carrera/),
    ).toBeTruthy();
    const timeline = screen.getByRole("img", { name: /Línea de tiempo/ });
    expect(timeline.getAttribute("aria-label")).toContain(
      "17 stints y 16 paradas",
    );
  });
});

// ---- a press on Recalcular is never lost ----

describe("Recalcular right after typing a lap", () => {
  it("is one press: the move goes first, then the recalculation", async () => {
    const { request, hold, release } = mountGated(
      "plannedFuji",
      "strategy.moveBoundary",
    );
    await stints();
    await moveSecondBoundary();
    hold();
    fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 47 vueltas" }));
    fireEvent.change(lap(), { target: { value: "100" } });
    // the click takes the focus from the box: the lap is sent, and the press follows
    fireEvent.blur(lap());
    click("Recalcular");
    await waitFor(() =>
      expect(calls(request, "strategy.moveBoundary")).toHaveLength(2),
    );
    // not before the host has answered the move
    expect(calls(request, "strategy.recalculate")).toHaveLength(0);
    release();
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    const order = request.mock.calls
      .map(([sent]) => sent)
      .filter(
        (sent) =>
          sent.method === "strategy.moveBoundary" ||
          sent.method === "strategy.recalculate",
      )
      .map((sent) =>
        sent.method === "strategy.moveBoundary"
          ? `move ${sent.lap}`
          : "recalculate",
      );
    expect(order).toEqual(["move 90", "move 100", "recalculate"]);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("is not sent when the move it follows is refused: the error of the move stays", async () => {
    let refuse = false;
    const { request, hold, release } = mountGated(
      "plannedFuji",
      "strategy.moveBoundary",
      (sent) =>
        refuse && sent.method === "strategy.moveBoundary"
          ? { kind: "rejected" }
          : undefined,
    );
    await stints();
    await moveSecondBoundary();
    refuse = true;
    hold();
    fireEvent.change(lap(), { target: { value: "100" } });
    fireEvent.blur(lap());
    click("Recalcular");
    await waitFor(() =>
      expect(calls(request, "strategy.moveBoundary")).toHaveLength(2),
    );
    release();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("No se ha podido completar la acción.");
    // the press is dropped with the move: nothing is asked of the host, and the
    // error is not wiped by a request that cannot work
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls(request, "strategy.recalculate")).toHaveLength(0);
    expect(screen.getByRole("alert")).toBe(alert);
    // the plan keeps its adjustment and Recalcular still works with a new press
    expect(slider().value).toBe("90");
    click("Recalcular");
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    expect(calls(request, "strategy.recalculate")).toHaveLength(1);
  });

  it("is not sent when the move ends in a conflict: it says the plan changed and shows it", async () => {
    let current: StrategyView | undefined;
    const { request, hold, release } = mountGated(
      "plannedFuji",
      "strategy.moveBoundary",
      (sent) =>
        current && sent.method === "strategy.moveBoundary"
          ? { kind: "strategyConflict", current }
          : undefined,
    );
    await stints();
    await moveSecondBoundary();
    const latest = structuredClone(await lastView(request));
    latest.plan.state = "calculated";
    latest.plan.computeId = 9;
    current = latest;
    hold();
    fireEvent.change(lap(), { target: { value: "100" } });
    fireEvent.blur(lap());
    click("Recalcular");
    await waitFor(() =>
      expect(calls(request, "strategy.moveBoundary")).toHaveLength(2),
    );
    release();
    await waitFor(() =>
      expect(status()).toBe("El plan ha cambiado. Te mostramos el actual."),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls(request, "strategy.recalculate")).toHaveLength(0);
    expect(status()).toBe("El plan ha cambiado. Te mostramos el actual.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not send twice when pressed twice meanwhile", async () => {
    const { request, hold, release } = mountGated(
      "plannedFuji",
      "strategy.moveBoundary",
    );
    await stints();
    await moveSecondBoundary();
    hold();
    fireEvent.click(screen.getByRole("radio", { name: "Stint 2, 47 vueltas" }));
    fireEvent.change(lap(), { target: { value: "100" } });
    fireEvent.blur(lap());
    const recalculate = button("Recalcular");
    fireEvent.click(recalculate);
    fireEvent.click(recalculate);
    release();
    await waitFor(() => expect(status()).toContain("Plan recalculado"));
    expect(calls(request, "strategy.recalculate")).toHaveLength(1);
  });
});

// ---- «Confirmar y calcular» with the plan adjusted ----

describe("Confirmar y calcular with adjustments pending", () => {
  it("sends you to the Plan tab, where Recalcular and Restablecer are, and keeps the data", async () => {
    const request = mount("plannedFuji");
    await stops();
    await moveSecondStop();
    fireEvent.click(tab("Carrera"));
    click("Editar carrera");
    // nothing written: the data are confirmed as they are and the calculation is refused
    click("Confirmar y calcular");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Tienes ajustes del plan sin recalcular. Ve a la pestaña Plan para recalcular o restablecer.",
    );
    expect(calls(request, "strategy.compute")).toHaveLength(1);
    // the data were confirmed, so the editor is closed and the data are shown
    expect(
      screen.queryByRole("button", { name: "Confirmar y calcular" }),
    ).toBeNull();
    expect(button("Editar carrera")).toBeTruthy();
    expect(screen.getByText("360 min · 236 vueltas")).toBeTruthy();
    // and the adjustments are still there, with their way out
    fireEvent.click(tab("Plan"));
    await heading("Plan modificado");
    expect(button("Recalcular")).toBeTruthy();
    expect(button("Restablecer")).toBeTruthy();
  });

  it("keeps the text of the Plan tab for the same refusal there", async () => {
    mount("plannedFuji", (request) =>
      request.method === "strategy.pickFile"
        ? { kind: "strategyEditPending" }
        : undefined,
    );
    await stops();
    await moveSecondStop();
    fireEvent.click(tab("Carrera"));
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Más acciones de archivo" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Abrir archivo…" }),
    );
    // from Carrera there are no such buttons: it says where they are
    expect((await screen.findByRole("alert")).textContent).toContain(
      "pestaña Plan",
    );
    // in the Plan tab those buttons are there, and the text says so
    fireEvent.click(tab("Plan"));
    await heading("Plan modificado");
    expect(screen.getByRole("alert").textContent).toBe(
      "Tienes ajustes del plan sin recalcular. Recalcula o restablece antes de continuar.",
    );
    expect(button("Recalcular")).toBeTruthy();
  });
});

// ---- what the screen reads from the plan, without a browser ----

describe("reading the schedule", () => {
  async function view() {
    const host = createMockHost("strategy-plannedFuji");
    host({ kind: "request", id: 1, request: { method: "strategy.open" } });
    const reply = host({
      kind: "request",
      id: 2,
      request: { method: "strategy.view" },
    });
    if (reply?.kind !== "response") throw Error("no view");
    return (reply.result as { value: StrategyView }).value;
  }

  it("finds the stops that are not where the plan has them", async () => {
    const { plan } = await view();
    const timeline = plan.result?.timeline ?? null;
    expect(movedStops(timeline, plan.edit)).toEqual([]);
    expect(editSummary([])).toBe(
      "Las paradas están donde las dejó el cálculo. Puedes recalcular o restablecer.",
    );
    const edit = structuredClone(plan.edit);
    if (!edit) throw Error("no edit");
    edit.stops[1].lap = 90;
    edit.stops[3].lap = 169;
    const moves = movedStops(timeline, edit);
    expect(moves).toEqual([
      { stop: 2, from: 85, to: 90 },
      { stop: 4, from: 170, to: 169 },
    ]);
    expect(editSummary(moves)).toBe(
      "Has movido 2 paradas respecto al plan calculado.",
    );
    expect(editSummary(moves.slice(0, 1))).toBe(
      "La parada 2 pasa de la vuelta 85 a la 90.",
    );
  });

  it("draws the edited schedule over the plan's amounts", async () => {
    const { plan } = await view();
    const timeline = plan.result?.timeline;
    const edit = structuredClone(plan.edit);
    if (!timeline || !edit) throw Error("no plan");
    edit.stops[1].lap = 90;
    edit.stints[1].toLap = 90;
    edit.stints[2].fromLap = 91;
    const drawn = scheduleTimeline(timeline, edit);
    expect(drawn.stints[1].toLap).toBe(90);
    expect(drawn.pits[1]).toEqual({ ...timeline.pits[1], lap: 90 });
    expect(drawn.fuelStartLiters).toBe(timeline.fuelStartLiters);
    // no edit, or one that does not fit the plan: the plan as it is
    expect(scheduleTimeline(timeline, null)).toBe(timeline);
  });

  it("announces a recalculation apart from a first calculation", async () => {
    const { plan } = await view();
    const calculating = { ...plan, state: "calculating" as const };
    expect(planAnnouncement(calculating, "edited")).toBe(
      "Recalculando el plan.",
    );
    expect(
      planAnnouncement(
        { ...calculating, result: null, edit: null },
        "uncalculated",
      ),
    ).toBe("Calculando el plan.");
    expect(planAnnouncement(plan, "calculating", true)).toBe(
      "Plan recalculado: 6 horas y 1 minuto; 5 paradas.",
    );
    expect(planAnnouncement(plan, "calculating", false)).toBe(
      "Plan calculado: 6 horas y 1 minuto; 5 paradas.",
    );
    // a cancelled recalculation, and one that fails says it in its alert
    const edited = { ...plan, state: "edited" as const };
    expect(planAnnouncement(edited, "calculating", true)).toBe(
      "Recálculo cancelado. Tus ajustes siguen pendientes.",
    );
    if (plan.edit)
      expect(
        planAnnouncement(
          { ...edited, edit: { ...plan.edit, error: "failed" } },
          "calculating",
          true,
        ),
      ).toBeUndefined();
    expect(planAnnouncement(edited, "edited", true)).toBeUndefined();
  });

  it("writes the card of each kind of plan", async () => {
    const { plan } = await view();
    expect(planCard({ ...plan, result: null })).toBeNull();
    expect(planCard(plan)?.title).toBe("Calculado · 6:01:04 · 5 paradas");
    expect(planCard({ ...plan, state: "edited" })).toEqual({
      tag: null,
      title: "Plan modificado · pendiente de recalcular",
      certificate: "",
      notes: [{ tone: "warn", text: "Recalcula para poder aceptar el plan." }],
      accept: false,
    });
    expect(planCard({ ...plan, state: "calculating" })?.title).toBe(
      "Recalculando el plan…",
    );
  });
});

// ---- the mock keeps what the real host does ----
// strategy_editing.rs: «the document is never touched»; strategy.rs `edit`: the
// document, its revision and `dirty` do not change; strategy_calculation.rs
// `finish`: the end of a recalculation is applied to the plan only (it returns
// no document). A move or a recalculation never makes the file «Sin guardar».

describe("the mock host adjusts the plan in memory only", () => {
  function host(scene = "plannedFuji") {
    const run = createMockHost(`strategy-${scene}`);
    let id = 1;
    return (request: Request) => {
      const reply = run({ kind: "request", id: id++, request });
      if (reply?.kind === "failure") return { error: reply.error };
      if (reply?.kind !== "response") throw Error("no reply");
      return { view: (reply.result as { value: StrategyView }).value };
    };
  }

  it("keeps the revision and dirty through a move, a recalculation and a reset", () => {
    const send = host();
    const opened = send({ method: "strategy.open" }).view;
    const computeId = opened?.plan.computeId;
    if (!opened || !computeId) throw Error("no plan");
    const { revision } = opened;
    const moved = send({
      method: "strategy.moveStop",
      revision,
      computeId,
      index: 0,
      delta: -1,
    }).view;
    expect(moved?.plan.state).toBe("edited");
    expect([moved?.revision, moved?.dirty]).toEqual([revision, false]);
    const started = send({
      method: "strategy.recalculate",
      revision,
      computeId,
    }).view;
    expect(started?.plan.state).toBe("calculating");
    expect([started?.revision, started?.dirty]).toEqual([revision, false]);
    const done = send({ method: "strategy.view" }).view;
    // not proven: the solver keeps the calendar but does not prove it
    expect(done?.plan.state).toBe("partial");
    expect(done?.plan.result?.certificate).toBe("not_proven");
    expect(done?.plan.edit?.stops[0].lap).toBe(42);
    expect([done?.revision, done?.dirty]).toEqual([revision, false]);
    const again = send({
      method: "strategy.moveStop",
      revision,
      computeId: done?.plan.computeId ?? 0,
      index: 0,
      delta: -1,
    }).view;
    const reset = send({
      method: "strategy.resetEdit",
      revision,
      computeId: again?.plan.computeId ?? 0,
    }).view;
    expect(reset?.plan.edit?.stops[0].lap).toBe(42);
    expect(reset?.plan.edit?.canReset).toBe(false);
    expect([reset?.revision, reset?.dirty]).toEqual([revision, false]);
  });

  it("stays cancelled when the host is asked again after cancelling a recalculation", () => {
    const send = host("plannedFujiRecalculating");
    const opened = send({ method: "strategy.open" }).view;
    const computeId = opened?.plan.computeId;
    if (!opened || !computeId) throw Error("no plan");
    const { revision } = opened;
    send({
      method: "strategy.moveStop",
      revision,
      computeId,
      index: 1,
      delta: 1,
    });
    const running = send({
      method: "strategy.recalculate",
      revision,
      computeId,
    }).view;
    send({
      method: "strategy.cancel",
      computeId: running?.plan.computeId ?? 0,
    });
    const later = send({ method: "strategy.view" }).view;
    expect(later?.plan.state).toBe("edited");
    expect(later?.plan.edit?.canReset).toBe(true);
  });

  it("refuses a new calculation while the adjustments are pending, and asks the plan it knows", () => {
    const send = host();
    const opened = send({ method: "strategy.open" }).view;
    const computeId = opened?.plan.computeId;
    if (!opened || !computeId || !opened.form) throw Error("no plan");
    const { revision } = opened;
    send({
      method: "strategy.moveStop",
      revision,
      computeId,
      index: 1,
      delta: 1,
    });
    expect(
      send({
        method: "strategy.compute",
        eventId: opened.activeEventId ?? "",
        strategyId: opened.activeStrategyId ?? "",
        revision,
        form: opened.form,
      }).error,
    ).toEqual({ kind: "strategyEditPending" });
    // another plan's id is a conflict that brings the current view
    expect(
      send({
        method: "strategy.moveStop",
        revision,
        computeId: computeId + 5,
        index: 1,
        delta: 1,
      }).error?.kind,
    ).toBe("strategyConflict");
  });
});

// ---- what the real solver answers to a recalculated Fuji calendar ----

describe("the recalculation of the Fuji scenes", () => {
  function host(scene = "plannedFuji") {
    const run = createMockHost(`strategy-${scene}`);
    let id = 1;
    return (request: Request) => {
      const reply = run({ kind: "request", id: id++, request });
      if (reply?.kind === "failure") return { error: reply.error };
      if (reply?.kind !== "response") throw Error("no reply");
      return { view: (reply.result as { value: StrategyView }).value };
    };
  }
  function recalculate(index: number, delta: -1 | 1) {
    const send = host();
    const opened = send({ method: "strategy.open" }).view;
    const computeId = opened?.plan.computeId;
    if (!opened || !computeId) throw Error("no plan");
    const { revision } = opened;
    send({ method: "strategy.moveStop", revision, computeId, index, delta });
    send({ method: "strategy.recalculate", revision, computeId });
    return {
      before: opened.plan.result?.metrics?.totalSeconds,
      done: send({ method: "strategy.view" }).view,
    };
  }

  it("has no plan for the second stop one lap later, as the crate proves", () => {
    const { done } = recalculate(1, 1);
    expect(done?.plan.result?.certificate).toBe("no_solution");
    expect(done?.plan.result?.reason).toBe("constraintsUnsatisfiable");
    expect(done?.plan.result?.metrics).toBeNull();
    expect(done?.plan.result?.timeline).toBeNull();
  });

  it.each([
    [0, -1, 42],
    [3, -1, 169],
    [4, -1, 211],
  ] as const)(
    "gives a plan that keeps the calendar but is not proven when stop %i moves %i lap",
    (index, delta, lap) => {
      const { before, done } = recalculate(index, delta);
      const plan = done?.plan;
      expect(plan?.state).toBe("partial");
      expect(plan?.result?.certificate).toBe("not_proven");
      expect(plan?.result?.reason).toBe("searchBudgetExhausted");
      expect(plan?.result?.timeline?.pits[index].lap).toBe(lap);
      // a proven plan is the fastest of all calendars: another one is never faster
      expect(plan?.result?.metrics?.totalSeconds).toBeGreaterThan(before ?? 0);
    },
  );
});
