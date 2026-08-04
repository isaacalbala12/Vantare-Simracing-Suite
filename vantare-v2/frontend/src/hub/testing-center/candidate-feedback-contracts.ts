import {
  TESTING_CENTER_MODULES,
  type TestingCenterChannel,
  type TestingCenterModule,
} from "./contracts";

export type CandidateDecision = "accepted" | "rejected" | "cannot_verify";
export type RejectionCategory =
  | "issue_persists"
  | "new_regression"
  | "crash"
  | "different_behavior"
  | "other";
export type RejectionFrequency = "always" | "frequent" | "once";

export type CandidateReview = {
  issueId: string;
  candidateId: string;
  channel: TestingCenterChannel;
  appVersion: string;
  candidateSha: string;
  module: TestingCenterModule;
  summary: string;
  criteria: string[];
  knownFailure: string;
  state: "pending" | "accepted";
  canValidate: boolean;
};

export type RejectionDetails = {
  category: RejectionCategory;
  description: string;
  steps: string;
  expected: string;
  observed: string;
  frequency: RejectionFrequency;
  blocking: boolean;
  diagnosticsConsent: boolean;
  logsConsent: boolean;
};

export type CandidateFeedbackInput = {
  candidateId: string;
  candidateSha: string;
  decision: CandidateDecision;
  details?: RejectionDetails;
};

export type CandidateFeedbackResult = {
  validationId: string;
  decision: CandidateDecision;
  flowState: string;
  candidateState: string;
  idempotent: boolean;
};

export class CandidateFeedbackContractError extends Error {
  constructor() {
    super("testing_center_candidate_feedback_contract_invalid");
    this.name = "CandidateFeedbackContractError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CandidateFeedbackContractError();
  }
  return value as Record<string, unknown>;
}

function exact(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const result = record(value);
  const actual = Object.keys(result).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) throw new CandidateFeedbackContractError();
  return result;
}

function string(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) {
    throw new CandidateFeedbackContractError();
  }
  return value;
}

function candidate(value: unknown): CandidateReview {
  const item = exact(value, [
    "appVersion",
    "canValidate",
    "candidateId",
    "candidateSha",
    "channel",
    "criteria",
    "issueId",
    "knownFailure",
    "module",
    "state",
    "summary",
  ]);
  if (
    !/^issue_[0-9a-f]{64}$/u.test(string(item.issueId, 71)) ||
    !/^[A-Za-z0-9._-]{1,64}$/u.test(string(item.candidateId, 64)) ||
    (item.channel !== "nightly" && item.channel !== "testers") ||
    !/^[0-9a-f]{40}$/u.test(string(item.candidateSha, 40)) ||
    (item.state !== "pending" && item.state !== "accepted") ||
    typeof item.canValidate !== "boolean" ||
    !Array.isArray(item.criteria) || item.criteria.length < 1 ||
    item.criteria.length > 10
  ) throw new CandidateFeedbackContractError();
  const criteria = item.criteria.map((criterion) => string(criterion, 1024));
  return {
    issueId: item.issueId as string,
    candidateId: item.candidateId as string,
    channel: item.channel,
    appVersion: string(item.appVersion, 32),
    candidateSha: item.candidateSha as string,
    module: TESTING_CENTER_MODULES.includes(item.module as TestingCenterModule)
      ? item.module as TestingCenterModule
      : (() => {
        throw new CandidateFeedbackContractError();
      })(),
    summary: string(item.summary, 512),
    criteria,
    knownFailure: string(item.knownFailure, 1024),
    state: item.state,
    canValidate: item.canValidate,
  };
}

export function decodeCandidateFeed(value: unknown): CandidateReview[] {
  const root = exact(value, ["candidates", "contractVersion"]);
  if (
    root.contractVersion !== "testing-center.candidate-feed.v1" ||
    !Array.isArray(root.candidates) || root.candidates.length > 20
  ) throw new CandidateFeedbackContractError();
  return root.candidates.map(candidate);
}

export function decodeCandidateFeedbackResult(
  value: unknown,
): CandidateFeedbackResult {
  const root = exact(value, [
    "candidateState",
    "contractVersion",
    "decision",
    "flowState",
    "idempotent",
    "validationId",
  ]);
  if (
    root.contractVersion !== "testing-center.candidate-feedback-result.v1" ||
    !["accepted", "rejected", "cannot_verify"].includes(String(root.decision)) ||
    !/^validation_[0-9a-f]{64}$/u.test(string(root.validationId, 75)) ||
    typeof root.idempotent !== "boolean"
  ) throw new CandidateFeedbackContractError();
  return {
    validationId: root.validationId as string,
    decision: root.decision as CandidateDecision,
    flowState: string(root.flowState, 64),
    candidateState: string(root.candidateState, 32),
    idempotent: root.idempotent,
  };
}
