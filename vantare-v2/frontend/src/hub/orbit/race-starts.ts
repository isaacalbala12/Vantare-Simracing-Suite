/**
 * Próximas salidas reales del calendario del hub (`13-modelo-y-algoritmos.md
 * § 13.3–13.4`).
 *
 * DECISIÓN (D-31): el backend ya publica `seriesPreviews[].nextStarts` para
 * cada serie de `configs/calendar-lmu.json`. Cuando esa lista trae salidas
 * futuras se usa tal cual —es la autoridad— y el motor local `nextStarts` solo
 * cubre las series cuyo preview llega vacío o no llega (arranque en frío del
 * backend, calendario recortado). Así el hero y la columna no inventan horas y
 * tampoco se quedan en blanco mientras el backend calcula.
 */
import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import { nextStarts, type Series, type SeriesTier } from "./next-starts";

export type LicenseTier = "bronze" | "silver" | "gold";

/** Una salida concreta de una serie, ya resuelta a `Date`. */
export interface RaceStart {
  seriesId: string;
  name: string;
  track: string;
  tier: SeriesTier;
  /** Color del chip de licencia; las semanales no llevan losa de tier. */
  licenseTier?: LicenseTier;
  licenseLabel: string;
  /** Cadencia publicada tal y como la rotula el backend ("Cada 15 min"). */
  note: string;
  /** Ventana del dial en minutos (`13.4`: cadencia, o 180 si no hay). */
  intervalMin: number;
  /** Clase de coche de la serie, cuando el calendario la publica. */
  vehicleClass: string;
  /** Duración de carrera en minutos, cuando el calendario la publica. */
  durationMin: number;
  at: Date;
  followed: boolean;
}

const TIERS: SeriesTier[] = ["beginner", "intermediate", "advanced", "weekly"];

const LICENSE_TIER: Partial<Record<SeriesTier, LicenseTier>> = {
  beginner: "bronze",
  intermediate: "silver",
  advanced: "gold",
};

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function toTier(tier: string): SeriesTier {
  return (TIERS as string[]).includes(tier) ? (tier as SeriesTier) : "weekly";
}

/** Ventana del dial: la cadencia de la serie, o su hueco semanal medio. */
export function intervalMinutesOf(series: RaceSeries): number {
  const interval = series.recurrence?.intervalMinutes;
  if (interval && interval > 0) return interval;
  const slots = series.recurrence?.timesUTC?.length ?? 0;
  const days = series.recurrence?.days?.length ?? 0;
  if (slots > 0 && days > 0) return Math.round((7 * 24 * 60) / (slots * days));
  return 180;
}

/**
 * Traducción `RaceSeries` (contrato del backend) → `Series` (motor 13.3).
 * Devuelve `null` cuando la recurrencia no describe ninguna cadencia calculable.
 */
export function toEngineSeries(series: RaceSeries): Series | null {
  const base = {
    id: series.id,
    name: series.name,
    tier: toTier(series.tier),
    license: series.licenseLabel ?? "",
    track: series.track ?? "",
    cls: series.vehicleClass ?? "",
    setup: series.setup === "fixed" || series.setup === "Fixed" ? ("Fixed" as const) : ("Open" as const),
    raceMin: series.raceDurationMin ?? series.durationMin ?? 0,
    sessions: "",
  };

  const interval = series.recurrence?.intervalMinutes;
  if (interval && interval > 0) {
    return { ...base, every: interval, offset: (series.startOffsetMinute ?? 0) % interval };
  }

  const slots = series.recurrence?.timesUTC ?? [];
  const days = (series.recurrence?.days ?? [])
    .map((day) => WEEKDAYS[day.slice(0, 3).toLowerCase()])
    .filter((day): day is number => day !== undefined);
  if (slots.length > 0 && days.length > 0) {
    return { ...base, weeklyUTC: [...slots], days };
  }
  return null;
}

export interface BuildRaceStartsOptions {
  /** Cuántas salidas devolver (4 en Inicio, 3 en la columna). */
  limit?: number;
  /** Cuántas salidas se toman por serie antes de ordenar (`13.3`: 2). */
  perSeries?: number;
}

/**
 * Próximas salidas del calendario real, ordenadas por hora y luego por nombre.
 * Sin calendario, sin series o sin cadencia calculable devuelve `[]`: el estado
 * vacío es honesto, no hay fixture de respaldo.
 */
export function buildRaceStarts(
  calendar: Calendar | null,
  now: Date,
  options: BuildRaceStartsOptions = {},
): RaceStart[] {
  const limit = options.limit ?? 4;
  const perSeries = options.perSeries ?? 2;
  if (!calendar || limit <= 0) return [];

  const followed = new Set(calendar.followedSeriesIds ?? []);
  const previews = calendar.seriesPreviews ?? [];
  const rows: RaceStart[] = [];

  for (const series of calendar.series ?? []) {
    const preview = previews.find((entry) => entry.seriesId === series.id);
    const fromBackend = (preview?.nextStarts ?? [])
      .map((iso) => new Date(iso))
      .filter((at) => !Number.isNaN(at.getTime()) && at.getTime() >= now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());

    let starts = fromBackend.slice(0, perSeries);
    if (starts.length === 0) {
      const engineSeries = toEngineSeries(series);
      starts = engineSeries ? nextStarts(engineSeries, now, perSeries) : [];
    }
    if (starts.length === 0) continue;

    const tier = toTier(series.tier);
    for (const at of starts) {
      rows.push({
        seriesId: series.id,
        name: series.name,
        track: series.track ?? "",
        tier,
        licenseTier: LICENSE_TIER[tier],
        licenseLabel: series.safetyRating || series.licenseLabel || "",
        note: preview?.scheduleLabel ?? "",
        intervalMin: intervalMinutesOf(series),
        vehicleClass: series.vehicleClass ?? "",
        durationMin: series.raceDurationMin ?? series.durationMin ?? 0,
        at,
        followed: followed.has(series.id),
      });
    }
  }

  return rows
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Objetivo del dial (`13.4`): la primera salida de las series seguidas, y si no
 * hay ninguna seguida, la primera salida del calendario entero.
 */
export function dialTarget(starts: RaceStart[]): RaceStart | null {
  return starts.find((start) => start.followed) ?? starts[0] ?? null;
}
