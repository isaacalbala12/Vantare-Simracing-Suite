import {
  buildCodexDryRunPackage,
  type CodexDryRunInput,
  type CodexDryRunPackage,
} from "./testing-center-codex-dry-run.ts";
import {
  type VerifiedCodexEvidence,
  verifyCodexEvidence,
} from "./testing-center-codex-evidence.ts";

export const CODEX_BASE_PROOF_VERSION =
  "testing-center.codex-base-proof.v1" as const;

export type NightlyAncestryProof = {
  contractVersion: typeof CODEX_BASE_PROOF_VERSION;
  repositoryOwner: "isaacalbala12";
  repositoryName: "Vantare-Simracing-Suite";
  baseRef: "nightly";
  analysisBaseSha: string;
  nightlyHeadSha: string;
  isAncestor: true;
  proofDigest: string;
};

export type CodexQueueCommand = {
  technicalIssueId: string;
  requestDigest: string;
  evidenceDigest: string;
  analysisBaseSha: string;
  nightlyHeadSha: string;
  ancestryProofDigest: string;
};

export interface CodexControlStore {
  loadVerifiedEvidence(technicalIssueId: string): Promise<unknown>;
  queueDryRun(command: CodexQueueCommand): Promise<unknown>;
}

export interface NightlyAncestryResolver {
  loadNightlyAncestry(): Promise<unknown>;
}

export type CodexControlPreparationInput =
  & Omit<
    CodexDryRunInput,
    "analysisBaseSha" | "verifiedEvidence"
  >
  & { analysisBaseSha: string };

export type PreparedCodexDryRun = {
  request: CodexDryRunPackage;
  runId: string;
  queueStatus: "queued" | "existing";
  ancestryProof: NightlyAncestryProof;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function invalid(code: string): never {
  throw new Error(code);
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function normalizeEvidenceRow(value: unknown): VerifiedCodexEvidence {
  if (
    !record(value) ||
    !exact(value, [
      "contract_version",
      "technical_issue_id",
      "report_id",
      "source_diagnostic_digest",
      "evidence_text",
      "evidence_digest",
    ]) ||
    value.contract_version !== "testing-center.codex-evidence.v1"
  ) invalid("codex_control_evidence_row_invalid");
  return {
    contractVersion: value.contract_version,
    technicalIssueId: value.technical_issue_id as string,
    reportId: value.report_id as string,
    sourceDiagnosticDigest: value.source_diagnostic_digest as string,
    evidenceText: value.evidence_text as string,
    evidenceDigest: value.evidence_digest as string,
  };
}

async function buildNightlyAncestryProof(
  value: unknown,
  requestedSha: string,
): Promise<NightlyAncestryProof> {
  if (
    !record(value) ||
    !exact(value, [
      "nightlyHeadSha",
      "ancestorShas",
    ]) ||
    typeof value.nightlyHeadSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.nightlyHeadSha) ||
    !Array.isArray(value.ancestorShas) || value.ancestorShas.length < 1 ||
    value.ancestorShas.length > 10000 ||
    !value.ancestorShas.every((sha) =>
      typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha)
    ) ||
    new Set(value.ancestorShas).size !== value.ancestorShas.length ||
    !value.ancestorShas.includes(value.nightlyHeadSha) ||
    !value.ancestorShas.includes(requestedSha)
  ) invalid("codex_control_base_proof_invalid");
  const unsigned = {
    contractVersion: CODEX_BASE_PROOF_VERSION,
    repositoryOwner: "isaacalbala12" as const,
    repositoryName: "Vantare-Simracing-Suite" as const,
    baseRef: "nightly" as const,
    analysisBaseSha: requestedSha,
    nightlyHeadSha: value.nightlyHeadSha,
    isAncestor: true as const,
  };
  return { ...unsigned, proofDigest: await sha256(JSON.stringify(unsigned)) };
}

function parseQueueReceipt(
  value: unknown,
): { queueStatus: "queued" | "existing"; runId: string } {
  if (
    !record(value) || !exact(value, ["queue_status", "run_id"]) ||
    !["queued", "existing"].includes(value.queue_status as string) ||
    typeof value.run_id !== "string" ||
    !/^codex_run_[0-9a-f]{64}$/.test(value.run_id)
  ) invalid("codex_control_queue_receipt_invalid");
  return {
    queueStatus: value.queue_status as "queued" | "existing",
    runId: value.run_id,
  };
}

export async function prepareCodexDryRun(
  input: CodexControlPreparationInput,
  store: CodexControlStore,
  ancestryResolver: NightlyAncestryResolver,
): Promise<PreparedCodexDryRun> {
  const evidence = await verifyCodexEvidence(
    normalizeEvidenceRow(
      await store.loadVerifiedEvidence(input.riskInput.technicalIssueId),
    ),
  );
  if (
    evidence.technicalIssueId !== input.riskInput.technicalIssueId ||
    evidence.reportId !== input.riskInput.reportId
  ) invalid("codex_control_evidence_identity_mismatch");

  const ancestryProof = await buildNightlyAncestryProof(
    await ancestryResolver.loadNightlyAncestry(),
    input.analysisBaseSha,
  );
  const request = await buildCodexDryRunPackage({
    ...input,
    verifiedEvidence: evidence,
  });
  const receipt = parseQueueReceipt(
    await store.queueDryRun({
      technicalIssueId: evidence.technicalIssueId,
      requestDigest: request.requestDigest,
      evidenceDigest: evidence.evidenceDigest,
      analysisBaseSha: ancestryProof.analysisBaseSha,
      nightlyHeadSha: ancestryProof.nightlyHeadSha,
      ancestryProofDigest: ancestryProof.proofDigest,
    }),
  );
  return { request, ...receipt, ancestryProof };
}
