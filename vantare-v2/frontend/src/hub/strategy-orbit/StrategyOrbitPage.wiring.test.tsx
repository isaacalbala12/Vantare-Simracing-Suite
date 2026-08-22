import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  StrategyEventV2,
  StrategyPlanningInputsV2,
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

const projectionConfidence = { sampleSize: 20, rangeLower: 2.6, rangeUpper: 2.9, computationVersion: "producer.v1" };
const derivedPlanning: StrategyPlanningInputsV2 = {
  projection: {
    contractVersion: "strategyinputprojection.v2", generatedAt: "2026-08-22T12:00:00.000Z", computationVersion: "producer.v1",
    sourceSessions: ["race-1"], combinationId: "lmu:imola",
    fuelConsumption: { presence: "valid", provenance: { kind: "derived", sourceId: "aggregate:lmu:imola" }, confidence: projectionConfidence, meanPerLap: 2.75, rangeLower: 2.6, rangeUpper: 2.9 },
    virtualEnergyConsumption: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_virtual_energy_consumption", meanPerLap: 0, rangeLower: 0, rangeUpper: 0 },
    combinedStintPaceCurve: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_combined_stint_pace_curve", identifiability: "combined_only", points: [] },
    tyreDegradation: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_tyre_degradation" },
    pit: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" } },
    savingCost: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_saving_cost" },
  },
  overrides: {},
};

const goldenClient: StrategyApplicationClient<unknown> = {
  async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
    if (command.operation === "list") {
      return {
        protocolVersion: "strategy.application.v1",
        commandId: command.commandId,
        repositoryVersion: 0,
        plans: [],
        recoveredFromBackup: false,
        closed: false,
      };
    }
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
    expect(stints.map((stint) => Number(stint.getAttribute("data-laps")))).toEqual([11, 32, 32, 32, 32]);
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

  it("vincula una combinación y persiste el toggle de sesión en el documento canónico", async () => {
    window.localStorage.clear();
    let saved: StrategyEventV2 | undefined;
    let version = 0;
    const calculatedInputs: unknown[] = [];
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
        const base = { protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: version, recoveredFromBackup: false, closed: false };
        if (command.operation === "list_session_combinations") return { ...base, sessionCatalogStatus: "available", sessionCombinations: [{
          combinationId: "lmu:imola", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Mustang", carClass: "LMGT3",
          sessionCount: 1, raceCount: 1, lastActivity: "2026-08-21T12:00:00Z", climateBuckets: [{ bucket: "dry", laps: 20 }],
          sessions: [{ sessionId: "race-1", type: "race", status: "identified_usable", defaultIncluded: true, lastActivity: "2026-08-21T12:00:00Z", climateBuckets: [{ bucket: "dry", laps: 20 }] }],
        }] };
        if (command.operation === "list_events") return { ...base, events: saved ? [saved] : [] };
        if (command.operation === "create_event" || command.operation === "edit_event") {
          saved = command.event;
          version += 1;
          return { ...base, repositoryVersion: version, strategyDocument: { contractVersion: "strategy.v2", schemaVersion: "2.0.0", generatedAt: command.updatedAt, events: [saved] } };
        }
        if (command.operation === "get_event_planning_inputs") return {
          ...base,
          planningInputStatus: saved?.combination?.sessions.some((session) => session.included) ? "available" : "no_included_sessions",
          planningInputs: saved?.combination?.sessions.some((session) => session.included)
            ? { ...derivedPlanning, overrides: saved.planningInputs?.overrides ?? {} }
            : { overrides: saved?.planningInputs?.overrides ?? {} },
        };
        if (command.operation === "calculate_orbit") {
          calculatedInputs.push(command.input);
          return { ...base, orbitCalculation: orbitGolden as StrategyOrbitCalculationResultV1 };
        }
        if (command.operation === "list") return { ...base, plans: [] };
        throw new Error(`unexpected ${command.operation}`);
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    const slot = document.createElement("div");
    slot.id = STRATEGY_CONTEXT_SLOT_ID;
    document.body.append(slot);
    render(<I18nProvider><ToastProvider><StrategyOrbitPage applicationClient={client} roster={ROSTER} /></ToastProvider></I18nProvider>);

    expect(await screen.findByTestId("orbit-strategy-session-picker")).toBeTruthy();
    fireEvent.click(screen.getByTestId("orbit-session-combination-lmu:imola"));
    expect(await screen.findByTestId("orbit-strategy-overview")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Datos" }));
    const fuel = await screen.findByTestId("orbit-planning-input-fuel_per_lap_liters");
    expect(within(fuel).getByLabelText(/Derivado: Calculado con 20 muestras/)).toBeTruthy();
    const fuelInput = within(fuel).getByRole("textbox");
    fireEvent.change(fuelInput, { target: { value: "3.5" } });
    fireEvent.blur(fuelInput);
    await waitFor(() => expect(saved?.planningInputs?.overrides.fuel_per_lap_liters?.value).toBe(3.5));
    const overriddenFuel = await screen.findByTestId("orbit-planning-input-fuel_per_lap_liters");
    expect(await within(overriddenFuel).findByRole("button", { name: "Volver al derivado" })).toBeTruthy();
    expect(saved?.planningInputs?.projection?.fuelConsumption.meanPerLap).toBe(2.75);
    expect(saved?.planningInputs?.overrides.fuel_per_lap_liters?.value).toBe(3.5);
    expect(calculatedInputs.some((input) => JSON.stringify(input).includes('"fuel_per_lap_liters":{"value":3.5'))).toBe(true);
    fireEvent.click(within(overriddenFuel).getByRole("button", { name: "Volver al derivado" }));
    await waitFor(() => expect(saved?.planningInputs?.overrides.fuel_per_lap_liters).toBeUndefined());
    const revertedFuel = await screen.findByTestId("orbit-planning-input-fuel_per_lap_liters");
    await within(revertedFuel).findByLabelText(/Derivado: Calculado con 20 muestras/);
    expect(saved?.planningInputs?.projection?.fuelConsumption.meanPerLap).toBe(2.75);
    expect(saved?.planningInputs?.overrides.fuel_per_lap_liters).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Sesiones" }));
    const sessions = await screen.findByTestId("orbit-strategy-sessions");
    fireEvent.click(within(sessions).getByRole("button", { name: "Excluir" }));
    await screen.findByText("Excluida por ti");
    expect(saved?.combination?.sessions).toEqual([{ sessionId: "race-1", included: false }]);
  });

  it("muestra ejemplos validados ordenados con cifras neutrales del replay Go", async () => {
    window.localStorage.clear();
    let saved: StrategyEventV2 | undefined;
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
        const base = { protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 0, recoveredFromBackup: false, closed: false };
        if (command.operation === "list_session_combinations") return { ...base, sessionCatalogStatus: "available", sessionCombinations: [{
          combinationId: "lmu:imola", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Mustang", carClass: "LMGT3",
          sessionCount: 1, raceCount: 1, lastActivity: "2026-08-20T18:00:00Z", climateBuckets: [{ bucket: "dry", laps: 4 }],
          sessions: [{ sessionId: "race-new", type: "race", status: "identified_usable", defaultIncluded: true, lastActivity: "2026-08-20T18:00:00Z", climateBuckets: [{ bucket: "dry", laps: 4 }] }],
        }] };
        if (command.operation === "list_events") return { ...base, events: saved ? [saved] : [] };
        if (command.operation === "create_event" || command.operation === "edit_event") {
          saved = command.event;
          return { ...base, strategyDocument: { contractVersion: "strategy.v2", schemaVersion: "2.0.0", generatedAt: command.updatedAt, events: [saved] } };
        }
        if (command.operation === "get_event_planning_inputs") return { ...base, planningInputStatus: "available", planningInputs: derivedPlanning };
        if (command.operation === "get_validated_examples") return { ...base, validatedExamples: {
          status: "available", combinationId: "lmu:imola",
          races: [{ raceId: "race-new", occurredAt: "2026-08-20T18:00:00Z", predictedTotalSeconds: 416, observedTotalSeconds: 420, absoluteErrorSeconds: 4, absoluteErrorRatio: 4 / 420,
            stints: [
              { stintNumber: 1, laps: 3, predictedSeconds: 315, observedSeconds: 318, absoluteErrorSeconds: 3, absoluteErrorRatio: 3 / 318 },
              { stintNumber: 2, laps: 1, predictedSeconds: 101, observedSeconds: 102, absoluteErrorSeconds: 1, absoluteErrorRatio: 1 / 102 },
            ], pitLaps: [3] }],
          aggregate: { raceCount: 1, totalErrorRatio: { count: 1, mean: 4 / 420, lower: 4 / 420, upper: 4 / 420 }, stintErrorRatio: { count: 2, mean: 0.00962, lower: 0.00942, upper: 0.00982 } },
        } };
        if (command.operation === "calculate_orbit") return { ...base, orbitCalculation: orbitGolden as StrategyOrbitCalculationResultV1 };
        if (command.operation === "list") return { ...base, plans: [] };
        throw new Error(`unexpected ${command.operation}`);
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    const slot = document.createElement("div");
    slot.id = STRATEGY_CONTEXT_SLOT_ID;
    document.body.append(slot);
    render(<I18nProvider><ToastProvider><StrategyOrbitPage applicationClient={client} roster={ROSTER} /></ToastProvider></I18nProvider>);

    fireEvent.click((await screen.findByTestId("orbit-session-combination-lmu:imola")));
    const examples = await screen.findByTestId("orbit-validated-examples");
    expect(examples.textContent).toContain("Ejemplos validados");
    expect(examples.textContent).toContain("3 + 1 vueltas");
    expect(examples.textContent).toContain("6:56");
    expect(examples.textContent).toContain("7:00");
    expect(examples.textContent).toContain("1,0 %");
    expect(examples.textContent).not.toMatch(/aprob|suspens|pass|fail/i);
  });

  it("muestra el vacío honesto cuando la combinación aún no tiene carreras", async () => {
    window.localStorage.clear();
    let saved: StrategyEventV2 | undefined;
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
        const base = { protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 0, recoveredFromBackup: false, closed: false };
        if (command.operation === "list_session_combinations") return { ...base, sessionCatalogStatus: "available", sessionCombinations: [{
          combinationId: "lmu:imola", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Mustang", carClass: "LMGT3", sessionCount: 0, raceCount: 0,
          lastActivity: "2026-08-20T18:00:00Z", climateBuckets: [], sessions: [],
        }] };
        if (command.operation === "list_events") return { ...base, events: saved ? [saved] : [] };
        if (command.operation === "create_event" || command.operation === "edit_event") {
          saved = command.event;
          return { ...base, strategyDocument: { contractVersion: "strategy.v2", schemaVersion: "2.0.0", generatedAt: command.updatedAt, events: [saved] } };
        }
        if (command.operation === "get_event_planning_inputs") return { ...base, planningInputStatus: "no_included_sessions", planningInputs: { overrides: {} } };
        if (command.operation === "get_validated_examples") return { ...base, validatedExamples: {
          status: "no_races", combinationId: "lmu:imola", races: [],
          aggregate: { raceCount: 0, totalErrorRatio: { count: 0, mean: 0, lower: 0, upper: 0 }, stintErrorRatio: { count: 0, mean: 0, lower: 0, upper: 0 } },
        } };
        if (command.operation === "calculate_orbit") return { ...base, orbitCalculation: orbitGolden as StrategyOrbitCalculationResultV1 };
        if (command.operation === "list") return { ...base, plans: [] };
        throw new Error(`unexpected ${command.operation}`);
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    const slot = document.createElement("div");
    slot.id = STRATEGY_CONTEXT_SLOT_ID;
    document.body.append(slot);
    render(<I18nProvider><ToastProvider><StrategyOrbitPage applicationClient={client} roster={ROSTER} /></ToastProvider></I18nProvider>);

    fireEvent.click((await screen.findByTestId("orbit-session-combination-lmu:imola")));
    expect((await screen.findByTestId("orbit-validated-examples")).textContent).toContain("Aún no hay carreras de esta combinación");
  });

  it("edita NODE_50 y muestra planes por escenario con recomendación robusta", async () => {
    window.localStorage.clear();
    let saved: StrategyEventV2 | undefined;
    const calculatedInputs: unknown[] = [];
    let version = 0;
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
        const base = { protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: version, recoveredFromBackup: false, closed: false };
        if (command.operation === "list_session_combinations") return { ...base, sessionCatalogStatus: "no_authorized_telemetry", sessionCombinations: [] };
        if (command.operation === "list_events") return { ...base, events: saved ? [saved] : [] };
        if (command.operation === "create_event" || command.operation === "edit_event") {
          saved = command.event;
          version += 1;
          return { ...base, repositoryVersion: version, strategyDocument: { contractVersion: "strategy.v2", schemaVersion: "2.0.0", generatedAt: command.updatedAt, events: [saved] } };
        }
        if (command.operation === "calculate_orbit") {
          calculatedInputs.push(command.input);
          const hasWeather = Boolean(command.input.weatherScenarios?.length);
          return {
            ...base,
            orbitCalculation: {
              ...(orbitGolden as StrategyOrbitCalculationResultV1),
              ...(hasWeather ? { weather: {
                plans: [{ scenarioId: command.input.weatherScenarios![0].scenario.scenarioId, weight: 1, totalSeconds: 15000, stops: 4, stints: [{ index: 0, laps: 11 }, { index: 1, laps: 32 }], timeline: [{ lap: 1, rainChance: 0, bucket: "dry" }, { lap: 70, rainChance: 100, bucket: "wet" }] }],
                robust: { method: "minimax_regret", maxRegretSeconds: 6, weightedExpectedLossSeconds: 2.5, stints: [{ index: 0, laps: 11 }, { index: 1, laps: 32 }] },
              } } : {}),
            } as StrategyOrbitCalculationResultV1,
          };
        }
        if (command.operation === "list") return { ...base, plans: [] };
        throw new Error(`unexpected ${command.operation}`);
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    const slot = document.createElement("div");
    slot.id = STRATEGY_CONTEXT_SLOT_ID;
    document.body.append(slot);
    render(<I18nProvider><ToastProvider><StrategyOrbitPage applicationClient={client} roster={ROSTER} /></ToastProvider></I18nProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Seguir en manual" }));
    await screen.findByTestId("orbit-strategy-overview");
    fireEvent.click(screen.getByRole("button", { name: "Clima" }));
    expect(await screen.findByText("Sin escenarios: el cálculo usa seco declarado manualmente.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capturar forecast" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Añadir escenario" }));
    await waitFor(() => expect(saved?.weatherScenarios).toHaveLength(1));
    const node50 = await screen.findByTestId("orbit-weather-node-0-2");
    const rain = within(node50).getByLabelText("Lluvia");
    fireEvent.change(rain, { target: { value: "100" } });
    fireEvent.blur(rain);
    await waitFor(() => expect(saved?.weatherScenarios?.[0].scenario.nodes[2].rainChance).toBe(100));
    await screen.findByText("Minimax regret");
    expect(screen.getByText("6.0 s")).toBeTruthy();
    expect(screen.getByText("2.5 s")).toBeTruthy();
    expect(screen.getByText("V70 · Mojado · 100%")).toBeTruthy();
    expect(calculatedInputs.some((input) => JSON.stringify(input).includes('"progress":"50","rainChance":100'))).toBe(true);
  });
});
