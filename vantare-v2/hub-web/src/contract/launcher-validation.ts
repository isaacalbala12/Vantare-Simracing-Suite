import { launcherLimits } from "./generated/contract";
import { exact, integer, oneOf, record } from "./validation-common";

function id(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    new TextEncoder().encode(value).length <= launcherLimits.id &&
    !value.includes("\0")
  );
}
export function isLauncherLaunch(value: Record<string, unknown>): boolean {
  return (
    exact(value, ["method", "profile", "baseRevision"]) &&
    id(value.profile) &&
    typeof value.baseRevision === "string" &&
    /^[0-9a-f]{64}$/.test(value.baseRevision)
  );
}
export function isLauncher(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, [
      "exists",
      "protected",
      "revision",
      "resident",
      "running",
      "scanning",
      "lmuTrigger",
      "profiles",
      "apps",
    ]) ||
    ![
      value.exists,
      value.protected,
      value.resident,
      value.running,
      value.scanning,
    ].every((item) => typeof item === "boolean") ||
    typeof value.revision !== "string" ||
    !(
      (value.protected && value.revision === "") ||
      /^[0-9a-f]{64}$/.test(value.revision)
    ) ||
    !(value.lmuTrigger === null || id(value.lmuTrigger)) ||
    !Array.isArray(value.apps) ||
    value.apps.length > launcherLimits.apps ||
    !Array.isArray(value.profiles) ||
    value.profiles.length > launcherLimits.profiles
  )
    return false;
  const apps = new Set<string>();
  for (const app of value.apps) {
    if (
      !record(app) ||
      !exact(app, ["id", "name", "available"]) ||
      !id(app.id) ||
      !id(app.name) ||
      typeof app.available !== "boolean" ||
      apps.has(app.id)
    )
      return false;
    apps.add(app.id);
  }
  const profiles = new Set<string>();
  for (const profile of value.profiles) {
    if (
      !record(profile) ||
      !exact(profile, [
        "id",
        "name",
        "description",
        "favorite",
        "apps",
        "launchable",
        "options",
      ]) ||
      !id(profile.id) ||
      !id(profile.name) ||
      typeof profile.description !== "string" ||
      typeof profile.favorite !== "boolean" ||
      typeof profile.launchable !== "boolean" ||
      !Array.isArray(profile.apps) ||
      profile.apps.length > launcherLimits.profiles ||
      !profile.apps.every((app) => id(app) && apps.has(app)) ||
      profiles.has(profile.id)
    )
      return false;
    if (
      !record(profile.options) ||
      !exact(profile.options, [
        "alreadyRunning",
        "firstStepDelay",
        "retries",
        "failure",
        "startup",
        "closeOnExit",
        "retryFailed",
      ]) ||
      !oneOf(profile.options.alreadyRunning, ["ask", "reuse", "restart"]) ||
      !oneOf(profile.options.failure, ["ask", "stop", "continue"]) ||
      !integer(profile.options.firstStepDelay) ||
      !integer(profile.options.retries) ||
      profile.options.retries > 3 ||
      typeof profile.options.startup !== "boolean" ||
      typeof profile.options.closeOnExit !== "boolean" ||
      typeof profile.options.retryFailed !== "boolean"
    )
      return false;
    profiles.add(profile.id);
  }
  return (
    value.lmuTrigger === null ||
    (typeof value.lmuTrigger === "string" && profiles.has(value.lmuTrigger))
  );
}
