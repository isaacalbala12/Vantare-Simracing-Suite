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

export interface StartGroup {
  /** Hora en punto del grupo (`01:00`). */
  hour: Date;
  rows: StartRow[];
}

/**
 * Vista 1 · Próximas agrupada por hora: la lista plana repetía la misma hora
 * en filas consecutivas, así que la hora sube a una cabecera de grupo y la fila
 * se queda con el nombre, el circuito y la meta.
 */
export function groupByHour(rows: StartRow[]): StartGroup[] {
  const groups: StartGroup[] = [];
  for (const row of rows) {
    const hour = new Date(row.at);
    hour.setMinutes(0, 0, 0);
    const last = groups[groups.length - 1];
    if (last && last.hour.getTime() === hour.getTime()) last.rows.push(row);
    else groups.push({ hour, rows: [row] });
  }
  return groups;
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

/** Cuántas horas concretas caben en una celda de Semana antes del "+n". */
export const WEEK_SLOTS = 4;

export interface WeekCell {
  day: Date;
  today: boolean;
  /** Día ya cerrado (anterior a hoy): la celda se atenúa. */
  past: boolean;
  /** Horas concretas visibles de ese día (máx. `WEEK_SLOTS`). */
  slots: Date[];
  /** Salidas del día que no caben en la celda. */
  more: number;
  /** Salidas del día en total (contando las ya corridas si el día es hoy). */
  total: number;
}

export interface WeekRow {
  entry: RaceSeriesEntry;
  cells: WeekCell[];
}

/** Todas las salidas locales de una serie dentro de un día. */
export function daySlots(entry: RaceSeriesEntry, day: Date): Date[] {
  const end = new Date(day.getTime() + 86_400_000);
  return nextStarts(entry.engine, day, dayCount(entry.engine)).filter((at) => at < end);
}

/**
 * Vista 3 · Semana: una fila por serie, siete celdas Lun…Dom.
 *
 * La celda no rotula la cadencia (era el mismo texto en las 70 celdas): enseña
 * las próximas horas concretas de ese día — desde ahora si el día es hoy, desde
 * medianoche en el resto — y cuenta en "+n" las que no caben.
 */
export function weekRows(entries: RaceSeriesEntry[], monday: Date, now: Date): WeekRow[] {
  const today = dayAnchor(now, 0).getTime();
  return entries.map((entry) => ({
    entry,
    cells: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday.getTime() + index * 86_400_000);
      const isToday = day.getTime() === today;
      const all = daySlots(entry, day);
      const upcomingSlots = isToday ? all.filter((at) => at >= now) : all;
      // Un día ya cerrado enseña sus primeras horas, atenuadas.
      const shown = upcomingSlots.length > 0 ? upcomingSlots : all;
      return {
        day,
        today: isToday,
        past: day.getTime() < today,
        slots: shown.slice(0, WEEK_SLOTS),
        more: Math.max(0, shown.length - WEEK_SLOTS),
        total: all.length,
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

/**
 * Vista 5 · Timeline: una fila por serie sobre las próximas `spanH` horas.
 * Por defecto 24 h, que es el rango con el que nació la vista.
 */
export function timelineRows(
  entries: RaceSeriesEntry[],
  start: Date,
  spanH = 24,
): TimelineRow[] {
  const end = new Date(start.getTime() + spanH * 3_600_000);
  return entries.map((entry) => {
    const every = entry.engine.every;
    const raceMin = entry.raceMin > 0 ? entry.raceMin : (every ?? 60);
    return {
      entry,
      starts: nextStarts(
        entry.engine,
        start,
        every ? Math.ceil((spanH * 60) / every) + 1 : Math.max(10, spanH),
      ).filter((at) => at < end),
      blockMin: Math.max(1, Math.min(raceMin, (every ?? raceMin) - 3)),
    };
  });
}

// ── Timeline · rango y zoom ──────────────────────────────────────────────

/** Rangos del eje del timeline, en horas (`Seg` de la cabecera). */
export const TIMELINE_RANGES = [6, 12, 24] as const;
export type TimelineRange = (typeof TIMELINE_RANGES)[number];

/** El zoom se guarda como factor sobre el mínimo (1× = 24 h a la vista). */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Zoom que hace caber justo `range` horas en el ancho del eje. */
export function fitZoom(range: TimelineRange): number {
  return clampZoom(24 / range);
}

/** Píxeles por hora para un ancho de eje y un factor de zoom. */
export function pxPerHourOf(axisWidth: number, zoom: number): number {
  return Math.max(1, (axisWidth / 24) * clampZoom(zoom));
}

/** Etiquetas del eje: cada hora, media hora o cuarto según el zoom. */
export function tickEveryMinFor(pxPerHour: number): number {
  if (pxPerHour >= 220) return 15;
  if (pxPerHour >= 110) return 30;
  return 60;
}

export interface TimelinePrefs {
  range: TimelineRange;
  zoom: number;
}

const PREFS_KEY = "vantare.orbit.races.timeline";
const DEFAULT_PREFS: TimelinePrefs = { range: 24, zoom: ZOOM_MIN };

/** Rango y zoom persistidos; los valores raros vuelven al defecto. */
export function readTimelinePrefs(store?: Storage): TimelinePrefs {
  const target = store ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return DEFAULT_PREFS;
  try {
    const raw = target.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<TimelinePrefs>;
    const range = TIMELINE_RANGES.includes(parsed.range as TimelineRange)
      ? (parsed.range as TimelineRange)
      : DEFAULT_PREFS.range;
    return { range, zoom: clampZoom(Number(parsed.zoom)) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeTimelinePrefs(prefs: TimelinePrefs, store?: Storage): void {
  const target = store ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return;
  try {
    target.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* almacenamiento no disponible: el zoom simplemente no persiste */
  }
}
