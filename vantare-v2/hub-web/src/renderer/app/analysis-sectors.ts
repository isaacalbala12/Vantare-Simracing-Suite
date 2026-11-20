import type {
  AnalysisLap,
  AnalysisSessionSummary,
} from "../../contract/generated/analysis";
import { lapTime } from "./analysis-laps";

export type Sectors = readonly [number, number, number];
export type SectorIndex = 0 | 1 | 2;

/**
 * Sectores de una vuelta tal como los manda el host. La regla de validez
 * (exactamente 3, todos > 0, suma = tiempo oficial) vive solo en el host
 * (`valid_sectors`): aquí no se suma ni se valida nada; solo se estrecha el
 * tipo y se exige que la vuelta enseñe tiempo oficial, para que una vuelta sin
 * él en pantalla nunca enseñe sectores.
 */
export function lapSectors(lap: AnalysisLap | undefined): Sectors | null {
  const sectors = lap?.sectorsMs;
  return sectors && lapTime(lap).official
    ? [sectors[0], sectors[1], sectors[2]]
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
  const perSession = new Set(sessions.map((s) => s.trackName)).size > 1;
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
