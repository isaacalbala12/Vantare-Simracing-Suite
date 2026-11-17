import {
  type AnalysisLap,
  type AnalysisRow,
  type AnalysisSessionSummary,
  analysisMax,
} from "../../contract/generated/analysis";
import { methods } from "../../contract/modules/analysis";
import type { MockContext, MockHandler } from "../context";

const rows: AnalysisRow[] = [
  {
    id: "a".repeat(64),
    startedAtMs: 1700000000000,
    sizeBytes: 1048576,
    recording: false,
  },
  {
    id: "b".repeat(64),
    startedAtMs: 1700000120000,
    sizeBytes: 524288,
    recording: true,
  },
  {
    id: "c".repeat(64),
    startedAtMs: 1700000240000,
    sizeBytes: 786432,
    recording: false,
  },
];
const sessionRows: AnalysisSessionSummary[] = [
  {
    index: 0,
    kind: "race",
    kindText: null,
    trackName: "Spa",
    vehicle: "Porsche 911 GT3 R",
    className: "GT3",
    startedAtMs: 1700000100000,
    endedAtMs: null,
    sealed: false,
    endReason: null,
    positionAtClose: null,
    classPositionAtClose: null,
    lapsCompleted: null,
    bestLapMs: null,
  },
  {
    index: 1,
    kind: "qualifying",
    kindText: null,
    trackName: "Spa",
    vehicle: "Porsche 911 GT3 R",
    className: "GT3",
    startedAtMs: 1700000000000,
    endedAtMs: 1700000090000,
    sealed: true,
    endReason: "sessionChanged",
    positionAtClose: 3,
    classPositionAtClose: 2,
    lapsCompleted: 3,
    bestLapMs: 111625,
  },
];
const quality = { reliable: 7200, estimated: 0, stale: 0, unavailable: 0 };
const lapTimes = [112400, 111600, 111900, 112200];
const laps: AnalysisLap[] = lapTimes.map((lapTimeApproxMs, index) => ({
  index,
  lap: index + 1,
  car: index === 3 ? 8 : 7,
  sealed: true,
  gap: index === 2,
  samples: 7200,
  lapTimeApproxMs: index === 2 ? null : lapTimeApproxMs,
  session: index === 3 ? 0 : 1,
  lapTimeMs: index === 2 ? null : lapTimeApproxMs + 25,
  sectorsMs: index === 2 ? null : [35000, 40000, lapTimeApproxMs + 25 - 75000],
  speed: { ...quality, min: 35, mean: 51, max: 75 },
  throttle: { ...quality, min: 0, mean: 0.7, max: 1 },
  brake: { ...quality, min: 0, mean: 0.2, max: 1 },
}));
export function create({ core, sceneName }: MockContext): MockHandler {
  let session: string | undefined;
  const legacy = sceneName === "analysis-v1";
  let catalogued = false;
  let generation = 0;
  return (message) => {
    if (
      message.kind !== "request" ||
      !methods.some((method) => method === message.request.method)
    )
      return undefined;
    const { id, request } = message;
    const fail = (
      kind:
        | "denied"
        | "analysisLocked"
        | "analysisNotFound"
        | "analysisIncomparable",
    ) => ({
      kind: "failure" as const,
      id,
      error: { kind },
    });
    if (
      !core.access.verified ||
      core.access.blocked ||
      !core.access.analysis ||
      core.rights !== "connected"
    ) {
      session = undefined;
      catalogued = false;
      return fail("denied");
    }
    switch (request.method) {
      case "analysis.status":
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            status:
              sceneName === "analysis-status-null"
                ? null
                : {
                    state: "recording",
                    cause: null,
                    rowId: catalogued ? (rows[1]?.id ?? null) : null,
                    startedAtMs: 1700000120000,
                    durableWatermark: "1200",
                    attempted: "1200",
                    limits: { maxRecordings: 200, maxBytes: 5368709120 },
                    lastPrune: {
                      atMs: 1700000100000,
                      items: [
                        {
                          name: "series-1-2.duckdb",
                          sizeBytes: 1048576,
                          modifiedAtMs: 1700000000000,
                          reason: "count",
                          result: "deleted",
                        },
                        {
                          name: "series-3-4.duckdb",
                          sizeBytes: 524288,
                          modifiedAtMs: 1700000010000,
                          reason: "bytes",
                          result: "skippedInUse",
                        },
                        {
                          name: "series-5-6.duckdb.creating-7-8",
                          sizeBytes: 4096,
                          modifiedAtMs: 1700000020000,
                          reason: "orphan",
                          result: "error",
                        },
                      ],
                    },
                  },
          },
        };
      case "analysis.catalog":
        catalogued = true;
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            recordings: structuredClone(rows),
            max: analysisMax,
          },
        };
      case "analysis.inspect":
      case "analysis.open": {
        const row = catalogued
          ? rows.find((row) => row.id === request.id)
          : undefined;
        if (!row) return fail("analysisNotFound");
        if (
          row.recording ||
          (row.id === rows[2]?.id && request.method === "analysis.open")
        )
          return fail("analysisLocked");
        if (request.method === "analysis.inspect")
          return {
            kind: "response",
            id,
            result:
              row.id === rows[2]?.id
                ? {
                    method: request.method,
                    state: "locked",
                    laps: 0,
                    sessions: [],
                  }
                : {
                    method: request.method,
                    state: "complete",
                    laps: laps.length,
                    sessions: legacy ? [] : structuredClone(sessionRows),
                    bestLapApproxMs: 111600,
                  },
          };
        session = (++generation).toString(16).padStart(64, "0");
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            session,
            watermark: "28800",
            finished: true,
            attempted: "28800",
            total: "4",
            sessions: legacy ? [] : structuredClone(sessionRows),
            laps: legacy
              ? laps.map((lap) => ({
                  ...lap,
                  session: null,
                  lapTimeMs: null,
                  sectorsMs: null,
                }))
              : structuredClone(laps),
          },
        };
      }
      case "analysis.compare": {
        if (session !== request.session || !laps[request.a] || !laps[request.b])
          return fail("analysisNotFound");
        if (laps[request.a]?.car !== laps[request.b]?.car)
          return fail("analysisIncomparable");
        const points = (
          lap: number,
          signal: "speed" | "throttle" | "brake" | "delta",
        ) =>
          Array.from({ length: 128 }, (_, i) => {
            const f = i / 127,
              wave = (1 + Math.sin(f * 10 * Math.PI)) / 2;
            return {
              distance: f * 5000,
              elapsed: (f * (lapTimes[lap] ?? 0)) / 1000,
              segment: lap === 2 && i >= 64 ? 1 : 0,
              value:
                signal === "speed"
                  ? 125 + wave * 130
                  : signal === "throttle"
                    ? 100 - wave * 65
                    : signal === "brake"
                      ? wave * 40
                      : (f *
                          ((laps[request.a]?.lapTimeApproxMs ?? 0) -
                            (laps[request.b]?.lapTimeApproxMs ?? 0))) /
                        1000,
            };
          }).filter((_, i) => lap !== 2 || i < 60 || i >= 64);
        const series = (signal: "speed" | "throttle" | "brake") => ({
          a: points(request.a, signal),
          b: points(request.b, signal),
        });
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            distanceRange: [0, 5000],
            speed: series("speed"),
            throttle: series("throttle"),
            brake: series("brake"),
            delta:
              request.a === 2 || request.b === 2
                ? null
                : points(request.a, "delta"),
            ...(request.a === 2 || request.b === 2
              ? {
                  deltaUnavailable:
                    request.a === 2 ? ("gapInA" as const) : ("gapInB" as const),
                }
              : {}),
            gaps: {
              a:
                request.a === 2
                  ? [{ from: (59 / 127) * 5000, to: (64 / 127) * 5000 }]
                  : [],
              b:
                request.b === 2
                  ? [{ from: (59 / 127) * 5000, to: (64 / 127) * 5000 }]
                  : [],
            },
          },
        };
      }
      case "analysis.close":
        if (session !== request.session) return fail("analysisNotFound");
        session = undefined;
        return { kind: "response", id, result: { method: request.method } };
      case "analysis.cancel":
        // Mock work completes synchronously; cancellation preserves an opened session.
        return {
          kind: "response",
          id,
          result: { method: request.method, cancelled: false },
        };
    }
    return undefined;
  };
}
