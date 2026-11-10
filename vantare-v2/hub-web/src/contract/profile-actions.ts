import {
  launcherLimits,
  profileFailures,
  profileLimits,
  profileRunning,
} from "./generated/contract";
import { exact, integer, oneOf, record } from "./validation-common";
export const profileActionMethods = [
  "launcher.profile.delete",
  "launcher.profile.duplicate",
  "launcher.profile.favorite",
  "launcher.profile.option",
  "launcher.trigger",
] as const;
const id = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  new TextEncoder().encode(value).length <= launcherLimits.id &&
  !value.includes("\0");
export function isProfileAction(value: Record<string, unknown>): boolean {
  if (
    typeof value.baseRevision !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.baseRevision)
  )
    return false;
  if (value.method === "launcher.trigger")
    return (
      exact(value, ["method", "id", "baseRevision"]) &&
      (value.id === null || id(value.id))
    );
  if (!id(value.id)) return false;
  if (value.method === "launcher.profile.favorite")
    return (
      exact(value, ["method", "id", "favorite", "baseRevision"]) &&
      typeof value.favorite === "boolean"
    );
  if (value.method !== "launcher.profile.option")
    return exact(value, ["method", "id", "baseRevision"]);
  if (
    !exact(value, ["method", "id", "patch", "baseRevision"]) ||
    !record(value.patch) ||
    !exact(value.patch, ["option", "value"])
  )
    return false;
  const patch = value.patch;
  switch (patch.option) {
    case "alreadyRunning":
      return oneOf(patch.value, profileRunning);
    case "failure":
      return oneOf(patch.value, profileFailures);
    case "firstStepDelay":
      return integer(patch.value) && patch.value <= profileLimits.delay;
    case "retries":
      return integer(patch.value) && patch.value <= profileLimits.retries;
    case "startup":
    case "closeOnExit":
    case "retryFailed":
      return typeof patch.value === "boolean";
    default:
      return false;
  }
}

export const isProfileActionMethod = (value: unknown): boolean =>
  profileActionMethods.some((method) => method === value);
