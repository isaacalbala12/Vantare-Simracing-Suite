import type { ResidentView } from "./generated/contract";
import { launcherAnswerChoices, launcherDecisionIdLimit, launcherDecisionMax, launcherLimits, launcherQuestionKinds, profileLimits, registrationStates } from "./generated/contract";
import { exact, oneOf, record } from "./validation-common";
const actionIds = launcherAnswerChoices.map((choice) => choice.id);
const text = (value: unknown, maximum: number): value is string => typeof value === "string" && new TextEncoder().encode(value).length <= maximum && !value.includes("\0");
export function isDecisionId(value: unknown): value is string {
  if (typeof value !== "string" || value.length > launcherDecisionIdLimit || !/^[0-9]+$/.test(value)) return false;
  const parsed = BigInt(value);
  return parsed.toString() === value && parsed <= BigInt(launcherDecisionMax);
}
export function isResidentAnswer(value: Record<string, unknown>): boolean {
  return exact(value, ["method", "decision", "action"]) && isDecisionId(value.decision) && oneOf(value.action, actionIds);
}
export function isResident(value: unknown): value is ResidentView {
  if (!record(value) || !exact(value, ["online", "running", "error", "decision", "registrations"]) || ![value.online, value.running, value.error].every((field) => typeof field === "boolean") || !Array.isArray(value.registrations) || value.registrations.length > launcherLimits.profiles) return false;
  const ids = new Set<string>();
  for (const row of value.registrations) {
    if (!record(row) || !exact(row, ["id", "name", "hotkey", "state"]) || !text(row.id, launcherLimits.id) || !row.id || !text(row.name, profileLimits.name) || !row.name || !text(row.hotkey, profileLimits.hotkey) || !row.hotkey || !oneOf(row.state, registrationStates) || ids.has(row.id)) return false;
    ids.add(row.id);
  }
  const question = value.decision;
  if (question === null) return true;
  if (!record(question) || !exact(question, ["id", "kind", "actions", "dismiss"]) || !isDecisionId(question.id) || !oneOf(question.kind, launcherQuestionKinds) || !Array.isArray(question.actions) || question.actions.length === 0 || question.actions.length > launcherAnswerChoices.length || !oneOf(question.dismiss, actionIds)) return false;
  const seen = new Set<string>();
  for (const action of question.actions) {
    if (!record(action) || !exact(action, ["id", "label"]) || !oneOf(action.id, actionIds) || action.label !== launcherAnswerChoices.find((choice) => choice.id === action.id)?.label || seen.has(action.id)) return false;
    seen.add(action.id);
  }
  return question.dismiss === (seen.has("leave") ? "leave" : "cancel");
}
