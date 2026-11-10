import { isSettings, isSettingsPatch } from "../settings-validation";
import { exact } from "../validation-common";

export { settingsMethods as methods } from "../generated/settings";
export function isRequest(value: Record<string, unknown>): boolean {
  return value.method === "settings.update"
    ? exact(value, ["method", "patch", "baseRevision"]) &&
        isSettingsPatch(value.patch) &&
        typeof value.baseRevision === "string" &&
        /^[0-9a-f]{64}$/.test(value.baseRevision)
    : exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return exact(value, ["method", "value"]) && isSettings(value.value);
}
export function isError(value: Record<string, unknown>): boolean {
  return (
    value.kind === "conflict" &&
    exact(value, ["kind", "current"]) &&
    isSettings(value.current)
  );
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
