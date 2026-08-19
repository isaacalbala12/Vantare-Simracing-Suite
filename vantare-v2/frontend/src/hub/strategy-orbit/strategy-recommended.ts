/**
 * Eventos recomendados del estado inicial de Estrategia (briefing 07, parte B).
 *
 * El selector «Empieza tu estrategia» dejaba vacío todo el espacio bajo las dos
 * tarjetas. Lo que falta ahí no es decoración: es la lista de eventos que de
 * verdad se planifican. La autoridad es el calendario real del hub, con dos
 * niveles y ninguno inventado:
 *
 *  1. **Especiales** — `calendar.events`, las citas con fecha propia (las 24 h,
 *     una prueba puntual). Si hay alguna por delante, manda.
 *  2. **Semanales** — si no hay ninguna especial, las series de tier `weekly`
 *     con su próxima salida real, una fila por serie.
 *
 * Sin ninguna de las dos la lista queda vacía y la pantalla lo dice: no hay
 * fixture de respaldo (`01-principios.md`, honestidad de datos).
 */

import type { Calendar } from "../../calendar/calendar-types";
import type { RaceStart } from "../orbit/race-starts";

/** De dónde salió la lista; `none` cuando el calendario no da nada. */
export type RecommendedKind = "special" | "weekly" | "none";

/**
 * Una fila de la lista. Los campos son exactamente los que
 * `createEventFromSeries` necesita, para que «Planificar» sea la misma acción
 * que «Desde un evento» y no una copia con otras reglas.
 */
export interface RecommendedEvent {
  /** Clave de React: serie + instante, únicos en la lista. */
  key: string;
  seriesId: string;
  name: string;
  track: string;
  /** Clase de coche cuando el calendario la publica; si no, cadena vacía. */
  vehicleClass: string;
  /** Duración de carrera en minutos; `0` cuando el calendario no la publica. */
  durationMin: number;
  /** Serie a la que pertenece un especial, o cadencia de una semanal. */
  note: string;
  at: Date;
}

export interface RecommendedEvents {
  kind: RecommendedKind;
  rows: RecommendedEvent[];
}

const EMPTY: RecommendedEvents = { kind: "none", rows: [] };

/** Especiales del calendario que aún no han empezado, en orden de salida. */
function specialsOf(calendar: Calendar, now: Date, limit: number): RecommendedEvent[] {
  return (calendar.events ?? [])
    .map((event) => ({ event, at: new Date(event.startTime) }))
    .filter(({ at }) => !Number.isNaN(at.getTime()) && at.getTime() >= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.event.title.localeCompare(b.event.title))
    .slice(0, limit)
    .map(({ event, at }) => ({
      key: `special:${event.id}`,
      // El evento del calendario no publica id de serie; el suyo propio sirve
      // de referencia para el evento de estrategia que nazca de aquí.
      seriesId: event.series || event.id,
      name: event.title,
      track: event.track,
      vehicleClass: "",
      durationMin: event.raceDurationMin ?? event.durationMin ?? 0,
      note: event.series,
      at,
    }));
}

/** Semanales: una fila por serie, la más próxima de cada una. */
function weeklyOf(starts: readonly RaceStart[], limit: number): RecommendedEvent[] {
  const seen = new Set<string>();
  const rows: RecommendedEvent[] = [];
  for (const start of starts) {
    if (start.tier !== "weekly" || seen.has(start.seriesId)) continue;
    seen.add(start.seriesId);
    rows.push({
      key: `weekly:${start.seriesId}:${start.at.getTime()}`,
      seriesId: start.seriesId,
      name: start.name,
      track: start.track,
      vehicleClass: start.vehicleClass,
      durationMin: start.durationMin,
      note: start.note,
      at: start.at,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * Lista recomendada del estado inicial. `starts` ya viene ordenado por hora
 * (`use-calendar-starts`), así que la primera salida de cada serie es la suya.
 */
export function buildRecommendedEvents(
  calendar: Calendar | null,
  starts: readonly RaceStart[],
  now: Date,
  limit = 6,
): RecommendedEvents {
  if (limit <= 0) return EMPTY;
  if (calendar) {
    const specials = specialsOf(calendar, now, limit);
    if (specials.length > 0) return { kind: "special", rows: specials };
  }
  const weekly = weeklyOf(starts, limit);
  if (weekly.length > 0) return { kind: "weekly", rows: weekly };
  return EMPTY;
}
