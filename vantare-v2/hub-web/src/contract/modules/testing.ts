import {
  isReportDraft,
  isReportFields,
  isReportPreview,
  isReportPreviewId,
  isReportReceipt,
  isReportUpdatedAt,
  isTesting,
  isTestingId,
} from "../testing-validation";
import { exact, integer } from "../validation-common";

export { testingMethods as methods } from "../generated/testing";
export function isRequest(value: Record<string, unknown>): boolean {
  switch (value.method) {
    case "testing.answer":
      return (
        exact(value, ["method", "id", "score"]) &&
        isTestingId(value.id) &&
        integer(value.score) &&
        value.score >= 1 &&
        value.score <= 5
      );
    case "testing.contribute":
    case "testing.credit":
      return (
        exact(value, ["method", "id", "consent"]) &&
        isTestingId(value.id) &&
        typeof value.consent === "boolean"
      );
    case "testing.noticeRead":
      return (
        exact(value, ["method", "id", "updatedAt"]) &&
        isTestingId(value.id) &&
        isReportUpdatedAt(value.updatedAt)
      );
    case "report.send":
      return (
        exact(value, ["method", "previewId", "consent"]) &&
        isReportPreviewId(value.previewId) &&
        typeof value.consent === "boolean"
      );
    case "report.removeScreenshot":
      return (
        exact(value, ["method", "id", "fields"]) &&
        isReportPreviewId(value.id) &&
        isReportFields(value.fields)
      );
    case "report.capture":
    case "draft.save":
      return exact(value, ["method", "fields"]) && isReportFields(value.fields);
    case "report.prepare":
    case "report.retryPrepare":
    case "testing.refresh":
    case "draft.load":
    case "draft.discard":
      return exact(value, ["method"]);
    default:
      return false;
  }
}
export function isReply(value: Record<string, unknown>): boolean {
  switch (value.method) {
    case "testing.refresh":
    case "testing.answer":
    case "testing.contribute":
    case "testing.credit":
    case "testing.noticeRead":
      return exact(value, ["method", "value"]) && isTesting(value.value);
    case "draft.load":
    case "draft.save":
    case "draft.discard":
    case "report.capture":
    case "report.removeScreenshot":
      return exact(value, ["method", "value"]) && isReportDraft(value.value);
    case "report.prepare":
    case "report.retryPrepare":
      return exact(value, ["method", "value"]) && isReportPreview(value.value);
    case "report.send":
      return exact(value, ["method", "value"]) && isReportReceipt(value.value);
    default:
      return false;
  }
}
export function isError(value: Record<string, unknown>): boolean {
  return value.kind === "evidencePending" && exact(value, ["kind"]);
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
