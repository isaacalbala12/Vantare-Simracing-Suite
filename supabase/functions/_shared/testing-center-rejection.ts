// deno-lint-ignore-file no-control-regex
export const TESTING_CENTER_REJECTION_VERSION =
  "testing-center.rejection.v1" as const;

import {
  buildTestingCenterUntrustedBlock,
  sanitizeTestingCenterTesterText,
  sha256Hex,
} from "./testing-center-projection-sanitization.ts";

const CHANNELS = ["nightly", "testers"] as const;
const DECISIONS = ["accepted", "rejected", "cannot_verify"] as const;
const REJECTION_CATEGORIES = [
  "issue_persists",
  "new_regression",
  "crash",
  "different_behavior",
  "other",
] as const;
const REJECTION_FREQUENCIES = ["always", "frequent", "once"] as const;
const NIGHTLY_ROLES = ["primary_tester", "owner"] as const;
const TESTER_ROLES = ["tester", "primary_tester", "owner"] as const;
const OWNER_DISPOSITIONS = [
  "create_correction_subissue",
  "environment_issue",
  "create_separate_issue",
  "dismiss_with_reason",
  "stop_rollout",
] as const;
const ENCODER = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISSUE_ID = /^issue_[0-9a-f]{64}$/;
const CANDIDATE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const SHA = /^[0-9a-f]{40}$/;

type RecordValue = Record<string, unknown>;
type TestingCenterChannel = (typeof CHANNELS)[number];
type TestingCenterDecision = (typeof DECISIONS)[number];
type TestingCenterRejectionCategory = (typeof REJECTION_CATEGORIES)[number];
type TestingCenterRejectionFrequency = (typeof REJECTION_FREQUENCIES)[number];
type TestingCenterNightlyRole = (typeof NIGHTLY_ROLES)[number];
type TestingCenterTesterRole = (typeof TESTER_ROLES)[number];

type TestingCenterActorRole =
  | TestingCenterNightlyRole
  | TestingCenterTesterRole;

type TestingCenterActor = {
  actorId: string;
  actorRole: TestingCenterActorRole;
};

export type TestingCenterVerifiedValidationContext = {
  actorId: string;
  actorRole: TestingCenterActorRole;
  candidateAuthorId: string;
};

export type TestingCenterOwnerDisposition = {
  contractVersion: "testing-center.owner-disposition.v1";
  issueId: string;
  rejectionReplayKey: string;
  actorId: string;
  disposition: (typeof OWNER_DISPOSITIONS)[number];
  reason: string;
  correctionIssueId: string | null;
  targetBranch: string | null;
  nightlySha: string | null;
};

export type TestingCenterRejectionInput = {
  contractVersion: typeof TESTING_CENTER_REJECTION_VERSION;
  issueId: string;
  candidateId: string;
  channel: TestingCenterChannel;
  appVersion: string;
  candidateSha: string;
  candidateAuthorId: string;
  actor: TestingCenterActor;
  decision: TestingCenterDecision;
  details?: {
    category: TestingCenterRejectionCategory;
    description: string;
    steps: string;
    expected: string;
    observed: string;
    frequency: TestingCenterRejectionFrequency;
    blocking: boolean;
    diagnosticsConsent: boolean;
    logsConsent: boolean;
  };
};

export type TestingCenterRejectionDetails = {
  category: TestingCenterRejectionCategory;
  description: string;
  steps: string;
  expected: string;
  observed: string;
  frequency: TestingCenterRejectionFrequency;
  blocking: boolean;
  diagnosticsConsent: boolean;
  logsConsent: boolean;
};

type TestingCenterRejectionProjection = {
  contractVersion: typeof TESTING_CENTER_REJECTION_VERSION;
  operation: "record_validation";
  issueId: string;
  candidateId: string;
  channel: TestingCenterChannel;
  appVersion: string;
  candidateSha: string;
  actorRole: TestingCenterActorRole;
  decision: TestingCenterDecision;
  replayKey: string;
  decisionDigest: string;
  projectionDigest: string;
  detailsMarkdown: string | null;
  sanitization: {
    redactedValues: number;
    truncatedFields: number;
  };
};

export type TestingCenterRejectionDryRunResult =
  | {
    status: "dry_run";
    operation: "record_validation";
    replayKey: string;
    projectionDigest: string;
    idempotent: boolean;
  }
  | {
    status: "failed";
    operation: "record_validation";
    replayKey: string;
    projectionDigest: string;
    errorCode:
      | "dry_run_idempotency_conflict"
      | "dry_run_projection_integrity_invalid";
  };

export interface TestingCenterRejectionDryRunPort {
  dispatchValidation(
    projection: TestingCenterRejectionProjection,
  ): Promise<TestingCenterRejectionDryRunResult>;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    expected.slice().sort().every((key, index) => actual[index] === key);
}

function invalidShape(): never {
  throw new Error("testing_center_rejection_invalid_shape");
}

function invalidValue(): never {
  throw new Error("testing_center_rejection_invalid_value");
}

function forbiddenAction(): never {
  throw new Error("testing_center_rejection_forbidden_action");
}

function stringTrimmed(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value) invalidValue();
  return value;
}

function exactMatch(value: unknown, pattern: RegExp): string {
  return pattern.test(stringTrimmed(value)) ? value as string : invalidValue();
}

function hasBytesBetween(
  value: unknown,
  minBytes: number,
  maxBytes: number,
): string {
  const normalized = stringTrimmed(value);
  const bytes = ENCODER.encode(normalized).length;
  if (bytes < minBytes || bytes > maxBytes) invalidValue();
  return normalized;
}

function assertDetails(value: unknown): TestingCenterRejectionDetails {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "category",
      "description",
      "steps",
      "expected",
      "observed",
      "frequency",
      "blocking",
      "diagnosticsConsent",
      "logsConsent",
    ])
  ) invalidShape();

  if (
    !REJECTION_CATEGORIES.includes(
      value.category as TestingCenterRejectionCategory,
    ) ||
    !REJECTION_FREQUENCIES.includes(
      value.frequency as TestingCenterRejectionFrequency,
    ) ||
    typeof value.blocking !== "boolean" ||
    typeof value.diagnosticsConsent !== "boolean" ||
    typeof value.logsConsent !== "boolean"
  ) invalidValue();

  return {
    category: value.category as TestingCenterRejectionDetails["category"],
    frequency: value.frequency as TestingCenterRejectionDetails["frequency"],
    blocking: value.blocking,
    diagnosticsConsent: value.diagnosticsConsent,
    logsConsent: value.logsConsent,
    description: hasBytesBetween(value.description, 1, 2048),
    steps: hasBytesBetween(value.steps, 1, 2048),
    expected: hasBytesBetween(value.expected, 1, 2048),
    observed: hasBytesBetween(value.observed, 1, 2048),
  };
}

function parseActor(
  value: unknown,
  channel: TestingCenterChannel,
): TestingCenterActor {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["actorId", "actorRole"])
  ) {
    invalidValue();
  }

  const actorRole = stringTrimmed(value.actorRole);
  if (channel === "nightly") {
    if (
      actorRole !== "primary_tester" &&
      actorRole !== "owner"
    ) invalidValue();
  } else {
    if (!TESTER_ROLES.includes(actorRole as TestingCenterActorRole)) {
      invalidValue();
    }
  }

  return {
    actorId: exactMatch(value.actorId, UUID),
    actorRole: actorRole as TestingCenterActorRole,
  };
}

export function parseTestingCenterRejection(
  raw: unknown,
  verifiedContext: TestingCenterVerifiedValidationContext,
): TestingCenterRejectionInput {
  if (!isRecord(raw)) {
    invalidShape();
  }

  if (
    typeof raw.decision !== "string" ||
    !DECISIONS.includes(raw.decision as TestingCenterDecision) ||
    exactMatch(raw.contractVersion, /^testing-center[.]rejection[.]v1$/) !==
      TESTING_CENTER_REJECTION_VERSION ||
    !CHANNELS.includes(raw.channel as TestingCenterChannel)
  ) {
    invalidValue();
  }

  const channel = raw.channel as TestingCenterChannel;
  const decision = raw.decision as TestingCenterDecision;
  if (
    !exactKeys(
      raw,
      decision === "rejected"
        ? [
          "contractVersion",
          "issueId",
          "candidateId",
          "channel",
          "appVersion",
          "candidateSha",
          "candidateAuthorId",
          "actor",
          "decision",
          "details",
        ]
        : [
          "contractVersion",
          "issueId",
          "candidateId",
          "channel",
          "appVersion",
          "candidateSha",
          "candidateAuthorId",
          "actor",
          "decision",
        ],
    )
  ) {
    invalidShape();
  }

  const actor = parseActor(raw.actor, channel);
  const candidateAuthorId = exactMatch(raw.candidateAuthorId, UUID);
  const verifiedActor = parseActor({
    actorId: verifiedContext?.actorId,
    actorRole: verifiedContext?.actorRole,
  }, channel);
  const verifiedCandidateAuthorId = exactMatch(
    verifiedContext?.candidateAuthorId,
    UUID,
  );

  if (
    actor.actorId !== verifiedActor.actorId ||
    actor.actorRole !== verifiedActor.actorRole ||
    candidateAuthorId !== verifiedCandidateAuthorId
  ) forbiddenAction();

  if (actor.actorId === candidateAuthorId) {
    forbiddenAction();
  }
  if (actor.actorRole === "tester" && channel === "nightly") {
    invalidValue();
  }

  const issueId = exactMatch(raw.issueId, ISSUE_ID);
  const candidateId = stringTrimmed(raw.candidateId);
  if (!CANDIDATE_ID.test(candidateId)) invalidValue();
  const appVersion = hasBytesBetween(raw.appVersion, 1, 32);
  const candidateSha = exactMatch(raw.candidateSha, SHA);

  const expectsDetails = decision === "rejected";
  const hasDetails = Object.hasOwn(raw, "details");
  if (expectsDetails !== hasDetails) invalidValue();
  if (expectsDetails && hasDetails) {
    const details = assertDetails(raw.details);
    return {
      contractVersion: TESTING_CENTER_REJECTION_VERSION,
      issueId,
      candidateId,
      channel,
      appVersion,
      candidateSha,
      candidateAuthorId,
      actor,
      decision,
      details,
    };
  }

  return {
    contractVersion: TESTING_CENTER_REJECTION_VERSION,
    issueId,
    candidateId,
    channel,
    appVersion,
    candidateSha,
    candidateAuthorId,
    actor,
    decision,
  };
}

export function parseTestingCenterOwnerDisposition(
  raw: unknown,
  verifiedOwnerId: string,
): TestingCenterOwnerDisposition {
  if (
    !isRecord(raw) ||
    !exactKeys(raw, [
      "contractVersion",
      "issueId",
      "rejectionReplayKey",
      "actorId",
      "disposition",
      "reason",
      "correctionIssueId",
      "targetBranch",
      "nightlySha",
    ])
  ) invalidShape();

  const actorId = exactMatch(raw.actorId, UUID);
  if (actorId !== exactMatch(verifiedOwnerId, UUID)) forbiddenAction();
  if (raw.contractVersion !== "testing-center.owner-disposition.v1") {
    invalidValue();
  }
  if (!OWNER_DISPOSITIONS.includes(raw.disposition as never)) invalidValue();
  const disposition = raw
    .disposition as TestingCenterOwnerDisposition["disposition"];
  const reason = hasBytesBetween(raw.reason, 3, 2048);
  const issueId = exactMatch(raw.issueId, ISSUE_ID);
  const rejectionReplayKey = hasBytesBetween(raw.rejectionReplayKey, 20, 512);

  const correctionIssueId = raw.correctionIssueId === null
    ? null
    : exactMatch(raw.correctionIssueId, ISSUE_ID);
  const targetBranch = raw.targetBranch === null
    ? null
    : hasBytesBetween(raw.targetBranch, 1, 80);
  const nightlySha = raw.nightlySha === null
    ? null
    : exactMatch(raw.nightlySha, SHA);
  const isCorrection = disposition === "create_correction_subissue";
  if (
    isCorrection !==
      (correctionIssueId !== null && targetBranch !== null &&
        nightlySha !== null)
  ) invalidValue();
  if (
    targetBranch !== null &&
    !/^vantareapp\/isa-[0-9]+-[a-z0-9-]{1,60}$/.test(targetBranch)
  ) invalidValue();

  return {
    contractVersion: "testing-center.owner-disposition.v1",
    issueId,
    rejectionReplayKey,
    actorId,
    disposition,
    reason,
    correctionIssueId,
    targetBranch,
    nightlySha,
  };
}

function buildRejectionDetailsMarkdown(
  details: TestingCenterRejectionDetails,
): string {
  const description = sanitizeTestingCenterTesterText(
    details.description,
    4096,
  );
  const steps = sanitizeTestingCenterTesterText(details.steps, 4096);
  const expected = sanitizeTestingCenterTesterText(details.expected, 2048);
  const observed = sanitizeTestingCenterTesterText(details.observed, 2048);
  return [
    `## Rechazo: ${details.category}`,
    `- Frecuencia: ${details.frequency}`,
    `- Impacto bloqueante: ${details.blocking ? "sí" : "no"}`,
    `- Consentimientos: diagnóstico=${
      details.diagnosticsConsent ? "sí" : "no"
    }, logs=${details.logsConsent ? "sí" : "no"}`,
    buildTestingCenterUntrustedBlock("Descripción", description.value),
    buildTestingCenterUntrustedBlock("Pasos", steps.value),
    buildTestingCenterUntrustedBlock("Esperado", expected.value),
    buildTestingCenterUntrustedBlock("Observado", observed.value),
  ].join("\n\n");
}

export async function buildTestingCenterRejectionProjection(
  rawInput: unknown,
  verifiedContext: TestingCenterVerifiedValidationContext,
): Promise<{
  contractVersion: typeof TESTING_CENTER_REJECTION_VERSION;
  operation: "record_validation";
  issueId: string;
  candidateId: string;
  channel: TestingCenterChannel;
  appVersion: string;
  candidateSha: string;
  actorRole: TestingCenterActorRole;
  decision: TestingCenterDecision;
  replayKey: string;
  decisionDigest: string;
  projectionDigest: string;
  detailsMarkdown: string | null;
  sanitization: {
    redactedValues: number;
    truncatedFields: number;
  };
}> {
  const input = parseTestingCenterRejection(rawInput, verifiedContext);

  const details = input.details;
  const detailsMarkdown = details === undefined
    ? null
    : buildRejectionDetailsMarkdown(
      details,
    );
  const sanitized = (() => {
    if (details === undefined) return { redactedValues: 0, truncatedFields: 0 };
    const description = sanitizeTestingCenterTesterText(
      details.description,
      2048,
    );
    const steps = sanitizeTestingCenterTesterText(details.steps, 2048);
    const expected = sanitizeTestingCenterTesterText(details.expected, 2048);
    const observed = sanitizeTestingCenterTesterText(details.observed, 2048);
    return {
      redactedValues: description.redactedValues + steps.redactedValues +
        expected.redactedValues + observed.redactedValues,
      truncatedFields: (description.truncated ? 1 : 0) +
        (steps.truncated ? 1 : 0) + (expected.truncated ? 1 : 0) +
        (observed.truncated ? 1 : 0),
    };
  })();

  const replayKey = [
    "validation",
    input.issueId,
    input.candidateId,
    input.channel,
    input.candidateSha,
    input.actor.actorId,
  ].join(":");

  const decisionDigest = await sha256Hex(
    JSON.stringify({
      contractVersion: input.contractVersion,
      issueId: input.issueId,
      candidateId: input.candidateId,
      channel: input.channel,
      candidateSha: input.candidateSha,
      decision: input.decision,
      actorRole: input.actor.actorRole,
      details,
      candidateAuthorId: input.candidateAuthorId,
    }),
  );
  const projectionDigest = await sha256Hex(
    JSON.stringify({
      contractVersion: input.contractVersion,
      operation: "record_validation",
      replayKey,
      issueId: input.issueId,
      candidateId: input.candidateId,
      channel: input.channel,
      appVersion: input.appVersion,
      candidateSha: input.candidateSha,
      actorRole: input.actor.actorRole,
      decision: input.decision,
      decisionDigest,
      sanitization: sanitized,
      detailsMarkdown,
    }),
  );

  return {
    contractVersion: TESTING_CENTER_REJECTION_VERSION,
    operation: "record_validation",
    issueId: input.issueId,
    candidateId: input.candidateId,
    channel: input.channel,
    appVersion: input.appVersion,
    candidateSha: input.candidateSha,
    actorRole: input.actor.actorRole,
    decision: input.decision,
    replayKey,
    decisionDigest,
    projectionDigest,
    detailsMarkdown,
    sanitization: sanitized,
  };
}

export function createTestingCenterRejectionDryRunAdapter():
  & TestingCenterRejectionDryRunPort
  & {
    recordedEffectCount(): number;
  } {
  const effects = new Map<string, string>();

  async function dispatch(projection: {
    replayKey: string;
    operation: "record_validation";
    projectionDigest: string;
    contractVersion: string;
    issueId: string;
    candidateId: string;
    channel: TestingCenterChannel;
    appVersion: string;
    candidateSha: string;
    actorRole: TestingCenterActorRole;
    decision: TestingCenterDecision;
    decisionDigest: string;
    sanitization: { redactedValues: number; truncatedFields: number };
    detailsMarkdown: string | null;
  }): Promise<TestingCenterRejectionDryRunResult> {
    const projectionText = JSON.stringify({
      contractVersion: projection.contractVersion,
      operation: projection.operation,
      replayKey: projection.replayKey,
      issueId: projection.issueId,
      candidateId: projection.candidateId,
      channel: projection.channel,
      appVersion: projection.appVersion,
      candidateSha: projection.candidateSha,
      actorRole: projection.actorRole,
      decision: projection.decision,
      decisionDigest: projection.decisionDigest,
      sanitization: projection.sanitization,
      detailsMarkdown: projection.detailsMarkdown ?? null,
    });
    if (
      projection.operation !== "record_validation" ||
      !/^[0-9a-f]{64}$/.test(projection.projectionDigest) ||
      projection.projectionDigest !== await sha256Hex(projectionText)
    ) {
      return {
        status: "failed",
        operation: "record_validation",
        replayKey: projection.replayKey,
        projectionDigest: projection.projectionDigest,
        errorCode: "dry_run_projection_integrity_invalid",
      };
    }

    const previous = effects.get(projection.replayKey);
    if (previous !== undefined && previous !== projection.projectionDigest) {
      return {
        status: "failed",
        operation: "record_validation",
        replayKey: projection.replayKey,
        projectionDigest: projection.projectionDigest,
        errorCode: "dry_run_idempotency_conflict",
      };
    }
    effects.set(projection.replayKey, projection.projectionDigest);
    return {
      status: "dry_run",
      operation: "record_validation",
      replayKey: projection.replayKey,
      projectionDigest: projection.projectionDigest,
      idempotent: previous === projection.projectionDigest,
    };
  }

  return {
    async dispatchValidation(projection) {
      return dispatch(projection);
    },
    recordedEffectCount() {
      return effects.size;
    },
  };
}
