// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTestingCenterRejectionProjection,
  createTestingCenterRejectionDryRunAdapter,
  parseTestingCenterOwnerDisposition,
  parseTestingCenterRejection,
  TESTING_CENTER_REJECTION_VERSION,
  type TestingCenterRejectionInput,
} from "./testing-center-rejection.ts";

const actorId = "11111111-1111-4111-8111-111111111111";
const authorId = "22222222-2222-4222-8222-222222222222";
const verifiedContext = {
  actorId,
  actorRole: "primary_tester" as const,
  candidateAuthorId: authorId,
};

function rejection(
  overrides: Partial<TestingCenterRejectionInput> = {},
): TestingCenterRejectionInput {
  const base: TestingCenterRejectionInput = {
    contractVersion: TESTING_CENTER_REJECTION_VERSION,
    issueId: `issue_${"a".repeat(64)}`,
    candidateId: "candidate-nightly-42",
    channel: "nightly",
    appVersion: "0.4.7-nightly.42",
    candidateSha: "b".repeat(40),
    candidateAuthorId: authorId,
    actor: { actorId, actorRole: "primary_tester" },
    decision: "rejected",
    details: {
      category: "issue_persists",
      description: "The original issue still appears",
      steps: "Open Settings and select Updates",
      expected: "The panel remains visible",
      observed: "The panel closes",
      frequency: "always",
      blocking: true,
      diagnosticsConsent: false,
      logsConsent: false,
    },
  };
  return { ...base, ...overrides };
}

Deno.test("rejection accepts explicit negative consent and sanitizes untrusted text", async () => {
  const input = rejection();
  input.details!.description =
    "pilot@example.com @everyone https://evil.invalid";
  const projection = await buildTestingCenterRejectionProjection(
    input,
    verifiedContext,
  );
  assertEquals(projection.decision, "rejected");
  assertMatch(projection.detailsMarkdown!, /redacted-email/);
  assertMatch(projection.detailsMarkdown!, /redacted-url/);
  assertNotMatch(projection.detailsMarkdown!, /@everyone|evil[.]invalid/);
});

Deno.test("accepted and cannot_verify forbid rejection details", () => {
  for (const decision of ["accepted", "cannot_verify"] as const) {
    const invalid = { ...rejection(), decision };
    assertThrows(
      () => parseTestingCenterRejection(invalid, verifiedContext),
      Error,
      "testing_center_rejection_invalid_shape",
    );
    const valid = { ...invalid } as Record<string, unknown>;
    delete valid.details;
    assertEquals(
      parseTestingCenterRejection(valid, verifiedContext).decision,
      decision,
    );
  }
});

Deno.test("roles are channel-bound and self-validation fails closed", () => {
  assertThrows(
    () =>
      parseTestingCenterRejection(
        rejection({
          actor: { actorId, actorRole: "tester" },
        }),
        verifiedContext,
      ),
  );
  const selfContext = { ...verifiedContext, candidateAuthorId: actorId };
  assertThrows(
    () =>
      parseTestingCenterRejection(
        rejection({
          candidateAuthorId: actorId,
        }),
        selfContext,
      ),
    Error,
    "testing_center_rejection_forbidden_action",
  );
  assertThrows(
    () =>
      parseTestingCenterRejection(
        rejection({
          candidateAuthorId: actorId,
        }),
        verifiedContext,
      ),
    Error,
    "testing_center_rejection_forbidden_action",
  );
  for (const actorRole of ["tester", "primary_tester", "owner"] as const) {
    const channelContext = { ...verifiedContext, actorRole };
    const parsed = parseTestingCenterRejection(
      rejection({
        channel: "testers",
        actor: { actorId, actorRole },
      }),
      channelContext,
    );
    assertEquals(parsed.actor.actorRole, actorRole);
  }
});

Deno.test("owner dispositions are closed, owner-bound and never resume the same aggregate", () => {
  const correction = {
    contractVersion: "testing-center.owner-disposition.v1",
    issueId: `issue_${"a".repeat(64)}`,
    rejectionReplayKey: `validation:${"b".repeat(64)}`,
    actorId,
    disposition: "create_correction_subissue",
    reason: "Create a fresh correction from current nightly",
    correctionIssueId: `issue_${"c".repeat(64)}`,
    targetBranch: "vantareapp/isa-999-correction-after-rejection",
    nightlySha: "d".repeat(40),
  };
  assertEquals(
    parseTestingCenterOwnerDisposition(correction, actorId).disposition,
    "create_correction_subissue",
  );
  assertThrows(() =>
    parseTestingCenterOwnerDisposition(
      { ...correction, disposition: "same_branch" },
      actorId,
    )
  );
  assertThrows(() =>
    parseTestingCenterOwnerDisposition(
      correction,
      "33333333-3333-4333-8333-333333333333",
    )
  );
});

Deno.test("one actor vote per candidate is idempotent and conflicting mutation fails", async () => {
  const adapter = createTestingCenterRejectionDryRunAdapter();
  const projection = await buildTestingCenterRejectionProjection(
    rejection(),
    verifiedContext,
  );
  const first = await adapter.dispatchValidation(projection);
  const replay = await adapter.dispatchValidation(projection);
  assertEquals(first.status, "dry_run");
  assertEquals(replay.status, "dry_run");
  if (replay.status === "dry_run") assertEquals(replay.idempotent, true);

  const changed = await buildTestingCenterRejectionProjection(
    rejection({
      details: { ...rejection().details!, observed: "A different failure" },
    }),
    verifiedContext,
  );
  const conflict = await adapter.dispatchValidation(changed);
  assertEquals(conflict.status, "failed");
  if (conflict.status === "failed") {
    assertEquals(conflict.errorCode, "dry_run_idempotency_conflict");
  }
});

Deno.test("a new SHA creates a new vote identity", async () => {
  const first = await buildTestingCenterRejectionProjection(
    rejection(),
    verifiedContext,
  );
  const next = await buildTestingCenterRejectionProjection(
    rejection({ candidateSha: "c".repeat(40) }),
    verifiedContext,
  );
  assertEquals(first.replayKey === next.replayKey, false);
});
