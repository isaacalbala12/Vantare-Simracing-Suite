import { describe, expect, it } from "vitest";
import type { StrategyTyre } from "../../strategy/strategy-editor";
import {
  addAvailability,
  AVAILABILITY_FROM,
  AVAILABILITY_TO,
  clockTime,
  hhmm,
  lapTime,
  orbitCalculationInput,
  tyreCondition,
  tyreUses,
  type AvailabilitySegment,
  type StrategyDriver,
  type StrategyEvent,
  type StrategyVariant,
} from "./strategy-orbit-model";
import type { StrategyWeightedWeatherScenarioV1 } from "../../strategy/strategy-application-client";

const EVENT: StrategyEvent = {
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
};

const DRIVER: StrategyDriver = {
  id: "isaac",
  name: "Isaac",
  ini: "IA",
  color: "#ff6a5f",
  cls: "Gold",
  dry: [104, 2.75],
  wet: [112, 2.4],
  eco: [105.1, 2.55],
};

const VARIANT: StrategyVariant = {
  id: "s1",
  name: "Base",
  note: "",
  mode: "dry",
  order: ["isaac"],
  state: "ok",
  overrides: {},
  tyres: {},
};

describe("shaping de Orbit", () => {
  it("mapea el estado editable al input del motor sin derivar cifras", () => {
    expect(orbitCalculationInput(EVENT, [DRIVER], [VARIANT], "s1")).toEqual({
      event: { durationMinutes: 240, tankLiters: 90, pitLossSeconds: 64 },
      drivers: [{
        id: "isaac",
        name: "Isaac",
        dry: { paceSeconds: 104, fuelLitersPerLap: 2.75 },
        wet: { paceSeconds: 112, fuelLitersPerLap: 2.4 },
        eco: { paceSeconds: 105.1, fuelLitersPerLap: 2.55 },
      }],
      variants: [{ id: "s1", mode: "dry", order: ["isaac"], overrides: {} }],
      activeVariantId: "s1",
    });
  });

  it("transporta WeatherScenario v1 al motor sin recalcular el timeline", () => {
    const weatherScenarios = [{
      weight: 1,
      scenario: {
        contractVersion: "weatherscenario.v1" as const,
        scenarioId: "rain-node-50",
        combinationId: "manual:event-1",
        generatedAt: "2026-08-22T12:00:00.000Z",
        nodes: ["START", "25", "50", "75", "FINISH"].map((progress, index) => ({
          progress: progress as "START" | "25" | "50" | "75" | "FINISH",
          rainChance: index < 2 ? 0 : 100,
          sky: "overcast" as const,
          airTempC: 18,
          trackTempC: 22,
        })) as StrategyWeightedWeatherScenarioV1["scenario"]["nodes"],
        provenance: { source: "manual", capturedAt: "2026-08-22T12:00:00.000Z", freshUntil: "2026-08-22T12:00:00.001Z", sessionType: "manual", signalFreshness: "manual" },
      },
    }];
    expect(orbitCalculationInput(EVENT, [DRIVER], [VARIANT], "s1", undefined, weatherScenarios).weatherScenarios).toEqual(weatherScenarios);
  });

  it("formatea reloj, vuelta y hora para la vista", () => {
    expect(lapTime(104.25)).toBe("1:44.250");
    expect(clockTime(3723)).toBe("1:02:03");
    expect(hhmm(14 * 60 + 5)).toBe("14:05");
  });
});

describe("neumáticos", () => {
  const tyre = (id: string, min: number, max: number): StrategyTyre => ({
    id,
    compound: "medium",
    origin: max === 100 ? "event_allocation" : "qualifying",
    condition: {
      minimumRemainingPercent: min,
      maximumRemainingPercent: max,
      provenance: { kind: max === 100 ? "observed" : "range" },
      confidence: { level: max === 100 ? "high" : "low" },
    },
    state: "free",
    stints: 0,
  });

  it("conserva la condición real sin uso y presenta el desgaste ya contratado", () => {
    expect(tyreCondition(tyre("S-05", 80, 90), 0)).toEqual({ min: 80, max: 90 });
    expect(tyreCondition(tyre("M-01", 100, 100), 1)).toEqual({ min: 80, max: 88 });
  });

  it("ordena los usos para el ViewModel", () => {
    const uses = tyreUses({ 1: { FL: "M-01" }, 0: { FL: "M-01", FR: "M-02" } });
    expect(uses["M-01"]).toEqual([{ stint: 0, corner: "FL" }, { stint: 1, corner: "FL" }]);
  });
});

describe("disponibilidad", () => {
  const full: AvailabilitySegment[] = [{ state: "ok", from: AVAILABILITY_FROM, to: AVAILABILITY_TO }];

  it("recorta el tramo nuevo dentro del eje visual", () => {
    expect(addAvailability(full, { state: "no", from: 15 * 60, to: 16 * 60 })).toEqual([
      { state: "ok", from: AVAILABILITY_FROM, to: 15 * 60 },
      { state: "no", from: 15 * 60, to: 16 * 60 },
      { state: "ok", from: 16 * 60, to: AVAILABILITY_TO },
    ]);
  });
});
