export type TestingCenterAgentVisibleState =
  | "processing"
  | "verifying_nightly"
  | "available_nightly"
  | "reverting_nightly"
  | "reverted_nightly"
  | "needs_owner"
  | "stopped";

const VERIFYING = new Set([
  "merge_queued",
  "merged_nightly",
  "smoke_running",
  "nightly_tagged",
]);
const WORKING = new Set([
  "triage_queued",
  "triaged",
  "eligible",
  "red_running",
  "red_verified",
  "green_running",
  "diff_verified",
  "review_approved",
  "ci_running",
]);

export function agentVisibleState(
  state: string,
): TestingCenterAgentVisibleState {
  if (WORKING.has(state)) return "processing";
  if (VERIFYING.has(state)) return "verifying_nightly";
  if (state === "completed") return "available_nightly";
  if (state === "smoke_failed" || state === "revert_pr_open") {
    return "reverting_nightly";
  }
  if (state === "reverted") return "reverted_nightly";
  if (state === "needs_owner") return "needs_owner";
  return "stopped";
}

export type TestingCenterAgentObservation = {
  jobKey: string;
  phase: string;
  provider: string;
  model: string | null;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  result: string;
  reason: string;
};

const SAFE_TEXT = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function sanitizeAgentObservation(
  value: TestingCenterAgentObservation & Record<string, unknown>,
): TestingCenterAgentObservation {
  if (
    !/^[0-9a-f]{64}$/.test(value.jobKey) ||
    !SAFE_TEXT.test(value.phase) ||
    !SAFE_TEXT.test(value.provider) ||
    (value.model !== null && !SAFE_TEXT.test(value.model)) ||
    !Number.isSafeInteger(value.durationMs) || value.durationMs < 0 ||
    !Number.isSafeInteger(value.inputTokens) || value.inputTokens < 0 ||
    !Number.isSafeInteger(value.outputTokens) || value.outputTokens < 0 ||
    !SAFE_TEXT.test(value.result) || !SAFE_TEXT.test(value.reason)
  ) throw new Error("testing_center_agent_observation_invalid");
  return {
    jobKey: value.jobKey,
    phase: value.phase,
    provider: value.provider,
    model: value.model,
    durationMs: value.durationMs,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    result: value.result,
    reason: value.reason,
  };
}
