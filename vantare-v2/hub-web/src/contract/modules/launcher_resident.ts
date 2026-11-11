import {
  residentActionLabels,
  residentActions,
  residentIdLimit,
  residentIdMaximum,
  residentIdPattern,
  residentQuestionKinds,
} from "../generated/launcher_resident";
import { exact, oneOf, record } from "../validation-common";
import { isReply as isShortcutsReply } from "./shortcuts";

export { launcher_residentMethods as methods } from "../generated/launcher_resident";

function question(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["id", "kind", "actions"]) &&
    typeof value.id === "string" &&
    value.id.length <= residentIdLimit &&
    new RegExp(residentIdPattern).test(value.id) &&
    BigInt(value.id) <= BigInt(residentIdMaximum) &&
    oneOf(value.kind, residentQuestionKinds) &&
    Array.isArray(value.actions) &&
    value.actions.length > 0 &&
    value.actions.length <= residentActions.length &&
    value.actions.every(
      (action) =>
        record(action) &&
        exact(action, ["id", "label"]) &&
        oneOf(action.id, residentActions) &&
        action.label === residentActionLabels[action.id],
    ) &&
    new Set(value.actions.map((action) => action.id)).size ===
      value.actions.length
  );
}
export function isResident(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "protected",
      "online",
      "running",
      "error",
      "decision",
      "registrations",
    ]) &&
    typeof value.protected === "boolean" &&
    typeof value.online === "boolean" &&
    typeof value.running === "boolean" &&
    typeof value.error === "boolean" &&
    (value.decision === null || question(value.decision)) &&
    (value.online ||
      (!value.running && !value.error && value.decision === null)) &&
    isShortcutsReply({
      method: "shortcuts.get",
      value: { protected: value.protected, profiles: value.registrations },
    })
  );
}
export function isRequest(value: Record<string, unknown>): boolean {
  return value.method === "launcher.resident.get" && exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return (
    value.method === "launcher.resident.get" &&
    exact(value, ["method", "value"]) &&
    isResident(value.value)
  );
}
export function isEvent(value: Record<string, unknown>): boolean {
  return (
    value.topic === "launcherResident" &&
    exact(value, ["topic", "value"]) &&
    isResident(value.value)
  );
}
export function isError(_value: Record<string, unknown>): boolean {
  return false;
}
