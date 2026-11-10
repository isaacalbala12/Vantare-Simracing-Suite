import { reportFieldLimits, reportModules } from "./generated/contract";
import { exact, integer, record } from "./validation-common";

export function isReportFields(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, [
      "actionText",
      "expectedText",
      "observedText",
      "contextText",
      "module",
    ])
  )
    return false;
  return (
    reportModules.some(([id]) => id === value.module) &&
    [
      value.actionText,
      value.expectedText,
      value.observedText,
      value.contextText,
    ].every(
      (text, index) =>
        typeof text === "string" &&
        new TextEncoder().encode(text).length <= reportFieldLimits[index] &&
        Array.from(text).every((char) => {
          const code = char.codePointAt(0) ?? 0;
          return (
            code === 9 ||
            code === 10 ||
            (code >= 32 && (code < 127 || code > 159))
          );
        }),
    )
  );
}
export function isReportDraft(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["fields", "exists", "screenshots"]) &&
    typeof value.exists === "boolean" &&
    isReportFields(value.fields) &&
    isScreenshots(value.screenshots)
  );
}
export function isTesting(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["reports", "questionnaires"]) &&
    Array.isArray(value.questionnaires) &&
    value.questionnaires.every(
      (q) =>
        record(q) &&
        exact(q, ["id", "version", "title", "question", "score"]) &&
        [q.id, q.version, q.title, q.question].every(
          (text) => typeof text === "string",
        ) &&
        (q.score === null ||
          (integer(q.score) && q.score >= 1 && q.score <= 5)),
    ) &&
    Array.isArray(value.reports) &&
    value.reports.every(
      (report) =>
        record(report) &&
        exact(report, [
          "id",
          "title",
          "state",
          "credit",
          "updatedAt",
          "fixedVersion",
          "notice",
        ]) &&
        [report.id, report.title, report.state].every(
          (text) => typeof text === "string",
        ) &&
        typeof report.credit === "boolean" &&
        typeof report.notice === "boolean" &&
        (report.updatedAt === null || typeof report.updatedAt === "string") &&
        (report.fixedVersion === null ||
          typeof report.fixedVersion === "string"),
    )
  );
}

function isScreenshots(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        record(s) &&
        exact(s, ["id", "jpeg", "width", "height", "byteSize"]) &&
        typeof s.id === "string" &&
        typeof s.jpeg === "string" &&
        integer(s.width) &&
        integer(s.height) &&
        integer(s.byteSize),
    )
  );
}
export function isReportPreview(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "id",
      "digest",
      "fields",
      "appVersion",
      "osVersion",
      "channel",
      "retry",
      "screenshots",
    ]) &&
    [
      value.id,
      value.digest,
      value.appVersion,
      value.osVersion,
      value.channel,
    ].every((text) => typeof text === "string") &&
    isReportFields(value.fields) &&
    typeof value.retry === "boolean" &&
    isScreenshots(value.screenshots)
  );
}
export function isReportReceipt(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["id", "state", "createdAt", "draftCleared"]) &&
    [value.id, value.state, value.createdAt].every(
      (text) => typeof text === "string",
    ) &&
    typeof value.draftCleared === "boolean"
  );
}
