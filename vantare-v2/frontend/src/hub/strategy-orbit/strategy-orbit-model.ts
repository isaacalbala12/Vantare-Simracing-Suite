/**
 * Modelo de la pantalla Estrategia de Command Orbit
 * (`15-briefings/07-estrategia.md`, `13-modelo-y-algoritmos.md § 13.5`).
 *
 * Adaptador de presentación. El reparto de vueltas, la rotación, Fuel, las
 * ventanas y la comparación llegan ya calculados por manual+solver Go. Esta
 * capa solo tipa el estado editable, lo mapea al wire v2 y prepara ViewModels.
 */

import {
  conditionMidpoint,
  type StrategyTyre,
} from "../../strategy/strategy-editor";
import type {
  StrategyOrbitCalculatedPlanV1,
  StrategyOrbitCalculatedStintV1,
  StrategyOrbitCalculationInputV1,
  StrategyPlanningInputsV2,
  StrategyWeightedWeatherScenarioV1,
} from "../../strategy/strategy-application-client";

/** Modo de la estrategia: el ritmo y el consumo del piloto que se usan. */
export type StrategyMode = "dry" | "wet" | "eco";

/** Esquinas del prototipo (`04 · CornerSlot`), en el orden del esquema. */
export const ORBIT_CORNERS = ["FL", "FR", "RL", "RR"] as const;
export type OrbitCorner = (typeof ORBIT_CORNERS)[number];

export interface StrategyEvent {
  /** Minutos desde medianoche local de la salida (14:00 → 840). */
  startMin: number;
  durationMin: number;
  tankL: number;
  /** Tiempo de parada en segundos. */
  pitS: number;
  name: string;
  subtitle: string;
  monogram: string;
  vehicleClass: string;
  team: string;
  /** Etiqueta de día ya formateada por quien conoce el calendario real. */
  dayLabel: string;
  /** Instante real de la salida, cuando el puente lo conoce (timeline). */
  startISO?: string;
}

/** Ritmo (s/vuelta) y consumo (L/vuelta) de un piloto en un modo. */
export type StrategyPace = readonly [paceS: number, litresPerLap: number];

export interface StrategyDriver {
  id: string;
  name: string;
  ini: string;
  color: string;
  cls: string;
  dry: StrategyPace;
  wet: StrategyPace;
  eco: StrategyPace;
}

export interface StrategyOverride {
  laps?: number;
  fuel?: number;
}

/** Asignación de neumáticos: índice de stint → esquina → id del neumático. */
export type TyreAssignments = Readonly<Record<number, Partial<Record<OrbitCorner, string>>>>;

export interface StrategyVariant {
  id: string;
  name: string;
  note: string;
  mode: StrategyMode;
  /** Orden base de pilotos; la rotación se repite si hacen falta más stints. */
  order: string[];
  state: "ok" | "draft";
  overrides: Readonly<Record<number, StrategyOverride>>;
  tyres: TyreAssignments;
}

export type StintPlan = StrategyOrbitCalculatedStintV1;
export type StrategyPlan = StrategyOrbitCalculatedPlanV1;

/** Mapea el estado editable al contrato fino; no calcula ningún valor. */
export function orbitCalculationInput(
  event: StrategyEvent,
  drivers: readonly StrategyDriver[],
  variants: readonly StrategyVariant[],
  activeVariantId: string,
  planningInputs?: StrategyPlanningInputsV2,
  weatherScenarios?: readonly StrategyWeightedWeatherScenarioV1[],
): StrategyOrbitCalculationInputV1 {
  const pace = (value: StrategyPace) => ({ paceSeconds: value[0], fuelLitersPerLap: value[1] });
  return {
    event: {
      durationMinutes: event.durationMin,
      tankLiters: event.tankL,
      pitLossSeconds: event.pitS,
    },
    drivers: drivers.map((driver) => ({
      id: driver.id,
      name: driver.name,
      dry: pace(driver.dry),
      wet: pace(driver.wet),
      eco: pace(driver.eco),
    })),
    variants: variants.map((variant) => ({
      id: variant.id,
      mode: variant.mode,
      order: variant.order,
      overrides: variant.overrides,
    })),
    activeVariantId,
    ...(planningInputs ? { planningInputs } : {}),
    ...(weatherScenarios?.length ? { weatherScenarios } : {}),
  };
}

/** Minuto absoluto de un instante del plan (`startMin + segundos/60`). */
export function stintClock(event: StrategyEvent, seconds: number): number {
  return event.startMin + seconds / 60;
}

/** `13.5`: la ventana de boxes es la vuelta `max(lap0, lap1 − 3)`. */

/** Usos de cada neumático en la estrategia (stint · esquina). */
export function tyreUses(tyres: TyreAssignments): Record<string, { stint: number; corner: OrbitCorner }[]> {
  const uses: Record<string, { stint: number; corner: OrbitCorner }[]> = {};
  for (const [index, corners] of Object.entries(tyres)) {
    for (const corner of ORBIT_CORNERS) {
      const id = corners?.[corner];
      if (!id) continue;
      (uses[id] ??= []).push({ stint: Number(index), corner });
    }
  }
  for (const list of Object.values(uses)) list.sort((a, b) => a.stint - b.stint);
  return uses;
}

/** `13.5`: la condición baja 12 puntos por uso, con un rango de 8. */
export const TYRE_WEAR_PER_USE = 12;
export const TYRE_CONDITION_RANGE = 8;
export const TYRE_CONDITION_FLOOR = 40;

export interface TyreCondition {
  min: number;
  max: number;
}

/**
 * Condición mostrada: parte de la condición **real** del neumático
 * (`strategy-tyre`, que ya distingue medida de estimada) y le aplica el
 * desgaste por uso de `13.5`. Un neumático sin usar conserva su condición real.
 */
export function tyreCondition(tyre: StrategyTyre, uses: number): TyreCondition {
  const from = conditionMidpoint(tyre.condition);
  const worn = Math.max(0, from - uses * TYRE_WEAR_PER_USE);
  if (uses === 0) {
    return {
      min: tyre.condition.minimumRemainingPercent,
      max: tyre.condition.maximumRemainingPercent,
    };
  }
  return { min: Math.max(TYRE_CONDITION_FLOOR, worn - TYRE_CONDITION_RANGE), max: worn };
}

/** Ámbar cuando un neumático se ha usado más de dos veces (`13.5`). */
export const TYRE_WARN_USES = 2;

export interface DistributionSlice {
  driver: StrategyDriver;
  laps: number;
  /** Tiempo en pista del piloto, en segundos. */
  time: number;
}

/** Distribución por piloto: vueltas o tiempo (`04 · Donut`). */
export function distributionView(plan: StrategyPlan, drivers: readonly StrategyDriver[]): DistributionSlice[] {
  const byId = new Map(drivers.map((driver) => [driver.id, driver]));
  return plan.distribution.flatMap((slice) => {
    const driver = byId.get(slice.driverId);
    return driver ? [{ driver, laps: slice.laps, time: slice.seconds }] : [];
  });
}

// ───────────────────────────────────────────────────────── DISPONIBILIDAD

export type AvailabilityState = "ok" | "maybe" | "no";

/** Tramo de disponibilidad en minutos absolutos del día. */
export interface AvailabilitySegment {
  state: AvailabilityState;
  from: number;
  to: number;
}

/** Eje del tablero (`06 · Estrategia`): 13:00 → 18:30, hora local. */
export const AVAILABILITY_FROM = 13 * 60;
export const AVAILABILITY_TO = 18 * 60 + 30;

/**
 * `13.5 · Disponibilidad`: el tramo nuevo **recorta** los que solapa (las
 * partes anterior y posterior se conservan) y la lista queda ordenada por
 * inicio. Un tramo vacío tras el recorte desaparece.
 */
export function addAvailability(
  list: readonly AvailabilitySegment[],
  entry: AvailabilitySegment,
): AvailabilitySegment[] {
  const from = Math.max(AVAILABILITY_FROM, Math.min(entry.from, entry.to));
  const to = Math.min(AVAILABILITY_TO, Math.max(entry.from, entry.to));
  if (to <= from) return list.slice().sort((x, y) => x.from - y.from);

  const cut: AvailabilitySegment[] = [];
  for (const segment of list) {
    if (segment.to <= from || segment.from >= to) {
      cut.push({ ...segment });
      continue;
    }
    if (segment.from < from) cut.push({ state: segment.state, from: segment.from, to: from });
    if (segment.to > to) cut.push({ state: segment.state, from: to, to: segment.to });
  }
  cut.push({ state: entry.state, from, to });
  return cut.sort((x, y) => x.from - y.from);
}

/** `hh:mm` → minutos absolutos; `null` si el texto no es una hora. */
export function parseHhmm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** `hh:mm` a partir de un minuto absoluto. */
export function hhmm(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = Math.round(minute % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** `m:ss.mmm` de un tiempo de vuelta o de parada. */
export function lapTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}

/** `h:mm:ss` (o `m:ss`) de una duración larga. */
export function clockTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}
