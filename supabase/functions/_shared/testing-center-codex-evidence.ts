export const CODEX_EVIDENCE_VERSION =
  "testing-center.codex-evidence.v1" as const;

export type CodexEvidenceInput = {
  contractVersion: typeof CODEX_EVIDENCE_VERSION;
  technicalIssueId: string;
  reportId: string;
  diagnosticPayload: string;
  diagnosticDigest: string;
  diagnosticByteSize: number;
  diagnosticConsent: true;
  logsConsent: boolean;
};

export type VerifiedCodexEvidence = {
  contractVersion: typeof CODEX_EVIDENCE_VERSION;
  technicalIssueId: string;
  reportId: string;
  sourceDiagnosticDigest: string;
  evidenceText: string;
  evidenceDigest: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}
function invalid(): never {
  throw new Error("codex_evidence_invalid");
}
async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

const token = /^[a-z0-9][a-z0-9._+-]{0,63}$/;
const modules = [
  "hub",
  "launcher",
  "settings",
  "overlay_studio",
  "overlay_runtime",
  "telemetry",
  "telemetry_analysis",
  "engineer",
  "strategy",
  "calendar",
  "billing",
  "account",
  "updater",
  "testing_center",
  "unknown",
];

export async function buildVerifiedCodexEvidence(
  input: CodexEvidenceInput,
): Promise<VerifiedCodexEvidence> {
  const bytes = new TextEncoder().encode(input.diagnosticPayload);
  if (
    input.contractVersion !== CODEX_EVIDENCE_VERSION ||
    !/^issue_[0-9a-f]{64}$/.test(input.technicalIssueId) ||
    !/^report_[0-9a-f]{64}$/.test(input.reportId) ||
    input.diagnosticConsent !== true ||
    typeof input.logsConsent !== "boolean" ||
    !Number.isSafeInteger(input.diagnosticByteSize) ||
    input.diagnosticByteSize !== bytes.length || bytes.length > 65536 ||
    !/^[0-9a-f]{64}$/.test(input.diagnosticDigest) ||
    input.diagnosticDigest !== await sha256(input.diagnosticPayload)
  ) invalid();

  let diagnostic: unknown;
  try {
    diagnostic = JSON.parse(input.diagnosticPayload);
  } catch {
    invalid();
  }
  if (
    !record(diagnostic) ||
    !exact(diagnostic, [
      "contractVersion",
      "generatedAtUtc",
      "application",
      "module",
      "errorCode",
      "logs",
      "sanitization",
    ]) || diagnostic.contractVersion !== "testing-center.diagnostic.v1" ||
    typeof diagnostic.generatedAtUtc !== "string" ||
    !record(diagnostic.application) ||
    !exact(diagnostic.application, ["version", "channel", "os", "arch"]) ||
    typeof diagnostic.application.version !== "string" ||
    !token.test(diagnostic.application.version) ||
    !["nightly", "testers"].includes(
      diagnostic.application.channel as string,
    ) ||
    !["windows", "linux", "darwin", "unknown"].includes(
      diagnostic.application.os as string,
    ) ||
    !["amd64", "arm64", "unknown"].includes(
      diagnostic.application.arch as string,
    ) ||
    typeof diagnostic.module !== "string" ||
    !modules.includes(diagnostic.module) ||
    typeof diagnostic.errorCode !== "string" ||
    !token.test(diagnostic.errorCode) ||
    !Array.isArray(diagnostic.logs) || diagnostic.logs.length > 100 ||
    !record(diagnostic.sanitization) ||
    !exact(diagnostic.sanitization, [
      "inputLogs",
      "includedLogs",
      "omittedLogs",
      "redactedValues",
      "truncatedMessages",
    ])
  ) invalid();

  const safeLogs: Array<Record<string, unknown>> = [];
  for (const log of diagnostic.logs) {
    if (
      !record(log) ||
      !exact(log, ["offsetMillis", "source", "level", "code", "message"]) ||
      !Number.isSafeInteger(log.offsetMillis) ||
      (log.offsetMillis as number) < 0 ||
      (log.offsetMillis as number) > 86400000 ||
      !["frontend", "backend", "wails", "runtime"].includes(
        log.source as string,
      ) ||
      !["info", "warn", "error"].includes(log.level as string) ||
      typeof log.code !== "string" || !token.test(log.code) ||
      typeof log.message !== "string" ||
      new TextEncoder().encode(log.message).length > 512
    ) invalid();
    if (input.logsConsent) {
      safeLogs.push({
        offsetMillis: log.offsetMillis,
        source: log.source,
        level: log.level,
      });
    }
  }
  for (const value of Object.values(diagnostic.sanitization)) {
    if (!Number.isSafeInteger(value) || (value as number) < 0) invalid();
  }
  if (diagnostic.sanitization.includedLogs !== diagnostic.logs.length) {
    invalid();
  }

  const projection = {
    contractVersion: CODEX_EVIDENCE_VERSION,
    application: {
      channel: diagnostic.application.channel,
      os: diagnostic.application.os,
      arch: diagnostic.application.arch,
    },
    module: diagnostic.module,
    errorCodePresent: diagnostic.errorCode !== "unknown",
    logs: safeLogs,
    source: {
      diagnosticDigest: input.diagnosticDigest,
      diagnosticByteSize: input.diagnosticByteSize,
      logsIncludedByConsent: input.logsConsent,
    },
  };
  const evidenceText = JSON.stringify(projection);
  return {
    contractVersion: CODEX_EVIDENCE_VERSION,
    technicalIssueId: input.technicalIssueId,
    reportId: input.reportId,
    sourceDiagnosticDigest: input.diagnosticDigest,
    evidenceText,
    evidenceDigest: await sha256(evidenceText),
  };
}

export async function verifyCodexEvidence(
  value: unknown,
): Promise<VerifiedCodexEvidence> {
  if (
    !record(value) ||
    !exact(value, [
      "contractVersion",
      "technicalIssueId",
      "reportId",
      "sourceDiagnosticDigest",
      "evidenceText",
      "evidenceDigest",
    ]) || value.contractVersion !== CODEX_EVIDENCE_VERSION ||
    typeof value.technicalIssueId !== "string" ||
    !/^issue_[0-9a-f]{64}$/.test(value.technicalIssueId) ||
    typeof value.reportId !== "string" ||
    !/^report_[0-9a-f]{64}$/.test(value.reportId) ||
    typeof value.sourceDiagnosticDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.sourceDiagnosticDigest) ||
    typeof value.evidenceText !== "string" ||
    new TextEncoder().encode(value.evidenceText).length > 8192 ||
    typeof value.evidenceDigest !== "string" ||
    value.evidenceDigest !== await sha256(value.evidenceText)
  ) invalid();
  return value as VerifiedCodexEvidence;
}
