import { registrationStates } from "../generated/contract";
import { exact, oneOf, record } from "../validation-common";

export { shortcutsMethods as methods } from "../generated/shortcuts";
export function isRequest(value: Record<string, unknown>): boolean {
  return exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return (
    exact(value, ["method", "value"]) &&
    record(value.value) &&
    exact(value.value, ["profiles", "protected"]) &&
    typeof value.value.protected === "boolean" &&
    Array.isArray(value.value.profiles) &&
    value.value.profiles.every(
      (item) =>
        record(item) &&
        exact(item, ["id", "name", "hotkey", "state"]) &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.hotkey === "string" &&
        oneOf(item.state, registrationStates),
    )
  );
}
export function isError(_value: Record<string, unknown>): boolean {
  return false;
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
