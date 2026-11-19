// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostError, Request } from "../src/contract/generated/contract";
import type {
  StrategyCalculationView,
  StrategyPlanView,
  StrategyView,
} from "../src/contract/generated/strategy";
import { createMockHost } from "../src/mock/host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { HostFailure } from "../src/renderer/bridge/client";
import {
  durationWords,
  planAnnouncement,
} from "../src/renderer/screens/strategy/planText";
import { StrategyScreen } from "../src/renderer/ui/strategy/StrategyScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The mock host answers every request; `mapView` reshapes the views it sends
// (open and view), so a test fixes the plan the screen has to show.
function clientFor(
  scene: string,
  override?: (request: Request) => HostError | undefined,
  mapView?: (view: StrategyView) => StrategyView,
) {
  const host = createMockHost(`strategy-${scene}`);
  return vi.fn(async (request: Request) => {
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
const methods = (request: Client) => request.mock.calls.map(([r]) => r.method);
function sent<M extends Request["method"]>(request: Client, method: M) {
  return request.mock.calls.find(([r]) => r.method === method)?.[0] as Extract<
    Request,
    { method: M }
  >;
}
const field = (name: string) =>
  screen.getByRole("textbox", { name }) as HTMLInputElement;
function fill(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values))
    fireEvent.change(field(name), { target: { value } });
}
const tab = (name: string) => screen.getByRole("tab", { name });
const statusText = () => screen.getByRole("status").textContent;
// Simulated time: the screen asks the host for the end of a calculation by the
// clock, so these tests move the clock and never wait for real.
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function openPlanSimulated() {
  await advance(0);
  click("Continuar");
  fireEvent.click(tab("Plan"));
}
const views = (request: Client) =>
  methods(request).filter((method) => method === "strategy.view").length;
const heading = (name: string) => screen.getByRole("heading", { name });
async function openRace() {
  await screen.findByRole("heading", { name: "Tus estrategias" });
  click("Continuar");
}
async function openPlan() {
  await openRace();
  fireEvent.click(tab("Plan"));
}
// The view the document had when it opened.
function watch() {
  const seen: { view?: StrategyView } = {};
  return {
    seen,
    map: (view: StrategyView) => {
      seen.view ??= structuredClone(view);
      return view;
    },
  };
}

// ---- fixtures: the plan of Opus' Fuji case, as the host would send it ----

const result = (patch: Partial<StrategyCalculationView> = {}) =>
  ({
    certificate: "proven",
    degraded: false,
    reason: null,
    steps: { fuelLiters: 1, vePercent: 1 },
    metrics: {
      totalSeconds: 21664,
      laps: 236,
      pitCount: 5,
      fuelReserveRealLaps: 1.14,
      fuelReserveRequiredLaps: 0.8,
    },
    timeline: {
      pilot: "Isaac",
      basePaceSeconds: 90.472,
      fuelStartLiters: 82,
      fuelFinishLiters: 2.1,
      veStartPercent: 100,
      veFinishPercent: 4,
      stints: [
        { fromLap: 1, toLap: 43 },
        { fromLap: 44, toLap: 85 },
        { fromLap: 86, toLap: 127 },
        { fromLap: 128, toLap: 170 },
        { fromLap: 171, toLap: 212 },
        { fromLap: 213, toLap: 236 },
      ],
      pits: [
        [43, 78, 99],
        [85, 77, 97],
        [127, 77, 98],
        [170, 79, 99],
        [212, 76, 96],
      ].map(([lap, fuelLiters, vePercent]) => ({
        lap,
        fuelLiters,
        vePercent,
        changeTyres: true,
        service: "parallel" as const,
      })),
    },
    ...patch,
  }) satisfies StrategyCalculationView;
const plan = (
  state: StrategyPlanView["state"],
  patch: Partial<StrategyPlanView> = {},
): StrategyPlanView => ({
  state,
  computeId: 7,
  result: result(),
  error: null,
  errorField: null,
  edit: null,
  ...patch,
});
const failure = (
  error: "invalidInput" | "failed",
  errorField: StrategyPlanView["errorField"] = null,
) => plan("error", { result: null, error, errorField });
// The screen starts on this plan, with no calculation.
const showing = (fixed: StrategyPlanView) => (view: StrategyView) => ({
  ...view,
  plan: fixed,
});
// A calculation of the mock ends with this result instead of its sample.
const ending =
  (patch: Partial<StrategyCalculationView>) => (view: StrategyView) =>
    view.plan.result
      ? {
          ...view,
          plan: {
            ...view.plan,
            state:
              patch.certificate === "not_proven" || patch.certificate === null
                ? ("partial" as const)
                : ("calculated" as const),
            result: result(patch),
          },
        }
      : view;

// ---- states ----

describe("states of the plan", () => {
  it("shows an uncalculated plan with the way to calculate it and no plan editing", async () => {
    mount("ready");
    await openPlan();
    expect(screen.getByRole("heading", { name: "Sin calcular" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Calcula tu plan" }),
    ).toBeTruthy();
    expect(button("Calcular plan")).toBeTruthy();
    expect(button("Revisar datos")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    for (const label of ["Resumen", "Ajustar stints", "Ajustar paradas"])
      expect(screen.queryByText(label)).toBeNull();
  });

  it("asks to calculate again when the data changed after the last plan (pendingChanges)", async () => {
    mount(
      "ready",
      undefined,
      showing({
        state: "pendingChanges",
        computeId: null,
        result: null,
        error: null,
        errorField: null,
        edit: null,
      }),
    );
    await openPlan();
    expect(
      screen.getByRole("heading", { name: "Datos cambiados" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Has cambiado los datos de la carrera/),
    ).toBeTruthy();
    expect(button("Calcular plan")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("calculates with the saved form, shows the calculation and cancels it with its computeId", async () => {
    const { seen, map } = watch();
    const request = mount("calculating", undefined, map);
    await openPlan();
    click("Calcular plan");
    await screen.findByRole("heading", { name: "Calculando…" });
    expect(statusText()).toBe("Calculando el plan.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(sent(request, "strategy.compute")).toEqual({
      method: "strategy.compute",
      eventId: "event-1",
      strategyId: "variant-1",
      revision: expect.any(String),
      form: seen.view?.form,
    });
    click("Cancelar");
    await screen.findByRole("heading", { name: "Sin calcular" });
    expect(sent(request, "strategy.cancel")).toEqual({
      method: "strategy.cancel",
      computeId: 1,
    });
    expect(statusText()).toBe("Cálculo cancelado.");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Sin calcular" }),
    );
  });

  it("retries a busy calculation once after cancelling, reading the next view and without alarming", async () => {
    let cancelled = false;
    let busy = true;
    const request = mount("calculating", (r) => {
      if (r.method === "strategy.cancel") cancelled = true;
      if (r.method === "strategy.compute" && cancelled && busy) {
        busy = false;
        return { kind: "busy" };
      }
    });
    await openPlan();
    click("Calcular plan");
    await screen.findByRole("heading", { name: "Calculando…" });
    click("Cancelar");
    await screen.findByRole("heading", { name: "Sin calcular" });
    click("Calcular plan");
    await screen.findByRole("heading", { name: "Calculando…" });
    // the refused request, the next view, and the same request again
    const afterCancel = methods(request).slice(
      methods(request).lastIndexOf("strategy.cancel"),
    );
    expect(afterCancel.slice(0, 4)).toEqual([
      "strategy.cancel",
      "strategy.compute",
      "strategy.view",
      "strategy.compute",
    ]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("receives the result when the calculation ends, announces it and stops asking", async () => {
    vi.useFakeTimers();
    const request = mount("ready");
    await openPlanSimulated();
    click("Calcular plan");
    await advance(0); // the calculation starts and the screen schedules its first read
    await advance(300);
    expect(heading("Plan calculado")).toBeTruthy();
    expect(statusText()).toBe("Plan calculado: 5 minutos; 1 parada.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const asked = methods(request).length;
    await advance(2000);
    expect(methods(request)).toHaveLength(asked);
  });

  it("keeps asking for the view while the host is still calculating, and stops on cancel", async () => {
    vi.useFakeTimers();
    const request = mount("calculating");
    await openPlanSimulated();
    click("Calcular plan");
    await advance(0);
    expect(heading("Calculando…")).toBeTruthy();
    const before = views(request);
    await advance(750);
    expect(views(request)).toBeGreaterThanOrEqual(before + 2);
    // asking never disables the way out
    expect((button("Cancelar") as HTMLButtonElement).disabled).toBe(false);
    click("Cancelar");
    await advance(0);
    expect(heading("Sin calcular")).toBeTruthy();
    const after = views(request);
    await advance(2000);
    expect(views(request)).toBe(after);
  });

  it("keeps asking after a transient read error and ends the calculation when the host answers", async () => {
    vi.useFakeTimers();
    let armed = false;
    let failures = 0;
    mount("ready", (r) => {
      if (r.method === "strategy.compute") armed = true;
      if (armed && r.method === "strategy.view" && failures < 2) {
        failures++;
        return { kind: "io" };
      }
    });
    await openPlanSimulated();
    click("Calcular plan");
    await advance(0);
    await advance(2000);
    expect(failures).toBe(2);
    expect(heading("Plan calculado")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("after three read errors in a row says so, offers to try again and stops asking", async () => {
    vi.useFakeTimers();
    let armed = false;
    let broken = true;
    const request = mount("ready", (r) => {
      if (r.method === "strategy.compute") armed = true;
      if (armed && broken && r.method === "strategy.view")
        return { kind: "io" };
    });
    await openPlanSimulated();
    click("Calcular plan");
    await advance(0);
    await advance(2000);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("No se puede saber cómo va el cálculo");
    expect(heading("Calculando…")).toBeTruthy();
    const asked = views(request);
    await advance(3000);
    expect(views(request), "no more reads once it gave up").toBe(asked);
    broken = false;
    click("Reintentar");
    await advance(1000);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(heading("Plan calculado")).toBeTruthy();
  });

  it("cancels the calculation in force, quoting its own id, not an old one", async () => {
    const request = mount("calculating");
    await openPlan();
    click("Calcular plan");
    await screen.findByRole("heading", { name: "Calculando…" });
    click("Cancelar");
    await screen.findByRole("heading", { name: "Sin calcular" });
    click("Calcular plan");
    await screen.findByRole("heading", { name: "Calculando…" });
    click("Cancelar");
    await screen.findByRole("heading", { name: "Sin calcular" });
    const cancels = request.mock.calls
      .map(([r]) => r)
      .filter((r) => r.method === "strategy.cancel");
    expect(cancels).toEqual([
      { method: "strategy.cancel", computeId: 1 },
      { method: "strategy.cancel", computeId: 2 },
    ]);
  });

  it("shows the error when busy lasts after the single retry, without looping", async () => {
    let cancelled = false;
    const request = mount("calculating", (r) => {
      if (r.method === "strategy.cancel") cancelled = true;
      if (r.method === "strategy.compute" && cancelled) return { kind: "busy" };
    });
    await openPlan();
    click("Calcular plan");
    await screen.findByRole("heading", { name: "Calculando…" });
    click("Cancelar");
    await screen.findByRole("heading", { name: "Sin calcular" });
    click("Calcular plan");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "El archivo está ocupado. Vuelve a intentarlo.",
    );
    const afterCancel = methods(request).slice(
      methods(request).lastIndexOf("strategy.cancel"),
    );
    // the refused request, one view and one more request: nothing else
    expect(afterCancel).toEqual([
      "strategy.cancel",
      "strategy.compute",
      "strategy.view",
      "strategy.compute",
    ]);
    expect(heading("Sin calcular")).toBeTruthy();
    expect(button("Calcular plan")).toBeTruthy();
  });

  it("calculates again from a calculated plan with the saved form and shows the calculation", async () => {
    vi.useFakeTimers();
    const { seen, map } = watch();
    const request = mount("planned", undefined, map);
    await openPlanSimulated();
    expect(heading("Plan calculado")).toBeTruthy();
    click("Calcular de nuevo");
    await advance(0);
    expect(heading("Calculando…")).toBeTruthy();
    expect(tab("Plan").getAttribute("aria-selected")).toBe("true");
    expect(sent(request, "strategy.compute")).toEqual({
      method: "strategy.compute",
      eventId: "event-1",
      strategyId: "variant-1",
      revision: expect.any(String),
      form: seen.view?.form,
    });
    await advance(300);
    expect(heading("Plan calculado")).toBeTruthy();
  });

  it("calculates from the plan that the changed data left pending", async () => {
    vi.useFakeTimers();
    const { seen, map } = watch();
    const request = mount("ready", undefined, (view) =>
      showing({
        state: "pendingChanges",
        computeId: null,
        result: null,
        error: null,
        errorField: null,
        edit: null,
      })(map(view)),
    );
    await openPlanSimulated();
    expect(heading("Datos cambiados")).toBeTruthy();
    click("Calcular plan");
    await advance(0);
    expect(heading("Calculando…")).toBeTruthy();
    expect(sent(request, "strategy.compute").form).toEqual(seen.view?.form);
  });

  it("explains a failed calculation, keeps the data and offers to try again", async () => {
    const request = mount("computeFailed");
    await openPlan();
    click("Calcular plan");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo calcular el plan");
    expect(alert.textContent).toContain("Tus datos no han cambiado");
    expect(statusText()).toBe("No se pudo calcular el plan.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(tab("Plan").getAttribute("aria-selected"), "stays on the plan").toBe(
      "true",
    );
    click("Reintentar");
    await waitFor(() =>
      expect(
        methods(request).filter((method) => method === "strategy.compute"),
      ).toHaveLength(2),
    );
  });

  it("explains a rejected input without a field and leads to the Carrera tab", async () => {
    mount("ready", undefined, showing(failure("invalidInput")));
    await openPlan();
    expect(screen.getByRole("alert").textContent).toContain(
      "El cálculo no ha aceptado los datos",
    );
    click("Revisar datos");
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Coche" })).toBeTruthy();
    // the pressed button is gone: the focus goes to the title of the race
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Practice" }),
    );
    expect(
      screen.queryByRole("button", { name: "Cancelar edición" }),
    ).toBeNull();
  });

  it("opens the editor with the field marked when a stored plan error names one", async () => {
    mount(
      "ready",
      undefined,
      showing(failure("invalidInput", "fuelPerLapLiters")),
    );
    await openPlan();
    expect(screen.getByRole("alert").textContent).toContain(
      "Consumo por vuelta",
    );
    click("Revisar datos");
    expect(button("Cancelar edición")).toBeTruthy();
    expect(field("Consumo por vuelta").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(field("Depósito").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Revisa 1 dato");
  });

  it("says so in the editor when the rejected input has no control (team)", async () => {
    mount("ready", undefined, showing(failure("invalidInput", "team")));
    await openPlan();
    click("Revisar datos");
    expect(button("Cancelar edición")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      "El cálculo no ha aceptado los datos. Revísalos.",
    );
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it("shows no plan and no editing in an edited plan: it is the calculated plan", async () => {
    mount(
      "ready",
      undefined,
      showing(
        plan("edited", {
          edit: {
            stints: [
              { fromLap: 1, toLap: 43 },
              { fromLap: 44, toLap: 236 },
            ],
            stops: [
              {
                lap: 43,
                minLap: 1,
                maxLap: 235,
                fuelLiters: 78,
                vePercent: 99,
              },
            ],
            canReset: true,
            error: null,
          },
        }),
      ),
    );
    await openPlan();
    expect(
      screen.getByRole("heading", { name: "Plan calculado" }),
    ).toBeTruthy();
    expect(screen.getByText("6:01:04")).toBeTruthy();
    for (const label of [
      /Ajustar/,
      /Recalcular/,
      /Restablecer/,
      /valor anterior/,
      /Plan modificado/,
    ])
      expect(screen.queryByText(label)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Recalcular|Restablecer/ }),
    ).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});

// ---- the numbers, the timeline and the list ----

describe("result of a calculation", () => {
  async function showResult(fixed = plan("calculated")) {
    mount("ready", undefined, showing(fixed));
    await openPlan();
  }

  it("shows the four figures exactly as the host sent them", async () => {
    await showResult();
    const figures = screen.getByRole("list", { name: "Cifras del plan" });
    const text = (label: string) =>
      within(figures).getByText(label).closest("li")?.textContent;
    expect(text("Duración")).toContain("6:01:04");
    expect(text("Vueltas")).toContain("236");
    expect(text("Paradas")).toContain("5");
    expect(text("Paradas")).toContain("todas con ruedas nuevas");
    expect(text("Sobra al final")).toContain("1,14 v");
    expect(text("Sobra al final")).toContain("pediste 0,80 v");
    expect(
      screen.getByText("6 stints y 5 paradas para 236 vueltas."),
    ).toBeTruthy();
  });

  it("draws the stints to scale with a diamond for each stop", async () => {
    await showResult();
    const line = screen.getByRole("img", {
      name: "Línea de tiempo: 6 stints y 5 paradas en 236 vueltas",
    });
    const stints = Array.from(
      line.querySelectorAll<HTMLElement>("[data-stint]"),
    );
    expect(stints).toHaveLength(6);
    const share = (node: HTMLElement) =>
      Number.parseFloat(node.style.width) / 100;
    expect(share(stints[0])).toBeCloseTo(43 / 236, 5);
    expect(share(stints[5])).toBeCloseTo(24 / 236, 5);
    expect(Number.parseFloat(stints[1].style.left) / 100).toBeCloseTo(
      43 / 236,
      5,
    );
    const stops = Array.from(line.querySelectorAll<HTMLElement>("[data-stop]"));
    expect(stops.map((node) => node.textContent)).toEqual([
      "P1",
      "P2",
      "P3",
      "P4",
      "P5",
    ]);
    expect(Number.parseFloat(stops[1].style.left) / 100).toBeCloseTo(
      85 / 236,
      5,
    );
  });

  it("lists every stint and stop with what the host sent for each stop", async () => {
    await showResult();
    const list = screen.getByRole("list", { name: "Stints y paradas" });
    const rows = within(list)
      .getAllByRole("listitem")
      .map((row) => row.textContent ?? "");
    expect(rows).toHaveLength(11);
    expect(rows[0]).toContain("Stint 1");
    expect(rows[0]).toContain("Vueltas 1–43");
    expect(rows[0]).toContain("43 vueltas");
    expect(rows[0]).toContain("Isaac");
    expect(rows[0]).toContain("1:30,472");
    expect(rows[0]).toContain("sale con 82,0 L · 100 %");
    expect(rows[1]).toContain("Parada 1");
    expect(rows[1]).toContain("Vuelta 43");
    expect(rows[1]).toContain("+78 L · +99 %");
    expect(rows[1]).toContain("ruedas nuevas");
    expect(rows[1]).toContain("a la vez");
    expect(rows[10]).toContain("Stint 6");
    expect(rows[10]).toContain("Vueltas 213–236");
    expect(rows[10]).toContain("llega con 2,1 L · 4 %");
  });

  it("shows sequential service, kept tyres and an absent reserve without inventing them", async () => {
    const base = result();
    const timeline = base.timeline;
    if (!timeline) throw Error("fixture");
    timeline.pits[0] = {
      ...timeline.pits[0],
      changeTyres: false,
      service: "sequential",
      vePercent: 0,
    };
    await showResult(
      plan("calculated", {
        result: {
          ...base,
          metrics: base.metrics && {
            ...base.metrics,
            fuelReserveRealLaps: null,
          },
        },
      }),
    );
    const rows = within(screen.getByRole("list", { name: "Stints y paradas" }))
      .getAllByRole("listitem")
      .map((row) => row.textContent ?? "");
    expect(rows[1]).toContain("+78 L");
    expect(rows[1]).not.toContain("+0 %");
    expect(rows[1]).toContain("mismas ruedas");
    expect(rows[1]).toContain("uno tras otro");
    const figures = screen.getByRole("list", { name: "Cifras del plan" });
    expect(
      within(figures).getByText("Sobra al final").closest("li")?.textContent,
    ).toContain("—");
    expect(
      within(figures).getByText("Paradas").closest("li")?.textContent,
    ).toContain("ruedas nuevas en 4 de 5");
  });

  it("says «las que pediste» only when the plan has the laps of the form", async () => {
    // the mock sample calculates 3 laps and its form asks for 3
    mount("planned");
    await openPlan();
    const laps = (name: string) =>
      within(screen.getByRole("list", { name: "Cifras del plan" }))
        .getByText("Vueltas")
        .closest("li")?.textContent ?? name;
    expect(laps("asked")).toContain("las que pediste");
    cleanup();
    // the Fuji plan has 236 and the same form asks for 3: nothing is said
    await showResult();
    expect(laps("other")).not.toContain("las que pediste");
  });

  it("keeps the figures when the plan is too long to draw, and says so", async () => {
    const base = result();
    await showResult(
      plan("calculated", { result: { ...base, timeline: null } }),
    );
    expect(screen.getByText("6:01:04")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("list", { name: "Stints y paradas" })).toBeNull();
    expect(
      screen.getByText("Este plan tiene demasiadas paradas para dibujarlo."),
    ).toBeTruthy();
  });
});

// ---- the sentence of the certificate, one test per combination ----

const stepsFine = { fuelLiters: 1, vePercent: 1 };
const stepsCoarse = { fuelLiters: 1.5, vePercent: 2 };
const title = {
  proven: "Comprobado: es el plan más rápido con estos datos",
  coarse: "El paso de carga es más grueso que el que pediste",
  partial: "Plan válido, pero sin garantía de que sea el más rápido",
  noSolution: "Ningún plan termina la carrera con estos datos",
} as const;
const because = {
  searchBudgetExhausted: "La búsqueda se detuvo antes de poder comprobarlo",
  fineGridNoFallback:
    "Con pasos de carga tan finos no se pudo completar el cálculo; prueba con pasos más gruesos",
  constraintsUnsatisfiable:
    "Las reglas del evento o el calendario editado no lo permiten",
  noFeasiblePlan: "No hay plan posible con estos datos y pasos",
} as const;
const fine = "de 1 L en 1 L y de 1 % en 1 %";
const coarse = "de 1,5 L en 1,5 L y de 2 % en 2 %";

describe("certificate sentences", () => {
  const notice = () =>
    screen.getByRole("region", { name: "Qué garantiza este plan" });
  async function show(
    patch: Partial<StrategyCalculationView>,
    withPlan = true,
  ) {
    const base = result({ degraded: patch.degraded ?? false, ...patch });
    const shown = withPlan ? base : { ...base, metrics: null, timeline: null };
    const state =
      patch.certificate === "not_proven" || patch.certificate === null
        ? "partial"
        : "calculated";
    mount("ready", undefined, showing(plan(state, { result: shown })));
    await openPlan();
    return notice();
  }

  it.each([false, true])("proven, degraded=%s", async (degraded) => {
    const steps = degraded ? stepsCoarse : stepsFine;
    const group = await show({ certificate: "proven", degraded, steps });
    const text = group.textContent ?? "";
    if (degraded) {
      expect(within(group).getByText(title.coarse)).toBeTruthy();
      expect(text).toContain(coarse);
      // never claims the fastest plan for the step that was asked
      expect(text).not.toContain("Comprobado");
      expect(text).not.toContain(fine);
    } else {
      expect(within(group).getByText(title.proven)).toBeTruthy();
      expect(text).toContain(fine);
      expect(text).not.toContain("más grueso");
    }
    expect(text).not.toContain("sin garantía");
  });

  it("proven with a single resource speaks only about that step", async () => {
    const group = await show({
      certificate: "proven",
      steps: { fuelLiters: 1, vePercent: null },
    });
    expect(group.textContent).toContain("de 1 L en 1 L, y ninguna");
    expect(group.textContent).not.toContain("%");
  });

  it("proven with no step at all promises nothing about steps", async () => {
    const group = await show({
      certificate: "proven",
      steps: { fuelLiters: null, vePercent: null },
    });
    expect(within(group).getByText(title.proven)).toBeTruthy();
    expect(group.textContent).not.toMatch(/ de \d/);
  });

  const unproven = (["not_proven", null] as const).flatMap((certificate) =>
    (["searchBudgetExhausted", "fineGridNoFallback"] as const).flatMap(
      (reason) =>
        [false, true].map(
          (degraded) => [certificate, reason, degraded] as const,
        ),
    ),
  );
  it.each(unproven)(
    "%s with a plan, reason %s, degraded=%s",
    async (certificate, reason, degraded) => {
      const group = await show({
        certificate,
        reason,
        degraded,
        steps: degraded ? stepsCoarse : stepsFine,
      });
      const text = group.textContent ?? "";
      expect(within(group).getByText(title.partial)).toBeTruthy();
      expect(text).toContain(because[reason]);
      expect(text).not.toContain("Comprobado");
      expect(text.includes("es más grueso que el que pediste")).toBe(degraded);
      if (degraded) expect(text).toContain(coarse);
      // the plan is still there
      expect(screen.getByText("6:01:04")).toBeTruthy();
      expect(statusText()).toBe("");
    },
  );

  it.each([
    [
      "searchBudgetExhausted",
      "La búsqueda se detuvo antes de encontrar un plan",
    ],
    ["fineGridNoFallback", because.fineGridNoFallback],
  ] as const)(
    "partial without a plan, reason %s, says the calculation did not finish",
    async (reason, sentence) => {
      const group = await show(
        { certificate: null, reason, steps: stepsFine },
        false,
      );
      expect(
        within(group).getByText("El cálculo no ha terminado"),
      ).toBeTruthy();
      expect(group.textContent).toContain(sentence);
      expect(screen.queryByText("6:01:04")).toBeNull();
      expect(screen.queryByText(title.partial)).toBeNull();
    },
  );

  const none = (
    ["constraintsUnsatisfiable", "noFeasiblePlan"] as const
  ).flatMap((reason) =>
    [false, true].map((degraded) => [reason, degraded] as const),
  );
  it.each(none)(
    "no_solution, reason %s, degraded=%s",
    async (reason, degraded) => {
      const base = result({
        certificate: "no_solution",
        reason,
        degraded,
        metrics: null,
        timeline: null,
      });
      mount("ready", undefined, showing(plan("calculated", { result: base })));
      await openPlan();
      expect(
        screen.getByRole("heading", { name: title.noSolution, level: 2 }),
      ).toBeTruthy();
      expect(screen.getByText(new RegExp(because[reason]))).toBeTruthy();
      expect(screen.queryByText("6:01:04")).toBeNull();
      expect(screen.queryByRole("img")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Revisar datos" }),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Calcular de nuevo" }),
      ).toBeNull();
    },
  );
});

// ---- singular and plural ----

describe("singular and plural", () => {
  const short = (laps: number, stints: number) => {
    const bounds = Array.from({ length: stints }, (_, i) => ({
      fromLap: i === 0 ? 1 : laps - (stints - 1 - i),
      toLap: i === 0 ? laps - (stints - 1) : laps - (stints - 1 - i),
    }));
    const base = result();
    return plan("calculated", {
      result: {
        ...base,
        metrics: base.metrics && {
          ...base.metrics,
          laps,
          pitCount: stints - 1,
        },
        timeline: base.timeline && {
          ...base.timeline,
          stints: bounds,
          pits: base.timeline.pits.slice(0, stints - 1).map((pit, i) => ({
            ...pit,
            lap: bounds[i].toLap,
          })),
        },
      },
    });
  };

  it("a short race with no stops is one stint and no stops, not «1 stints»", async () => {
    mount("ready", undefined, showing(short(3, 1)));
    await openPlan();
    expect(screen.getByText("Sin paradas para 3 vueltas.")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "Línea de tiempo: 1 stint y sin paradas en 3 vueltas",
      }),
    ).toBeTruthy();
    const row = within(
      screen.getByRole("list", { name: "Stints y paradas" }),
    ).getAllByRole("listitem")[0].textContent;
    expect(row).toContain("Vueltas 1–3");
    expect(row).toContain("3 vueltas");
  });

  it("one stop is «1 parada», two stints «2 stints», and a one-lap stint is «Vuelta»", async () => {
    mount("ready", undefined, showing(short(2, 2)));
    await openPlan();
    expect(
      screen.getByText("2 stints y 1 parada para 2 vueltas."),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "Línea de tiempo: 2 stints y 1 parada en 2 vueltas",
      }),
    ).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: "Stints y paradas" }))
      .getAllByRole("listitem")
      .map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("Vuelta 1");
    expect(rows[0]).not.toContain("Vueltas");
    expect(rows[0]).toContain("1 vuelta");
    expect(rows[0]).not.toContain("1 vueltas");
  });

  it("asks for one lap as «la vuelta»", async () => {
    mount("ready", undefined, (view) => {
      if (view.form) view.form.inputs.raceLaps = "1";
      return view;
    });
    await openPlan();
    expect(
      screen.getByText(/Vantare reparte la vuelta en stints/),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("1 vueltas");
  });
});

// ---- the Fuji scenes tell one story ----

it("the Fuji scene has a header that fits its plan", async () => {
  mount("plannedFuji");
  await openPlan();
  expect(heading("Plan calculado")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Fuji 6 Horas" })).toBeTruthy();
  expect(
    screen.getByText("Hypercar · Fuji Speedway · 360 min · 236 vueltas"),
  ).toBeTruthy();
  expect(screen.getByText(/Plan · estrategia «Seco»/)).toBeTruthy();
  const figures = screen.getByRole("list", { name: "Cifras del plan" });
  expect(
    within(figures).getByText("Vueltas").closest("li")?.textContent,
  ).toContain("las que pediste");
});

// ---- the status line ----

describe("announcements", () => {
  it.each([
    [{}, "Plan calculado: 6 horas y 1 minuto; 5 paradas."],
    [
      { certificate: "not_proven", reason: "searchBudgetExhausted" } as const,
      "Plan calculado sin garantía de ser el más rápido.",
    ],
    [
      {
        certificate: "no_solution",
        reason: "noFeasiblePlan",
        metrics: null,
        timeline: null,
      } as const,
      "Ningún plan termina la carrera con estos datos.",
    ],
    [
      {
        certificate: null,
        reason: "searchBudgetExhausted",
        metrics: null,
        timeline: null,
      } as const,
      "No se pudo completar el cálculo del plan.",
    ],
  ])(
    "after calculating, a result like %j is said as %s",
    async (patch, said) => {
      mount("ready", undefined, ending(patch));
      await openPlan();
      click("Calcular plan");
      await waitFor(() => expect(statusText()).toBe(said));
      expect(screen.getAllByRole("status")).toHaveLength(1);
    },
  );

  it("says what the pure function says", () => {
    const total = (seconds: number, pits: number) =>
      planAnnouncement(
        plan("calculated", {
          result: result({
            metrics: {
              totalSeconds: seconds,
              laps: 10,
              pitCount: pits,
              fuelReserveRealLaps: 1,
              fuelReserveRequiredLaps: 1,
            },
          }),
        }),
        "calculating",
      );
    expect(total(21664, 5)).toBe(
      "Plan calculado: 6 horas y 1 minuto; 5 paradas.",
    );
    expect(total(7200, 0)).toBe("Plan calculado: 2 horas; sin paradas.");
    expect(planAnnouncement(plan("calculating"), "uncalculated")).toBe(
      "Calculando el plan.",
    );
    // a plan that was already there when the screen opened is not announced
    expect(planAnnouncement(plan("calculated"), undefined)).toBeUndefined();
    expect(planAnnouncement(plan("calculated"), "calculated")).toBeUndefined();
    expect(
      planAnnouncement(plan("uncalculated", { result: null }), "calculating"),
    ).toBe("Cálculo cancelado.");
    expect(planAnnouncement(failure("failed"), "calculating")).toBe(
      "No se pudo calcular el plan.",
    );
    expect(
      planAnnouncement(failure("invalidInput", "raceLaps"), "calculating"),
    ).toBe("No se pudo calcular el plan.");
  });

  it.each([
    [0, "menos de un minuto"],
    [59, "menos de un minuto"],
    [60, "1 minuto"],
    [301, "5 minutos"],
    [3600, "1 hora"],
    [3661, "1 hora y 1 minuto"],
    [21664, "6 horas y 1 minuto"],
    [7260, "2 horas y 1 minuto"],
  ])("writes %i seconds as %s", (seconds, words) => {
    expect(durationWords(seconds)).toBe(words);
  });

  it("is not announced when the screen opens on a plan that already exists", async () => {
    mount("ready", undefined, showing(plan("calculated")));
    await openPlan();
    expect(statusText()).toBe("");
  });
});

// ---- «Confirmar y calcular» in the Carrera tab ----

const allFields = {
  "Nombre de la carrera": "Copa Fuji",
  Circuito: "Suzuka",
  "Clase o coche": "LMP2",
  Salida: "2026-12-06T13:00:00+01:00",
  Duración: "361",
  "Vueltas que vas a dar": "237",
  "Vuelta de formación": "1",
  Depósito: "83,5",
  "Consumo por vuelta": "1,9",
  "Reserva al final": "0,9",
  "Ritmo por vuelta": "91,5",
  "Energía virtual máxima": "99",
  "Energía virtual por vuelta": "2,4",
  "Vida del neumático": "44",
  "Pérdida por desgaste": "0,3",
  "Tránsito por boxes": "26",
  "Velocidad de repostaje": "4,5",
  "Velocidad de recarga de energía": "2,7",
  "Cambio de neumáticos": "31",
  "Cargar combustible de": "2",
  "Cargar energía de": "3",
  "Nombre del piloto": "Ana Pérez",
  Iniciales: "AP",
  "Nombre de esta estrategia": "Húmedo B",
  Nota: "Nota larga",
};
const writtenFields = {
  name: "Copa Fuji",
  track: "Suzuka",
  class: "LMP2",
  durationMinutes: "361",
  fuelCapacityLiters: "83.5",
  pitTransitSeconds: "26",
  startAt: "2026-12-06T12:00:00.000Z",
  driverName: "Ana Pérez",
  driverInitials: "AP",
  team: "Equipo Z",
  variantName: "Húmedo B",
  variantMode: "dry",
  variantNote: "Nota larga",
};
const writtenInputs = {
  basePaceSeconds: "91.5",
  fuelPerLapLiters: "1.9",
  raceLaps: "237",
  veCapacityPercent: "99",
  vePerLapPercent: "2.4",
  tyreLifeLaps: "44",
  degradationSeconds: "0.3",
  refuelRate: "4.5",
  veRate: "2.7",
  tyreServiceSeconds: "31",
  formationSeconds: "1",
  fuelStep: "2",
  veStep: "3",
  reserveLaps: "0.9",
  serviceMode: "sequential",
};
const withTeam = (view: StrategyView) => {
  if (view.form) view.form.fields.team = "Equipo Z";
  return view;
};
async function writeEverything() {
  await openRace();
  click("Editar carrera");
  fill(allFields);
  fireEvent.click(screen.getByRole("radio", { name: "Uno tras otro" }));
}

// The calculation ends refusing «Vueltas que vas a dar»: the editor shows it marked.
const markedRaceLaps = () =>
  waitFor(() =>
    expect(field("Vueltas que vas a dar").getAttribute("aria-invalid")).toBe(
      "true",
    ),
  );

describe("Confirmar y calcular", () => {
  it("is offered only while the data are being edited, next to Confirmar datos", async () => {
    mount("calculating");
    await openRace();
    expect(
      screen.queryByRole("button", { name: "Confirmar y calcular" }),
    ).toBeNull();
    click("Editar carrera");
    expect(button("Confirmar datos")).toBeTruthy();
    expect(button("Confirmar y calcular")).toBeTruthy();
  });

  it("sends every field and every input to compute, all values different, and moves to the plan", async () => {
    const request = mount("calculating", undefined, withTeam);
    await writeEverything();
    click("Confirmar y calcular");
    await screen.findByRole("heading", { name: "Calculando…" });
    expect(tab("Plan").getAttribute("aria-selected")).toBe("true");
    expect(statusText()).toBe("Calculando el plan.");
    const compute = sent(request, "strategy.compute");
    expect(compute.eventId).toBe("event-1");
    expect(compute.strategyId).toBe("variant-1");
    expect(compute.form.fields).toEqual(writtenFields);
    expect(compute.form.inputs).toEqual(writtenInputs);
    // the data are no longer waiting to be confirmed: nothing stays locked
    expect(screen.queryByText("Datos sin confirmar")).toBeNull();
    expect(tab("Plan").getAttribute("aria-disabled")).not.toBe("true");
  });

  it("sends to compute the very same form that Confirmar datos sends", async () => {
    const confirmed = mount("calculating", undefined, withTeam);
    await writeEverything();
    click("Confirmar datos");
    await screen.findByText("Datos confirmados.");
    const confirm = sent(confirmed, "strategy.confirm");
    cleanup();
    const computed = mount("calculating", undefined, withTeam);
    await writeEverything();
    click("Confirmar y calcular");
    await screen.findByRole("heading", { name: "Calculando…" });
    const compute = sent(computed, "strategy.compute");
    expect(compute.form).toEqual({
      fields: confirm.fields,
      inputs: confirm.inputs,
    });
  });

  it("does not send anything when the form has errors, and marks them", async () => {
    const request = mount("calculating");
    await openRace();
    click("Editar carrera");
    fill({ Depósito: "" });
    click("Confirmar y calcular");
    expect(field("Depósito").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("Revisa 1 dato");
    expect(methods(request)).not.toContain("strategy.compute");
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
  });

  it("confirms the data first and calculates after, so cancelling the calculation keeps what was written", async () => {
    const request = mount("calculating");
    await openRace();
    click("Editar carrera");
    fill({ "Nombre de la carrera": "Copa Fuji", "Ritmo por vuelta": "91,5" });
    click("Confirmar y calcular");
    await screen.findByRole("button", { name: "Cancelar" });
    expect(methods(request).filter((m) => m !== "strategy.view")).toEqual([
      "strategy.open",
      "strategy.confirm",
      "strategy.compute",
    ]);
    click("Cancelar");
    await screen.findByRole("heading", { name: "Sin calcular" });
    fireEvent.click(tab("Carrera"));
    // the host drops what a cancelled calculation was given; what was confirmed stays
    expect(screen.getByRole("heading", { name: "Copa Fuji" })).toBeTruthy();
    expect(screen.getByText("1:31,500 por vuelta")).toBeTruthy();
    expect(screen.getByText("Sin guardar")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the editor and what was written when the host refuses to confirm", async () => {
    mount("calculating", (r) =>
      r.method === "strategy.confirm" ? { kind: "rejected" } : undefined,
    );
    await openRace();
    click("Editar carrera");
    fill({ "Nombre de la carrera": "Copa Fuji" });
    click("Confirmar y calcular");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "No se ha podido completar la acción.",
    );
    expect(field("Nombre de la carrera").value).toBe("Copa Fuji");
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the confirmed data and says so when the host refuses to calculate afterwards", async () => {
    const request = mount("calculating", (r) =>
      r.method === "strategy.compute" ? { kind: "rejected" } : undefined,
    );
    await openRace();
    click("Editar carrera");
    fill({ "Nombre de la carrera": "Copa Fuji" });
    click("Confirmar y calcular");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "No se ha podido completar la acción.",
    );
    expect(methods(request)).toContain("strategy.confirm");
    // nothing is lost: the data are confirmed and the editor is closed
    expect(screen.getByRole("heading", { name: "Copa Fuji" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Cancelar edición" }),
    ).toBeNull();
    expect(screen.getByText("Sin guardar")).toBeTruthy();
  });

  it("keeps the editor, with its draft, when the data changed outside the screen", async () => {
    const { seen, map } = watch();
    mount(
      "calculating",
      (r) => {
        if (r.method !== "strategy.confirm" || !seen.view) return;
        return {
          kind: "strategyConflict",
          current: { ...structuredClone(seen.view), revision: "b".repeat(64) },
        };
      },
      map,
    );
    await openRace();
    click("Editar carrera");
    fill({ "Nombre de la carrera": "Mi nombre" });
    click("Confirmar y calcular");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Los datos de la carrera han cambiado fuera de esta pantalla. Revisa lo que has escrito y vuelve a confirmar.",
    );
    expect(field("Nombre de la carrera").value).toBe("Mi nombre");
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
  });

  it("says the data changed outside when the conflict comes after confirming, at the calculation", async () => {
    const { seen, map } = watch();
    const request = mount(
      "calculating",
      (r) => {
        if (r.method !== "strategy.compute" || !seen.view) return;
        return {
          kind: "strategyConflict",
          current: { ...structuredClone(seen.view), revision: "b".repeat(64) },
        };
      },
      map,
    );
    await openRace();
    click("Editar carrera");
    fill({ "Nombre de la carrera": "Mi nombre" });
    click("Confirmar y calcular");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Los datos de la carrera han cambiado fuera de esta pantalla. Vuelve a calcular el plan.",
    );
    expect(methods(request)).toContain("strategy.confirm");
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
  });

  it("goes back to the Carrera tab with the draft and the field marked when the calculation rejects an input", async () => {
    const request = mount("computeInvalid");
    await openRace();
    click("Editar carrera");
    fill({ "Nombre de la carrera": "Copa Fuji", "Ritmo por vuelta": "91,5" });
    click("Confirmar y calcular");
    await markedRaceLaps();
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
    expect(field("Nombre de la carrera").value).toBe("Copa Fuji");
    expect(field("Ritmo por vuelta").value).toBe("91,5");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("Revisa 1 dato");
    expect(statusText()).toBe("No se pudo calcular el plan.");
    // the lock of unconfirmed data is back
    expect(screen.getByText("Datos sin confirmar")).toBeTruthy();
    // and it is sent again once corrected, with what was written
    fill({ "Vueltas que vas a dar": "4" });
    click("Confirmar y calcular");
    await waitFor(() =>
      expect(
        request.mock.calls.filter(([r]) => r.method === "strategy.compute"),
      ).toHaveLength(2),
    );
    const second = request.mock.calls.filter(
      ([r]) => r.method === "strategy.compute",
    )[1][0];
    if (second.method !== "strategy.compute") throw Error("compute");
    expect(second.form.inputs.raceLaps).toBe("4");
    expect(second.form.fields.name).toBe("Copa Fuji");
  });

  it("keeps the editor open with what was written and the field marked when the host refuses the confirmation", async () => {
    const request = mount("calculating", (r) =>
      r.method === "strategy.confirm"
        ? { kind: "strategyInvalidInput", field: "raceLaps" }
        : undefined,
    );
    await openRace();
    click("Editar carrera");
    fill({ "Nombre de la carrera": "Copa Fuji", "Ritmo por vuelta": "91,5" });
    click("Confirmar y calcular");
    await markedRaceLaps();
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
    expect(field("Nombre de la carrera").value).toBe("Copa Fuji");
    expect(field("Ritmo por vuelta").value).toBe("91,5");
    expect(screen.getByRole("alert").textContent).toContain("Revisa 1 dato");
    expect(methods(request)).not.toContain("strategy.compute");
    // the same with the button that only confirms
    click("Confirmar datos");
    await waitFor(() =>
      expect(
        request.mock.calls.filter(([r]) => r.method === "strategy.confirm"),
      ).toHaveLength(2),
    );
    await markedRaceLaps();
    expect(field("Nombre de la carrera").value).toBe("Copa Fuji");
  });

  it("says the calculation did not accept the data when the host names no field", async () => {
    mount("calculating", (r) =>
      r.method === "strategy.confirm"
        ? { kind: "strategyInvalidInput", field: null }
        : undefined,
    );
    await openRace();
    click("Editar carrera");
    fill({ "Nombre de la carrera": "Copa Fuji" });
    click("Confirmar y calcular");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "El cálculo no ha aceptado los datos. Revísalos.",
    );
    expect(field("Nombre de la carrera").value).toBe("Copa Fuji");
    expect(
      screen.getByRole("button", { name: "Cancelar edición" }),
    ).toBeTruthy();
  });

  it("also goes to the marked field when Calcular plan is used with the saved data", async () => {
    mount("computeInvalid");
    await openPlan();
    click("Calcular plan");
    await markedRaceLaps();
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
  });

  it("does not drag the user to Carrera for a plan error that was already there", async () => {
    mount("ready", undefined, showing(failure("invalidInput", "raceLaps")));
    await openPlan();
    expect(tab("Plan").getAttribute("aria-selected")).toBe("true");
    expect(
      screen.queryByRole("button", { name: "Cancelar edición" }),
    ).toBeNull();
  });

  it("keeps blocking the Plan tab and navigation while unconfirmed data are open", async () => {
    mount("calculating");
    await openRace();
    click("Editar carrera");
    fireEvent.click(tab("Plan"));
    expect(tab("Carrera").getAttribute("aria-selected")).toBe("true");
    expect(tab("Plan").getAttribute("aria-disabled")).toBe("true");
    expect((button("← Tus estrategias") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("Datos sin confirmar")).toBeTruthy();
  });
});
