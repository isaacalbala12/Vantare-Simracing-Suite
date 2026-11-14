import {
  residentActionLabels,
  residentActions,
  residentAnswerRejections,
  residentIdLimit,
  residentIdMaximum,
  residentIdPattern,
  residentOrderRejections,
  residentProfileIdLimit,
  residentQuestionKinds,
  residentRetryScopes,
} from "../generated/launcher_resident";
import {
  decimal,
  hex,
  isProfileId,
  isResidentExecution,
} from "../resident-execution-validation";
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
    BigInt(value.id).toString() === value.id &&
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
      "execution",
      "protected",
      "online",
      "running",
      "error",
      "decision",
      "registrations",
    ]) &&
    (value.execution === null ||
      (value.online === true && isResidentExecution(value.execution))) &&
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
  if (value.method === "launcher.resident.get") return exact(value, ["method"]);
  if (value.method === "launcher.resident.retry") {
    if (!exact(value, ["method", "target"]) || !record(value.target))
      return false;
    const target = value.target;
    return (
      exact(target, [
        "instance",
        "accountGeneration",
        "run",
        "profile",
        "revision",
        "scope",
      ]) &&
      hex(target.instance, 64) &&
      hex(target.accountGeneration, 64) &&
      decimal(target.run) &&
      isProfileId(target.profile) &&
      hex(target.revision, 64) &&
      oneOf(target.scope, residentRetryScopes)
    );
  }
  if (
    value.method === "launcher.resident.cancel" ||
    value.method === "launcher.resident.rehearse"
  ) {
    if (!exact(value, ["method", "target"]) || !record(value.target))
      return false;
    const target = value.target;
    const base =
      hex(target.instance, 64) &&
      hex(target.accountGeneration, 64) &&
      hex(target.revision, 64);
    return (
      base &&
      (value.method === "launcher.resident.cancel"
        ? exact(target, ["instance", "accountGeneration", "run", "revision"]) &&
          decimal(target.run)
        : exact(target, [
            "instance",
            "accountGeneration",
            "profile",
            "revision",
          ]) &&
          typeof target.profile === "string" &&
          target.profile.length > 0 &&
          new TextEncoder().encode(target.profile).length <=
            residentProfileIdLimit &&
          !target.profile.includes("\0"))
    );
  }

  if (
    value.method !== "launcher.resident.answer" ||
    !exact(value, ["method", "target"]) ||
    !record(value.target)
  )
    return false;
  const target = value.target;
  return (
    exact(target, [
      "instance",
      "accountGeneration",
      "run",
      "revision",
      "decision",
      "action",
    ]) &&
    hex(target.instance, 64) &&
    hex(target.accountGeneration, 64) &&
    decimal(target.run) &&
    hex(target.revision, 64) &&
    decimal(target.decision) &&
    oneOf(target.action, residentActions)
  );
}
export function isReply(value: Record<string, unknown>): boolean {
  if (
    value.method === "launcher.resident.answer" ||
    value.method === "launcher.resident.retry" ||
    value.method === "launcher.resident.cancel" ||
    value.method === "launcher.resident.rehearse"
  ) {
    return (
      exact(value, ["method", "value"]) &&
      record(value.value) &&
      exact(value.value, ["kind", "request"]) &&
      value.value.kind === "queued" &&
      hex(value.value.request, 32)
    );
  }
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
export function isError(value: Record<string, unknown>): boolean {
  if (value.kind === "residentControlRejected")
    return (
      exact(value, ["kind", "reason"]) &&
      oneOf(value.reason, residentOrderRejections)
    );
  return (
    value.kind === "residentAnswerRejected" &&
    exact(value, ["kind", "reason"]) &&
    oneOf(value.reason, residentAnswerRejections)
  );
}
