import {
  type AnalysisLap,
  type AnalysisRow,
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
const quality = { reliable: 7200, estimated: 0, stale: 0, unavailable: 0 };
const laps: AnalysisLap[] = [112400, 111600, 111900].map(
  (lapTimeApproxMs, index) => ({
    index,
    lap: index + 1,
    car: 7,
    sealed: true,
    gap: false,
    samples: 7200,
    lapTimeApproxMs,
    speed: { ...quality, min: 35, mean: 51, max: 75 },
    throttle: { ...quality, min: 0, mean: 0.7, max: 1 },
    brake: { ...quality, min: 0, mean: 0.2, max: 1 },
  }),
);
export function create({ core }: MockContext): MockHandler {
  let session: string | undefined;
  let catalogued = false;
  let generation = 0;
  return (message) => {
    if (
      message.kind !== "request" ||
      !methods.some((method) => method === message.request.method)
    )
      return undefined;
    const { id, request } = message;
    const fail = (kind: "denied" | "analysisLocked" | "analysisNotFound") => ({
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
                ? { method: request.method, state: "locked", laps: 0 }
                : {
                    method: request.method,
                    state: "complete",
                    laps: laps.length,
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
            watermark: "21600",
            finished: true,
            attempted: "21600",
            total: "3",
            laps: structuredClone(laps),
          },
        };
      }
      case "analysis.compare": {
        if (session !== request.session || !laps[request.a] || !laps[request.b])
          return fail("analysisNotFound");
        const points = (
          lap: number,
          signal: "speed" | "throttle" | "brake" | "delta",
        ) =>
          Array.from({ length: 128 }, (_, i) => {
            const f = i / 127,
              wave = (1 + Math.sin(f * 10 * Math.PI)) / 2;
            return {
              distance: f * 5000,
              elapsed: (f * (laps[lap]?.lapTimeApproxMs ?? 0)) / 1000,
              segment: 0,
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
          });
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
            delta: points(request.a, "delta"),
            gaps: { a: [], b: [] },
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
