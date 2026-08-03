export type TestingCenterChannel = "nightly" | "testers";
export type VantareBuildChannel = TestingCenterChannel | "master";

export const TESTING_CENTER_MODULES = [
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
] as const;

export type TestingCenterModule = (typeof TESTING_CENTER_MODULES)[number];

export type ReportDraftFields = {
  actionText: string;
  expectedText: string;
  observedText: string;
  contextText: string;
  module: TestingCenterModule;
};

export type ReportDraft = ReportDraftFields & {
  schemaVersion: 1;
  idempotencyKey: string;
};

export type DiagnosticPreview = {
  contractVersion: "testing-center.diagnostic.v1";
  payload: string;
  sha256: string;
  byteSize: number;
};

export type DiagnosticEnvironment = {
  appVersion: string;
  osFamily: "windows";
  osVersion: string;
  arch: "amd64" | "arm64";
  availableLogCount: number;
  channel: TestingCenterChannel;
};

export type PreparedReportDiagnostic = {
  preview: DiagnosticPreview;
  environment: DiagnosticEnvironment;
};

export type SubmittedReport = {
  reportId: string;
  reportState: "submitted";
  idempotent: boolean;
  createdAt: string;
};

export class TestingCenterContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestingCenterContractError";
  }
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TestingCenterContractError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactObject(
  value: unknown,
  name: string,
  required: readonly string[],
): Record<string, unknown> {
  const record = object(value, name);
  const allowed = new Set(required);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new TestingCenterContractError(`${name} contains unknown fields`);
  }
  if (required.some((key) => !(key in record))) {
    throw new TestingCenterContractError(`${name} is incomplete`);
  }
  return record;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || value.length > max) {
    throw new TestingCenterContractError(`${name} is invalid`);
  }
  return value;
}

function requestId(value: unknown): string {
  const result = text(value, "requestId", 64);
  if (result.length < 8 || !/^[A-Za-z0-9_-]+$/u.test(result)) {
    throw new TestingCenterContractError("requestId is invalid");
  }
  return result;
}

function module(value: unknown): TestingCenterModule {
  if (typeof value !== "string" || !TESTING_CENTER_MODULES.includes(value as TestingCenterModule)) {
    throw new TestingCenterContractError("module is invalid");
  }
  return value as TestingCenterModule;
}

export function unwrapWailsEvent(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && "data" in value) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) {
      if (data.length !== 1) throw new TestingCenterContractError("event data is invalid");
      return data[0];
    }
    return data;
  }
  return value;
}

export function eventRequestId(value: unknown): string | null {
  try {
    return requestId(object(value, "event").requestId);
  } catch {
    return null;
  }
}

export function decodeDraftEvent(value: unknown): { requestId: string; draft: ReportDraft } {
  const root = exactObject(value, "draft event", ["requestId", "draft"]);
  const draft = object(root.draft, "draft");
  const allowed = new Set([
    "schemaVersion", "idempotencyKey", "actionText", "expectedText",
    "observedText", "contextText", "module",
  ]);
  if (Object.keys(draft).some((key) => !allowed.has(key)) ||
    ["schemaVersion", "idempotencyKey", "actionText", "expectedText", "observedText"]
      .some((key) => !(key in draft))) {
    throw new TestingCenterContractError("draft is incomplete");
  }
  if (draft.schemaVersion !== 1 ||
    typeof draft.idempotencyKey !== "string" ||
    !/^draft_[0-9a-f]{64}$/u.test(draft.idempotencyKey)) {
    throw new TestingCenterContractError("draft identity is invalid");
  }
  return {
    requestId: requestId(root.requestId),
    draft: {
      schemaVersion: 1,
      idempotencyKey: draft.idempotencyKey,
      actionText: text(draft.actionText, "actionText", 2048),
      expectedText: text(draft.expectedText, "expectedText", 2048),
      observedText: text(draft.observedText, "observedText", 2048),
      contextText: draft.contextText === undefined ? "" : text(draft.contextText, "contextText", 4096),
      module: draft.module === undefined ? "unknown" : module(draft.module),
    },
  };
}

export function decodeDiscardedEvent(value: unknown): { requestId: string } {
  const root = exactObject(value, "discarded event", ["requestId"]);
  return { requestId: requestId(root.requestId) };
}

export function decodeDraftErrorEvent(value: unknown): {
  requestId: string;
  operation: "save" | "load" | "discard";
  code: string;
} {
  const root = exactObject(value, "draft error", ["requestId", "operation", "code"]);
  if (root.operation !== "save" && root.operation !== "load" && root.operation !== "discard") {
    throw new TestingCenterContractError("draft error operation is invalid");
  }
  return {
    requestId: requestId(root.requestId),
    operation: root.operation,
    code: text(root.code, "draft error code", 64),
  };
}

export function decodePreparedDiagnosticEvent(value: unknown): {
  requestId: string;
  prepared: PreparedReportDiagnostic;
} {
  const root = exactObject(value, "diagnostic event", ["requestId", "preview", "environment"]);
  const preview = exactObject(root.preview, "diagnostic preview", [
    "contractVersion", "payload", "sha256", "byteSize",
  ]);
  const environment = exactObject(root.environment, "diagnostic environment", [
    "appVersion", "osFamily", "osVersion", "arch", "availableLogCount", "channel",
  ]);
  const payload = text(preview.payload, "diagnostic payload", 64 * 1024);
  const payloadByteSize = new TextEncoder().encode(payload).byteLength;
  const sha256 = text(preview.sha256, "diagnostic sha256", 64);
  if (preview.contractVersion !== "testing-center.diagnostic.v1" ||
    !/^[0-9a-f]{64}$/u.test(sha256) ||
    payloadByteSize > 64 * 1024 ||
    preview.byteSize !== payloadByteSize) {
    throw new TestingCenterContractError("diagnostic integrity metadata is invalid");
  }
  if (environment.osFamily !== "windows" ||
    (environment.arch !== "amd64" && environment.arch !== "arm64") ||
    (environment.channel !== "nightly" && environment.channel !== "testers") ||
    !Number.isSafeInteger(environment.availableLogCount) ||
    (environment.availableLogCount as number) < 0) {
    throw new TestingCenterContractError("diagnostic environment is invalid");
  }
  return {
    requestId: requestId(root.requestId),
    prepared: {
      preview: {
        contractVersion: "testing-center.diagnostic.v1",
        payload,
        sha256,
        byteSize: preview.byteSize as number,
      },
      environment: {
        appVersion: text(environment.appVersion, "appVersion", 32),
        osFamily: "windows",
        osVersion: text(environment.osVersion, "osVersion", 64),
        arch: environment.arch,
        availableLogCount: environment.availableLogCount as number,
        channel: environment.channel,
      },
    },
  };
}

export function decodeDiagnosticErrorEvent(value: unknown): { requestId: string; code: string } {
  const root = exactObject(value, "diagnostic error", ["requestId", "code"]);
  return { requestId: requestId(root.requestId), code: text(root.code, "diagnostic error code", 64) };
}

export function decodeSubmittedReport(value: unknown): SubmittedReport {
  const root = exactObject(value, "submitted report", [
    "report_id", "report_state", "idempotent", "created_at",
  ]);
  const reportId = text(root.report_id, "report_id", 96);
  const createdAt = text(root.created_at, "created_at", 64);
  if (!/^report_[0-9a-f]{64}$/u.test(reportId) || root.report_state !== "submitted" ||
    typeof root.idempotent !== "boolean" || Number.isNaN(Date.parse(createdAt))) {
    throw new TestingCenterContractError("submitted report response is invalid");
  }
  return { reportId, reportState: "submitted", idempotent: root.idempotent, createdAt };
}
