import { triageItems, triagePreviewLimit } from "./generated/triage";
import { isReportPreviewId, isTestingId } from "./testing-validation";
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
    new TextEncoder().encode(value.payload).length <= triagePreviewLimit &&
    isTriagePayload(value.payload)
  );
}
function array(value: unknown, limit: number, valid: (value: unknown) => boolean) {
  return Array.isArray(value) && value.length <= limit && value.every(valid);
}
function numeric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
}
function count(value: unknown) { return numeric(value) && Number.isInteger(value); }
function version(value: unknown) {
  return typeof value === "string" && value.length <= 64 && (value === "otro" || /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})(?:-(?:nightly|testers|alpha|beta|rc)(?:\.(?:0|[1-9][0-9]{0,5}))*)?(?:\+(?:0|[1-9][0-9]{0,5})(?:\.(?:0|[1-9][0-9]{0,5}))*)?$/.test(value));
}
function timestamp(value: unknown) {
  if (typeof value !== "string") return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zoneHour, zoneMinute] = parts;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 && day >= 1 && day <= days && Number(hourText) <= 23 && Number(minuteText) <= 59 && Number(secondText) <= 60 && (zoneHour === undefined || (Number(zoneHour) <= 23 && Number(zoneMinute) <= 59));
}
function optional(value: unknown, rules: Record<string, (value: unknown) => boolean>) {
  return record(value) && Object.entries(value).every(([key, value]) => Object.hasOwn(rules, key) && rules[key](value));
}
function system(value: unknown) {
  return optional(value, {
    os: (value) => optional(value, { name: (value) => oneOf(value, ["Windows", "Linux", "macOS", "otro"]), version, build: (value) => typeof value === "string" && (value === "otro" || /^[0-9]{1,6}$/.test(value)) }),
    cpu: (value) => optional(value, { cores: count }),
    gpu: (value) => array(value, 8, (value) => record(value) && exact(value, ["driver_version"]) && version(value.driver_version)),
    displays: (value) => array(value, 16, (value) => optional(value, { width: numeric, height: numeric, hz: numeric, dpi_scale: numeric, primary: (value) => typeof value === "boolean" })),
    ram_gb: numeric,
    obs_active: (value) => typeof value === "boolean",
    overlays_active: (value) => array(value, 5, (value) => oneOf(value, ["OBS", "Streamlabs", "SimHub", "CrewChief", "Vantare"])),
  });
}
function summary(value: unknown) {
  return value === null || (record(value) && exact(value, ["errors", "events"]) && array(value.errors, 20, (error) => record(error) && exact(error, ["type", "message", "fingerprint"]) && error.type === "ServicesCommandFailure" && error.message === error.type && isReportPreviewId(error.fingerprint)) && array(value.events, 50, (event) => record(event) && exact(event, ["name", "at"]) && oneOf(event.name, ["ServicesCommandFailure", "ServicesCommandSuccess"]) && timestamp(event.at)));
}
function context(value: unknown, channel: string) {
  return record(value) && exact(value, ["app_version", "app_channel", "game", "game_version", "system", "telemetry_summary", "posthog_session_id", "consent"]) && version(value.app_version) && value.app_channel === channel && oneOf(value.game, ["lmu", "acc", "none"]) && (value.game_version === null || version(value.game_version)) && system(value.system) && summary(value.telemetry_summary) && value.posthog_session_id === null && record(value.consent) && exact(value.consent, ["version", "items", "accepted_at"]) && value.consent.version === "triage-v2" && array(value.consent.items, triageItems.length, (value) => oneOf(value, ["system", "telemetry_summary", "app_log", "telemetry_fragment", "posthog_session"])) && timestamp(value.consent.accepted_at);
}
function attachment(value: unknown) {
  if (!record(value) || !exact(value, ["kind", "content", "sha256"]) || value.kind !== "app_log" || typeof value.content !== "string" || new TextEncoder().encode(value.content).length > triagePreviewLimit || !isReportPreviewId(value.sha256)) return false;
  try {
    return array(JSON.parse(value.content), 300, (entry) => record(entry) && exact(entry, ["level", "module", "relative_ms"]) && oneOf(entry.level, ["INFO", "ERROR"]) && entry.module === "services" && count(entry.relative_ms));
  } catch { return false; }
}
export function isTriagePayload(payload: string) {
  try {
    const value: unknown = JSON.parse(payload);
    return record(value) && exact(value, ["p_id", "p_channel", "p_title", "p_body", "p_context", "p_attachments"]) && isTestingId(value.p_id) && oneOf(value.p_channel, ["nightly", "testers"]) && value.p_title === "[contenido retirado por privacidad]" && value.p_body === value.p_title && context(value.p_context, value.p_channel as string) && array(value.p_attachments, 1, attachment);
  } catch { return false; }
}
