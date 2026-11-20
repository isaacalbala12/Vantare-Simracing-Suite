import type {
  AnalysisLap,
  AnalysisSessionSummary,
} from "../../contract/generated/analysis";
import { lapTime } from "./analysis-laps";

export type Sectors = readonly [number, number, number];
export type SectorIndex = 0 | 1 | 2;
/** Números de sector (S1–S3), para rotular sin aritmética de índices. */
export const sectorNumbers = [1, 2, 3] as const;
export type SectorsWhy = "approximate" | "gap" | "unfinished" | "notGiven";

/**
 * Sectores de una vuelta tal como los manda el host. La regla de validez
 * (exactamente 3, todos > 0, suma = tiempo oficial) vive en el host
 * (`valid_sectors`) y el renderer no suma ni compara tiempos de vuelta. Aquí
 * solo se estrecha el TIPO: si el host rompiera su garantía (≠ 3 valores, algo
 * no finito o ≤ 0), la vuelta cuenta como «sin sectores» en vez de pintar
 * basura. Además se exige tiempo oficial a la vista, para que una vuelta que
 * enseña «—» o «≈» nunca enseñe sectores.
 */
export function lapSectors(lap: AnalysisLap | undefined): Sectors | null {
  const sectors = lap?.sectorsMs;
  if (!sectors || !lapTime(lap).official) return null;
  const [first, second, third, ...extra] = sectors;
  const triple = [first, second, third];
  return extra.length === 0 &&
    triple.every((ms) => Number.isFinite(ms) && ms > 0)
    ? [first, second, third]
    : null;
}

export const hasSectors = (laps: readonly AnalysisLap[]) =>
  laps.some((lap) => lapSectors(lap) !== null);

/**
 * Mejor tiempo de cada sector: el de toda la grabación, o el de cada sesión
 * cuando las sesiones son de circuitos distintos. Un empate marca todas.
 */
export function sectorBests(
  laps: readonly AnalysisLap[],
  sessions: readonly AnalysisSessionSummary[],
) {
  // Una sesión sin nombre de circuito no cuenta como «otro circuito».
  const circuits = new Set(
    sessions.flatMap((s) => (s.trackName ? [s.trackName] : [])),
  );
  const perSession = circuits.size > 1;
  const scope = (lap: AnalysisLap) => (perSession ? (lap.session ?? -1) : 0);
  const bests = new Map<number, number[]>();
  for (const lap of laps) {
    const sectors = lapSectors(lap);
    if (!sectors) continue;
    const best = bests.get(scope(lap)) ?? [Infinity, Infinity, Infinity];
    bests.set(
      scope(lap),
      best.map((ms, i) => Math.min(ms, sectors[i])),
    );
  }
  return {
    perSession,
    isBest(lap: AnalysisLap, sector: SectorIndex) {
      const ms = lapSectors(lap)?.[sector];
      return ms !== undefined && ms === bests.get(scope(lap))?.[sector];
    },
  };
}

/** Filas S1–S3 de Comparar: A, B y A−B en milisegundos, o null si falta algún lado. */
export function sectorRows(
  a: AnalysisLap | undefined,
  b: AnalysisLap | undefined,
) {
  const [sa, sb] = [lapSectors(a), lapSectors(b)];
  return ([0, 1, 2] as const).map((i) => ({
    n: sectorNumbers[i],
    a: sa?.[i] ?? null,
    b: sb?.[i] ?? null,
    diff: sa && sb ? sa[i] - sb[i] : null,
  }));
}

/** Motivo de que una vuelta no tenga sectores, o null si los tiene. */
export function sectorsWhy(lap: AnalysisLap | undefined): SectorsWhy | null {
  if (!lap || lapSectors(lap)) return null;
  if (!lap.sealed) return "unfinished";
  if (lap.gap) return "gap";
  if (lapTime(lap).official) return "notGiven";
  return lap.lapTimeApproxMs === null ? "unfinished" : "approximate";
}
