import { useSyncExternalStore } from "react";
import { requestCalendar, requestCalendarRefreshStatus, subscribeToCalendar, subscribeToCalendarErrors, subscribeToCalendarRefresh, type CalendarRefreshState } from "../../calendar/calendar-store";
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
  refreshState: CalendarRefreshState;
  calendarError: boolean;
  /** `null` mientras el calendario no ha llegado; `Calendar` aunque venga vacío. */
  calendar: Calendar | null;
  /** Conjunto ordenado de próximas salidas (hasta `POOL`). */
  starts: RaceStart[];
  /** Objetivo del dial: primera salida seguida, si no la primera de todas. */
  target: RaceStart | null;
}

const EMPTY_SNAPSHOT: OrbitRacesState = {
  refreshState: "idle",
  calendarError: false,
  calendar: null,
  starts: [],
  target: null,
};

/**
 * Store de módulo con una única suscripción al calendario compartida por
 * todos los consumidores (`OrbitShell`, `ScheduleImportSection`,
 * `StrategyOrbitPage`). Antes cada instancia abría sus ~4 suscripciones,
 * repetía `calendar:get` + `calendar:refresh:status:get` y mantenía su propio
 * `setInterval` de 15 s (auditoría ISA-1111): hasta 3 instancias simultáneas
 * triplicaban el trabajo.
 *
 * `starts`/`target` se derivan aquí una vez por cambio (`buildRaceStarts` +
 * `dialTarget`, lógica intacta), así que N consumidores comparten el mismo
 * cálculo y la misma referencia de array en cada tick.
 *
 * Refcount: la suscripción y el reloj se instalan con el primer oyente y se
 * liberan con el último —montar = suscribir y pedir, desmontar = liberar,
 * igual que hacía cada instancia—; un always-on seguiría tickeando en
 * ventanas sin Hub (overlay, tests) sin ningún beneficio. Frescura: mientras
 * el store está activo la suscripción viva y el tick mantienen los datos al
 * día, así que un segundo consumidor no re-emite las peticiones iniciales.
 * Si llega a desactivarse (cero oyentes), el estado se reinicia y la
 * siguiente activación vuelve a pedirlos, igual que un montaje nuevo.
 */
let snapshot: OrbitRacesState = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();
let releaseWails: (() => void) | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function deriveStarts(calendar: Calendar | null): { starts: RaceStart[]; target: RaceStart | null } {
  const starts = buildRaceStarts(calendar, new Date(), {
    limit: POOL,
    perSeries: PER_SERIES,
  });
  return { starts, target: dialTarget(starts) };
}

function activate(): void {
  if (releaseWails) return;
  const unsubscribe = subscribeToCalendar((state) => {
    if (state.kind === "loaded") {
      snapshot = { ...snapshot, calendar: state.calendar, calendarError: false, ...deriveStarts(state.calendar) };
      notify();
    }
  });
  const stopRefresh = subscribeToCalendarRefresh((refreshState) => {
    snapshot = { ...snapshot, refreshState };
    notify();
  });
  const stopErrors = subscribeToCalendarErrors(() => {
    snapshot = { ...snapshot, calendarError: true };
    notify();
  });
  const interval = window.setInterval(() => {
    snapshot = { ...snapshot, ...deriveStarts(snapshot.calendar) };
    notify();
  }, REFRESH_MS);
  releaseWails = () => {
    unsubscribe();
    stopRefresh();
    stopErrors();
    window.clearInterval(interval);
  };
  // Las peticiones iniciales se emiten una vez por activación del store, no
  // por consumidor: el siguiente montaje lee la instantánea ya poblada.
  requestCalendarRefreshStatus();
  requestCalendar();
}

function deactivate(): void {
  releaseWails?.();
  releaseWails = null;
  snapshot = EMPTY_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  activate();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) deactivate();
  };
}

function getSnapshot(): OrbitRacesState {
  return snapshot;
}

/**
 * Próximas salidas reales del hub. Es la misma fuente que la página de
 * Carreras (`calendar:loaded` con `series`, `seriesPreviews` y
 * `followedSeriesIds`), así que seguir o dejar de seguir una serie mueve el
 * dial y la columna sin ninguna copia intermedia.
 */
export function useCalendarStarts(): OrbitRacesState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
