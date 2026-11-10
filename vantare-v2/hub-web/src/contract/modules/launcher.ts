import {isProfileRequest,isProfileEditor} from "../profile-validation";
import { isLauncher, isLauncherLaunch } from "../launcher-validation";
import { exact } from "../validation-common";

export { launcherMethods as methods } from "../generated/launcher";
export function isRequest(value: Record<string, unknown>): boolean {
  if(value.method==="launcher.profile.get"||value.method==="launcher.profile.save")return isProfileRequest(value);
  return value.method === "launcher.launch"
    ? isLauncherLaunch(value)
    : exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  if(value.method==="launcher.profile.get")return exact(value,["method","value"])&&isProfileEditor(value.value);
  return value.method === "launcher.get" || value.method === "launcher.profile.save"
    ? exact(value, ["method", "value"]) && isLauncher(value.value)
    : exact(value, ["method", "accepted"]) &&
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
