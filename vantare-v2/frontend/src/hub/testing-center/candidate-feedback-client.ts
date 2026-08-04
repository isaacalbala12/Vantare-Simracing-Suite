import { getSupabaseClient } from "../../lib/supabase-auth";
import {
  type CandidateFeedbackInput,
  type CandidateFeedbackResult,
  type CandidateReview,
  decodeCandidateFeedbackResult,
  decodeCandidateFeed,
} from "./candidate-feedback-contracts";
import type { TestingCenterChannel } from "./contracts";

export class CandidateFeedbackClientError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "CandidateFeedbackClientError";
    this.code = code;
  }
}

export interface TestingCenterFeedbackClient {
  listCandidates(channel: TestingCenterChannel): Promise<CandidateReview[]>;
  submitFeedback(input: CandidateFeedbackInput): Promise<CandidateFeedbackResult>;
}

export const testingCenterFeedbackClient: TestingCenterFeedbackClient = {
  async listCandidates(channel) {
    const { data, error } = await getSupabaseClient().functions.invoke(
      "testing-center-feedback",
      { body: { operation: "list_candidates", channel } },
    );
    if (error) throw new CandidateFeedbackClientError("feedback_unavailable");
    return decodeCandidateFeed(data);
  },
  async submitFeedback(input) {
    const body = {
      operation: "submit_feedback",
      candidateId: input.candidateId,
      candidateSha: input.candidateSha,
      decision: input.decision,
      ...(input.details ? { details: input.details } : {}),
    };
    const { data, error } = await getSupabaseClient().functions.invoke(
      "testing-center-feedback",
      { body },
    );
    if (error) throw new CandidateFeedbackClientError("feedback_unavailable");
    return decodeCandidateFeedbackResult(data);
  },
};
