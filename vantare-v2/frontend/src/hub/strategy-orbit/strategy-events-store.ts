/**
 * Almacén local de **eventos de estrategia** (briefing 07, parte B).
 *
 * Hasta ahora la pantalla dependía de un único evento activo publicado por el
 * puente (`strategy:roster`): sin él no había nada que planificar. El feedback
 * de Isaac pide dos caminos —«hago yo mi estrategia» o «cojo una de un
 * evento»—, así que el evento deja de ser un dato externo y pasa a ser un
 * registro local que la pantalla sabe crear, editar y seleccionar.
 *
 * El roster del puente no desaparece: entra como un evento más (`source:
 * "roster"`) y conserva los overrides que la parte A ya guardaba en
 * `vantare.v03orbit.strategy` (migración por evento, ver `00-decisiones.md`,
 * D-W4-1).
 *
 * FREEZE ISA-694 F1 · Caracterizaciones (issue #727):
 * Este store queda congelado — ninguna feature nueva sobre localStorage.
 * Los defectos actuales se documentan con tests de caracterización verdes;
 * se corregirán en F2 (cutover al backend canónico y migración tipada).
 * Ver docs/strategy-planner/isa-694-current-state-and-rework-brief.md §8
 * y docs/strategy-planner/evidence/isa-694-spike/matriz-migracion-orbit.csv.
 * No ampliar shape, defaults ni lógica de lectura/escritura hasta F2.
 */

import type { RaceStart } from "../orbit/race-starts";
import type { StrategyRoster } from "./strategy-orbit-bridge";
import type {
  AvailabilitySegment,
  StrategyDriver,
  StrategyEvent,
  StrategyVariant,
} from "./strategy-orbit-model";

/** Clave nueva: los eventos y sus estrategias. */
export const STRATEGY_EVENTS_KEY = "vantare.v03orbit.strategy.events";
/** Clave de la parte A: solo estrategias del evento del puente. */
export const STRATEGY_LEGACY_KEY = "vantare.v03orbit.strategy";
/** Journal frontend: existe solo después de que Go confirme el commit canónico. */
export const STRATEGY_MIGRATED_KEY = "vantare.v03orbit.strategy.migrated";

/** De dónde nace el evento: del usuario, de una serie del calendario o del puente. */
export type StrategyEventSource = "custom" | "series" | "roster";

/**
 * Modo de tablero elegido en el asistente (ISA-377).
 *
 * `solo` es un evento de un solo piloto: no hay reparto entre compañeros ni
 * disponibilidad que cuadrar, así que la pantalla esconde lo que sobra.
 * `team` es el tablero completo.
 */
export type StrategyTeamMode = "solo" | "team";

/** Cómo se rellena la estrategia: manualmente o desde las sesiones elegidas. */
export type StrategyFillMode = "manual" | "telemetry";

export interface StrategyEventRecord {
  id: string;
  name: string;
  source: StrategyEventSource;
  /** Serie del calendario de la que se creó (`source: "series"`). */
  seriesId?: string;
  track: string;
  /** Clase de coche («LMGT3», «GT3»…). */
  cls: string;
  durationMin: number;
  /** Instante de la salida en ISO. */
  startAt: string;
  team?: string;
  drivers: StrategyDriver[];
  tankL: number;
  pitLossSec: number;
  strategies: StrategyVariant[];
  /** Disponibilidad declarada, por piloto (minutos absolutos del día). */
  availability?: Record<string, AvailabilitySegment[]>;
  /** Estrategia activa dentro del evento. */
  activeStrategyId?: string;
  /** Tablero completo o de un solo piloto (asistente, ISA-377). */
  teamMode?: StrategyTeamMode;
  /** Cómo se rellenó: a mano o con telemetría histórica. */
  fillMode?: StrategyFillMode;
  /**
   * Última vez que el usuario abrió este evento, en ISO. Es lo que ordena el
   * menú de entrada y lo que alimenta la tarjeta «Continuar» (ISA-377).
   */
  lastOpenedAt?: string;
}

export interface StrategyEventsState {
  events: StrategyEventRecord[];
  /** Evento seleccionado; `null` mientras el usuario no ha elegido camino. */
  activeId: string | null;
}

export const EMPTY_STRATEGY_EVENTS: StrategyEventsState = { events: [], activeId: null };

// ─────────────────────────────────────────────────────────────── lectura

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Sanea un evento leído del almacenamiento; `null` si no es utilizable. */
function parseEvent(value: unknown): StrategyEventRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null;
  const drivers = (Array.isArray(value.drivers) ? value.drivers : []).filter(
    (driver): driver is StrategyDriver => isRecord(driver) && typeof driver.id === "string",
  );
  if (drivers.length === 0) return null;
  const strategies = (Array.isArray(value.strategies) ? value.strategies : []).filter(
    (variant): variant is StrategyVariant => isRecord(variant) && typeof variant.id === "string",
  );
  return {
    id: value.id,
    name: str(value.name, value.id),
    source: (["custom", "series", "roster"] as string[]).includes(str(value.source))
      ? (value.source as StrategyEventSource)
      : "custom",
    seriesId: typeof value.seriesId === "string" ? value.seriesId : undefined,
    track: str(value.track),
    cls: str(value.cls),
    durationMin: num(value.durationMin, 60),
    startAt: str(value.startAt, new Date().toISOString()),
    team: typeof value.team === "string" ? value.team : undefined,
    drivers,
    tankL: num(value.tankL, 90),
    pitLossSec: num(value.pitLossSec, 60),
    strategies,
    availability: isRecord(value.availability)
      ? (value.availability as Record<string, AvailabilitySegment[]>)
      : undefined,
    activeStrategyId:
      typeof value.activeStrategyId === "string" ? value.activeStrategyId : undefined,
    teamMode: value.teamMode === "solo" || value.teamMode === "team" ? value.teamMode : undefined,
    fillMode: value.fillMode === "manual" || value.fillMode === "telemetry" ? value.fillMode : undefined,
    lastOpenedAt: typeof value.lastOpenedAt === "string" ? value.lastOpenedAt : undefined,
  };
}

export function readStrategyEvents(): StrategyEventsState {
  try {
    const raw = window.localStorage?.getItem(STRATEGY_EVENTS_KEY);
    if (!raw) return EMPTY_STRATEGY_EVENTS;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return EMPTY_STRATEGY_EVENTS;
    const events = (Array.isArray(parsed.events) ? parsed.events : [])
      .map(parseEvent)
      .filter((event): event is StrategyEventRecord => event !== null);
    const activeId = typeof parsed.activeId === "string" ? parsed.activeId : null;
    return { events, activeId: events.some((event) => event.id === activeId) ? activeId : null };
  } catch {
    return EMPTY_STRATEGY_EVENTS;
  }
}

export function writeStrategyEvents(state: StrategyEventsState): boolean {
  try {
    if (window.localStorage?.getItem(STRATEGY_MIGRATED_KEY)) return false;
    window.localStorage?.setItem(STRATEGY_EVENTS_KEY, JSON.stringify(state));
    return true;
  } catch {
    // Sin almacenamiento los eventos solo viven en memoria.
    return false;
  }
}

/** Sella el cutover. Se verifica la escritura para no declarar read-only si falló. */
export function markStrategyEventsMigrated(fingerprint: string, migratedAt: string): void {
  const marker = JSON.stringify({ fingerprint, migratedAt });
  window.localStorage?.setItem(STRATEGY_MIGRATED_KEY, marker);
  if (window.localStorage?.getItem(STRATEGY_MIGRATED_KEY) !== marker) {
    throw new Error("No se pudo guardar la marca de migración de Orbit.");
  }
}

export function isStrategyEventsReadOnly(): boolean {
  return Boolean(window.localStorage?.getItem(STRATEGY_MIGRATED_KEY));
}

export function clearStrategyEventsMigrated(): void {
  window.localStorage?.removeItem(STRATEGY_MIGRATED_KEY);
  if (window.localStorage?.getItem(STRATEGY_MIGRATED_KEY)) {
    throw new Error("No se pudo retirar la marca de migración de Orbit.");
  }
}

/** Estado de la parte A, que guardaba estrategias y disponibilidad sueltas. */
export interface LegacyStrategyState {
  variants: Record<string, Partial<StrategyVariant>>;
  availability?: Record<string, AvailabilitySegment[]>;
}

/** Lee la clave antigua para no perder los overrides ya guardados. */
export function readLegacyStrategyState(): LegacyStrategyState {
  try {
    const raw = window.localStorage?.getItem(STRATEGY_LEGACY_KEY);
    if (!raw) return { variants: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { variants: {} };
    if ("variants" in parsed) return parsed as unknown as LegacyStrategyState;
    return { variants: parsed as Record<string, Partial<StrategyVariant>> };
  } catch {
    return { variants: {} };
  }
}

// ──────────────────────────────────────────────────────────── derivados

/** Minutos desde medianoche local de un instante ISO. */
export function startMinuteOf(startAt: string): number {
  const at = new Date(startAt);
  if (Number.isNaN(at.getTime())) return 14 * 60;
  return at.getHours() * 60 + at.getMinutes();
}

const MONOGRAM_STOP = new Set(["de", "del", "la", "el", "of", "the", "di", "da"]);

/** Monograma de dos caracteres a partir del nombre del evento. */
export function monogramOf(name: string): string {
  const words = name
    .split(/[\s·]+/)
    .map((word) => word.trim())
    .filter((word) => word && !MONOGRAM_STOP.has(word.toLowerCase()));
  if (words.length === 0) return "EV";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Etiqueta corta del día («sáb 12»), en el idioma que se le pase. */
export function dayLabelOf(startAt: string, locale: string): string {
  const at = new Date(startAt);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(at);
}

/** Traduce un evento local al `StrategyEvent` que consume el modelo (`13.5`). */
export function toStrategyEvent(record: StrategyEventRecord, locale = "es"): StrategyEvent {
  const subtitleParts = [record.cls, record.track].filter(Boolean);
  return {
    startMin: startMinuteOf(record.startAt),
    durationMin: record.durationMin,
    tankL: record.tankL,
    pitS: record.pitLossSec,
    name: record.name,
    subtitle: subtitleParts.join(" · "),
    monogram: monogramOf(record.name),
    vehicleClass: record.cls,
    team: record.team ?? "",
    dayLabel: dayLabelOf(record.startAt, locale),
    startISO: record.startAt,
  };
}

// ──────────────────────────────────────────────────────────── creación

/** Ritmos por defecto de un piloto nuevo: honestos, no optimistas. */
export const DEFAULT_DRY: StrategyDriver["dry"] = [105, 2.8];

function defaultDriverPaces(): Pick<StrategyDriver, "dry" | "wet" | "eco"> {
  return {
    dry: DEFAULT_DRY,
    wet: [DEFAULT_DRY[0] + 8, Number((DEFAULT_DRY[1] - 0.35).toFixed(2))],
    eco: [Number((DEFAULT_DRY[0] + 1.1).toFixed(1)), Number((DEFAULT_DRY[1] - 0.2).toFixed(2))],
  };
}

/** Iniciales de un nombre («Isaac Albalá» → «IA»). */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Paleta de pilotos del kit, en el orden en que se reparten. */
export const DRIVER_COLORS = [
  "var(--orbit-coral)",
  "var(--orbit-green)",
  "var(--orbit-cyan)",
  "var(--orbit-ember)",
  "var(--orbit-cyan-soft)",
  "var(--orbit-wine)",
] as const;

export function newDriver(name: string, index: number): StrategyDriver {
  return {
    id: `d${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    ini: initialsOf(name),
    color: DRIVER_COLORS[index % DRIVER_COLORS.length],
    cls: "",
    ...defaultDriverPaces(),
  };
}

/** Primera estrategia de un evento nuevo: todos los pilotos en orden. */
function firstStrategy(drivers: StrategyDriver[], name: string, note: string): StrategyVariant {
  return {
    id: "s1",
    name,
    note,
    mode: "dry",
    order: drivers.map((driver) => driver.id),
    state: "ok",
    overrides: {},
    tyres: {},
  };
}

/** Id libre en la lista de eventos, con el prefijo del origen. */
export function freeEventId(events: readonly StrategyEventRecord[], prefix: string): string {
  const taken = new Set(events.map((event) => event.id));
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

export interface CustomEventInput {
  name: string;
  track: string;
  cls: string;
  durationMin: number;
  startAt: string;
  tankL: number;
  pitLossSec: number;
  team?: string;
  drivers: StrategyDriver[];
  /** Elección del asistente; sin ella el evento es de equipo, como siempre. */
  teamMode?: StrategyTeamMode;
  /** Fuente elegida en el asistente. */
  fillMode?: StrategyFillMode;
}

/** Evento propio: exactamente lo que el usuario ha escrito. */
export function createCustomEvent(
  events: readonly StrategyEventRecord[],
  input: CustomEventInput,
  labels: { strategyName: string; strategyNote: string },
): StrategyEventRecord {
  return {
    id: freeEventId(events, "own"),
    name: input.name,
    source: "custom",
    track: input.track,
    cls: input.cls,
    durationMin: input.durationMin,
    startAt: input.startAt,
    team: input.team || undefined,
    drivers: input.drivers,
    tankL: input.tankL,
    pitLossSec: input.pitLossSec,
    strategies: [firstStrategy(input.drivers, labels.strategyName, labels.strategyNote)],
    activeStrategyId: "s1",
    teamMode: input.teamMode ?? "team",
    fillMode: input.fillMode ?? "manual",
    lastOpenedAt: new Date().toISOString(),
  };
}

/** Duración por defecto cuando la serie no la publica (una hora). */
export const FALLBACK_SERIES_DURATION_MIN = 60;

/**
 * Evento a partir de una salida real del calendario. Los pilotos por defecto
 * son solo el usuario: nadie más ha confirmado que corre.
 */
export function createEventFromSeries(
  events: readonly StrategyEventRecord[],
  start: Pick<RaceStart, "seriesId" | "name" | "track" | "at"> & {
    vehicleClass?: string;
    durationMin?: number;
  },
  me: StrategyDriver,
  labels: { strategyName: string; strategyNote: string },
  teamMode: StrategyTeamMode = "team",
  fillMode: StrategyFillMode = "manual",
): StrategyEventRecord {
  const drivers = [me];
  return {
    id: freeEventId(events, "serie"),
    name: start.name,
    source: "series",
    seriesId: start.seriesId,
    track: start.track,
    cls: start.vehicleClass ?? "",
    durationMin: start.durationMin && start.durationMin > 0 ? start.durationMin : FALLBACK_SERIES_DURATION_MIN,
    startAt: start.at.toISOString(),
    drivers,
    tankL: 90,
    pitLossSec: 60,
    strategies: [firstStrategy(drivers, labels.strategyName, labels.strategyNote)],
    activeStrategyId: "s1",
    teamMode,
    fillMode,
    lastOpenedAt: new Date().toISOString(),
  };
}

/** Id estable del evento del puente: el mismo roster no se duplica al recargar. */
export function rosterEventId(roster: StrategyRoster): string {
  return `roster:${roster.event.name}`;
}

/**
 * Importa el roster del puente como un evento más, aplicando encima los
 * overrides que la parte A guardaba sueltos (migración, D-W4-1).
 */
export function eventFromRoster(
  roster: StrategyRoster,
  legacy: LegacyStrategyState = { variants: {} },
): StrategyEventRecord {
  const strategies: StrategyVariant[] = roster.strategies.map((item) => {
    const saved = legacy.variants[item.id];
    return {
      ...item,
      state: (saved?.state as StrategyVariant["state"]) ?? "ok",
      order: saved?.order ?? item.order,
      overrides: saved?.overrides ?? {},
      tyres: saved?.tyres ?? {},
    };
  });
  // Las estrategias que la parte A creó en local (`local-n`) también se salvan.
  for (const [id, saved] of Object.entries(legacy.variants)) {
    if (strategies.some((variant) => variant.id === id)) continue;
    if (!saved || !Array.isArray(saved.order) || saved.order.length === 0) continue;
    strategies.push({
      id,
      name: saved.name ?? id,
      note: saved.note ?? "",
      mode: saved.mode ?? "dry",
      order: saved.order,
      state: saved.state ?? "draft",
      overrides: saved.overrides ?? {},
      tyres: saved.tyres ?? {},
    });
  }

  const startAt = roster.event.startISO ?? isoFromStartMinute(roster.event.startMin);
  return {
    id: rosterEventId(roster),
    name: roster.event.name,
    source: "roster",
    track: roster.event.subtitle,
    cls: roster.event.vehicleClass,
    durationMin: roster.event.durationMin,
    startAt,
    team: roster.event.team || undefined,
    drivers: roster.drivers,
    tankL: roster.event.tankL,
    pitLossSec: roster.event.pitS,
    strategies,
    availability: legacy.availability,
    activeStrategyId: strategies[0]?.id,
  };
}

/** Instante de hoy a la hora indicada, en ISO (el roster antiguo solo traía minutos). */
function isoFromStartMinute(startMin: number, now = new Date()): string {
  const at = new Date(now);
  at.setHours(Math.floor(startMin / 60), Math.round(startMin % 60), 0, 0);
  return at.toISOString();
}

// ──────────────────────────────────────────────────────────── mutación

/** Inserta o reemplaza un evento conservando el orden de la lista. */
export function upsertEvent(
  state: StrategyEventsState,
  event: StrategyEventRecord,
): StrategyEventsState {
  const index = state.events.findIndex((item) => item.id === event.id);
  const events =
    index < 0
      ? [...state.events, event]
      : state.events.map((item, i) => (i === index ? event : item));
  return { ...state, events };
}

/** Aplica un cambio al evento indicado. */
export function patchEvent(
  state: StrategyEventsState,
  id: string,
  change: (event: StrategyEventRecord) => StrategyEventRecord,
): StrategyEventsState {
  return {
    ...state,
    events: state.events.map((event) => (event.id === id ? change(event) : event)),
  };
}

/** El evento seleccionado, o `null`. */
export function activeEventOf(state: StrategyEventsState): StrategyEventRecord | null {
  return state.events.find((event) => event.id === state.activeId) ?? null;
}

/** Quita un evento de la lista; si era el activo, la vista vuelve al menú. */
export function removeEvent(state: StrategyEventsState, id: string): StrategyEventsState {
  const events = state.events.filter((event) => event.id !== id);
  return { events, activeId: state.activeId === id ? null : state.activeId };
}

/**
 * Marca un evento como recién abierto y lo deja activo. Es la única puerta por
 * la que se entra al editor, así que `lastOpenedAt` no puede desincronizarse
 * de lo que el usuario está mirando (ISA-377).
 */
export function openEvent(
  state: StrategyEventsState,
  id: string,
  at: Date = new Date(),
): StrategyEventsState {
  if (!state.events.some((event) => event.id === id)) return state;
  return {
    activeId: id,
    events: state.events.map((event) =>
      event.id === id ? { ...event, lastOpenedAt: at.toISOString() } : event,
    ),
  };
}

/**
 * El evento que el usuario abrió más recientemente, que es el que ofrece
 * «Continuar». Los que nunca se abrieron no cuentan: nadie los ha visto.
 */
export function lastOpenedEventOf(state: StrategyEventsState): StrategyEventRecord | null {
  const stamped = state.events.filter((event) => Boolean(event.lastOpenedAt));
  if (stamped.length === 0) return null;
  return stamped.reduce((best, event) =>
    (event.lastOpenedAt ?? "") > (best.lastOpenedAt ?? "") ? event : best,
  );
}

/** Los eventos guardados en el orden del menú: primero el más reciente. */
export function eventsByRecency(state: StrategyEventsState): StrategyEventRecord[] {
  return [...state.events].sort((a, b) => {
    const left = a.lastOpenedAt ?? "";
    const right = b.lastOpenedAt ?? "";
    if (left !== right) return right.localeCompare(left);
    return a.startAt.localeCompare(b.startAt);
  });
}
