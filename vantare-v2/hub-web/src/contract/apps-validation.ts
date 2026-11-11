import type { AppDraft } from "./generated/contract";
import {
  launcherLimits,
  launcherPickPathMax,
  profileLimits,
} from "./generated/contract";
import { exact, integer, record } from "./validation-common";

const text = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  !value.includes("\0") &&
  new TextEncoder().encode(value).length <= max;
const id = (value: unknown): value is string =>
  text(value, launcherLimits.id) && value.length > 0;
const revision = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
export function isAppDraft(value: unknown): value is AppDraft {
  return (
    record(value) &&
    exact(value, ["id", "name", "favorite", "useDiscovery"]) &&
    (value.id === null || id(value.id)) &&
    text(value.name, profileLimits.name) &&
    typeof value.favorite === "boolean" &&
    typeof value.useDiscovery === "boolean"
  );
}
export function isAppEditor(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "revision",
      "draft",
      "hasExecutable",
      "hasCustomArguments",
      "customProfiles",
    ]) &&
    revision(value.revision) &&
    isAppDraft(value.draft) &&
    typeof value.hasExecutable === "boolean" &&
    typeof value.hasCustomArguments === "boolean" &&
    integer(value.customProfiles) &&
    value.customProfiles <= launcherLimits.profiles
  );
}
export function isPickedApp(value: unknown): boolean {
  return (
    value === null ||
    (record(value) &&
      exact(value, ["token", "name", "fileName"]) &&
      revision(value.token) &&
      text(value.name, profileLimits.name) &&
      text(value.fileName, profileLimits.name + 4) &&
      !/[\\/:]/.test(value.fileName))
  );
}
export function isCatalog(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["revision", "scanning", "apps"]) &&
    revision(value.revision) &&
    typeof value.scanning === "boolean" &&
    Array.isArray(value.apps) &&
    value.apps.length <= launcherLimits.apps &&
    value.apps.every(
      (app) =>
        record(app) &&
        exact(app, [
          "id",
          "name",
          "category",
          "steam",
          "favorite",
          "removable",
          "found",
          "installed",
        ]) &&
        id(app.id) &&
        text(app.name, profileLimits.name) &&
        text(app.category, profileLimits.name) &&
        [
          app.steam,
          app.favorite,
          app.removable,
          app.found,
          app.installed,
        ].every((flag) => typeof flag === "boolean"),
    )
  );
}
export function isAppRequest(value: Record<string, unknown>): boolean {
  switch (value.method) {
    case "launcher.catalog":
    case "launcher.scan":
      return exact(value, ["method"]);
    case "launcher.app.pick":
    case "launcher.app.get":
      return (
        exact(value, ["method", "id"]) && (value.id === null || id(value.id))
      );
    case "launcher.app.save":
      return (
        exact(value, ["method", "draft", "pickToken", "baseRevision"]) &&
        isAppDraft(value.draft) &&
        (value.pickToken === null || revision(value.pickToken)) &&
        revision(value.baseRevision)
      );
    case "launcher.app.remove":
      return (
        exact(value, ["method", "id", "baseRevision"]) &&
        id(value.id) &&
        revision(value.baseRevision)
      );
    case "launcher.app.favorite":
      return (
        exact(value, ["method", "id", "favorite", "baseRevision"]) &&
        id(value.id) &&
        typeof value.favorite === "boolean" &&
        revision(value.baseRevision)
      );
    default:
      return false;
  }
}
export function isPickedExecutable(value: Record<string, unknown>): boolean {
  return (
    exact(value, ["kind", "id", "path"]) &&
    integer(value.id) &&
    (value.path === null || text(value.path, launcherPickPathMax))
  );
}
