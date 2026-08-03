// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTestingCenterCodexDossier,
  TESTING_CENTER_CODEX_DOSSIER_VERSION,
} from "./testing-center-codex-dossier.ts";
import { TESTING_CENTER_REJECTION_VERSION } from "./testing-center-rejection.ts";

const issueId = `issue_${"a".repeat(64)}`;
const subIssueId = `issue_${"b".repeat(64)}`;
const sha = "c".repeat(40);
const verifiedContext = {
  actorId: "11111111-1111-4111-8111-111111111111",
  actorRole: "primary_tester" as const,
  candidateAuthorId: "22222222-2222-4222-8222-222222222222",
};

function input(): Record<string, unknown> {
  return {
    contractVersion: TESTING_CENTER_CODEX_DOSSIER_VERSION,
    originalIssue: { issueId, title: "Settings panel closes" },
    subIssue: { issueId: subIssueId, title: "Correction after rejection" },
    rejection: {
      contractVersion: TESTING_CENTER_REJECTION_VERSION,
      issueId,
      candidateId: "candidate-nightly-42",
      channel: "nightly",
      appVersion: "0.4.7-nightly.42",
      candidateSha: sha,
      candidateAuthorId: "22222222-2222-4222-8222-222222222222",
      actor: {
        actorId: "11111111-1111-4111-8111-111111111111",
        actorRole: "primary_tester",
      },
      decision: "rejected",
      details: {
        category: "issue_persists",
        description: "The issue remains visible",
        steps: "Open Settings and select Updates",
        expected: "The panel remains visible",
        observed: "The panel closes",
        frequency: "always",
        blocking: true,
        diagnosticsConsent: false,
        logsConsent: false,
      },
    },
    candidate: {
      candidateId: "candidate-nightly-42",
      channel: "nightly",
      appVersion: "0.4.7-nightly.42",
      candidateSha: sha,
    },
    repository: {
      owner: "isaacalbala12",
      name: "Vantare-Simracing-Suite",
      environment: "vantare-codex-cloud",
    },
    targetBranch: "vantareapp/isa-999-correction-after-rejection",
    nightlyHeadSha: sha,
    prBaseRef: "nightly",
    basePrSha: sha,
    criteria: ["The Settings panel remains visible in the focal test"],
    evidence: {
      text: "Sanitized deterministic reproduction evidence",
      redactedValues: 0,
      truncatedFields: 0,
    },
    files: ["frontend/src/settings/panel.tsx"],
    commandIds: ["frontend.test.focal"],
  };
}

Deno.test("dossier is deterministic, complete and contains sanitized rejection", async () => {
  const first = await buildTestingCenterCodexDossier(input(), verifiedContext);
  const replay = await buildTestingCenterCodexDossier(
    structuredClone(input()),
    verifiedContext,
  );
  assertEquals(first, replay);
  assertEquals(first.status, "complete");
  assertEquals(first.strategy, "sub_issue_new_branch");
  assertEquals(first.rejection.category, "issue_persists");
  assertEquals(first.evidence, "Sanitized deterministic reproduction evidence");
  assertEquals(
    first.repository.targetBranch.startsWith("vantareapp/isa-"),
    true,
  );
  assertEquals(first.hasReplayUrl, false);
  assertEquals(first.noRetryAllowed && first.noMergeAllowed, true);
  assertEquals(
    new TextEncoder().encode(JSON.stringify(first)).length <= 32 * 1024,
    true,
  );
});

Deno.test("candidate or nightly base mismatch is incomplete", async () => {
  const mismatch = input();
  (mismatch.candidate as Record<string, unknown>).candidateSha = "d".repeat(40);
  mismatch.basePrSha = "e".repeat(40);
  const dossier = await buildTestingCenterCodexDossier(
    mismatch,
    verifiedContext,
  );
  assertEquals(dossier.status, "incomplete");
  assertEquals(
    dossier.incompleteReasons.includes("candidate_sha_mismatch"),
    true,
  );
  assertEquals(
    dossier.incompleteReasons.includes("nightly_base_sha_mismatch"),
    true,
  );
});

Deno.test("new candidate SHA changes dossier identity and digest", async () => {
  const first = await buildTestingCenterCodexDossier(input(), verifiedContext);
  const changed = input();
  const nextSha = "d".repeat(40);
  changed.nightlyHeadSha = nextSha;
  changed.basePrSha = nextSha;
  (changed.candidate as Record<string, unknown>).candidateSha = nextSha;
  (changed.rejection as Record<string, unknown>).candidateSha = nextSha;
  const next = await buildTestingCenterCodexDossier(changed, verifiedContext);
  assertNotEquals(first.dossierIdempotencyKey, next.dossierIdempotencyKey);
  assertNotEquals(first.dossierDigest, next.dossierDigest);
});

Deno.test("same_branch, wrong environment, extra fields and excessive budgets fail closed", async () => {
  const sameBranch = input();
  sameBranch.targetBranch = "nightly";
  const sameBranchDossier = await buildTestingCenterCodexDossier(
    sameBranch,
    verifiedContext,
  );
  assertEquals(sameBranchDossier.status, "incomplete");
  assertEquals(
    sameBranchDossier.incompleteReasons.includes(
      "target_branch_missing_or_invalid",
    ),
    true,
  );

  const wrongEnvironment = input();
  (wrongEnvironment.repository as Record<string, unknown>).environment =
    "production";
  await assertRejects(() =>
    buildTestingCenterCodexDossier(wrongEnvironment, verifiedContext)
  );

  const extra = input();
  extra.merge = true;
  await assertRejects(() =>
    buildTestingCenterCodexDossier(extra, verifiedContext)
  );

  const tooManyCriteria = input();
  tooManyCriteria.criteria = Array.from(
    { length: 11 },
    (_, index) => `Criterion ${index}`,
  );
  await assertRejects(() =>
    buildTestingCenterCodexDossier(tooManyCriteria, verifiedContext)
  );
});

Deno.test("forbidden release instruction and replay URL never become ready", async () => {
  const forbidden = input();
  forbidden.criteria = ["Deploy the result after verification"];
  (forbidden.evidence as Record<string, unknown>).text =
    "See https://example.invalid/replay";
  const dossier = await buildTestingCenterCodexDossier(
    forbidden,
    verifiedContext,
  );
  assertEquals(dossier.status, "incomplete");
  assertEquals(dossier.includesRetryOrReleaseCommand, true);
  assertEquals(dossier.hasReplayUrl, false);
});

Deno.test("well-shaped missing requirements produce incomplete instead of delegation", async () => {
  const missing = input();
  missing.targetBranch = "";
  missing.nightlyHeadSha = "";
  missing.basePrSha = "";
  missing.criteria = [];
  missing.files = [];
  missing.commandIds = [];
  (missing.evidence as Record<string, unknown>).text = "";
  const dossier = await buildTestingCenterCodexDossier(
    missing,
    verifiedContext,
  );
  assertEquals(dossier.status, "incomplete");
  for (
    const reason of [
      "target_branch_missing_or_invalid",
      "invalid_nightly_head_or_base_sha",
      "missing_criteria",
      "missing_files",
      "invalid_command_count",
      "missing_evidence",
    ]
  ) {
    assertEquals(dossier.incompleteReasons.includes(reason), true);
  }
});

Deno.test("evidence shape is exact and numeric metrics never coerce", async () => {
  const extra = input();
  (extra.evidence as Record<string, unknown>).rawLog = "forbidden";
  await assertRejects(() =>
    buildTestingCenterCodexDossier(extra, verifiedContext)
  );

  for (const value of [null, "", "0"]) {
    const coerced = input();
    (coerced.evidence as Record<string, unknown>).redactedValues = value;
    await assertRejects(() =>
      buildTestingCenterCodexDossier(coerced, verifiedContext)
    );
  }
});
