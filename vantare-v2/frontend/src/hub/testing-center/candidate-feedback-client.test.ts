import { beforeEach, describe, expect, it, vi } from "vitest";
import { CandidateFeedbackContractError } from "./candidate-feedback-contracts";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../../lib/supabase-auth", () => ({
  getSupabaseClient: () => ({ functions: { invoke } }),
}));

import {
  CandidateFeedbackClientError,
  testingCenterFeedbackClient,
} from "./candidate-feedback-client";

function feed() {
  return {
    contractVersion: "testing-center.candidate-feed.v1",
    candidates: [{
      issueId: `issue_${"a".repeat(64)}`,
      candidateId: "candidate-isa242",
      channel: "nightly",
      appVersion: "v0.1.0.5-nightly",
      candidateSha: "b".repeat(40),
      module: "testing_center",
      summary: "The report form remains open",
      criteria: ["The draft remains visible"],
      knownFailure: "The draft used to disappear",
      state: "pending",
      canValidate: true,
    }],
  };
}

describe("candidate feedback client", () => {
  beforeEach(() => invoke.mockReset());

  it("invokes the closed list operation", async () => {
    invoke.mockResolvedValue({ data: feed(), error: null });
    await expect(testingCenterFeedbackClient.listCandidates("nightly"))
      .resolves.toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith("testing-center-feedback", {
      body: { operation: "list_candidates", channel: "nightly" },
    });
  });

  it("submits only candidate identity, decision and structured details", async () => {
    invoke.mockResolvedValue({
      data: {
        contractVersion: "testing-center.candidate-feedback-result.v1",
        validationId: `validation_${"c".repeat(64)}`,
        decision: "cannot_verify",
        flowState: "nightly_candidate",
        candidateState: "pending",
        idempotent: false,
      },
      error: null,
    });
    await testingCenterFeedbackClient.submitFeedback({
      candidateId: "candidate-isa242",
      candidateSha: "b".repeat(40),
      decision: "cannot_verify",
    });
    expect(invoke).toHaveBeenCalledWith("testing-center-feedback", {
      body: {
        operation: "submit_feedback",
        candidateId: "candidate-isa242",
        candidateSha: "b".repeat(40),
        decision: "cannot_verify",
      },
    });
  });

  it("does not expose remote errors and rejects malformed success payloads", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    await expect(testingCenterFeedbackClient.listCandidates("nightly"))
      .rejects.toEqual(expect.objectContaining<Partial<CandidateFeedbackClientError>>({
        code: "feedback_unavailable",
      }));
    invoke.mockResolvedValue({ data: { candidates: [] }, error: null });
    await expect(testingCenterFeedbackClient.listCandidates("nightly"))
      .rejects.toBeInstanceOf(CandidateFeedbackContractError);
  });
});
