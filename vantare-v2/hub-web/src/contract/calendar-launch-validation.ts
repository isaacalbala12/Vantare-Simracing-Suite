import { isCalendarRevision, number, text } from "./calendar-common";
import { calendarLaunchArmIdLength, calendarLaunchStops, calendarLaunchUnknowns, calendarTimestampLimit } from "./generated/calendar";
import { launcherLimits, profileLimits } from "./generated/launcher";
import { residentIdMaximum, residentIdPattern } from "./generated/launcher_resident";
import { isResidentOutcome, isResidentRejection } from "./resident-execution-validation";
import { exact, oneOf, record } from "./validation-common";
const hex = (value: unknown, length: number): value is string => typeof value === "string" && value.length === length && /^[0-9a-f]+$/u.test(value);
const profile = (value: unknown): value is string => typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).length <= launcherLimits.id && !value.includes("\0");
const name = (value: unknown) => text(value) && value.trim().length > 0 && new TextEncoder().encode(value).length <= profileLimits.name;
const requestId = (value: unknown) => hex(value, 32);
const runId = (value: unknown) => typeof value === "string" && value !== "0" && new RegExp(residentIdPattern).test(value) && BigInt(value) <= BigInt(residentIdMaximum);
export function isCalendarLaunchMode(v: unknown): boolean {
  if (!record(v)) return false;
  return v.kind === "once" ? exact(v,["kind","seriesId","startAt"]) && text(v.seriesId) && v.seriesId.trim().length > 0 && number(v.startAt,calendarTimestampLimit*1000)
    : v.kind === "alerts" && exact(v,["kind","expectedRevision"]) && isCalendarRevision(v.expectedRevision);
}
function plan(v: unknown): boolean {
  return record(v) && exact(v,["armId","profile","profileName","decisionRequired","mode"]) && hex(v.armId,calendarLaunchArmIdLength) && profile(v.profile) && name(v.profileName) && typeof v.decisionRequired === "boolean" && isCalendarLaunchMode(v.mode);
}
function progress(v: unknown): boolean {
  if (!record(v)) return false;
  switch (v.kind) {
    case "queued": return exact(v,["kind","request"]) && requestId(v.request);
    case "running": return exact(v,["kind","request","run"]) && requestId(v.request) && runId(v.run);
    case "finished": return exact(v,["kind","request","run","outcome"]) && requestId(v.request) && runId(v.run) && isResidentOutcome(v.outcome);
    case "rejected": return exact(v,["kind","request","reason"]) && requestId(v.request) && isResidentRejection(v.reason);
    case "notSent": return exact(v,["kind","reason"]) && oneOf(v.reason,calendarLaunchStops);
    case "unknown": return exact(v,["kind","request","reason"]) && (v.request === null || requestId(v.request)) && oneOf(v.reason,calendarLaunchUnknowns);
    default: return false;
  }
}
function attempt(v: unknown): boolean {
  return record(v) && exact(v,["armId","profileName","seriesId","startAt","progress"]) && hex(v.armId,calendarLaunchArmIdLength) && name(v.profileName) && text(v.seriesId) && v.seriesId.trim().length > 0 && number(v.startAt,calendarTimestampLimit*1000) && progress(v.progress);
}
export function isCalendarLaunchView(v: unknown): boolean {
  if (!record(v) || !exact(v,["armed","automatic","latest","change"])) return false;
  return (v.armed === null || (plan(v.armed) && record(v.armed) && record(v.armed.mode) && v.armed.mode.kind === "once")) &&
    (v.automatic === null || (plan(v.automatic) && record(v.automatic) && record(v.automatic.mode) && v.automatic.mode.kind === "alerts")) &&
    (v.latest === null || attempt(v.latest)) &&
    (v.change === null || (record(v.change) && exact(v.change,["plan","reason"]) && plan(v.change.plan) && oneOf(v.change.reason,calendarLaunchStops)));
}
export function isCalendarLaunchArm(v: Record<string,unknown>): boolean {
  return exact(v,["method","profile","baseRevision","armedGeneration","mode"]) && profile(v.profile) && isCalendarRevision(v.baseRevision) && isCalendarRevision(v.armedGeneration) && isCalendarLaunchMode(v.mode);
}
export function isCalendarLaunchCancel(v: Record<string,unknown>): boolean {
  return exact(v,["method","armId"]) && hex(v.armId,calendarLaunchArmIdLength);
}
