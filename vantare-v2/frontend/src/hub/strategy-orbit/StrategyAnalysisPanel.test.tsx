import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { strategyOrbitEs } from "../../i18n/locales/strategy-orbit/es";
import type { StrategyOrbitCalculatedPlanV1, StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
import type { StrategyEvent, StrategyVariant } from "./strategy-orbit-model";
import { StrategyAnalysisPanel } from "./StrategyAnalysisPanel";

const t = (key: string) => strategyOrbitEs[key] ?? key;
afterEach(cleanup);
const event: StrategyEvent = {
  startMin: 14 * 60, durationMin: 120, tankL: 90, pitS: 64,
  name: "2 Horas de Spa", subtitle: "WEC · Spa", monogram: "2H",
  vehicleClass: "LMGT3", team: "Vantare Racing", dayLabel: "Sáb 24",
};
const recommended: StrategyVariant = {
  id: "normal", name: "Recomendado", note: "", mode: "dry", order: ["isaac"],
  state: "ok", overrides: {}, tyres: { 1: { FL: "fl", FR: "fr" } },
};
const eco: StrategyVariant = {
  ...recommended, id: "eco", name: "D6", mode: "eco", tyres: {},
};

function plan(overrides: Partial<StrategyOrbitCalculatedPlanV1> = {}): StrategyOrbitCalculatedPlanV1 {
  return {
    stints: [
      { i: 0, d: "isaac", laps: 30, fuel: 84, pace: 104, start: 0, end: 3120, lap0: 1, lap1: 30, pitWindowLap: 27, pitWindowSeconds: 2704, over: false, manual: false },
      { i: 1, d: "isaac", laps: 30, fuel: 84, pace: 104, start: 3184, end: 6304, lap0: 31, lap1: 60, pitWindowLap: 57, pitWindowSeconds: 5888, over: false, manual: false },
    ],
    totalLaps: 60, total: 6304, stops: 1, maxLaps: 32, avgFuel: 2.8, avgPace: 104,
    distribution: [{ driverId: "isaac", laps: 60, seconds: 6240 }],
    drivingSeconds: 6240, pitSeconds: 64, startFuelLiters: 84,
    finishFuelLiters: 0, reserveLaps: 0,
    stopDetails: [{ index: 0, lap: 30, fuelInLiters: 0, fuelOutLiters: 84, pitLossSeconds: 64 }],
    ...overrides,
  };
}

function renderPanel(options: { classes?: string[]; ecoPlan?: StrategyOrbitCalculatedPlanV1; planningInputs?: StrategyPlanningInputsV2 } = {}) {
  const ecoPlan = options.ecoPlan;
  render(<StrategyAnalysisPanel
    active={recommended}
    classes={options.classes ?? ["LMGT3"]}
    comparison={ecoPlan ? { winnerId: "normal", loserId: "eco", winnerLaps: 60, loserLaps: 60, diff: 0, savedStops: 0, savedS: 0, costS: 48, totalDeltaSeconds: 48, pays: false, sameStops: true, stints: 2, driverCount: 1, doubles: [] } : undefined}
    eco={ecoPlan ? eco : undefined}
    ecoPlan={ecoPlan}
    event={event}
    plan={plan()}
    planningInputs={options.planningInputs}
    start={new Date("2030-01-01T14:00:00Z")}
    t={t}
  />);
}

const missingPlanning = {
  projection: {
    contractVersion: "strategyinputprojection.v2", generatedAt: "2026-08-24T12:00:00.000Z", computationVersion: "producer.v1",
    sourceSessions: ["race-1"], combinationId: "lmu:spa:lmgt3",
    fuelConsumption: { presence: "valid", provenance: { kind: "derived" }, confidence: { sampleSize: 8, computationVersion: "producer.v1" }, meanPerLap: 2.8, rangeLower: 2.7, rangeUpper: 2.9 },
    virtualEnergyConsumption: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_virtual_energy_consumption", meanPerLap: 0, rangeLower: 0, rangeUpper: 0 },
    combinedStintPaceCurve: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_combined_stint_pace_curve", identifiability: "combined_only", points: [] },
    tyreDegradation: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_tyre_degradation" },
    pit: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" } },
    savingCost: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_saving_cost" },
  },
  overrides: {},
} satisfies StrategyPlanningInputsV2;

describe("StrategyAnalysisPanel", () => {
  it("compara el recomendado con D6 en las mismas columnas y superpone su reparto", () => {
    renderPanel({ ecoPlan: plan({ total: 6352, drivingSeconds: 6288, avgPace: 104.8 }) });
    expect(screen.getAllByText("Plan recomendado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Plan con ahorro").length).toBeGreaterThan(0);
    expect(screen.getByText("+0:48 más lento que el recomendado")).toBeTruthy();
    expect(document.querySelectorAll('[data-variant="outline"]')).toHaveLength(2);
  });

  it("mantiene visible la segunda fila cuando el motor no entrega D6", () => {
    renderPanel();
    expect(screen.getAllByText("Plan con ahorro").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no contiene una variante D6/).length).toBeGreaterThan(0);
  });

  it("muestra todas las clases reales y la causa concreta mientras falta ritmo por clase", () => {
    renderPanel({ classes: ["Hypercar", "LMP2", "LMGT3"] });
    expect(screen.getAllByText("Hypercar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LMP2").length).toBeGreaterThan(0);
    expect(screen.getByText(/la proyección que recibe Strategy aún no publica ritmo por clase/)).toBeTruthy();
    expect(screen.getAllByText("Sin cálculo: falta ritmo proyectado para esta clase.")).toHaveLength(2);
  });

  it("explica por qué una carrera monoclase no tiene doblajes entre clases", () => {
    renderPanel();
    expect(screen.getByText("Carrera monoclase.")).toBeTruthy();
    expect(screen.queryByText("Clase que te dobla")).toBeNull();
  });

  it("conserva una familia ausente y su causa en el log copiable", () => {
    renderPanel({ planningInputs: missingPlanning });
    expect(screen.getByTestId("orbit-analysis-log").textContent).toContain("Falta; causa: missing_combined_stint_pace_curve");
    expect(screen.getByTestId("orbit-analysis-log").textContent).toContain("Consumo: 2.8 L/v [Derivado]");
  });
});
