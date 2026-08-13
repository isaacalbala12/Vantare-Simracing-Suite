export const TESTING_CENTER_AGENT_JOB_VERSION =
  "testing-center.agent-job.v2" as const;
export const TESTING_CENTER_AUTOFIX_POLICY_VERSION =
  "testing-center.autofix-policy.v2" as const;

const CLASSIFICATIONS = [
  "bug",
  "duplicate",
  "needs_info",
  "ineligible",
] as const;
const ALLOWED_FAMILIES = ["testing-center-ui-state"] as const;
const RISKS = ["low", "medium", "high"] as const;
const ALLOWED_COMMAND_IDS = [
  "go.test.focal",
  "frontend.test.focal",
  "frontend.visual.testing-center",
] as const;
const VISUAL_GATES = ["blocking", "advisory", "not_applicable"] as const;
const MAX_CRITERIA = 10;
const MAX_FILES = 5;
const MAX_CRITERION_LENGTH = 500;
const MAX_PATH_LENGTH = 240;
const MAX_TESTER_TEXT_LENGTH = 8192;
const MAX_MODEL_OUTPUT_LENGTH = 32768;
const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const ISSUE_ID = /^issue_[0-9a-f]{64}$/;
const SAFE_PATH_CHARS = /^[a-z0-9._/-]+$/;
const PRODUCT_EXTENSION = /\.(?:css|go|ts|tsx)$/;
const TEST_FILE = /(?:\.(?:spec|test)\.(?:ts|tsx)|_test\.go)$/;
const FORBIDDEN_PREFIXES = [
  ".github/",
  "supabase/migrations/",
  "supabase/rollbacks/",
  "vantare-v2/docs/",
] as const;
const DEPENDENCY_FILES = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "cargo.toml",
  "deno.json",
  "deno.jsonc",
  "go.mod",
  "go.sum",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
]);
const ENCODER = new TextEncoder();

const AGENT_JOB_KEYS = [
  "contractVersion",
  "jobKey",
  "technicalIssueId",
  "reportDigest",
  "dossierDigest",
  "nightlyBaseSha",
  "reservedNightlyHeadSha",
  "executionGeneration",
  "classification",
  "duplicateOf",
  "family",
  "risk",
  "reproductionComplete",
  "reproductionDeterministic",
  "acceptanceCriteria",
  "files",
  "redTestCommandId",
  "baseMatchesNightly",
  "blockingGatesAvailable",
  "requiresDependency",
  "requiresMigration",
  "requiresAuth",
  "requiresBilling",
  "requiresSecrets",
  "requiresPermissions",
  "requiresWorkflow",
  "requiresRelease",
  "requiresGovernance",
  "requiresArchitecture",
  "requiresDeletion",
  "activePathOverlap",
  "visualChange",
  "visualGate",
  "untrustedTesterText",
  "untrustedModelOutput",
] as const;

const BOOLEAN_KEYS = [
  "reproductionComplete",
  "reproductionDeterministic",
  "baseMatchesNightly",
  "blockingGatesAvailable",
  "requiresDependency",
  "requiresMigration",
  "requiresAuth",
  "requiresBilling",
  "requiresSecrets",
  "requiresPermissions",
  "requiresWorkflow",
  "requiresRelease",
  "requiresGovernance",
  "requiresArchitecture",
  "requiresDeletion",
  "activePathOverlap",
  "visualChange",
] as const;

export type AgentJob = {
  contractVersion: typeof TESTING_CENTER_AGENT_JOB_VERSION;
  jobKey: string;
  technicalIssueId: string;
  reportDigest: string;
  dossierDigest: string;
  nightlyBaseSha: string;
  reservedNightlyHeadSha: string;
  executionGeneration: 1;
  classification: (typeof CLASSIFICATIONS)[number];
  duplicateOf: string | null;
  family: (typeof ALLOWED_FAMILIES)[number];
  risk: (typeof RISKS)[number];
  reproductionComplete: boolean;
  reproductionDeterministic: boolean;
  acceptanceCriteria: readonly string[];
  files: readonly string[];
  redTestCommandId: (typeof ALLOWED_COMMAND_IDS)[number];
  baseMatchesNightly: boolean;
  blockingGatesAvailable: boolean;
  requiresDependency: boolean;
  requiresMigration: boolean;
  requiresAuth: boolean;
  requiresBilling: boolean;
  requiresSecrets: boolean;
  requiresPermissions: boolean;
  requiresWorkflow: boolean;
  requiresRelease: boolean;
  requiresGovernance: boolean;
  requiresArchitecture: boolean;
  requiresDeletion: boolean;
  activePathOverlap: boolean;
  visualChange: boolean;
  visualGate: (typeof VISUAL_GATES)[number];
  untrustedTesterText: string;
  untrustedModelOutput: string;
};

export type EligibilityReason =
  | "acceptance_missing"
  | "active_path_overlap"
  | "architecture_change"
  | "auth_change"
  | "billing_change"
  | "blocking_gate_missing"
  | "blocking_visual_gate_missing"
  | "classification_not_bug"
  | "command_not_allowed"
  | "deletion_change"
  | "dependency_change"
  | "duplicate_detected"
  | "duplicate_file"
  | "family_not_allowed"
  | "file_budget_invalid"
  | "forbidden_path"
  | "governance_change"
  | "migration_change"
  | "nightly_base_mismatch"
  | "permission_change"
  | "release_change"
  | "reproduction_incomplete"
  | "reproduction_not_deterministic"
  | "risk_not_low"
  | "secret_change"
  | "visual_gate_mismatch"
  | "workflow_change";

export type EligibilityDecision = {
  eligible: boolean;
  reasons: EligibilityReason[];
};

type RecordValue = Record<string, unknown>;

function invalid(): never {
  throw new Error("testing_center_agent_job_invalid");
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: RecordValue): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...AGENT_JOB_KEYS].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function hasLengthAtMost(value: string, maximum: number): boolean {
  return Array.from(value).length <= maximum;
}

function isUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isStrictText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.trim() === value && hasLengthAtMost(value, maximumLength);
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" &&
    hasLengthAtMost(value, maximumLength);
}

function isCanonicalProductPath(path: string): boolean {
  const lower = path.toLowerCase();
  const segments = path.split("/");
  const basename = segments.at(-1)?.toLowerCase() ?? "";
  return path.length >= 4 &&
    hasLengthAtMost(path, MAX_PATH_LENGTH) &&
    SAFE_PATH_CHARS.test(path) &&
    !path.startsWith("/") &&
    !/^[A-Za-z]:\//.test(path) &&
    !path.includes("\\") &&
    !path.includes("//") &&
    !segments.some((segment) => segment === "." || segment === "..") &&
    !FORBIDDEN_PREFIXES.some((prefix) => lower.startsWith(prefix)) &&
    !DEPENDENCY_FILES.has(basename) &&
    PRODUCT_EXTENSION.test(lower) &&
    !TEST_FILE.test(lower);
}

export function parseAgentJob(value: unknown): AgentJob {
  if (!isRecord(value) || !hasExactKeys(value)) invalid();
  if (
    value.contractVersion !== TESTING_CENTER_AGENT_JOB_VERSION ||
    typeof value.jobKey !== "string" || !HEX_64.test(value.jobKey) ||
    typeof value.technicalIssueId !== "string" ||
    !ISSUE_ID.test(value.technicalIssueId) ||
    typeof value.reportDigest !== "string" ||
    !HEX_64.test(value.reportDigest) ||
    typeof value.dossierDigest !== "string" ||
    !HEX_64.test(value.dossierDigest) ||
    typeof value.nightlyBaseSha !== "string" ||
    !HEX_40.test(value.nightlyBaseSha) ||
    typeof value.reservedNightlyHeadSha !== "string" ||
    !HEX_40.test(value.reservedNightlyHeadSha) ||
    value.executionGeneration !== 1 ||
    !CLASSIFICATIONS.includes(value.classification as never) ||
    !ALLOWED_FAMILIES.includes(value.family as never) ||
    !RISKS.includes(value.risk as never) ||
    !ALLOWED_COMMAND_IDS.includes(value.redTestCommandId as never) ||
    !VISUAL_GATES.includes(value.visualGate as never)
  ) invalid();

  if (
    value.duplicateOf !== null &&
    (typeof value.duplicateOf !== "string" || !ISSUE_ID.test(value.duplicateOf))
  ) invalid();
  if (
    (value.classification === "duplicate") !== (value.duplicateOf !== null)
  ) invalid();
  for (const key of BOOLEAN_KEYS) {
    if (typeof value[key] !== "boolean") invalid();
  }
  if (
    !Array.isArray(value.acceptanceCriteria) ||
    value.acceptanceCriteria.length < 1 ||
    value.acceptanceCriteria.length > MAX_CRITERIA ||
    !value.acceptanceCriteria.every((item) =>
      isStrictText(item, MAX_CRITERION_LENGTH)
    ) ||
    !isUnique(value.acceptanceCriteria as string[])
  ) invalid();
  if (
    !Array.isArray(value.files) || value.files.length < 1 ||
    value.files.length > MAX_FILES ||
    !value.files.every((path) =>
      typeof path === "string" && isCanonicalProductPath(path)
    ) ||
    !isUnique(value.files as string[])
  ) invalid();
  if (
    !isBoundedText(value.untrustedTesterText, MAX_TESTER_TEXT_LENGTH) ||
    !isBoundedText(value.untrustedModelOutput, MAX_MODEL_OUTPUT_LENGTH)
  ) invalid();
  const snapshot = {
    ...value,
    acceptanceCriteria: Object.freeze([
      ...(value.acceptanceCriteria as string[]),
    ]),
    files: Object.freeze([...(value.files as string[])]),
  } as unknown as AgentJob;
  return Object.freeze(snapshot);
}

export function decideEligibility(job: AgentJob): EligibilityDecision {
  const reasons: EligibilityReason[] = [];
  if (job.classification !== "bug") reasons.push("classification_not_bug");
  if (job.duplicateOf !== null || job.classification === "duplicate") {
    reasons.push("duplicate_detected");
  }
  if (!ALLOWED_FAMILIES.includes(job.family as never)) {
    reasons.push("family_not_allowed");
  }
  if (job.risk !== "low") reasons.push("risk_not_low");
  if (!job.reproductionComplete) reasons.push("reproduction_incomplete");
  if (!job.reproductionDeterministic) {
    reasons.push("reproduction_not_deterministic");
  }
  if (job.acceptanceCriteria.length === 0) reasons.push("acceptance_missing");
  if (job.files.length === 0 || job.files.length > MAX_FILES) {
    reasons.push("file_budget_invalid");
  }
  if (!isUnique(job.files)) reasons.push("duplicate_file");
  if (job.files.some((path) => !isCanonicalProductPath(path))) {
    reasons.push("forbidden_path");
  }
  if (!ALLOWED_COMMAND_IDS.includes(job.redTestCommandId as never)) {
    reasons.push("command_not_allowed");
  }
  if (
    !job.baseMatchesNightly ||
    job.nightlyBaseSha !== job.reservedNightlyHeadSha
  ) reasons.push("nightly_base_mismatch");
  if (!job.blockingGatesAvailable) reasons.push("blocking_gate_missing");
  if (job.requiresDependency) reasons.push("dependency_change");
  if (job.requiresMigration) reasons.push("migration_change");
  if (job.requiresAuth) reasons.push("auth_change");
  if (job.requiresBilling) reasons.push("billing_change");
  if (job.requiresSecrets) reasons.push("secret_change");
  if (job.requiresPermissions) reasons.push("permission_change");
  if (job.requiresWorkflow) reasons.push("workflow_change");
  if (job.requiresRelease) reasons.push("release_change");
  if (job.requiresGovernance) reasons.push("governance_change");
  if (job.requiresArchitecture) reasons.push("architecture_change");
  if (job.requiresDeletion) reasons.push("deletion_change");
  if (job.activePathOverlap) reasons.push("active_path_overlap");
  if (job.visualChange && job.visualGate !== "blocking") {
    reasons.push("blocking_visual_gate_missing");
  }
  if (!job.visualChange && job.visualGate !== "not_applicable") {
    reasons.push("visual_gate_mismatch");
  }
  const unique = [...new Set(reasons)].sort();
  return { eligible: unique.length === 0, reasons: unique };
}

export async function computePolicyDigest(job: AgentJob): Promise<string> {
  const trustedFacts = {
    policyVersion: TESTING_CENTER_AUTOFIX_POLICY_VERSION,
    contractVersion: job.contractVersion,
    jobKey: job.jobKey,
    technicalIssueId: job.technicalIssueId,
    reportDigest: job.reportDigest,
    dossierDigest: job.dossierDigest,
    nightlyBaseSha: job.nightlyBaseSha,
    reservedNightlyHeadSha: job.reservedNightlyHeadSha,
    executionGeneration: job.executionGeneration,
    classification: job.classification,
    duplicateOf: job.duplicateOf,
    family: job.family,
    risk: job.risk,
    reproductionComplete: job.reproductionComplete,
    reproductionDeterministic: job.reproductionDeterministic,
    acceptanceCriteria: [...job.acceptanceCriteria].sort(),
    files: [...job.files].sort(),
    redTestCommandId: job.redTestCommandId,
    baseMatchesNightly: job.baseMatchesNightly,
    blockingGatesAvailable: job.blockingGatesAvailable,
    requiresDependency: job.requiresDependency,
    requiresMigration: job.requiresMigration,
    requiresAuth: job.requiresAuth,
    requiresBilling: job.requiresBilling,
    requiresSecrets: job.requiresSecrets,
    requiresPermissions: job.requiresPermissions,
    requiresWorkflow: job.requiresWorkflow,
    requiresRelease: job.requiresRelease,
    requiresGovernance: job.requiresGovernance,
    requiresArchitecture: job.requiresArchitecture,
    requiresDeletion: job.requiresDeletion,
    activePathOverlap: job.activePathOverlap,
    visualChange: job.visualChange,
    visualGate: job.visualGate,
  };
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      ENCODER.encode(JSON.stringify(trustedFacts)),
    ),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
