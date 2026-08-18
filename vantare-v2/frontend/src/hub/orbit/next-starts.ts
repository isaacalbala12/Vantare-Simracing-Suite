/**
 * Motor de salidas de serie (`13-modelo-y-algoritmos.md § 13.3`).
 *
 * Dominio puro, sin dependencias ni React: calcula las próximas salidas de una
 * serie a partir de su cadencia publicada (intervalo en UTC o slots semanales).
 */

export type SeriesTier = "beginner" | "intermediate" | "advanced" | "weekly";

export interface Series {
  id: string;
  name: string;
  tier: SeriesTier;
  license: string;
  track: string;
  cls: string;
  setup: "Fixed" | "Open";
  raceMin: number;
  sessions: string;
  /** Cadencia por intervalo: hay salida cuando el minuto UTC ≡ offset (mod every). */
  every?: number;
  offset?: number;
  /** Cadencia semanal: slots "HH:MM" UTC en los días `getUTCDay()` indicados. */
  weeklyUTC?: string[];
  days?: number[];
}

/** Próximas `count` salidas de una serie desde `from` (incluye `from` si cae justo en una). */
export function nextStarts(series: Series, from: Date, count = 4): Date[] {
  const out: Date[] = [];
  if (count <= 0) return out;

  if (series.every && series.offset !== undefined) {
    const truncated = new Date(from);
    truncated.setSeconds(0, 0);
    const k = Math.ceil((truncated.getUTCMinutes() - series.offset) / series.every);
    let candidate = new Date(truncated);
    candidate.setUTCMinutes(series.offset + k * series.every, 0, 0);
    while (candidate < from) {
      candidate = new Date(candidate.getTime() + series.every * 60_000);
    }
    for (let i = 0; i < count; i += 1) {
      out.push(new Date(candidate.getTime() + i * series.every * 60_000));
    }
    return out;
  }

  const days = series.days ?? [];
  const slots = series.weeklyUTC ?? [];
  if (!days.length || !slots.length) return out;

  const day0 = new Date(from);
  day0.setUTCHours(0, 0, 0, 0);
  for (let d = 0; d < 8 && out.length < count; d += 1) {
    const day = new Date(day0.getTime() + d * 86_400_000);
    if (!days.includes(day.getUTCDay())) continue;
    for (const hm of slots) {
      const [h, m] = hm.split(":").map(Number);
      const candidate = new Date(day);
      candidate.setUTCHours(h, m, 0, 0);
      if (candidate >= from && out.length < count) out.push(candidate);
    }
  }
  return out;
}

export interface UpcomingStart {
  series: Series;
  at: Date;
}

/** Próximas salidas de un conjunto de series, ordenadas por hora y luego por nombre. */
export function upcoming(pool: Series[], from: Date, limit: number): UpcomingStart[] {
  return pool
    .flatMap((series) => nextStarts(series, from, 2).map((at) => ({ series, at })))
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.series.name.localeCompare(b.series.name))
    .slice(0, limit);
}

/** "mm:ss" hasta 1 h, "Nh Mm" a partir de ahí (`13.4`). */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Hora local HH:MM de una salida. */
export function formatStartTime(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}
