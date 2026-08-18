import { describe, expect, it } from "vitest";
import {
  buildPlan,
  distribution,
  pitWindowLap,
  rotateOrder,
  tyreCondition,
  tyreUses,
  type StrategyDriver,
  type StrategyEvent,
} from "./strategy-orbit-model";
import type { StrategyTyre } from "../../strategy/strategy-editor";

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

function driver(id: string, pace: number, litres: number): StrategyDriver {
  return {
    id,
    name: id,
    ini: id.slice(0, 2).toUpperCase(),
    color: "#ff6a5f",
    cls: "Gold SR",
    dry: [pace, litres],
    wet: [pace + 8, litres - 0.35],
    // `13.5 · caso d`: eco añade 0.4 s de vuelta y baja el consumo un 6 %.
    eco: [pace + 0.4, Number((litres * 0.94).toFixed(4))],
  };
}

const FOUR = [
  driver("isaac", 104.0, 2.75),
  driver("sol", 104.0, 2.75),
  driver("diego", 104.0, 2.75),
  driver("marta", 104.0, 2.75),
];
const ROSTER = Object.fromEntries(FOUR.map((item) => [item.id, item]));
const ORDER = FOUR.map((item) => item.id);

describe("buildPlan (13.5)", () => {
  it("caso a · 240 min a 104 s y 2.75 L con 4 pilotos: 139 vueltas en 5 stints", () => {
    const plan = buildPlan(EVENT, ROSTER, { mode: "dry", order: ORDER, overrides: {} });

    expect(plan.totalLaps).toBe(139);
    expect(plan.maxLaps).toBe(32);
    expect(plan.stints).toHaveLength(5);
    expect(plan.stints.map((stint) => stint.laps)).toEqual([28, 28, 28, 28, 27]);
    expect(plan.stops).toBe(4);
    // La rotación se repite: el quinto stint vuelve al primer piloto.
    expect(plan.stints[4].d).toBe("isaac");
    expect(plan.stints[0].lap0).toBe(1);
    expect(plan.stints[4].lap1).toBe(139);
    // Tiempo total = vueltas × ritmo + paradas × parada.
    expect(plan.total).toBeCloseTo(139 * 104 + 4 * 64, 6);
  });

  it("caso b · un override fija su stint y el resto se redistribuye", () => {
    const plan = buildPlan(EVENT, ROSTER, {
      mode: "dry",
      order: ORDER,
      overrides: { 0: { laps: 20 } },
    });

    expect(plan.stints[0].laps).toBe(20);
    expect(plan.stints[0].manual).toBe(true);
    expect(plan.stints.slice(1).map((stint) => stint.laps)).toEqual([30, 30, 30, 29]);
    expect(plan.stints.reduce((sum, stint) => sum + stint.laps, 0)).toBe(139);
    expect(plan.stints[1].manual).toBe(false);
  });

  it("caso c · 20 min a 124.5 s y 2.10 L con un piloto: 10 vueltas, un stint", () => {
    const solo = driver("isaac", 124.5, 2.1);
    const plan = buildPlan(
      { ...EVENT, durationMin: 20, tankL: 70 },
      { isaac: solo },
      { mode: "dry", order: ["isaac"], overrides: {} },
    );

    expect(plan.totalLaps).toBe(10);
    expect(plan.stints).toHaveLength(1);
    expect(plan.stops).toBe(0);
    expect(plan.stints[0].fuel).toBeCloseTo(21, 6);
  });

  it("caso d · eco reduce las vueltas totales sin quitar la parada", () => {
    const dry = buildPlan(EVENT, ROSTER, { mode: "dry", order: ORDER, overrides: {} });
    const eco = buildPlan(EVENT, ROSTER, { mode: "eco", order: ORDER, overrides: {} });

    expect(dry.totalLaps - eco.totalLaps).toBeGreaterThanOrEqual(1);
    expect(dry.totalLaps - eco.totalLaps).toBeLessThanOrEqual(2);
    // El depósito sigue dando para el mismo número de stints: `ceil` no baja.
    expect(eco.stops).toBe(dry.stops);
    expect(eco.maxLaps).toBeGreaterThan(dry.maxLaps);
  });

  it("el combustible se recorta al depósito y marca el exceso", () => {
    const thirsty = driver("isaac", 104, 6);
    const plan = buildPlan(
      EVENT,
      { isaac: thirsty },
      { mode: "dry", order: ["isaac"], overrides: { 0: { fuel: 140 } } },
    );

    expect(plan.stints[0].fuel).toBe(90);
    expect(plan.stints[0].over).toBe(true);
  });
});

describe("derivados", () => {
  it("la ventana de boxes es la vuelta max(lap0, lap1 − 3)", () => {
    const plan = buildPlan(EVENT, ROSTER, { mode: "dry", order: ORDER, overrides: {} });
    expect(pitWindowLap(plan.stints[0])).toBe(25);
    expect(pitWindowLap({ ...plan.stints[0], lap0: 1, lap1: 2 })).toBe(1);
  });

  it("la rotación repite el orden base hasta cubrir los stints", () => {
    expect(rotateOrder(["a", "b"], 5)).toEqual(["a", "b", "a", "b", "a"]);
    expect(rotateOrder([], 3)).toEqual([]);
  });

  it("la distribución reparte vueltas y tiempo por piloto", () => {
    const plan = buildPlan(EVENT, ROSTER, { mode: "dry", order: ORDER, overrides: {} });
    const slices = distribution(plan, FOUR);

    expect(slices).toHaveLength(4);
    expect(slices[0].laps).toBe(28 + 27);
    expect(slices.reduce((sum, slice) => sum + slice.laps, 0)).toBe(139);
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

  it("sin usar conserva la condición real del dominio", () => {
    expect(tyreCondition(tyre("S-05", 80, 90), 0)).toEqual({ min: 80, max: 90 });
  });

  it("cada uso baja 12 puntos con un rango de 8", () => {
    expect(tyreCondition(tyre("M-01", 100, 100), 1)).toEqual({ min: 80, max: 88 });
    expect(tyreCondition(tyre("M-01", 100, 100), 2)).toEqual({ min: 68, max: 76 });
  });

  it("los usos se agrupan por neumático en orden de stint", () => {
    const uses = tyreUses({ 1: { FL: "M-01" }, 0: { FL: "M-01", FR: "M-02" } });
    expect(uses["M-01"]).toEqual([
      { stint: 0, corner: "FL" },
      { stint: 1, corner: "FL" },
    ]);
    expect(uses["M-02"]).toHaveLength(1);
  });
});
