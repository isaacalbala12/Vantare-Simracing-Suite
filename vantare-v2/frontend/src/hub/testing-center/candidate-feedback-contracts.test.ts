import { describe, expect, it } from "vitest";
import {
  CandidateFeedbackContractError,
  decodeCandidateFeed,
  decodeCandidateFeedbackResult,
} from "./candidate-feedback-contracts";

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

describe("candidate feedback contracts", () => {
  it("decodes the closed candidate feed", () => {
    expect(decodeCandidateFeed(feed())[0].module).toBe("testing_center");
  });

  it("rejects unknown fields, modules and identity leakage", () => {
    const extra = feed();
    Object.assign(extra.candidates[0], { actorId: "private" });
    expect(() => decodeCandidateFeed(extra)).toThrow(CandidateFeedbackContractError);

    const module = feed();
    module.candidates[0].module = "private_area";
    expect(() => decodeCandidateFeed(module)).toThrow(CandidateFeedbackContractError);
  });

  it("decodes only a complete feedback result", () => {
    const result = {
      contractVersion: "testing-center.candidate-feedback-result.v1",
      validationId: `validation_${"c".repeat(64)}`,
      decision: "rejected",
      flowState: "needs_owner",
      candidateState: "rejected",
      idempotent: false,
    };
    expect(decodeCandidateFeedbackResult(result).decision).toBe("rejected");
    expect(() => decodeCandidateFeedbackResult({ ...result, ownerAction: "merge" }))
      .toThrow(CandidateFeedbackContractError);
  });
});
