import type { OverlayFrameV2, OverlayQualityV2, OverlayStandingRowV2 } from "../../../generated/telemetry";

type DemoScenario = {
  session: "practice" | "qualifying" | "race";
  location: "track" | "pits";
  playerPosition?: number;
};

// Datos de autoría, no telemetría: cada sesión tiene tiempos y vueltas
// propios. El orden de práctica/clasificación procede de la mejor vuelta.
export function withFunctionalStandingsDemo(
  frame: OverlayFrameV2,
  scenario: DemoScenario,
  quality: OverlayQualityV2,
): OverlayFrameV2 {
  const race = scenario.session === "race";
  const qualifying = scenario.session === "qualifying";
  const q = (v: number) => ({ v, q: quality });
  const classPace: Record<string, number> = { hypercar: 108, lmp2: 114, gte: 127 };
  let standings: OverlayStandingRowV2[] = frame.standings.map((row, index) => {
    const best = (classPace[row.classId ?? ""] ?? 127)
      + (qualifying ? 0 : race ? 0.8 : 1.6) + (row.classPosition ?? index + 1) * 0.217;
    return {
      ...row,
      bestLap: q(Number(best.toFixed(3))),
      lastLap: q(Number((best + (race ? 0.65 : qualifying ? 0.124 : 0.842)).toFixed(3))),
      laps: race ? 17 : qualifying ? 3 + index % 3 : 5 + index % 8,
      gap: q(Number((index * 1.437 + index * index * 0.081).toFixed(3))),
      gapLaps: undefined,
      pit: "track",
    };
  });
  if (!race) standings = standings.sort((a, b) => a.bestLap.v! - b.bestLap.v!);
  standings = rankDemoStandings(standings);
  const playerId = standings.find((row) => row.position === scenario.playerPosition)?.id ?? frame.player.id;
  // El podio siempre permanece visible en la ventana normal. Un rival en
  // boxes permite comprobar el módulo sin cambiar la ubicación del jugador.
  const pitExample = standings.slice(0, 3).find((row) => row.id !== playerId)?.id;
  standings = standings.map((row) => ({
    ...row,
    pit: row.id === playerId ? scenario.location === "pits" ? "pit" : "track" : row.id === pitExample ? "pit" : "track",
  }));
  return {
    ...frame, standings,
    player: { ...frame.player, id: playerId },
    session: { ...frame.session, remaining: q(race ? 38 * 60 + 12 : qualifying ? 8 * 60 + 24 : 22 * 60 + 36) },
  };
}

// El productor real resuelve ambas posiciones; las escenas hacen lo mismo
// sobre su orden de ejemplo para no mostrar posiciones de clase antiguas.
export function rankDemoStandings(rows: readonly OverlayStandingRowV2[]): OverlayStandingRowV2[] {
  const classes = new Map<string, number>();
  return rows.map((row, index) => {
    const classId = row.classId ?? "";
    const classPosition = (classes.get(classId) ?? 0) + 1;
    classes.set(classId, classPosition);
    return { ...row, position: index + 1, classPosition };
  });
}
