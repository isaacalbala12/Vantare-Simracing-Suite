// deno-lint-ignore-file no-control-regex
import {
  parseTestingCenterRejection,
  type TestingCenterRejectionInput,
  type TestingCenterVerifiedValidationContext,
} from "./testing-center-rejection.ts";
import {
  sanitizeTestingCenterTesterText,
  sha256Hex,
} from "./testing-center-projection-sanitization.ts";

export const TESTING_CENTER_CODEX_DOSSIER_VERSION =
  "testing-center.codex-dossier.v1" as const;

const MAX_DOSSIER_BYTES = 32 * 1024;
const MAX_EVIDENCE_BYTES = 8 * 1024;
const MAX_FILES = 5;
const MAX_COMMAND_IDS = 3;
const MAX_PATH_BYTES = 220;
const MAX_CRITERIA_BYTES = 2000;
const FORBIDDEN_WORDS = ["retry", "merge", "deploy", "promotion"];
const ALLOWED_COMMAND_IDS = [
  "frontend.test.focal",
  "frontend.test.global",
  "frontend.build",
  "frontend.lint.focal",
] as const;
const ALLOWED_PATH_RE = /^[A-Za-z0-9._/-]+\.(ts|tsx|css)$/;
const REPO_OWNER = "isaacalbala12" as const;
const REPO_NAME = "Vantare-Simracing-Suite" as const;
const IDENTIFIER = /^[0-9a-f]{40}$/;
const ENCODER = new TextEncoder();

type RecordValue = Record<string, unknown>;

type TestingCenterChannel = TestingCenterRejectionInput["channel"];
type DossierCandidate = {
  candidateId: string;
  channel: TestingCenterChannel;
  appVersion: string;
  candidateSha: string;
};
type DossierRepository = {
  owner: typeof REPO_OWNER;
  name: typeof REPO_NAME;
  environment: "vantare-codex-cloud";
};
type IssueReference = {
  issueId: string;
  title: string;
};
type RejectionInput = ReturnType<typeof parseTestingCenterRejection>;

type Raw = {
  contractVersion: typeof TESTING_CENTER_CODEX_DOSSIER_VERSION;
  originalIssue: IssueReference;
  subIssue: IssueReference;
  rejection: RejectionInput;
  candidate: DossierCandidate;
  repository: DossierRepository;
  targetBranch: string;
  nightlyHeadSha: string;
  prBaseRef: "nightly";
  basePrSha: string;
  criteria: string[];
  evidence: {
    text: string;
    redactedValues: number;
    truncatedFields: number;
  };
  files: string[];
  commandIds: string[];
};

export type TestingCenterCodexDossier = {
  contractVersion: typeof TESTING_CENTER_CODEX_DOSSIER_VERSION;
  status: "complete" | "incomplete";
  dossierIdempotencyKey: string;
  dossierDigest: string;
  repository: {
    owner: typeof REPO_OWNER;
    name: typeof REPO_NAME;
    environment: DossierRepository["environment"];
    targetBranch: string;
  };
  strategy: "sub_issue_new_branch";
  source: {
    originalIssue: IssueReference;
    subIssue: IssueReference;
    candidate: DossierCandidate;
    channel: TestingCenterChannel;
    appVersion: string;
  };
  rejection: {
    category: NonNullable<TestingCenterRejectionInput["details"]>["category"];
    frequency: NonNullable<TestingCenterRejectionInput["details"]>["frequency"];
    blocking: boolean;
    diagnosticsConsent: boolean;
    logsConsent: boolean;
    description: string;
    steps: string;
    expected: string;
    observed: string;
  };
  candidateSha: string;
  nightlyHeadSha: string;
  prBaseRef: "nightly";
  basePrSha: string;
  criteria: string[];
  evidence: string;
  evidenceDigest: string;
  evidenceRedactedValues: number;
  evidenceTruncatedFields: number;
  files: string[];
  commandIds: string[];
  incompleteReasons: string[];
  hasReplayUrl: false;
  includesRetryOrReleaseCommand: boolean;
  noRetryAllowed: true;
  noMergeAllowed: true;
  noDeployAllowed: true;
  noPromotionAllowed: true;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const sorted = Object.keys(value).sort();
  return sorted.length === expected.length &&
    [...expected].sort().every((key: string, index: number) =>
      sorted[index] === key
    );
}

function invalidShape(): never {
  throw new Error("codex_dossier_invalid_shape");
}

function invalidValue(): never {
  throw new Error("codex_dossier_invalid_value");
}

function invalidRejection(): never {
  throw new Error("codex_dossier_invalid_rejection");
}

function assertText(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") invalidValue();
  return value.trim();
}

function assertString(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value) invalidValue();
  return value;
}

function assertTextWithBytes(value: unknown, maxBytes: number): string {
  const normalized = assertText(value);
  if (ENCODER.encode(normalized).length > maxBytes) invalidValue();
  return normalized;
}

function assertIssue(value: unknown): IssueReference {
  if (!isRecord(value) || !exact(value, ["issueId", "title"])) invalidShape();
  const issueId = assertText(value.issueId);
  const title = sanitizeTestingCenterTesterText(assertText(value.title), 280);
  if (!/^issue_[0-9a-f]{64}$/.test(issueId) || title.value.length > 140) {
    invalidValue();
  }
  return { issueId, title: title.value };
}

function assertCandidate(value: unknown): DossierCandidate {
  if (
    !isRecord(value) || !exact(value, [
      "candidateId",
      "channel",
      "appVersion",
      "candidateSha",
    ])
  ) invalidShape();
  const channel = assertText(value.channel);
  if (!["nightly", "testers"].includes(channel)) invalidValue();
  const candidateId = assertTextWithBytes(value.candidateId, 100);
  const appVersion = assertTextWithBytes(value.appVersion, 32);
  const candidateSha = assertText(value.candidateSha);
  if (
    !/^[A-Za-z0-9._-]{1,64}$/.test(candidateId) ||
    !IDENTIFIER.test(candidateSha)
  ) invalidValue();
  return {
    candidateId,
    channel: channel as TestingCenterChannel,
    appVersion,
    candidateSha,
  };
}

function assertRepository(value: unknown): DossierRepository {
  if (!isRecord(value) || !exact(value, ["owner", "name", "environment"])) {
    invalidShape();
  }
  const owner = assertText(value.owner);
  const name = assertText(value.name);
  const environment = assertText(value.environment);
  if (
    owner !== REPO_OWNER || name !== REPO_NAME ||
    environment !== "vantare-codex-cloud"
  ) {
    invalidValue();
  }
  return {
    owner: REPO_OWNER,
    name: REPO_NAME,
    environment: environment as DossierRepository["environment"],
  };
}

function assertPath(path: string): void {
  if (
    path.length < 4 || path.length > MAX_PATH_BYTES ||
    path.startsWith("/") || /^[A-Za-z]:\\/.test(path) ||
    path.includes("..") || /(^|\/)\.\.(\/|$)/.test(path) ||
    !ALLOWED_PATH_RE.test(path)
  ) invalidValue();
}

function noForbiddenWords(value: string): boolean {
  return rawContains([value], FORBIDDEN_WORDS);
}

function hasReplayReference(value: string): boolean {
  return value.includes("testing-center/report/") ||
    value.includes("http://") ||
    value.includes("https://");
}

function parseInput(
  raw: unknown,
  verifiedContext: TestingCenterVerifiedValidationContext,
): Raw {
  let encodedInput: Uint8Array;
  try {
    encodedInput = ENCODER.encode(JSON.stringify(raw));
  } catch (_error) {
    invalidShape();
  }
  if (encodedInput.length > MAX_DOSSIER_BYTES) invalidValue();
  if (
    !isRecord(raw) ||
    !exact(raw, [
      "contractVersion",
      "originalIssue",
      "subIssue",
      "rejection",
      "candidate",
      "repository",
      "targetBranch",
      "nightlyHeadSha",
      "prBaseRef",
      "basePrSha",
      "criteria",
      "evidence",
      "files",
      "commandIds",
    ]) ||
    !isRecord(raw.evidence) ||
    !exact(raw.evidence, ["text", "redactedValues", "truncatedFields"])
  ) {
    invalidShape();
  }
  if (
    assertText(raw.contractVersion) !== TESTING_CENTER_CODEX_DOSSIER_VERSION ||
    !Array.isArray(raw.criteria) ||
    !Array.isArray(raw.files) ||
    !Array.isArray(raw.commandIds)
  ) {
    invalidValue();
  }
  if (raw.prBaseRef !== "nightly") invalidValue();
  if (
    raw.criteria.length > 10 || raw.files.length > MAX_FILES ||
    raw.commandIds.length > MAX_COMMAND_IDS
  ) invalidValue();
  if (
    typeof raw.evidence.redactedValues !== "number" ||
    typeof raw.evidence.truncatedFields !== "number"
  ) invalidValue();

  let rejection: RejectionInput;
  try {
    rejection = parseTestingCenterRejection(raw.rejection, verifiedContext);
  } catch (_error) {
    invalidRejection();
  }

  if (rejection.decision !== "rejected") invalidValue();
  return {
    contractVersion: TESTING_CENTER_CODEX_DOSSIER_VERSION,
    originalIssue: assertIssue(raw.originalIssue),
    subIssue: assertIssue(raw.subIssue),
    rejection,
    candidate: assertCandidate(raw.candidate),
    repository: assertRepository(raw.repository),
    targetBranch: assertString(raw.targetBranch),
    nightlyHeadSha: assertString(raw.nightlyHeadSha),
    prBaseRef: "nightly",
    basePrSha: assertString(raw.basePrSha),
    criteria: raw.criteria.map((value) =>
      assertTextWithBytes(value, MAX_CRITERIA_BYTES)
    ),
    evidence: {
      text: assertString(raw.evidence.text),
      redactedValues: raw.evidence.redactedValues as number,
      truncatedFields: raw.evidence.truncatedFields as number,
    },
    files: raw.files.map((value) => assertText(value as unknown)),
    commandIds: raw.commandIds.map((value) => assertText(value as unknown)),
  };
}

export async function buildTestingCenterCodexDossier(
  raw: unknown,
  verifiedContext: TestingCenterVerifiedValidationContext,
): Promise<TestingCenterCodexDossier> {
  const input = parseInput(raw, verifiedContext);
  const reasons: string[] = [];
  const evidenceRaw = input.evidence.text;
  const evidence = sanitizeTestingCenterTesterText(
    evidenceRaw,
    MAX_EVIDENCE_BYTES,
  );

  if (
    input.repository.owner !== REPO_OWNER ||
    input.repository.name !== REPO_NAME
  ) reasons.push("repository_not_server_owned");

  if (input.prBaseRef !== "nightly") reasons.push("base_ref_not_nightly");
  if (
    !/^vantareapp\/isa-[0-9]+-[a-z0-9-]{1,60}$/.test(input.targetBranch)
  ) reasons.push("target_branch_missing_or_invalid");
  if (
    !IDENTIFIER.test(input.nightlyHeadSha) || !IDENTIFIER.test(input.basePrSha)
  ) {
    reasons.push("invalid_nightly_head_or_base_sha");
  }
  if (input.candidate.candidateSha !== input.rejection.candidateSha) {
    reasons.push("candidate_sha_mismatch");
  }
  if (input.candidate.candidateId !== input.rejection.candidateId) {
    reasons.push("candidate_id_mismatch");
  }
  if (input.candidate.channel !== input.rejection.channel) {
    reasons.push("candidate_channel_mismatch");
  }
  if (input.candidate.appVersion !== input.rejection.appVersion) {
    reasons.push("candidate_version_mismatch");
  }
  if (input.nightlyHeadSha !== input.basePrSha) {
    reasons.push("nightly_base_sha_mismatch");
  }
  if (input.originalIssue.issueId !== input.rejection.issueId) {
    reasons.push("original_issue_mismatch");
  }
  if (input.originalIssue.issueId === input.subIssue.issueId) {
    reasons.push("sub_issue_not_distinct");
  }
  if (input.candidate.appVersion.length < 1) {
    reasons.push("invalid_app_version");
  }

  if (input.files.length > MAX_FILES) reasons.push("too_many_files");
  if (input.files.length < 1) reasons.push("missing_files");
  if (new Set(input.files).size !== input.files.length) {
    reasons.push("duplicate_files");
  }
  for (const path of input.files) {
    try {
      assertPath(path);
    } catch (_error) {
      reasons.push("invalid_file_path");
    }
  }

  if (input.criteria.length < 1) reasons.push("missing_criteria");
  for (const criterion of input.criteria) {
    if (criterion.length > 200 || ENCODER.encode(criterion).length < 3) {
      reasons.push("invalid_criterion");
      break;
    }
    if (noForbiddenWords(criterion)) {
      reasons.push("criteria_contains_forbidden_command");
    }
    const sanitizedCriterion = sanitizeTestingCenterTesterText(criterion, 400);
    if (
      sanitizedCriterion.value !== criterion ||
      sanitizedCriterion.redactedValues > 0 || sanitizedCriterion.truncated
    ) {
      reasons.push("criterion_not_server_safe");
    }
  }

  if (
    input.commandIds.length < 1 || input.commandIds.length > MAX_COMMAND_IDS
  ) {
    reasons.push("invalid_command_count");
  } else if (
    !input.commandIds.every((command) =>
      ALLOWED_COMMAND_IDS.includes(command as never)
    )
  ) {
    reasons.push("invalid_command_id");
  } else if (new Set(input.commandIds).size !== input.commandIds.length) {
    reasons.push("duplicate_command");
  }

  if (
    !Number.isSafeInteger(input.evidence.redactedValues) ||
    input.evidence.redactedValues < 0
  ) {
    reasons.push("invalid_evidence_metrics");
  }
  if (
    !Number.isSafeInteger(input.evidence.truncatedFields) ||
    input.evidence.truncatedFields < 0
  ) {
    reasons.push("invalid_evidence_metrics");
  }
  if (hasReplayReference(evidenceRaw) || noForbiddenWords(evidenceRaw)) {
    reasons.push("forbidden_evidence_content");
  }
  if (evidence.truncated) reasons.push("evidence_truncated");
  if (evidenceRaw.length === 0) reasons.push("missing_evidence");
  if (ENCODER.encode(evidence.value).length > MAX_DOSSIER_BYTES) {
    reasons.push("evidence_too_large");
  }
  if (hasReplayReference(evidence.value) || noForbiddenWords(evidence.value)) {
    reasons.push("forbidden_evidence_content");
  }
  if (
    input.rejection.decision !== "rejected" ||
    input.rejection.details === undefined
  ) {
    reasons.push("rejection_missing_details");
  }

  const includesRetryOrReleaseCommand = rawContains([
    ...input.commandIds,
    ...input.criteria,
  ], FORBIDDEN_WORDS);
  if (includesRetryOrReleaseCommand) reasons.push("forbidden_commands");

  const status: TestingCenterCodexDossier["status"] = reasons.length === 0
    ? "complete"
    : "incomplete";
  const rejectionDetails = input.rejection.details!;
  const rejectionDescription = sanitizeTestingCenterTesterText(
    rejectionDetails.description,
    2048,
  );
  const rejectionSteps = sanitizeTestingCenterTesterText(
    rejectionDetails.steps,
    2048,
  );
  const rejectionExpected = sanitizeTestingCenterTesterText(
    rejectionDetails.expected,
    2048,
  );
  const rejectionObserved = sanitizeTestingCenterTesterText(
    rejectionDetails.observed,
    2048,
  );
  const output = {
    contractVersion: TESTING_CENTER_CODEX_DOSSIER_VERSION,
    status,
    dossierIdempotencyKey:
      `${input.originalIssue.issueId}:${input.subIssue.issueId}:${input.nightlyHeadSha}:${input.basePrSha}`,
    dossierDigest: "",
    repository: {
      owner: input.repository.owner,
      name: input.repository.name,
      environment: input.repository.environment,
      targetBranch: input.targetBranch,
    },
    strategy: "sub_issue_new_branch" as const,
    source: {
      originalIssue: input.originalIssue,
      subIssue: input.subIssue,
      candidate: input.candidate,
      channel: input.candidate.channel,
      appVersion: input.candidate.appVersion,
    },
    rejection: {
      category: rejectionDetails.category,
      frequency: rejectionDetails.frequency,
      blocking: rejectionDetails.blocking,
      diagnosticsConsent: rejectionDetails.diagnosticsConsent,
      logsConsent: rejectionDetails.logsConsent,
      description: rejectionDescription.value,
      steps: rejectionSteps.value,
      expected: rejectionExpected.value,
      observed: rejectionObserved.value,
    },
    candidateSha: input.candidate.candidateSha,
    nightlyHeadSha: input.nightlyHeadSha,
    prBaseRef: input.prBaseRef,
    basePrSha: input.basePrSha,
    criteria: [...new Set(input.criteria)],
    evidence: evidence.value,
    evidenceDigest: "",
    evidenceRedactedValues: input.evidence.redactedValues +
      evidence.redactedValues + rejectionDescription.redactedValues +
      rejectionSteps.redactedValues + rejectionExpected.redactedValues +
      rejectionObserved.redactedValues,
    evidenceTruncatedFields: input.evidence.truncatedFields +
      (evidence.truncated ? 1 : 0),
    files: [...new Set(input.files)].slice(0, MAX_FILES),
    commandIds: [...input.commandIds],
    incompleteReasons: Array.from(new Set(reasons)),
    hasReplayUrl: false as const,
    includesRetryOrReleaseCommand,
    noRetryAllowed: true as const,
    noMergeAllowed: true as const,
    noDeployAllowed: true as const,
    noPromotionAllowed: true as const,
  };
  const evidenceDigest = await sha256Hex(
    JSON.stringify({
      originalIssue: output.source.originalIssue,
      subIssue: output.source.subIssue,
      candidate: output.source.candidate,
      rejection: {
        contractVersion: input.rejection.contractVersion,
        issueId: input.rejection.issueId,
        candidateId: input.rejection.candidateId,
        decision: input.rejection.decision,
        details: output.rejection,
      },
      repository: output.repository,
      prBaseRef: output.prBaseRef,
      nightlyHeadSha: output.nightlyHeadSha,
      basePrSha: output.basePrSha,
      criteria: output.criteria,
      files: output.files,
      commandIds: output.commandIds,
      evidence: evidence.value,
      evidenceRedactedValues: output.evidenceRedactedValues,
      evidenceTruncatedFields: output.evidenceTruncatedFields,
      incompleteReasons: output.incompleteReasons,
      status: output.status,
    }),
  );
  output.evidenceDigest = evidenceDigest;
  if (
    ENCODER.encode(JSON.stringify({
      ...output,
      dossierDigest: "0".repeat(64),
    })).length > MAX_DOSSIER_BYTES
  ) {
    invalidValue();
  }
  output.dossierDigest = await sha256Hex(JSON.stringify(output));
  return output;
}

function rawContains(values: string[], forbidden: string[]): boolean {
  return values.some((candidate) =>
    forbidden.some((word) => new RegExp(`\\b${word}\\b`, "i").test(candidate))
  );
}
