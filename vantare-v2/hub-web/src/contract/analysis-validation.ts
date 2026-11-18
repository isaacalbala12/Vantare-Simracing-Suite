import {
  analysisDeltaUnavailable,
  analysisLapKeys,
  analysisMax,
  analysisPointsMax,
  analysisPruneMax,
  analysisPruneReasons,
  analysisPruneResults,
  analysisRecordingCauses,
  analysisRecordingStates,
  analysisSessionEndReasons,
  analysisSessionKeys,
  analysisSessionKinds,
} from "./generated/analysis";
import { exact, integer, oneOf, record } from "./validation-common";
export function token(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
}
export function safe(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
export function decimal(v: unknown): boolean {
  return (
    typeof v === "string" &&
    /^(0|[1-9][0-9]{0,19})$/.exec(v)?.[0] === v &&
    BigInt(v) <= 18446744073709551615n
  );
}
const nullable = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v));
export function row(v: unknown): boolean {
  return (
    record(v) &&
    exact(v, ["id", "startedAtMs", "sizeBytes", "recording"]) &&
    token(v.id) &&
    safe(v.startedAtMs) &&
    safe(v.sizeBytes) &&
    typeof v.recording === "boolean"
  );
}
function signal(v: unknown): boolean {
  return (
    record(v) &&
    exact(v, [
      "reliable",
      "estimated",
      "stale",
      "unavailable",
      "min",
      "mean",
      "max",
    ]) &&
    [v.reliable, v.estimated, v.stale, v.unavailable].every(integer) &&
    [v.min, v.mean, v.max].every(nullable)
  );
}
const nullableInteger = (v: unknown) => v === null || integer(v);
const encoder = new TextEncoder();
const sessionKeys = [...analysisSessionKeys];
const lapKeys = [...analysisLapKeys];
const nullableText = (v: unknown) =>
  v === null ||
  (typeof v === "string" &&
    v.length > 0 &&
    v.length <= 256 &&
    encoder.encode(v).length <= 256);

export function sessions(v: unknown): v is unknown[] {
  return (
    Array.isArray(v) &&
    v.length <= analysisMax &&
    v.every(
      (row, index) =>
        record(row) &&
        exact(row, sessionKeys) &&
        row.index === index &&
        oneOf(row.kind, analysisSessionKinds) &&
        [row.kindText, row.trackName, row.vehicle, row.className].every(
          nullableText,
        ) &&
        safe(row.startedAtMs) &&
        (row.endedAtMs === null || safe(row.endedAtMs)) &&
        typeof row.sealed === "boolean" &&
        (row.endReason === null ||
          oneOf(row.endReason, analysisSessionEndReasons)) &&
        [
          row.positionAtClose,
          row.classPositionAtClose,
          row.lapsCompleted,
          row.bestLapMs,
        ].every(nullableInteger),
    )
  );
}

export function lap(v: unknown, sessionCount: number): boolean {
  return (
    record(v) &&
    exact(v, lapKeys) &&
    [v.index, v.lap, v.car, v.samples].every(integer) &&
    typeof v.sealed === "boolean" &&
    typeof v.gap === "boolean" &&
    nullableInteger(v.lapTimeApproxMs) &&
    (v.session === null
      ? v.lapTimeMs === null && v.sectorsMs === null
      : integer(v.session) && v.session < sessionCount) &&
    nullableInteger(v.lapTimeMs) &&
    (v.sectorsMs === null ||
      (Array.isArray(v.sectorsMs) &&
        v.sectorsMs.length <= 16 &&
        v.sectorsMs.every(integer))) &&
    [v.speed, v.throttle, v.brake].every(signal)
  );
}

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
function range(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    finite(v[0]) &&
    finite(v[1]) &&
    v[0] <= v[1]
  );
}
function points(v: unknown, domain: [number, number]): boolean {
  return (
    Array.isArray(v) &&
    v.length <= analysisPointsMax &&
    v.every(
      (p) =>
        record(p) &&
        exact(p, ["distance", "elapsed", "value", "segment"]) &&
        finite(p.distance) &&
        p.distance >= domain[0] &&
        p.distance <= domain[1] &&
        nullable(p.elapsed) &&
        finite(p.value) &&
        safe(p.segment),
    )
  );
}
export function comparison(v: Record<string, unknown>): boolean {
  if (!range(v.distanceRange)) return false;
  const domain = v.distanceRange;
  const series = (s: unknown) =>
    record(s) &&
    exact(s, ["a", "b"]) &&
    points(s.a, domain) &&
    points(s.b, domain);
  const ranges = (r: unknown) =>
    Array.isArray(r) &&
    r.every(
      (g) =>
        record(g) &&
        exact(g, ["from", "to"]) &&
        finite(g.from) &&
        finite(g.to) &&
        g.from <= g.to &&
        g.from >= domain[0] &&
        g.to <= domain[1],
    );
  return (
    exact(
      v,
      v.delta === null
        ? [
            "method",
            "distanceRange",
            "speed",
            "throttle",
            "brake",
            "delta",
            "deltaUnavailable",
            "gaps",
          ]
        : [
            "method",
            "distanceRange",
            "speed",
            "throttle",
            "brake",
            "delta",
            "gaps",
          ],
    ) &&
    [v.speed, v.throttle, v.brake].every(series) &&
    (v.delta === null
      ? oneOf(v.deltaUnavailable, analysisDeltaUnavailable)
      : points(v.delta, domain)) &&
    record(v.gaps) &&
    exact(v.gaps, ["a", "b"]) &&
    ranges(v.gaps.a) &&
    ranges(v.gaps.b)
  );
}

function recordingName(v: unknown): boolean {
  return (
    typeof v === "string" &&
    !/[\r\n\\/:]/.test(v) &&
    !v.includes("..") &&
    /^series-[0-9]+-[0-9]+\.duckdb(?:\.creating-[0-9]+-[0-9]+)?$/.test(v)
  );
}
export function recordingStatus(v: unknown): boolean {
  if (v === null) return true;
  return (
    record(v) &&
    exact(v, [
      "state",
      "cause",
      "rowId",
      "startedAtMs",
      "durableWatermark",
      "attempted",
      "limits",
      "lastPrune",
    ]) &&
    oneOf(v.state, analysisRecordingStates) &&
    (v.cause === null || oneOf(v.cause, analysisRecordingCauses)) &&
    (v.rowId === null || token(v.rowId)) &&
    safe(v.startedAtMs) &&
    [v.durableWatermark, v.attempted].every((n) => n === null || decimal(n)) &&
    record(v.limits) &&
    exact(v.limits, ["maxRecordings", "maxBytes"]) &&
    safe(v.limits.maxRecordings) &&
    safe(v.limits.maxBytes) &&
    record(v.lastPrune) &&
    exact(v.lastPrune, ["atMs", "items"]) &&
    safe(v.lastPrune.atMs) &&
    Array.isArray(v.lastPrune.items) &&
    v.lastPrune.items.length <= analysisPruneMax &&
    v.lastPrune.items.every(
      (item) =>
        record(item) &&
        exact(item, [
          "name",
          "sizeBytes",
          "modifiedAtMs",
          "reason",
          "result",
        ]) &&
        recordingName(item.name) &&
        safe(item.sizeBytes) &&
        safe(item.modifiedAtMs) &&
        oneOf(item.reason, analysisPruneReasons) &&
        oneOf(item.result, analysisPruneResults),
    )
  );
}
