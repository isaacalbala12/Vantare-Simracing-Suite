/**
 * Modelo de la pantalla Estrategia de Command Orbit
 * (`15-briefings/07-estrategia.md`, `13-modelo-y-algoritmos.md § 13.5`).
 *
 * Dominio puro. Aquí vive **solo** lo que `strategy-contract-v1` no cubre:
 * el reparto de vueltas entre stints, la rotación de pilotos y los derivados
 * de reloj (hora de stint, ventana de boxes, distribución). El inventario de
 * neumáticos, su legalidad y su condición son del dominio real
 * (`strategy/strategy-tyre.ts`) y esta capa no los duplica: solo aplica el
 * desgaste por uso que describe `13.5` sobre la condición real de partida
 * (ver `00-decisiones.md`, D-61).
 */

import {
  conditionMidpoint,
  type StrategyTyre,
} from "../../strategy/strategy-editor";

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

export interface StintPlan {
  /** Índice del stint (0-based). */
  i: number;
  /** Id del piloto. */
  d: string;
  laps: number;
  fuel: number;
  /** Ritmo del piloto en el modo activo, en segundos. */
  pace: number;
  /** Segundos desde la salida. */
  start: number;
  end: number;
  lap0: number;
  lap1: number;
  over: boolean;
  manual: boolean;
}

export interface StrategyPlan {
  stints: StintPlan[];
  totalLaps: number;
  /** Tiempo total en pista + paradas, en segundos. */
  total: number;
  stops: number;
  maxLaps: number;
  avgFuel: number;
  avgPace: number;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * `13.5 · buildPlan`: reparte las vueltas totales en el mínimo de stints que
 * caben en el depósito, equilibrados, respetando los overrides y repitiendo la
 * rotación de pilotos cuando hay más stints que pilotos.
 */
export function buildPlan(
  event: StrategyEvent,
  drivers: Record<string, StrategyDriver>,
  strategy: Pick<StrategyVariant, "mode" | "order" | "overrides">,
): StrategyPlan {
  const order = strategy.order.slice();
  if (order.length === 0) {
    return {
      stints: [],
      totalLaps: 0,
      total: 0,
      stops: 0,
      maxLaps: 0,
      avgFuel: 0,
      avgPace: 0,
    };
  }
  const paceOf = (id: string) => drivers[id][strategy.mode][0];
  const fuelOf = (id: string) => drivers[id][strategy.mode][1];
  const avgPace = average(order.map(paceOf));
  const avgFuel = average(order.map(fuelOf));
  const maxLaps = Math.max(1, Math.floor(event.tankL / avgFuel));
  // La última vuelta se completa: en carrera a tiempo la bandera cae con el
  // coche en pista, así que se redondea hacia arriba.
  const totalLaps = Math.ceil((event.durationMin * 60) / avgPace);
  const n = Math.max(order.length, Math.ceil(totalLaps / maxLaps));
  while (order.length < n) order.push(strategy.order[order.length % strategy.order.length]);

  const overrides = strategy.overrides;
  const fixed = Object.keys(overrides)
    .map(Number)
    .filter((index) => index < n && (overrides[index].laps ?? 0) > 0);
  const fixedLaps = fixed.reduce((sum, index) => sum + (overrides[index].laps ?? 0), 0);
  const free = n - fixed.length;
  const freeLaps = Math.max(0, totalLaps - fixedLaps);
  const base = free ? Math.floor(freeLaps / free) : 0;
  const extra = free ? freeLaps % free : 0;

  const stints: StintPlan[] = [];
  let clock = 0;
  let lap = 0;
  let taken = 0;
  for (let i = 0; i < n; i += 1) {
    const id = order[i];
    const pace = paceOf(id);
    const laps = fixed.includes(i) ? (overrides[i].laps as number) : base + (taken++ < extra ? 1 : 0);
    const wanted = (overrides[i]?.fuel ?? 0) > 0 ? (overrides[i].fuel as number) : laps * fuelOf(id);
    const start = clock;
    clock += laps * pace;
    stints.push({
      i,
      d: id,
      laps,
      fuel: Math.min(wanted, event.tankL),
      pace,
      start,
      end: clock,
      lap0: lap + 1,
      lap1: lap + laps,
      over: wanted > event.tankL + 0.01,
      manual: Boolean(overrides[i]),
    });
    lap += laps;
    if (i < n - 1) clock += event.pitS;
  }

  return { stints, totalLaps, total: clock, stops: n - 1, maxLaps, avgFuel, avgPace };
}

/** Rotación por orden: `Repartir pilotos` vuelve al orden base repetido. */
export function rotateOrder(base: string[], stints: number): string[] {
  if (base.length === 0) return [];
  return Array.from({ length: Math.max(base.length, stints) }, (_, i) => base[i % base.length]);
}

/** Minuto absoluto de un instante del plan (`startMin + segundos/60`). */
export function stintClock(event: StrategyEvent, seconds: number): number {
  return event.startMin + seconds / 60;
}

/** `13.5`: la ventana de boxes es la vuelta `max(lap0, lap1 − 3)`. */
export function pitWindowLap(stint: StintPlan): number {
  return Math.max(stint.lap0, stint.lap1 - 3);
}

/** Minuto absoluto en el que se abre la ventana de boxes de un stint. */
export function pitWindowClock(event: StrategyEvent, stint: StintPlan): number {
  const window = pitWindowLap(stint);
  return stintClock(event, stint.start + (window - stint.lap0) * stint.pace);
}

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
export function distribution(plan: StrategyPlan, drivers: StrategyDriver[]): DistributionSlice[] {
  return drivers
    .map((driver) => {
      const mine = plan.stints.filter((stint) => stint.d === driver.id);
      return {
        driver,
        laps: mine.reduce((sum, stint) => sum + stint.laps, 0),
        time: mine.reduce((sum, stint) => sum + (stint.end - stint.start), 0),
      };
    })
    .filter((slice) => slice.laps > 0);
}

// ────────────────────────────────────────────────────────── COMPARACIÓN
//
// `13.5`: en carrera a tiempo gana quien completa **más vueltas**. El texto
// explica el intercambio: el ahorro son las paradas que se quitan por el
// tiempo de parada, el coste son los segundos de ritmo que se pierden en
// pista a lo largo de las vueltas de la alternativa.

export interface StrategyComparison {
  /** Id de la estrategia que completa más vueltas (empate → la activa). */
  winnerId: string;
  loserId: string;
  winnerLaps: number;
  loserLaps: number;
  /** Diferencia de vueltas (0 en empate). */
  diff: number;
  /** Paradas que la alternativa ahorra frente a la activa (0 o menos = ninguna). */
  savedStops: number;
  /** Segundos de boxes ahorrados. */
  savedS: number;
  /** Segundos de ritmo perdidos en pista. */
  costS: number;
  /** El ahorro supera al coste. */
  pays: boolean;
  /** Ninguna de las dos para menos que la otra. */
  sameStops: boolean;
  /** Stints de la estrategia activa. */
  stints: number;
  driverCount: number;
  /** Nombres (primer nombre) de quien dobla turno en la activa. */
  doubles: string[];
}

export interface ComparisonSide {
  id: string;
  plan: StrategyPlan;
}

/**
 * `13.5 · Comparación`. `a` es la estrategia activa y `b` la alternativa; el
 * ahorro y el coste se miden siempre de `a` hacia `b`, como en el prototipo.
 */
export function compareStrategies(
  a: ComparisonSide,
  b: ComparisonSide,
  pitS: number,
  drivers: StrategyDriver[],
): StrategyComparison {
  const winnerIsA = a.plan.totalLaps >= b.plan.totalLaps;
  const savedStops = a.plan.stops - b.plan.stops;
  const savedS = savedStops * pitS;
  const costS = (b.plan.avgPace - a.plan.avgPace) * b.plan.totalLaps;
  const doubles = drivers
    .filter((driver) => a.plan.stints.filter((stint) => stint.d === driver.id).length > 1)
    .map((driver) => driver.name.split(" ")[0]);

  return {
    winnerId: winnerIsA ? a.id : b.id,
    loserId: winnerIsA ? b.id : a.id,
    winnerLaps: Math.max(a.plan.totalLaps, b.plan.totalLaps),
    loserLaps: Math.min(a.plan.totalLaps, b.plan.totalLaps),
    diff: Math.abs(a.plan.totalLaps - b.plan.totalLaps),
    savedStops,
    savedS,
    costS,
    pays: savedS > costS,
    sameStops: savedStops <= 0,
    stints: a.plan.stints.length,
    driverCount: drivers.length,
    doubles,
  };
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
