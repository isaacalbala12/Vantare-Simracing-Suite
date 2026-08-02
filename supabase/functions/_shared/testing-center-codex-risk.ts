export const CODEX_RISK_POLICY_VERSION =
  "testing-center.codex-risk.v1" as const;

const SAFE_SURFACES = [
  "frontend.presentation",
  "frontend.local_state",
] as const;
const SENSITIVE_FLAGS = [
  "security",
  "privacy",
  "auth",
  "permissions",
  "secrets",
  "billing_or_licensing",
  "data_loss_or_corruption",
  "migration",
  "workflow_or_release",
  "dependency_change",
  "architecture_change",
  "mass_edit",
] as const;

export type CodexRiskInput = {
  contractVersion: typeof CODEX_RISK_POLICY_VERSION;
  technicalIssueId: string;
  reportId: string;
  completeness: "complete" | "incomplete";
  reproduction: "deterministic" | "intermittent" | "unknown";
  trustedSurface: (typeof SAFE_SURFACES)[number] | "unknown";
  affectedModuleCount: number;
  estimatedFileCount: number;
  existingRegressionHarness: boolean;
  priorAutomaticAttempts: number;
  testerRejections: number;
  sensitive: Record<(typeof SENSITIVE_FLAGS)[number], boolean>;
  untrustedEvidence: string;
};

export type CodexRiskDecision = {
  contractVersion: typeof CODEX_RISK_POLICY_VERSION;
  decision: "eligible" | "needs_owner";
  reasonCodes: string[];
  policyDigest: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("|") === keys.sort().join("|");
}
function invalid(): never {
  throw new Error("codex_risk_input_invalid");
}

export function parseCodexRiskInput(value: unknown): CodexRiskInput {
  const keys = [
    "contractVersion",
    "technicalIssueId",
    "reportId",
    "completeness",
    "reproduction",
    "trustedSurface",
    "affectedModuleCount",
    "estimatedFileCount",
    "existingRegressionHarness",
    "priorAutomaticAttempts",
    "testerRejections",
    "sensitive",
    "untrustedEvidence",
  ];
  if (
    !record(value) || !exact(value, keys) || !record(value.sensitive) ||
    !exact(value.sensitive, [...SENSITIVE_FLAGS])
  ) invalid();
  if (
    value.contractVersion !== CODEX_RISK_POLICY_VERSION ||
    typeof value.technicalIssueId !== "string" ||
    !/^issue_[0-9a-f]{64}$/.test(value.technicalIssueId) ||
    typeof value.reportId !== "string" ||
    !/^report_[0-9a-f]{64}$/.test(value.reportId) ||
    !["complete", "incomplete"].includes(value.completeness as string) ||
    !["deterministic", "intermittent", "unknown"].includes(
      value.reproduction as string,
    ) ||
    ![...SAFE_SURFACES, "unknown"].includes(value.trustedSurface as never) ||
    typeof value.existingRegressionHarness !== "boolean" ||
    typeof value.untrustedEvidence !== "string" ||
    new TextEncoder().encode(value.untrustedEvidence).length > 8192
  ) invalid();
  for (const key of SENSITIVE_FLAGS) {
    if (typeof value.sensitive[key] !== "boolean") invalid();
  }
  for (
    const [field, max] of [
      ["affectedModuleCount", 16],
      ["estimatedFileCount", 1000],
      ["priorAutomaticAttempts", 2],
      ["testerRejections", 2],
    ] as const
  ) {
    const candidate = value[field];
    if (
      typeof candidate !== "number" || !Number.isSafeInteger(candidate) ||
      candidate < 0 || candidate > max
    ) invalid();
  }
  return value as CodexRiskInput;
}

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function canonicalSensitiveFlags(
  sensitive: CodexRiskInput["sensitive"],
): CodexRiskInput["sensitive"] {
  return Object.fromEntries(
    SENSITIVE_FLAGS.map((flag) => [flag, sensitive[flag]]),
  ) as CodexRiskInput["sensitive"];
}

export async function classifyCodexRisk(
  raw: unknown,
): Promise<CodexRiskDecision> {
  const input = parseCodexRiskInput(raw);
  const reasons: string[] = [];
  if (input.completeness !== "complete") reasons.push("report_incomplete");
  if (input.reproduction !== "deterministic") {
    reasons.push("reproduction_not_deterministic");
  }
  if (!SAFE_SURFACES.includes(input.trustedSurface as never)) {
    reasons.push("surface_not_allowlisted");
  }
  if (input.affectedModuleCount !== 1) reasons.push("scope_multiple_modules");
  if (input.estimatedFileCount < 1 || input.estimatedFileCount > 5) {
    reasons.push("scope_too_large_or_unknown");
  }
  if (!input.existingRegressionHarness) {
    reasons.push("regression_harness_missing");
  }
  if (input.priorAutomaticAttempts > 0) {
    reasons.push("automatic_attempt_already_used");
  }
  if (input.testerRejections > 0) {
    reasons.push("tester_rejection_requires_owner");
  }
  for (const flag of SENSITIVE_FLAGS) {
    if (input.sensitive[flag]) reasons.push(`sensitive_${flag}`);
  }
  reasons.sort();
  const decision = reasons.length === 0 ? "eligible" : "needs_owner";
  return {
    contractVersion: CODEX_RISK_POLICY_VERSION,
    decision,
    reasonCodes: reasons,
    policyDigest: await digest(
      JSON.stringify({
        version: CODEX_RISK_POLICY_VERSION,
        decision,
        reasons,
        issue: input.technicalIssueId,
        report: input.reportId,
        trustedFacts: {
          completeness: input.completeness,
          reproduction: input.reproduction,
          trustedSurface: input.trustedSurface,
          affectedModuleCount: input.affectedModuleCount,
          estimatedFileCount: input.estimatedFileCount,
          existingRegressionHarness: input.existingRegressionHarness,
          priorAutomaticAttempts: input.priorAutomaticAttempts,
          testerRejections: input.testerRejections,
          sensitive: canonicalSensitiveFlags(input.sensitive),
        },
      }),
    ),
  };
}
