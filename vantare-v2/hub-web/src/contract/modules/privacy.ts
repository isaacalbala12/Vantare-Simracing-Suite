import { isPrivacy, isPrivacyPatch } from "../privacy-validation";
import { exact, record } from "../validation-common";

export { privacyMethods as methods } from "../generated/privacy";
export function isRequest(value: Record<string, unknown>): boolean {
  if (value.method === "mail.set")
    return (
      exact(value, ["method", "consent"]) && typeof value.consent === "boolean"
    );
  return value.method === "privacy.update"
    ? exact(value, ["method", "patch", "baseRevision"]) &&
        isPrivacyPatch(value.patch) &&
        typeof value.baseRevision === "string" &&
        /^[0-9a-f]{64}$/.test(value.baseRevision)
    : exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  if (value.method === "privacy.policy")
    return (
      exact(value, ["method", "accepted"]) &&
      typeof value.accepted === "boolean"
    );
  if (value.method === "mail.get" || value.method === "mail.set")
    return (
      exact(value, ["method", "value"]) &&
      record(value.value) &&
      exact(value.value, ["consent"]) &&
      typeof value.value.consent === "boolean"
    );
  return exact(value, ["method", "value"]) && isPrivacy(value.value);
}
export function isError(value: Record<string, unknown>): boolean {
  return (
    (value.kind === "privacyConflict" || value.kind === "privacyCleanup") &&
    exact(value, ["kind", "current"]) &&
    isPrivacy(value.current)
  );
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
