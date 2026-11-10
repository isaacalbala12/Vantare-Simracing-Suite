import {
  launcherLimits,
  profileCloses,
  profileFailures,
  profileLimits,
  profileRetries,
  profileRunning,
} from "./generated/contract";
import { exact, integer, oneOf, record } from "./validation-common";

const text = (value: unknown, maximum: number): value is string =>
  typeof value === "string" &&
  new TextEncoder().encode(value).length <= maximum &&
  !value.includes("\0");
export function isProfileDraft(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, [
      "id",
      "name",
      "favorite",
      "description",
      "notes",
      "advanced",
      "hotkey",
      "startup",
      "steps",
      "policy",
    ]) ||
    !(
      value.id === null ||
      (text(value.id, launcherLimits.id) && value.id.length > 0)
    ) ||
    !text(value.name, profileLimits.name) ||
    !text(value.description, profileLimits.description) ||
    !text(value.notes, profileLimits.notes) ||
    !text(value.hotkey, profileLimits.hotkey) ||
    ![value.favorite, value.advanced, value.startup].every(
      (item) => typeof item === "boolean",
    ) ||
    !Array.isArray(value.steps) ||
    value.steps.length > profileLimits.steps
  )
    return false;
  for (const step of value.steps) {
    if (
      !record(step) ||
      !exact(step, ["key", "appId", "delaySeconds", "hasCustomArguments"]) ||
      !(
        step.key === null ||
        (typeof step.key === "string" && /^[0-9a-f]{64}$/.test(step.key))
      ) ||
      !text(step.appId, launcherLimits.id) ||
      !step.appId ||
      !integer(step.delaySeconds) ||
      step.delaySeconds > profileLimits.delay ||
      typeof step.hasCustomArguments !== "boolean"
    )
      return false;
  }
  const policy = value.policy;
  return (
    record(policy) &&
    exact(policy, [
      "alreadyRunning",
      "failure",
      "cancel",
      "exit",
      "retry",
      "retries",
      "firstStepDelay",
    ]) &&
    oneOf(policy.alreadyRunning, profileRunning) &&
    oneOf(policy.failure, profileFailures) &&
    oneOf(policy.cancel, profileCloses) &&
    oneOf(policy.exit, profileCloses) &&
    oneOf(policy.retry, profileRetries) &&
    integer(policy.retries) &&
    policy.retries <= profileLimits.retries &&
    integer(policy.firstStepDelay) &&
    policy.firstStepDelay <= profileLimits.delay
  );
}
export function isProfileEditor(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["revision", "draft"]) &&
    typeof value.revision === "string" &&
    /^[0-9a-f]{64}$/.test(value.revision) &&
    isProfileDraft(value.draft)
  );
}
export function isProfileRequest(value: Record<string, unknown>): boolean {
  if (value.method === "launcher.profile.get")
    return (
      exact(value, ["method", "id"]) &&
      (value.id === null ||
        (text(value.id, launcherLimits.id) && value.id.length > 0))
    );
  return (
    exact(value, ["method", "draft", "baseRevision"]) &&
    isProfileDraft(value.draft) &&
    typeof value.baseRevision === "string" &&
    /^[0-9a-f]{64}$/.test(value.baseRevision)
  );
}
