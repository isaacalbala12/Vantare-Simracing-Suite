import {
  isAppEditor,
  isAppRequest,
  isCatalog,
  isPickedApp,
} from "../apps-validation";
import { isLauncher, isLauncherLaunch } from "../launcher-validation";
import { isProfileAction, isProfileActionMethod } from "../profile-actions";
import { isProfileEditor, isProfileRequest } from "../profile-validation";
import { exact } from "../validation-common";

export { launcherMethods as methods } from "../generated/launcher";
export function isRequest(value: Record<string, unknown>): boolean {
  if (isProfileActionMethod(value.method)) return isProfileAction(value);
  if (
    typeof value.method === "string" &&
    (value.method.startsWith("launcher.app.") ||
      value.method === "launcher.catalog" ||
      value.method === "launcher.scan")
  )
    return isAppRequest(value);
  if (
    value.method === "launcher.profile.get" ||
    value.method === "launcher.profile.save"
  )
    return isProfileRequest(value);
  return value.method === "launcher.launch"
    ? isLauncherLaunch(value)
    : (value.method === "launcher.get" ||
        value.method === "launcher.favorite") &&
        exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  if (isProfileActionMethod(value.method))
    return exact(value, ["method", "value"]) && isLauncher(value.value);
  if (value.method === "launcher.catalog")
    return exact(value, ["method", "value"]) && isCatalog(value.value);
  if (value.method === "launcher.app.get")
    return exact(value, ["method", "value"]) && isAppEditor(value.value);
  if (value.method === "launcher.app.pick")
    return exact(value, ["method", "value"]) && isPickedApp(value.value);
  if (
    [
      "launcher.scan",
      "launcher.app.save",
      "launcher.app.remove",
      "launcher.app.favorite",
    ].includes(String(value.method))
  )
    return exact(value, ["method", "value"]) && isLauncher(value.value);
  if (value.method === "launcher.profile.get")
    return exact(value, ["method", "value"]) && isProfileEditor(value.value);
  return value.method === "launcher.get" ||
    value.method === "launcher.profile.save"
    ? exact(value, ["method", "value"]) && isLauncher(value.value)
    : (value.method === "launcher.launch" ||
        value.method === "launcher.favorite") &&
        exact(value, ["method", "accepted"]) &&
        typeof value.accepted === "boolean";
}
export function isError(value: Record<string, unknown>): boolean {
  return (
    value.kind === "launcherConflict" &&
    exact(value, ["kind", "current"]) &&
    isLauncher(value.current)
  );
}
export function isEvent(value: Record<string, unknown>): boolean {
  return (
    value.topic === "launcher" &&
    exact(value, ["topic", "value"]) &&
    isLauncher(value.value)
  );
}
