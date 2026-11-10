import { isDiagnostic } from "../privacy-validation";
import { exact } from "../validation-common";

export { diagnosticsMethods as methods } from "../generated/diagnostics";
export function isRequest(value: Record<string, unknown>): boolean {
  return exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return value.method === "diagnostics.copy"
    ? exact(value, ["method", "text"]) && typeof value.text === "string"
    : exact(value, ["method", "value"]) && isDiagnostic(value.value);
}
export function isError(_value: Record<string, unknown>): boolean {
  return false;
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
