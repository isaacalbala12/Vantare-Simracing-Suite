import { useEffect, useMemo, useState } from "react";
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
export function useCalendarStarts(): OrbitRacesState {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const unsubscribe = subscribeToCalendar((state) => {
      if (state.kind === "loaded") setCalendar(state.calendar);
    });
    requestCalendar();
    return unsubscribe;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const starts = buildRaceStarts(calendar, new Date(tick), {
      limit: POOL,
      perSeries: PER_SERIES,
    });
    return { calendar, starts, target: dialTarget(starts) };
  }, [calendar, tick]);
}
