import { isTesting } from "../testing-validation";
import { isTriagePreview, isTriageRequest } from "../triage-validation";
import { exact } from "../validation-common";

export { triageMethods as methods } from "../generated/triage";
export const isRequest = isTriageRequest;
export function isReply(value: Record<string, unknown>) {
  if (!exact(value, ["method", "value"])) return false;
  switch (value.method) {
    case "triage.prepare":
      return isTriagePreview(value.value);
    case "triage.send":
      return isTesting(value.value);
    default:
      return false;
  }
}
export function isError(_value: Record<string, unknown>) {
  return false;
}
export function isEvent(_value: Record<string, unknown>) {
  return false;
}
