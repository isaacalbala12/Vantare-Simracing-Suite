import { isCore } from "./core-validation";
import {
  diagnosticCodes,
  diagnosticEventLimit,
  diagnosticSections,
  privacyFields,
} from "./generated/contract";
import { exact, integer, oneOf, record } from "./validation-common";
export function isPrivacy(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "crashes",
      "usage",
      "crashesDecided",
      "usageDecided",
      "revision",
      "protected",
      "cleanupPending",
    ]) &&
    [
      value.crashes,
      value.usage,
      value.crashesDecided,
      value.usageDecided,
      value.protected,
      value.cleanupPending,
    ].every((item) => typeof item === "boolean") &&
    typeof value.revision === "string" &&
    /^[0-9a-f]{64}$/.test(value.revision)
  );
}
export function isPrivacyPatch(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["field", "value"]) &&
    oneOf(value.field, privacyFields) &&
    typeof value.value === "boolean"
  );
}
export function isDiagnostic(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "version",
      "os",
      "arch",
      "core",
      "settingsProtected",
      "events",
      "report",
    ]) &&
    [value.version, value.os, value.arch].every(
      (item) => typeof item === "string",
    ) &&
    isCore(value.core) &&
    typeof value.settingsProtected === "boolean" &&
    (value.report === null || typeof value.report === "string") &&
    Array.isArray(value.events) &&
    value.events.length <= diagnosticEventLimit &&
    value.events.every(
      (item) =>
        record(item) &&
        exact(item, ["section", "code", "sequence"]) &&
        oneOf(item.section, diagnosticSections) &&
        oneOf(item.code, diagnosticCodes) &&
        integer(item.sequence),
    )
  );
}
