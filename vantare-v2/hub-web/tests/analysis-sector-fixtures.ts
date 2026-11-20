import type {
  AnalysisLap,
  AnalysisSessionSummary,
} from "../src/contract/generated/analysis";
import type { AnalysisSnapshot } from "../src/renderer/app/AnalysisController";

const quality = { reliable: 1, estimated: 0, stale: 0, unavailable: 0 };
const signal = { ...quality, min: 1, mean: 2, max: 3 };
export function lap(index: number, over: Partial<AnalysisLap> = {}) {
  return {
    index,
    lap: index + 1,
    car: 7,
    sealed: true,
    gap: false,
    samples: 10,
    lapTimeApproxMs: 100_000,
    session: 0,
    lapTimeMs: 100_000,
    sectorsMs: [30_000, 40_000, 30_000],
    speed: signal,
    throttle: signal,
    brake: signal,
    ...over,
  } satisfies AnalysisLap;
}
export const session = (trackName: string | null) =>
  ({ trackName, kind: "unknown", sealed: true }) as AnalysisSessionSummary;
/** A lap whose official time is the sum of its sectors, as the host guarantees. */
export const timed = (
  index: number,
  sectorsMs: number[] | null,
  sessionIndex = 0,
) =>
  lap(index, {
    session: sessionIndex,
    sectorsMs,
    lapTimeMs: sectorsMs?.reduce((a, b) => a + b, 0) ?? null,
  });
export function stateOf(
  laps: AnalysisLap[],
  sessions: AnalysisSessionSummary[] = [],
  pair?: AnalysisSnapshot["pair"],
): AnalysisSnapshot {
  return {
    rows: [],
    inspections: {},
    rowErrors: {},
    loading: false,
    opening: false,
    pair,
    selected: {
      id: "1".padStart(64, "0"),
      startedAtMs: 1_700_000_000_000,
      sizeBytes: 20_000_000,
    } as AnalysisSnapshot["selected"],
    opened: {
      method: "analysis.open",
      watermark: "1",
      finished: true,
      attempted: "1",
      total: String(laps.length),
      laps,
      sessions,
    },
  };
}
