import { useCallback, useEffect, useRef, useState } from "react";
import { requestCalendar, subscribeToCalendar } from "../../calendar/calendar-store";
import type { Calendar } from "../../calendar/calendar-types";
import { buildRaceStarts, dialTarget, type RaceStart } from "./race-starts";

/** Salidas que se calculan por debajo para que el dial vea más allá de la lista. */
const POOL = 24;

/**
 * Una salida por serie. `13.3` toma dos por serie antes de ordenar, pero con
 * diez series a cadencia de 15–30 min la segunda salida de una serie siempre
 * llega después de la primera de otra: lo único que produce es la misma serie
 * repetida en filas contiguas, que no es lo que muestra `evidence/inicio.png`.
 * El dial tampoco la necesita: solo mira la primera de cada serie.
 */
const PER_SERIES = 1;

/** Cada cuánto se recalcula el conjunto para que las salidas pasadas caigan. */
const REFRESH_MS = 15_000;

export interface OrbitRacesState {
  /** `null` mientras el calendario no ha llegado; `Calendar` aunque venga vacío. */
  calendar: Calendar | null;
  /** Conjunto ordenado de próximas salidas (hasta `POOL`). */
  starts: RaceStart[];
  /** Objetivo del dial: primera salida seguida, si no la primera de todas. */
  target: RaceStart | null;
}

/**
 * Próximas salidas reales del hub. Es la misma fuente que la página de
 * Carreras (`calendar:loaded` con `series`, `seriesPreviews` y
 * `followedSeriesIds`), así que seguir o dejar de seguir una serie mueve el
 * dial y la columna sin ninguna copia intermedia.
 */
function computeState(calendar: Calendar | null): OrbitRacesState {
  const starts = buildRaceStarts(calendar, new Date(), {
    limit: POOL,
    perSeries: PER_SERIES,
  });
  return { calendar, starts, target: dialTarget(starts) };
}

/** Igualdad por campos: `at` es `Date`, el resto son primitivas planas. */
function sameStart(a: RaceStart, b: RaceStart): boolean {
  return (
    a.seriesId === b.seriesId &&
    a.name === b.name &&
    a.track === b.track &&
    a.tier === b.tier &&
    a.licenseTier === b.licenseTier &&
    a.licenseLabel === b.licenseLabel &&
    a.note === b.note &&
    a.intervalMin === b.intervalMin &&
    a.vehicleClass === b.vehicleClass &&
    a.durationMin === b.durationMin &&
    a.at.getTime() === b.at.getTime() &&
    a.followed === b.followed
  );
}

function sameState(a: OrbitRacesState, b: OrbitRacesState): boolean {
  if (a.calendar !== b.calendar) return false;
  if (a.starts.length !== b.starts.length) return false;
  for (let index = 0; index < a.starts.length; index += 1) {
    if (!sameStart(a.starts[index], b.starts[index])) return false;
  }
  if (a.target === null || b.target === null) return a.target === b.target;
  return sameStart(a.target, b.target);
}

export function useCalendarStarts(): OrbitRacesState {
  const [state, setState] = useState<OrbitRacesState>(() => computeState(null));
  const stateRef = useRef(state);
  const calendarRef = useRef<Calendar | null>(null);

  // Solo publica cuando el resultado calculado difiere del vigente: sin
  // cambios no hay setState y la shell entera deja de re-renderizar cada 15 s.
  const apply = useCallback((next: OrbitRacesState) => {
    if (sameState(stateRef.current, next)) return;
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToCalendar((entry) => {
      if (entry.kind !== "loaded") return;
      calendarRef.current = entry.calendar;
      apply(computeState(entry.calendar));
    });
    requestCalendar();
    return unsubscribe;
  }, [apply]);

  useEffect(() => {
    const id = window.setInterval(() => apply(computeState(calendarRef.current)), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [apply]);

  return state;
}
