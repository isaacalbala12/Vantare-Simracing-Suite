/**
 * Modelo de la pantalla Carreras de Command Orbit (`15-briefings/06-carreras.md`).
 *
 * Dominio puro: traduce el `Calendar` real del hub a las entradas que consumen
 * las cinco vistas y calcula cada rejilla (día, semana, mes, timeline) sobre el
 * motor de salidas de `13.3` (`hub/orbit/next-starts.ts`). No hay fixture de
 * respaldo: sin calendario las listas salen vacías.
 */
import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import { nextStarts, upcoming, type Series, type SeriesTier } from "../orbit/next-starts";
import { toEngineSeries, type LicenseTier } from "../orbit/race-starts";

export type TierFilter = "all" | SeriesTier;

/** Orden del filtro de categoría de la columna (`06 § Carreras`). */
export const TIER_FILTERS: TierFilter[] = [
  "all",
  "beginner",
  "intermediate",
  "advanced",
  "weekly",
];

const LICENSE_TIER: Partial<Record<SeriesTier, LicenseTier>> = {
  beginner: "bronze",
  intermediate: "silver",
  advanced: "gold",
};

/** Color del bloque del timeline por categoría (`04 · TIER_COLOR`). */
export const TIER_COLOR: Record<SeriesTier, string> = {
  beginner: "var(--orbit-tier-bronze)",
  intermediate: "var(--orbit-tier-silver)",
  advanced: "var(--orbit-tier-gold)",
  weekly: "var(--orbit-cyan)",
};

/** Una serie del calendario ya resuelta para la pantalla. */
export interface RaceSeriesEntry {
  id: string;
  name: string;
  tier: SeriesTier;
  licenseTier?: LicenseTier;
  licenseLabel: string;
  track: string;
  cls: string;
  setup: "Fixed" | "Open";
  raceMin: number;
  /** Sesiones publicadas ("P 3 · Q 8 · R 20"), vacío si el fixture no las trae. */
  sessions: string;
  /** Motor `13.3` de esta serie. */
  engine: Series;
  followed: boolean;
}

const SESSION_INITIAL: Record<string, string> = {
  practice: "P",
  qualifying: "Q",
  qualy: "Q",
  race: "R",
  warmup: "W",
};

function sessionsLabel(series: RaceSeries): string {
  const sessions = series.sessions ?? [];
  if (sessions.length === 0) return "";
  return sessions
    .map((session) => {
      const key = session.name.trim().toLowerCase();
      const initial = SESSION_INITIAL[key] ?? session.name.slice(0, 1).toUpperCase();
      return `${initial} ${session.durationMin}`;
    })
    .join(" · ");
}

/**
 * Series reales del calendario, en el orden en que las publica el backend.
 * Las que no describen ninguna cadencia calculable se descartan: sin cadencia
 * no hay salidas que pintar en ninguna de las cinco vistas.
 */
export function buildSeriesEntries(calendar: Calendar | null): RaceSeriesEntry[] {
  if (!calendar) return [];
  const followed = new Set(calendar.followedSeriesIds ?? []);
  const entries: RaceSeriesEntry[] = [];

  for (const series of calendar.series ?? []) {
    const engine = toEngineSeries(series);
    if (!engine) continue;
    entries.push({
      id: series.id,
      name: series.name,
      tier: engine.tier,
      licenseTier: LICENSE_TIER[engine.tier],
      licenseLabel: series.safetyRating || series.licenseLabel || "",
      track: series.track ?? "",
      cls: series.vehicleClass ?? "",
      setup: engine.setup,
      raceMin: series.raceDurationMin ?? series.durationMin ?? 0,
      sessions: sessionsLabel(series),
      engine,
      followed: followed.has(series.id),
    });
  }

  return entries;
}

/** Contador por categoría del filtro de la columna. */
export function tierCounts(entries: RaceSeriesEntry[]): Record<TierFilter, number> {
  const counts: Record<TierFilter, number> = {
    all: entries.length,
    beginner: 0,
    intermediate: 0,
    advanced: 0,
    weekly: 0,
  };
  for (const entry of entries) counts[entry.tier] += 1;
  return counts;
}

/** Series visibles con el filtro de categoría aplicado. */
export function filterByTier(entries: RaceSeriesEntry[], tier: TierFilter): RaceSeriesEntry[] {
  return tier === "all" ? entries : entries.filter((entry) => entry.tier === tier);
}

export interface StartRow {
  entry: RaceSeriesEntry;
  at: Date;
}

/** Vista 1 · Próximas: salidas ordenadas por hora y desempatadas por nombre. */
export function upcomingRows(
  entries: RaceSeriesEntry[],
  from: Date,
  limit: number,
): StartRow[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return upcoming(
    entries.map((entry) => entry.engine),
    from,
    limit,
  )
    .map((row) => ({ entry: byId.get(row.series.id)!, at: row.at }))
    .filter((row) => Boolean(row.entry));
}

/** Cuántas salidas hay que pedirle al motor para cubrir un día entero. */
function dayCount(engine: Series): number {
  return engine.every ? Math.ceil(1440 / engine.every) + 1 : 8;
}

/** Medianoche local del día `offset` días después de hoy. */
export function dayAnchor(now: Date, offset: number): Date {
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + offset);
  return base;
}

/** Lunes local de la semana `offset` semanas después de la de hoy. */
export function weekAnchor(now: Date, offset: number): Date {
  const today = dayAnchor(now, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  return monday;
}

/** Día 1 local del mes `offset` meses después del actual. */
export function monthAnchor(now: Date, offset: number): Date {
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

export interface DayHour {
  hour: number;
  /** Hora en curso: solo cuando se mira el día de hoy. */
  now: boolean;
  events: StartRow[];
}

/** Vista 2 · Día: 24 filas horarias con las salidas locales de ese día. */
export function dayRows(entries: RaceSeriesEntry[], base: Date, now: Date): DayHour[] {
  const end = new Date(base.getTime() + 86_400_000);
  const isToday = dayAnchor(now, 0).getTime() === base.getTime();
  const events: StartRow[] = entries.flatMap((entry) =>
    nextStarts(entry.engine, base, dayCount(entry.engine))
      .filter((at) => at < end)
      .map((at) => ({ entry, at })),
  );

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    now: isToday && now.getHours() === hour,
    events: events
      .filter((event) => event.at.getHours() === hour)
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.entry.name.localeCompare(b.entry.name)),
  }));
}

export interface WeekCell {
  day: Date;
  today: boolean;
  /** Cadencia por intervalo: la celda rotula "cada N min" y el minuto base. */
  every?: number;
  offsetMinute?: number;
  /** Cadencia semanal: los slots locales de ese día (vacío = sin salidas). */
  slots: Date[];
}

export interface WeekRow {
  entry: RaceSeriesEntry;
  cells: WeekCell[];
}

/** Vista 3 · Semana: una fila por serie, siete celdas Lun…Dom. */
export function weekRows(entries: RaceSeriesEntry[], monday: Date, now: Date): WeekRow[] {
  const today = dayAnchor(now, 0).getTime();
  return entries.map((entry) => ({
    entry,
    cells: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday.getTime() + index * 86_400_000);
      const isToday = day.getTime() === today;
      if (entry.engine.every !== undefined) {
        return {
          day,
          today: isToday,
          every: entry.engine.every,
          offsetMinute: (entry.engine.offset ?? 0) % 60,
          slots: [],
        };
      }
      const end = new Date(day.getTime() + 86_400_000);
      return {
        day,
        today: isToday,
        slots: nextStarts(entry.engine, day, 12).filter((at) => at < end),
      };
    }),
  }));
}

export interface MonthDay {
  day: Date;
  /** Día de otro mes: la celda se apaga y no pinta eventos. */
  other: boolean;
  today: boolean;
  /** Cuántas series de intervalo corren ese día. */
  daily: number;
  /** Series semanales que tienen slots ese día. */
  weekly: { id: string; name: string; slots: number }[];
  /** Eventos con fecha del fixture (`calendar.events`). */
  specials: { id: string; title: string }[];
}

/** Vista 4 · Mes: rejilla 7×6 desde el lunes de la primera semana. */
export function monthDays(
  entries: RaceSeriesEntry[],
  first: Date,
  now: Date,
  events: Calendar["events"] = [],
): MonthDay[] {
  const today = dayAnchor(now, 0).getTime();
  const startDow = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(1 - startDow);
  const daily = entries.filter((entry) => entry.engine.every !== undefined);
  const weekly = entries.filter((entry) => entry.engine.every === undefined);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart.getTime() + index * 86_400_000);
    const other = day.getMonth() !== first.getMonth() || day.getFullYear() !== first.getFullYear();
    const end = new Date(day.getTime() + 86_400_000);
    return {
      day,
      other,
      today: day.getTime() === today,
      daily: other ? 0 : daily.length,
      weekly: other
        ? []
        : weekly
            .filter((entry) => (entry.engine.days ?? []).includes(day.getDay()))
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              slots: entry.engine.weeklyUTC?.length ?? 0,
            })),
      specials: other
        ? []
        : (events ?? [])
            .filter((event) => {
              const at = new Date(event.startTime);
              return !Number.isNaN(at.getTime()) && at >= day && at < end;
            })
            .map((event) => ({ id: event.id, title: event.title })),
    };
  });
}

/** Inicio del eje del timeline: la hora en punto actual (`13.3`). */
export function timelineStart(now: Date): Date {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  return start;
}

export interface TimelineRow {
  entry: RaceSeriesEntry;
  starts: Date[];
  /** Ancho del bloque en minutos: `min(raceMin, every − 3)` (`13.3`). */
  blockMin: number;
}

/** Vista 5 · Timeline: una fila por serie sobre las próximas 24 h. */
export function timelineRows(entries: RaceSeriesEntry[], start: Date): TimelineRow[] {
  const end = new Date(start.getTime() + 24 * 3_600_000);
  return entries.map((entry) => {
    const every = entry.engine.every;
    const raceMin = entry.raceMin > 0 ? entry.raceMin : (every ?? 60);
    return {
      entry,
      starts: nextStarts(entry.engine, start, every ? Math.ceil(1440 / every) + 1 : 10).filter(
        (at) => at < end,
      ),
      blockMin: Math.max(1, Math.min(raceMin, (every ?? raceMin) - 3)),
    };
  });
}
