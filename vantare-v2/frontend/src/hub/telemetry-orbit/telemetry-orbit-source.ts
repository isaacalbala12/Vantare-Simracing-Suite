/**
 * Fuente de sesiones de Telemetría Orbit.
 *
 * ADR 0004 / 0005 sitúan las sesiones en la base DuckDB de `telemetryanalysis`,
 * pero ese paquete **no está expuesto al frontend**: no hay binding, ni evento
 * Wails, ni store del hub que publique sesiones grabadas. Mientras siga así,
 * la pantalla no tiene datos y lo dice; el modo demo existe solo detrás de un
 * flag explícito y siempre etiquetado como sintético (`00-decisiones.md`, D-73).
 */

import { ORBIT_KEYS, orbitStore } from "../orbit/orbit-store";
import { DEMO_SESSIONS, type TelemetrySession } from "./telemetry-orbit-model";

/** Lee `?telemetryDemo=1|0`; sin parámetro manda lo guardado en local. */
export function readTelemetryDemoFromSearch(search: string): boolean | null {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const raw = params.get("telemetryDemo");
  if (raw === null) return null;
  return raw === "1" || raw === "true";
}

export function isTelemetryDemoEnabled(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): boolean {
  const fromSearch = readTelemetryDemoFromSearch(search);
  if (fromSearch !== null) {
    orbitStore.set(ORBIT_KEYS.telemetryDemo, fromSearch ? "1" : "0");
    return fromSearch;
  }
  return orbitStore.get(ORBIT_KEYS.telemetryDemo) === "1";
}

/**
 * Sesiones reales grabadas. Devuelve siempre una lista vacía: cuando el puente
 * de `telemetryanalysis` publique sesiones, esta función las lee y el modo demo
 * deja de tener sentido.
 */
function realTelemetrySessions(): TelemetrySession[] {
  return [];
}

export interface TelemetrySourceResult {
  sessions: TelemetrySession[];
  /** `true` cuando lo que se pinta es el generador sintético, no una sesión. */
  synthetic: boolean;
}

export function resolveTelemetrySessions(demo: boolean): TelemetrySourceResult {
  const real = realTelemetrySessions();
  if (real.length > 0) return { sessions: real, synthetic: false };
  return demo ? { sessions: DEMO_SESSIONS, synthetic: true } : { sessions: [], synthetic: false };
}
