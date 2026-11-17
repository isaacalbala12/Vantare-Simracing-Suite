import {
  analysisDeltaUnavailable,
  analysisPointsMax,
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
    /^(0|[1-9][0-9]{0,19})$/.test(v) &&
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
export function lap(v: unknown): boolean {
  return (
    record(v) &&
    exact(v, [
      "index",
      "lap",
      "car",
      "sealed",
      "gap",
      "samples",
      "lapTimeApproxMs",
      "speed",
      "throttle",
      "brake",
    ]) &&
    [v.index, v.lap, v.car, v.samples].every(integer) &&
    typeof v.sealed === "boolean" &&
    typeof v.gap === "boolean" &&
    (v.lapTimeApproxMs === null || integer(v.lapTimeApproxMs)) &&
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
