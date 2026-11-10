import { isUpdates } from "../updates-validation";
import { exact } from "../validation-common";

export { updatesMethods as methods } from "../generated/updates";
export function isRequest(value: Record<string, unknown>): boolean {
  return exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return value.method === "updates.restart"
    ? exact(value, ["method", "accepted"]) &&
        typeof value.accepted === "boolean"
    : exact(value, ["method", "value"]) && isUpdates(value.value);
}
export function isError(_value: Record<string, unknown>): boolean {
  return false;
}
export function isEvent(value: Record<string, unknown>): boolean {
  return (
    value.topic === "updates" &&
    exact(value, ["topic", "value"]) &&
    isUpdates(value.value)
  );
}
