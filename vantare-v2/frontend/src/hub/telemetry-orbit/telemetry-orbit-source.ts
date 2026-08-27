/**
 * Fuente de sesiones de Telemetría Orbit.
 *
 * Reutiliza el query Analysis-owned que Strategy ya publica por su protocolo
 * Wails. Orbit recibe únicamente el catálogo precocinado: nunca rutas, páginas
 * DuckDB ni muestras crudas. Los datos espaciales continúan ausentes hasta que
 * TA-04/TA-06 demuestren distancia y una referencia compatible.
 */

import { ORBIT_KEYS, orbitStore } from "../orbit/orbit-store";
import {
  createStrategyApplicationClient,
  createWailsStrategyApplicationTransport,
  type StrategyApplicationClient,
  type StrategySessionCombinationV1,
} from "../../strategy/strategy-application-client";
import { DEMO_SESSIONS, type TelemetrySession } from "./telemetry-orbit-model";

let catalogRequestSequence = 0;

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

function joinedLabel(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" · ");
}

function formatActivity(value: string, locale: string, timeZone?: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function catalogSessions(
  combinations: readonly StrategySessionCombinationV1[],
  locale: string,
  timeZone?: string,
): TelemetrySession[] {
  return combinations
    .flatMap((combination) =>
      combination.sessions.map((session) => {
        const evidencedLaps = session.climateBuckets.reduce(
          (total, bucket) => total + bucket.laps,
          0,
        );
        return {
          occurredAt: session.lastActivity,
          view: {
            id: session.sessionId,
            track: joinedLabel(combination.trackName, combination.trackLayout),
            car: joinedLabel(combination.carName, combination.carClass),
            when: formatActivity(session.lastActivity, locale, timeZone),
            laps: evidencedLaps > 0 ? evidencedLaps : null,
          // SessionCatalogListing todavía no publica tiempos de vuelta. Cero
          // sería un dato falso; la ausencia se conserva hasta un ViewModel
          // Analysis posterior.
            best: null,
          } satisfies TelemetrySession,
        };
      }),
    )
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .map((item) => item.view);
}

/** Lee el catálogo real ya autorizado mediante la única query existente. */
export async function loadRealTelemetrySessions(
  client: StrategyApplicationClient<unknown>,
  locale = "es-ES",
  timeZone?: string,
): Promise<TelemetrySession[]> {
  catalogRequestSequence += 1;
  const result = await client.execute({
    protocolVersion: "strategy.application.v1",
    commandId: `orbit-telemetry-catalog-${Date.now()}-${catalogRequestSequence}`,
    operation: "list_session_combinations",
    expectedRepositoryVersion: 0,
  });
  if (result.sessionCatalogStatus === "no_authorized_telemetry") return [];
  return catalogSessions(result.sessionCombinations ?? [], locale, timeZone);
}

export async function loadWailsTelemetrySessions(locale: string): Promise<TelemetrySession[]> {
  const client = createStrategyApplicationClient<unknown>(
    createWailsStrategyApplicationTransport(),
  );
  try {
    return await loadRealTelemetrySessions(client, locale);
  } finally {
    client.dispose();
  }
}

export interface TelemetrySourceResult {
  sessions: TelemetrySession[];
  /** `true` cuando lo que se pinta es el generador sintético, no una sesión. */
  synthetic: boolean;
}

export function resolveTelemetrySessions(
  demo: boolean,
  real: TelemetrySession[] = [],
): TelemetrySourceResult {
  if (real.length > 0) return { sessions: real, synthetic: false };
  return demo ? { sessions: DEMO_SESSIONS, synthetic: true } : { sessions: [], synthetic: false };
}
