import { isCore } from "../core-validation";
import { exact, integer, oneOf } from "../validation-common";

export { transportMethods as methods } from "../generated/transport";
export function isRequest(value: Record<string, unknown>): boolean {
  return exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return (
    value.method === "core.get" &&
    exact(value, ["method", "value"]) &&
    isCore(value.value)
  );
}
export function isError(value: Record<string, unknown>): boolean {
  return oneOf(value.kind, [
    "rejected",
    "busy",
    "coreUnavailable",
    "unsupported",
    "denied",
    "protected",
    "io",
  ])
    ? exact(value, ["kind"])
    : value.kind === "incompatible" &&
        exact(value, ["kind", "expected", "found"]) &&
        integer(value.expected) &&
        integer(value.found);
}
export function isEvent(value: Record<string, unknown>): boolean {
  return value.topic === "core"
    ? exact(value, ["topic", "value"]) && isCore(value.value)
    : value.topic === "simStatus" &&
        exact(value, ["topic", "live"]) &&
        typeof value.live === "boolean";
}
