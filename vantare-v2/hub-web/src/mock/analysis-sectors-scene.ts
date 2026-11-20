import type {
  AnalysisLap,
  AnalysisSessionSummary,
} from "../contract/generated/analysis";

/** QA-only laps for the sector columns: `con`, `mezcla` (every case without sectors) and `v1`. */
type Row = [
  session: number | null,
  official: number | null,
  sectors: number[] | null,
  approx?: number | null,
  flags?: { gap?: boolean; sealed?: boolean },
];
const quality = { reliable: 7200, estimated: 0, stale: 0, unavailable: 0 };
const track = {
  trackName: "Spa",
  vehicle: "Porsche 911 GT3 R",
  className: "GT3",
  endedAtMs: null,
  endReason: null,
  classPositionAtClose: null,
  lapsCompleted: null,
  bestLapMs: null,
};
const sessions = (...kinds: [AnalysisSessionSummary["kind"], string?][]) =>
  kinds.map(
    ([kind, kindText], index): AnalysisSessionSummary => ({
      ...track,
      index,
      kind,
      kindText: kindText ?? null,
      startedAtMs: 1_700_000_000_000 - index * 600_000,
      sealed: kind !== "other",
      positionAtClose: kind === "other" ? null : 3,
    }),
  );
const quali: Row[] = [
  [0, null, null, null],
  [0, 137_884, [41_204, 62_188, 34_492]],
  [0, 138_151, [41_096, 62_493, 34_562]],
  [0, 138_377, [41_402, 62_540, 34_435]],
  [0, 138_020, [41_388, 62_091, 34_541]],
  [0, 138_290, [41_290, 62_311, 34_689]],
];
const rows: Record<
  string,
  { sessions: AnalysisSessionSummary[]; rows: Row[] }
> = {
  con: { sessions: sessions(["qualifying"]), rows: quali },
  mezcla: {
    sessions: sessions(["other", "Warm-up"], ["qualifying"]),
    rows: [
      [0, null, null, null],
      [0, 138_904, [41_502, 62_611, 34_791]],
      [0, null, null, null, { sealed: false }],
      [1, null, null, null],
      [1, 137_884, [41_204, 62_188, 34_492]],
      [1, 138_151, [41_096, 62_493, 34_562]],
      [1, null, null, null, { gap: true }],
      [1, 138_020, [41_388, 62_091, 34_541]],
      [1, null, null, 138_100],
      [1, 138_402, null],
      [1, 138_233, [41_311, 62_502, 34_420]],
    ],
  },
  v1: {
    sessions: [],
    rows: [
      [null, null, null, null],
      [null, null, null, 139_100],
      [null, null, null, 138_400],
      [null, null, null, null, { gap: true }],
      [null, null, null, 138_000],
      [null, null, null, 138_200],
      [null, null, null, null, { sealed: false }],
    ],
  },
};
export function sectorsData(variant: string) {
  const data = rows[variant] ?? rows.con;
  const laps = data.rows.map(
    ([session, official, sectorsMs, approx, flags], index): AnalysisLap => ({
      index,
      lap: data.rows.slice(0, index).filter((r) => r[0] === session).length + 1,
      car: 7,
      sealed: flags?.sealed ?? true,
      gap: flags?.gap ?? false,
      samples: 7200,
      lapTimeApproxMs: approx ?? (official === null ? null : official - 20),
      session,
      lapTimeMs: official,
      sectorsMs,
      speed: {
        ...quality,
        min: 35,
        mean: 168.4 / 3.6,
        max: (index < 2 ? 275 : 276) / 3.6,
      },
      throttle: { ...quality, min: 0, mean: 0.63, max: 1 },
      brake: { ...quality, min: 0, mean: 0.12, max: 1 },
    }),
  );
  // Mejor vuelta oficial de cada sesión, como la cierra el host.
  for (const session of data.sessions) {
    const times = laps.flatMap((lap) =>
      lap.session === session.index && lap.lapTimeMs !== null
        ? [lap.lapTimeMs]
        : [],
    );
    session.bestLapMs = times.length ? Math.min(...times) : null;
  }
  return { sessions: data.sessions, laps };
}
