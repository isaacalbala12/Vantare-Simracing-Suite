import { exact, integer, record } from "./validation-common";
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
    exact(v, ["id", "startedAtMs", "sizeBytes"]) &&
    token(v.id) &&
    safe(v.startedAtMs) &&
    safe(v.sizeBytes)
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
