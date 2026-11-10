import { triageItems, triagePreviewLimit } from "./generated/contract";
import { isReportPreviewId } from "./testing-validation";
import { exact, oneOf, record } from "./validation-common";

export function isTriageRequest(value: unknown): boolean {
  if (!record(value) || typeof value.consent !== "boolean") return false;
  if (value.method === "triage.send")
    return (
      exact(value, ["method", "previewId", "consent"]) &&
      isReportPreviewId(value.previewId)
    );
  return (
    value.method === "triage.prepare" &&
    exact(value, ["method", "selection", "consent"]) &&
    record(value.selection) &&
    exact(value.selection, ["items"]) &&
    Array.isArray(value.selection.items) &&
    value.selection.items.length <= triageItems.length &&
    new Set(value.selection.items).size === value.selection.items.length &&
    value.selection.items.every((item) => oneOf(item, triageItems))
  );
}
export function isTriagePreview(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["id", "payload"]) &&
    isReportPreviewId(value.id) &&
    typeof value.payload === "string" &&
    new TextEncoder().encode(value.payload).length <= triagePreviewLimit
  );
}
