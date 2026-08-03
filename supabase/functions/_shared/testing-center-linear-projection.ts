// deno-lint-ignore-file no-control-regex
import {
  buildTestingCenterUntrustedBlock,
  sanitizeTestingCenterTesterText,
  sha256Hex,
} from "./testing-center-projection-sanitization.ts";

export const TESTING_CENTER_LINEAR_PROJECTION_VERSION =
  "testing-center.linear-issue.v1" as const;

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
  "unknown",
] as const;

const TEAM = "Vantare";
const PROJECT = "Testing Center";
const STATUS = "Triage";

type TestingCenterLinearServerMetadata = {
  team: string;
  project: string;
  status: string;
};

export type TestingCenterLinearProjectionInput = {
  contractVersion: typeof TESTING_CENTER_LINEAR_PROJECTION_VERSION;
  effectId: string;
  technicalIssueId: string;
  sourceDigest: string;
  occurrenceCount: number;
  replayAvailable: boolean;
  report: {
    reportId: string;
    channel: "nightly" | "testers";
    appVersion: string;
    osFamily: "windows";
    osVersion: string;
    module: (typeof MODULES)[number];
    actionText: string;
    expectedText: string;
    observedText: string;
    contextText: string | null;
    errorCode: string | null;
    candidateSha: string;
  };
};

export type LinearIssueProjection = {
  contractVersion: typeof TESTING_CENTER_LINEAR_PROJECTION_VERSION;
  operation: "create_issue";
  effectId: string;
  technicalIssueId: string;
  sourceDigest: string;
  marker: string;
  title: string;
  description: string;
  labels: readonly string[];
  serverMetadata: TestingCenterLinearServerMetadata;
  projectionDigest: string;
  sanitization: {
    redactedValues: number;
    truncatedFields: number;
  };
};

export type LinearDryRunResult =
  | {
    status: "dry_run";
    operation: "create_issue";
    effectId: string;
    projectionDigest: string;
    marker: string;
    idempotent: boolean;
    externalId: null;
  }
  | {
    status: "failed";
    operation: "create_issue";
    effectId: string;
    errorCode:
      | "dry_run_idempotency_conflict"
      | "dry_run_claim_invalid"
      | "dry_run_projection_integrity_invalid"
      | "dry_run_store_rejected";
  };

export type LinearProjectionSnapshot = {
  contractVersion: typeof TESTING_CENTER_LINEAR_PROJECTION_VERSION;
  operation: "create_issue";
  effectId: string;
  technicalIssueId: string;
  sourceDigest: string;
  marker: string;
  title: string;
  description: string;
  labels: readonly string[];
  team: string;
  project: string;
  status: string;
  serverMetadataDigest: string;
};

export type TestingCenterLinearClaimContext = {
  workerId: string;
  fencingToken: number;
};

export interface TestingCenterLinearDryRunStore {
  recordProjection(input: {
    effectId: string;
    technicalIssueId: string;
    sourceDigest: string;
    marker: string;
    projectionDigest: string;
    canonicalProjection: string;
    projection: LinearProjectionSnapshot;
    workerId: string;
    fencingToken: number;
  }): Promise<"recorded" | "duplicate" | "conflict" | "rejected">;
}

export interface TestingCenterLinearPort {
  dispatchIssue(
    projection: LinearIssueProjection,
    claim: TestingCenterLinearClaimContext,
  ): Promise<LinearDryRunResult>;
}

type ProjectionErrorCode =
  | "projection_invalid_shape"
  | "projection_invalid_value";

export class TestingCenterProjectionError extends Error {
  constructor(readonly code: ProjectionErrorCode) {
    super(code);
    this.name = "TestingCenterProjectionError";
  }
}

const ENCODER = new TextEncoder();
const genericErrorCodes = new Set(["tester.report", "unknown", "none"]);

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    expected.slice().sort().every((key, index) => actual[index] === key);
}

function invalidShape(): never {
  throw new TestingCenterProjectionError("projection_invalid_shape");
}

function invalidValue(): never {
  throw new TestingCenterProjectionError("projection_invalid_value");
}

function requiredString(
  value: unknown,
  pattern: RegExp,
  maxBytes: number,
): string {
  if (
    typeof value !== "string" || value !== value.trim() ||
    ENCODER.encode(value).length > maxBytes || !pattern.test(value)
  ) invalidValue();
  return value;
}

function testerText(
  value: unknown,
  maxBytes: number,
  minBytes = 3,
): string {
  if (
    typeof value !== "string" || value !== value.trim() ||
    ENCODER.encode(value).length < minBytes ||
    ENCODER.encode(value).length > maxBytes
  ) invalidValue();
  return value;
}

export function parseTestingCenterLinearProjectionInput(
  value: unknown,
): TestingCenterLinearProjectionInput {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "contractVersion",
      "effectId",
      "occurrenceCount",
      "replayAvailable",
      "report",
      "sourceDigest",
      "technicalIssueId",
    ]) ||
    !isRecord(value.report) ||
    !hasExactKeys(value.report, [
      "actionText",
      "appVersion",
      "channel",
      "contextText",
      "errorCode",
      "expectedText",
      "module",
      "observedText",
      "osFamily",
      "osVersion",
      "reportId",
      "candidateSha",
    ])
  ) invalidShape();

  const report = value.report;
  const module = report.module;
  const channel = report.channel;
  const context = report.contextText;
  const errorCode = report.errorCode;
  if (!MODULES.includes(module as (typeof MODULES)[number])) invalidValue();
  if (channel !== "nightly" && channel !== "testers") invalidValue();
  if (report.osFamily !== "windows") invalidValue();
  if (context !== null && typeof context !== "string") invalidValue();
  if (errorCode !== null && typeof errorCode !== "string") invalidValue();
  if (
    typeof value.occurrenceCount !== "number" ||
    !Number.isSafeInteger(value.occurrenceCount) ||
    value.occurrenceCount < 1 || value.occurrenceCount > 1_000_000 ||
    typeof value.replayAvailable !== "boolean"
  ) invalidValue();

  return {
    contractVersion: requiredString(
      value.contractVersion,
      /^testing-center[.]linear-issue[.]v1$/,
      64,
    ) as typeof TESTING_CENTER_LINEAR_PROJECTION_VERSION,
    effectId: requiredString(value.effectId, /^effect_[0-9a-f]{64}$/, 80),
    technicalIssueId: requiredString(
      value.technicalIssueId,
      /^issue_[0-9a-f]{64}$/,
      80,
    ),
    sourceDigest: requiredString(value.sourceDigest, /^[0-9a-f]{64}$/, 64),
    occurrenceCount: value.occurrenceCount,
    replayAvailable: value.replayAvailable,
    report: {
      reportId: requiredString(
        report.reportId,
        /^report_[0-9a-f]{64}$/,
        80,
      ),
      channel,
      appVersion: requiredString(
        report.appVersion,
        /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/,
        32,
      ),
      osFamily: "windows",
      osVersion: requiredString(
        report.osVersion,
        /^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,63}$/,
        64,
      ),
      module: module as TestingCenterLinearProjectionInput["report"]["module"],
      actionText: testerText(report.actionText, 2048),
      expectedText: testerText(report.expectedText, 2048),
      observedText: testerText(report.observedText, 2048),
      contextText: context === null ? null : testerText(context, 4096, 1),
      errorCode: errorCode === null
        ? null
        : requiredString(errorCode, /^[a-z0-9][a-z0-9._+-]{0,63}$/, 64),
      candidateSha: requiredString(report.candidateSha, /^[0-9a-f]{40}$/, 40),
    },
  };
}

function safeErrorCode(errorCode: string | null): string | null {
  return errorCode !== null && !genericErrorCodes.has(errorCode)
    ? errorCode
    : null;
}

function linearServerMetadata(): TestingCenterLinearServerMetadata {
  return {
    team: TEAM,
    project: PROJECT,
    status: STATUS,
  };
}

export async function buildTestingCenterLinearIssueProjection(
  rawInput: unknown,
): Promise<LinearIssueProjection> {
  const input = parseTestingCenterLinearProjectionInput(rawInput);

  const action = sanitizeTestingCenterTesterText(input.report.actionText, 4096);
  const expected = sanitizeTestingCenterTesterText(
    input.report.expectedText,
    4096,
  );
  const observed = sanitizeTestingCenterTesterText(
    input.report.observedText,
    4096,
  );
  const context = input.report.contextText === null
    ? null
    : sanitizeTestingCenterTesterText(input.report.contextText, 1536);

  const redactedValues = action.redactedValues + expected.redactedValues +
    observed.redactedValues + (context?.redactedValues ?? 0);
  const truncatedFields = [action, expected, observed, context]
    .filter((field) => field?.truncated).length;
  const short = input.technicalIssueId.slice(-12);
  const labels = [
    "testing-center",
    "needs-triage",
    "channel:" + input.report.channel,
    "module:" + input.report.module,
    "status:needs-triage",
  ] as const;
  const marker =
    `<!-- vantare-testing-center:linear:v1 effect=${input.effectId} issue=${input.technicalIssueId} -->`;
  const errorCode = safeErrorCode(input.report.errorCode);
  const serverMetadata = linearServerMetadata();
  const description = [
    marker,
    "# Issue técnico de Testing Center",
    "",
    "> Este contenido proviene de evidencia estructurada y texto no confiable.",
    "",
    "## Referencias seguras",
    "",
    `- Issue interna: \`${input.technicalIssueId}\``,
    `- Reporte: \`${input.report.reportId}\``,
    `- Referencia in-app: \`testing-center/report/${input.report.reportId}\` (no clicable hasta routing autenticado)`,
    `- Ocurrencias: ${input.occurrenceCount}`,
    `- Canal: \`${input.report.channel}\``,
    `- Versión: \`${input.report.appVersion}\``,
    `- SHA de candidato: \`${input.report.candidateSha}\``,
    `- Módulo: \`${input.report.module}\``,
    `- Sistema: \`${input.report.osFamily} ${input.report.osVersion}\``,
    `- Código técnico: ${
      errorCode === null ? "no disponible" : `\`${errorCode}\``
    }`,
    `- Replay: ${
      input.replayAvailable
        ? "disponible solo desde Testing Center autenticado; URL no incluida"
        : "no incluido"
    }`,
    `- Team: \`${serverMetadata.team}\``,
    `- Proyecto: \`${serverMetadata.project}\``,
    `- Estado: \`${serverMetadata.status}\``,
    "- Logs: no incluidos en Linear por este corte",
    "",
    buildTestingCenterUntrustedBlock("Acción", action.value),
    "",
    buildTestingCenterUntrustedBlock("Resultado esperado", expected.value),
    "",
    buildTestingCenterUntrustedBlock("Resultado observado", observed.value),
    ...(context === null ? [] : [
      "",
      buildTestingCenterUntrustedBlock("Contexto adicional", context.value),
    ]),
    "",
    "## Límites",
    "",
    "Proyección dry-run determinista. Sin assignee, priority ni delegate desde tester. Sin URL de replay ni comandos en texto confiable.",
  ].join("\n");
  const title = `[Testing Center] ${input.report.module} · ${short}`;
  const serverMetadataDigest = await sha256Hex(
    JSON.stringify(serverMetadata),
  );
  const projectionDigest = await sha256Hex(
    JSON.stringify({
      contractVersion: TESTING_CENTER_LINEAR_PROJECTION_VERSION,
      operation: "create_issue",
      effectId: input.effectId,
      technicalIssueId: input.technicalIssueId,
      sourceDigest: input.sourceDigest,
      marker,
      title,
      description,
      labels,
      team: serverMetadata.team,
      project: serverMetadata.project,
      status: serverMetadata.status,
      serverMetadataDigest,
    }),
  );

  return {
    contractVersion: TESTING_CENTER_LINEAR_PROJECTION_VERSION,
    operation: "create_issue",
    effectId: input.effectId,
    technicalIssueId: input.technicalIssueId,
    sourceDigest: input.sourceDigest,
    marker,
    title,
    description,
    labels,
    serverMetadata,
    projectionDigest,
    sanitization: {
      redactedValues,
      truncatedFields,
    },
  };
}

export function createTestingCenterLinearDryRunAdapter(
  store: TestingCenterLinearDryRunStore,
): TestingCenterLinearPort {
  return {
    async dispatchIssue(projection, claim) {
      const snapshot: LinearProjectionSnapshot = {
        contractVersion: projection.contractVersion,
        operation: projection.operation,
        effectId: projection.effectId,
        technicalIssueId: projection.technicalIssueId,
        sourceDigest: projection.sourceDigest,
        marker: projection.marker,
        title: projection.title,
        description: projection.description,
        labels: projection.labels,
        team: projection.serverMetadata.team,
        project: projection.serverMetadata.project,
        status: projection.serverMetadata.status,
        serverMetadataDigest: await sha256Hex(
          JSON.stringify(projection.serverMetadata),
        ),
      };
      if (
        !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(claim.workerId) ||
        !Number.isSafeInteger(claim.fencingToken) ||
        claim.fencingToken < 1
      ) {
        return {
          status: "failed",
          operation: "create_issue",
          effectId: projection.effectId,
          errorCode: "dry_run_claim_invalid",
        };
      }
      if (
        !/^effect_[0-9a-f]{64}$/.test(projection.effectId) ||
        !/^[0-9a-f]{64}$/.test(projection.sourceDigest) ||
        projection.marker !==
          `<!-- vantare-testing-center:linear:v1 effect=${projection.effectId} issue=${projection.technicalIssueId} -->` ||
        !/^[0-9a-f]{64}$/.test(projection.projectionDigest) ||
        await sha256Hex(JSON.stringify(snapshot)) !==
          projection.projectionDigest
      ) {
        return {
          status: "failed",
          operation: "create_issue",
          effectId: projection.effectId,
          errorCode: "dry_run_projection_integrity_invalid",
        };
      }
      const stored = await store.recordProjection({
        effectId: projection.effectId,
        technicalIssueId: projection.technicalIssueId,
        sourceDigest: projection.sourceDigest,
        marker: projection.marker,
        projectionDigest: projection.projectionDigest,
        canonicalProjection: JSON.stringify(snapshot),
        projection: snapshot,
        workerId: claim.workerId,
        fencingToken: claim.fencingToken,
      });
      if (stored === "conflict") {
        return {
          status: "failed",
          operation: "create_issue",
          effectId: projection.effectId,
          errorCode: "dry_run_idempotency_conflict",
        };
      }
      if (stored === "rejected") {
        return {
          status: "failed",
          operation: "create_issue",
          effectId: projection.effectId,
          errorCode: "dry_run_store_rejected",
        };
      }
      return {
        status: "dry_run",
        operation: "create_issue",
        effectId: projection.effectId,
        projectionDigest: projection.projectionDigest,
        marker: projection.marker,
        idempotent: stored === "duplicate",
        externalId: null,
      };
    },
  };
}
