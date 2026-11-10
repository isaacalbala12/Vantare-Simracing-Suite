import { isPilot, isPilotFields, isPilotRevision } from "../pilot-validation";
import { exact } from "../validation-common";

export { pilotMethods as methods } from "../generated/pilot";
export function isRequest(value: Record<string, unknown>): boolean {
  return value.method === "pilot.save"
    ? exact(value, ["method", "fields", "baseRevision"]) &&
        isPilotFields(value.fields) &&
        isPilotRevision(value.baseRevision)
    : exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return exact(value, ["method", "value"]) && isPilot(value.value);
}
export function isError(_value: Record<string, unknown>): boolean {
  return false;
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
