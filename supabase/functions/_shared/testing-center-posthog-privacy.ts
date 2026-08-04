import { sha256Hex } from "./testing-center-projection-sanitization.ts";

export const TESTING_CENTER_POSTHOG_EVIDENCE_VERSION =
  "testing-center.posthog-evidence.v1" as const;

const CHANNELS = ["nightly", "testers"] as const;
const MODULES = [
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
] as const;
const FAULT_SOURCES = ["frontend", "backend"] as const;
const FAULT_CODES = [
  "frontend.unhandled.exception",
  "frontend.operation.failed",
  "backend.operation.failed",
  "testing_center.submit.failed",
] as const;
const ERROR_NAMES = [
  "Error",
  "AggregateError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "BackendFailure",
] as const;
const OS_RELEASES = ["windows_10", "windows_11"] as const;
const REPLAY_HOSTS = new Set(["eu.posthog.com", "us.posthog.com"]);
const ENCODER = new TextEncoder();
const REPORT_ID = /^report_[0-9a-f]{64}$/;
const CORRELATION_ID = /^correlation_[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;
const APP_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/;
const REPLAY_SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/;

type RecordValue = Record<string, unknown>;
type Channel = (typeof CHANNELS)[number];
type Module = (typeof MODULES)[number];
type FaultSource = (typeof FAULT_SOURCES)[number];
type FaultCode = (typeof FAULT_CODES)[number];
type ErrorName = (typeof ERROR_NAMES)[number];
type OsRelease = (typeof OS_RELEASES)[number];

export const TESTING_CENTER_POSTHOG_BROWSER_POLICY = Object.freeze({
  initAfterExplicitConsent: true,
  autocapture: false,
  capturePageview: false,
  capturePageleave: false,
  captureExceptionsAutomatically: false,
  capturePerformance: false,
  captureConsoleLogs: false,
  identifyUsers: false,
  persistence: "memory",
  sessionRecordingStartsDisabled: true,
  disableSurveys: true,
  disableExternalDependencyLoading: true,
  sessionRecording: Object.freeze({
    maskAllInputs: true,
    maskTextSelector: "*",
    recordHeaders: false,
    recordBody: false,
    recordCrossOriginIframes: false,
    recordCanvas: false,
  }),
});

export type TestingCenterPostHogCaptureInput = {
  contractVersion: typeof TESTING_CENTER_POSTHOG_EVIDENCE_VERSION;
  reportId: string;
  correlationId: string;
  channel: Channel;
  appVersion: string;
  candidateSha: string;
  osFamily: "windows";
  osRelease: OsRelease;
  module: Module;
  faultSource: FaultSource;
  faultCode: FaultCode;
  errorName: ErrorName;
  diagnosticsConsent: boolean;
  replayConsent: boolean;
  replaySessionId: string | null;
  restrictedReplayUrl: string | null;
};

export type TestingCenterPostHogVerifiedContext = {
  reportId: string;
  channel: Channel;
  appVersion: string;
  candidateSha: string;
  osFamily: "windows";
  osRelease: OsRelease;
  module: Module;
  faultSource: FaultSource;
  faultCode: FaultCode;
  errorName: ErrorName;
  diagnosticsAvailable: boolean;
};

export type TestingCenterPostHogEvidenceProjection = {
  contractVersion: typeof TESTING_CENTER_POSTHOG_EVIDENCE_VERSION;
  operation: "prepare_posthog_evidence";
  reportId: string;
  correlationId: string;
  channel: Channel;
  appVersion: string;
  candidateSha: string;
  osFamily: "windows";
  osRelease: OsRelease;
  module: Module;
  faultSource: FaultSource;
  faultCode: string;
  errorName: ErrorName;
  diagnosticsConsent: true;
  replayConsent: boolean;
  replayAvailable: boolean;
  replaySessionId: string | null;
  restrictedReplayUrl: string | null;
  errorRetentionDays: 30;
  replayRetentionDays: 7;
  noPersonProfile: true;
  noRawMessage: true;
  noRawStack: true;
  noLogs: true;
  noCodexAuthority: true;
  noPromotionAuthority: true;
  projectionDigest: string;
};

export interface TestingCenterPostHogCapturePort {
  captureEvidence(
    projection: TestingCenterPostHogEvidenceProjection,
  ): Promise<boolean>;
}

export type TestingCenterPostHogBestEffortResult = {
  status: "captured" | "skipped_no_consent" | "unavailable";
  reportSubmissionAllowed: true;
  codexAuthorized: false;
  promotionAuthorized: false;
  projectionDigest: string | null;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: RecordValue, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    sortedExpected.every((key, index) => actual[index] === key);
}

function invalid(): never {
  throw new Error("testing_center_posthog_evidence_invalid");
}

function exactString<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function patterned(value: unknown, pattern: RegExp, maxBytes: number): string {
  if (
    typeof value !== "string" || value !== value.trim() ||
    ENCODER.encode(value).length > maxBytes || !pattern.test(value)
  ) invalid();
  return value;
}

function restrictedReplayUrl(
  value: unknown,
  expectedSessionId: string,
): string {
  if (typeof value !== "string" || ENCODER.encode(value).length > 512) {
    invalid();
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid();
  }
  if (
    url.protocol !== "https:" || !REPLAY_HOSTS.has(url.hostname) ||
    url.username !== "" || url.password !== "" || url.port !== "" ||
    url.search !== "" || url.hash !== "" ||
    !new RegExp(`^/project/[0-9]+/replay/${expectedSessionId}$`).test(
      url.pathname,
    )
  ) invalid();
  return url.toString();
}

function parseInput(value: unknown): TestingCenterPostHogCaptureInput {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "appVersion",
      "candidateSha",
      "channel",
      "contractVersion",
      "correlationId",
      "diagnosticsConsent",
      "errorName",
      "faultCode",
      "faultSource",
      "module",
      "osFamily",
      "osRelease",
      "replayConsent",
      "replaySessionId",
      "reportId",
      "restrictedReplayUrl",
    ]) ||
    value.contractVersion !== TESTING_CENTER_POSTHOG_EVIDENCE_VERSION ||
    value.osFamily !== "windows" ||
    typeof value.diagnosticsConsent !== "boolean" ||
    typeof value.replayConsent !== "boolean"
  ) invalid();

  const replayConsent = value.replayConsent;
  const replaySessionId = value.replaySessionId === null
    ? null
    : patterned(value.replaySessionId, REPLAY_SESSION_ID, 64);
  const replayUrl = value.restrictedReplayUrl === null
    ? null
    : restrictedReplayUrl(value.restrictedReplayUrl, replaySessionId ?? "");
  if (replayConsent !== (replaySessionId !== null && replayUrl !== null)) {
    invalid();
  }

  return {
    contractVersion: TESTING_CENTER_POSTHOG_EVIDENCE_VERSION,
    reportId: patterned(value.reportId, REPORT_ID, 71),
    correlationId: patterned(value.correlationId, CORRELATION_ID, 76),
    channel: exactString(value.channel, CHANNELS),
    appVersion: patterned(value.appVersion, APP_VERSION, 32),
    candidateSha: patterned(value.candidateSha, SHA, 40),
    osFamily: "windows",
    osRelease: exactString(value.osRelease, OS_RELEASES),
    module: exactString(value.module, MODULES),
    faultSource: exactString(value.faultSource, FAULT_SOURCES),
    faultCode: exactString(value.faultCode, FAULT_CODES),
    errorName: exactString(value.errorName, ERROR_NAMES),
    diagnosticsConsent: value.diagnosticsConsent,
    replayConsent,
    replaySessionId,
    restrictedReplayUrl: replayUrl,
  };
}

function assertVerifiedContext(
  input: TestingCenterPostHogCaptureInput,
  context: TestingCenterPostHogVerifiedContext,
): void {
  if (
    input.reportId !== context.reportId || input.channel !== context.channel ||
    input.appVersion !== context.appVersion ||
    input.candidateSha !== context.candidateSha ||
    input.osFamily !== context.osFamily ||
    input.osRelease !== context.osRelease ||
    input.module !== context.module ||
    input.faultSource !== context.faultSource ||
    input.faultCode !== context.faultCode ||
    input.errorName !== context.errorName ||
    input.diagnosticsConsent !== context.diagnosticsAvailable
  ) invalid();
}

function projectionSource(
  input: TestingCenterPostHogCaptureInput,
): Omit<TestingCenterPostHogEvidenceProjection, "projectionDigest"> {
  return {
    contractVersion: TESTING_CENTER_POSTHOG_EVIDENCE_VERSION,
    operation: "prepare_posthog_evidence",
    reportId: input.reportId,
    correlationId: input.correlationId,
    channel: input.channel,
    appVersion: input.appVersion,
    candidateSha: input.candidateSha,
    osFamily: input.osFamily,
    osRelease: input.osRelease,
    module: input.module,
    faultSource: input.faultSource,
    faultCode: input.faultCode,
    errorName: input.errorName,
    diagnosticsConsent: true,
    replayConsent: input.replayConsent,
    replayAvailable: input.replayConsent,
    replaySessionId: input.replaySessionId,
    restrictedReplayUrl: input.restrictedReplayUrl,
    errorRetentionDays: 30,
    replayRetentionDays: 7,
    noPersonProfile: true,
    noRawMessage: true,
    noRawStack: true,
    noLogs: true,
    noCodexAuthority: true,
    noPromotionAuthority: true,
  };
}

export async function buildTestingCenterPostHogEvidence(
  raw: unknown,
  verifiedContext: TestingCenterPostHogVerifiedContext,
): Promise<TestingCenterPostHogEvidenceProjection | null> {
  const input = parseInput(raw);
  assertVerifiedContext(input, verifiedContext);
  if (!input.diagnosticsConsent) return null;
  const source = projectionSource(input);
  return {
    ...source,
    projectionDigest: await sha256Hex(JSON.stringify(source)),
  };
}

export async function verifyTestingCenterPostHogEvidence(
  value: unknown,
): Promise<boolean> {
  if (
    !isRecord(value) || !exactKeys(value, [
      "appVersion",
      "candidateSha",
      "channel",
      "contractVersion",
      "correlationId",
      "diagnosticsConsent",
      "errorName",
      "errorRetentionDays",
      "faultCode",
      "faultSource",
      "module",
      "noCodexAuthority",
      "noLogs",
      "noPersonProfile",
      "noPromotionAuthority",
      "noRawMessage",
      "noRawStack",
      "operation",
      "osFamily",
      "osRelease",
      "projectionDigest",
      "replayAvailable",
      "replayConsent",
      "replayRetentionDays",
      "replaySessionId",
      "reportId",
      "restrictedReplayUrl",
    ])
  ) return false;
  try {
    const projection = value as TestingCenterPostHogEvidenceProjection;
    if (
      projection.operation !== "prepare_posthog_evidence" ||
      projection.diagnosticsConsent !== true ||
      projection.errorRetentionDays !== 30 ||
      projection.replayRetentionDays !== 7 ||
      projection.noPersonProfile !== true || projection.noRawMessage !== true ||
      projection.noRawStack !== true || projection.noLogs !== true ||
      projection.noCodexAuthority !== true ||
      projection.noPromotionAuthority !== true ||
      projection.replayAvailable !== projection.replayConsent ||
      !/^[0-9a-f]{64}$/.test(projection.projectionDigest)
    ) return false;
    const { projectionDigest, ...source } = projection;
    return projectionDigest === await sha256Hex(JSON.stringify(source));
  } catch {
    return false;
  }
}

export async function captureTestingCenterPostHogBestEffort(
  projection: TestingCenterPostHogEvidenceProjection | null,
  port: TestingCenterPostHogCapturePort,
): Promise<TestingCenterPostHogBestEffortResult> {
  if (projection === null) {
    return {
      status: "skipped_no_consent",
      reportSubmissionAllowed: true,
      codexAuthorized: false,
      promotionAuthorized: false,
      projectionDigest: null,
    };
  }
  try {
    const captured = await port.captureEvidence(projection);
    return {
      status: captured ? "captured" : "unavailable",
      reportSubmissionAllowed: true,
      codexAuthorized: false,
      promotionAuthorized: false,
      projectionDigest: projection.projectionDigest,
    };
  } catch {
    return {
      status: "unavailable",
      reportSubmissionAllowed: true,
      codexAuthorized: false,
      promotionAuthorized: false,
      projectionDigest: projection.projectionDigest,
    };
  }
}
