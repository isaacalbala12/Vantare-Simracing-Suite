import { type AuthResult, requireUserAuth } from "../_shared/auth.ts";
import { handleCorsPreflight } from "../_shared/cors.ts";
import { readJsonObject } from "../_shared/request.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  buildTestingCenterRejectionProjection,
  TESTING_CENTER_REJECTION_VERSION,
  type TestingCenterRejectionInput,
} from "../_shared/testing-center-rejection.ts";
import {
  sanitizeTestingCenterTesterText,
  sha256Hex,
} from "../_shared/testing-center-projection-sanitization.ts";

const CHANNELS = ["nightly", "testers"] as const;
const DECISIONS = ["accepted", "rejected", "cannot_verify"] as const;
const CATEGORIES = [
  "issue_persists",
  "new_regression",
  "crash",
  "different_behavior",
  "other",
] as const;
const FREQUENCIES = ["always", "frequent", "once"] as const;
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
const ROLES = ["tester", "primary_tester", "owner"] as const;
const ISSUE_ID = /^issue_[0-9a-f]{64}$/;
const CANDIDATE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const SHA = /^[0-9a-f]{40}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENCODER = new TextEncoder();

type Channel = (typeof CHANNELS)[number];
type Decision = (typeof DECISIONS)[number];
type Role = "tester" | "primary_tester" | "owner";

export type FeedbackMembership = {
  userId: string;
  actorId: string;
  role: Role;
};

export type FeedbackCandidateSource = {
  issueId: string;
  candidateId: string;
  channel: Channel;
  appVersion: string;
  candidateSha: string;
  candidateAuthorId: string;
  candidateState: "pending" | "accepted";
  flowState:
    | "nightly_candidate"
    | "nightly_accepted"
    | "testers_candidate"
    | "testers_accepted";
  module: string;
  actionText: string;
  expectedText: string;
  observedText: string;
};

export type FeedbackRecordResult = {
  validationId: string;
  decision: Decision;
  flowState: string;
  candidateState: string;
  idempotent: boolean;
};

export interface TestingCenterFeedbackStore {
  membership(userId: string): Promise<FeedbackMembership | null>;
  listCandidates(channel: Channel): Promise<FeedbackCandidateSource[]>;
  candidate(candidateId: string): Promise<FeedbackCandidateSource | null>;
  record(
    projection: Record<string, unknown>,
    canonical: string,
    digestSource: string,
    projectionDigest: string,
    transportDigest: string,
    actorUserId: string,
  ): Promise<FeedbackRecordResult>;
}

export type TestingCenterFeedbackDeps = {
  requireAuth?: (request: Request) => Promise<AuthResult>;
  store?: TestingCenterFeedbackStore;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
}

function roleCanView(role: Role, channel: Channel): boolean {
  return role === "owner" || role === "primary_tester" ||
    (role === "tester" && channel === "testers");
}

function canValidate(
  membership: FeedbackMembership,
  candidate: FeedbackCandidateSource,
): boolean {
  if (!roleCanView(membership.role, candidate.channel)) return false;
  if (membership.actorId === candidate.candidateAuthorId) return false;
  if (candidate.channel === "nightly") {
    return candidate.candidateState === "pending" &&
      candidate.flowState === "nightly_candidate";
  }
  return (candidate.candidateState === "pending" ||
    candidate.candidateState === "accepted") &&
    (candidate.flowState === "testers_candidate" ||
      candidate.flowState === "testers_accepted");
}

function safeText(value: string, maxBytes: number): string {
  return sanitizeTestingCenterTesterText(value, maxBytes).value;
}

function validCandidateSource(candidate: FeedbackCandidateSource): boolean {
  const versionBytes = ENCODER.encode(candidate.appVersion).length;
  const nightlyState = candidate.channel === "nightly" &&
    candidate.flowState === "nightly_candidate" &&
    candidate.candidateState === "pending";
  const testersState = candidate.channel === "testers" &&
    (candidate.flowState === "testers_candidate" ||
      candidate.flowState === "testers_accepted") &&
    (candidate.candidateState === "pending" ||
      candidate.candidateState === "accepted");
  return ISSUE_ID.test(candidate.issueId) &&
    CANDIDATE_ID.test(candidate.candidateId) &&
    CHANNELS.includes(candidate.channel) &&
    versionBytes >= 1 && versionBytes <= 32 &&
    SHA.test(candidate.candidateSha) &&
    UUID.test(candidate.candidateAuthorId) &&
    MODULES.includes(candidate.module as (typeof MODULES)[number]) &&
    (nightlyState || testersState);
}

function publicCandidate(
  membership: FeedbackMembership,
  candidate: FeedbackCandidateSource,
) {
  if (!validCandidateSource(candidate)) {
    throw new Error("testing_center_candidate_source_invalid");
  }
  return {
    issueId: candidate.issueId,
    candidateId: candidate.candidateId,
    channel: candidate.channel,
    appVersion: candidate.appVersion,
    candidateSha: candidate.candidateSha,
    module: candidate.module,
    summary: safeText(candidate.actionText, 512),
    criteria: [safeText(candidate.expectedText, 1024)],
    knownFailure: safeText(candidate.observedText, 1024),
    state: candidate.candidateState,
    canValidate: canValidate(membership, candidate),
  };
}

function parseChannel(value: unknown): Channel | null {
  return typeof value === "string" && CHANNELS.includes(value as Channel)
    ? value as Channel
    : null;
}

function parseDetails(value: unknown): TestingCenterRejectionInput["details"] {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "blocking",
      "category",
      "description",
      "diagnosticsConsent",
      "expected",
      "frequency",
      "logsConsent",
      "observed",
      "steps",
    ]) ||
    !CATEGORIES.includes(value.category as never) ||
    !FREQUENCIES.includes(value.frequency as never) ||
    typeof value.blocking !== "boolean" ||
    typeof value.diagnosticsConsent !== "boolean" ||
    typeof value.logsConsent !== "boolean" ||
    (value.logsConsent && !value.diagnosticsConsent)
  ) return undefined;
  for (const key of ["description", "steps", "expected", "observed"] as const) {
    if (typeof value[key] !== "string") return undefined;
    const bytes = ENCODER.encode(value[key].trim()).length;
    if (value[key] !== value[key].trim() || bytes < 3 || bytes > 2048) {
      return undefined;
    }
  }
  return value as TestingCenterRejectionInput["details"];
}

export async function handleTestingCenterFeedbackRequest(
  request: Request,
  deps: TestingCenterFeedbackDeps = {},
): Promise<Response> {
  const cors = handleCorsPreflight(request);
  if (cors) return cors;
  if (request.method !== "POST") {
    return errorResponse("method_not_allowed", "Only POST is supported", 405);
  }
  const auth = await (deps.requireAuth ?? requireUserAuth)(request);
  if (!auth.ok) return auth.response;
  if (!UUID.test(auth.userId)) {
    return errorResponse(
      "unauthorized",
      "Authenticated account is invalid",
      401,
    );
  }
  const parsed = await readJsonObject(request, 16 * 1024);
  if (!parsed.ok) return errorResponse(parsed.code, parsed.message, 400);
  const store = deps.store ?? createFeedbackStore();
  let membership: FeedbackMembership | null;
  try {
    membership = await store.membership(auth.userId);
  } catch {
    return errorResponse(
      "feedback_unavailable",
      "Testing Center is unavailable",
      503,
    );
  }
  if (
    !membership || membership.userId !== auth.userId ||
    !UUID.test(membership.actorId) || !ROLES.includes(membership.role)
  ) {
    return errorResponse(
      "membership_required",
      "Testing Center membership required",
      403,
    );
  }

  if (parsed.value.operation === "list_candidates") {
    if (!exactKeys(parsed.value, ["channel", "operation"])) {
      return errorResponse("invalid_request", "Request shape is invalid", 400);
    }
    const channel = parseChannel(parsed.value.channel);
    if (!channel || !roleCanView(membership.role, channel)) {
      return errorResponse(
        "channel_forbidden",
        "Build channel is not allowed",
        403,
      );
    }
    try {
      const candidates = (await store.listCandidates(channel))
        .filter((candidate) => candidate.channel === channel)
        .slice(0, 20)
        .map((candidate) => publicCandidate(membership!, candidate));
      return jsonResponse({
        contractVersion: "testing-center.candidate-feed.v1",
        candidates,
      });
    } catch {
      return errorResponse(
        "feedback_unavailable",
        "Testing Center is unavailable",
        503,
      );
    }
  }

  if (parsed.value.operation !== "submit_feedback") {
    return errorResponse(
      "invalid_operation",
      "Operation is not supported",
      400,
    );
  }
  const decision = parsed.value.decision;
  const rejected = decision === "rejected";
  if (
    !exactKeys(
      parsed.value,
      rejected
        ? ["candidateId", "candidateSha", "decision", "details", "operation"]
        : ["candidateId", "candidateSha", "decision", "operation"],
    ) ||
    typeof decision !== "string" || !DECISIONS.includes(decision as Decision) ||
    typeof parsed.value.candidateId !== "string" ||
    !CANDIDATE_ID.test(parsed.value.candidateId) ||
    typeof parsed.value.candidateSha !== "string" ||
    !SHA.test(parsed.value.candidateSha)
  ) return errorResponse("invalid_request", "Request shape is invalid", 400);
  const details = rejected ? parseDetails(parsed.value.details) : undefined;
  if (rejected && !details) {
    return errorResponse(
      "incomplete_rejection",
      "Rejection details are incomplete",
      400,
    );
  }

  try {
    const candidate = await store.candidate(parsed.value.candidateId);
    if (
      !candidate || !validCandidateSource(candidate) ||
      candidate.candidateSha !== parsed.value.candidateSha ||
      !canValidate(membership, candidate)
    ) {
      return errorResponse(
        "candidate_unavailable",
        "Candidate cannot be validated",
        409,
      );
    }
    const raw: TestingCenterRejectionInput = {
      contractVersion: TESTING_CENTER_REJECTION_VERSION,
      issueId: candidate.issueId,
      candidateId: candidate.candidateId,
      channel: candidate.channel,
      appVersion: candidate.appVersion,
      candidateSha: candidate.candidateSha,
      candidateAuthorId: candidate.candidateAuthorId,
      actor: { actorId: membership.actorId, actorRole: membership.role },
      decision: decision as Decision,
      ...(details ? { details } : {}),
    };
    const projection = await buildTestingCenterRejectionProjection(raw, {
      actorId: membership.actorId,
      actorRole: membership.role,
      candidateAuthorId: candidate.candidateAuthorId,
    });
    const canonical = JSON.stringify(projection);
    const digestSource = JSON.stringify({
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
      detailsMarkdown: projection.detailsMarkdown,
    });
    if (await sha256Hex(digestSource) !== projection.projectionDigest) {
      throw new Error("testing_center_feedback_projection_digest_invalid");
    }
    const result = await store.record(
      projection as unknown as Record<string, unknown>,
      canonical,
      digestSource,
      projection.projectionDigest,
      await sha256Hex(canonical),
      auth.userId,
    );
    return jsonResponse({
      contractVersion: "testing-center.candidate-feedback-result.v1",
      ...result,
    });
  } catch {
    return errorResponse("feedback_rejected", "Feedback was not recorded", 409);
  }
}

function createFeedbackStore(): TestingCenterFeedbackStore {
  const admin = getSupabaseAdmin();
  async function sourceFromCandidate(row: Record<string, unknown>) {
    const issueId = String(row.technical_issue_id ?? "");
    const { data: issue, error: issueError } = await admin
      .from("testing_center_technical_issues").select("report_id,flow_state")
      .eq("technical_issue_id", issueId).maybeSingle();
    if (issueError || !issue) throw issueError ?? new Error("issue missing");
    const { data: payload, error: payloadError } = await admin
      .from("testing_center_report_payloads")
      .select("action_text,expected_text,observed_text,module")
      .eq("report_id", issue.report_id).maybeSingle();
    if (payloadError || !payload) {
      throw payloadError ?? new Error("payload missing");
    }
    return {
      issueId,
      candidateId: String(row.candidate_id),
      channel: row.channel as Channel,
      appVersion: String(row.build_version),
      candidateSha: String(row.exact_sha),
      candidateAuthorId: String(row.author_id),
      candidateState: row.state as "pending" | "accepted",
      flowState: issue.flow_state as FeedbackCandidateSource["flowState"],
      module: String(payload.module),
      actionText: String(payload.action_text),
      expectedText: String(payload.expected_text),
      observedText: String(payload.observed_text),
    } satisfies FeedbackCandidateSource;
  }
  const candidateFields =
    "candidate_id,technical_issue_id,channel,build_version,exact_sha,author_id,state";
  return {
    async membership(userId) {
      const { data, error } = await admin.from("testing_center_memberships")
        .select("user_id,actor_id,role,active").eq("user_id", userId)
        .eq("active", true).maybeSingle();
      if (error) throw error;
      return data
        ? {
          userId: data.user_id,
          actorId: data.actor_id,
          role: data.role as Role,
        }
        : null;
    },
    async listCandidates(channel) {
      const { data, error } = await admin.from(
        "testing_center_candidate_builds",
      )
        .select(candidateFields).eq("channel", channel)
        .in("state", ["pending", "accepted"]).order("created_at", {
          ascending: false,
        }).limit(20);
      if (error) throw error;
      return await Promise.all((data ?? []).map(sourceFromCandidate));
    },
    async candidate(candidateId) {
      const { data, error } = await admin.from(
        "testing_center_candidate_builds",
      )
        .select(candidateFields).eq("candidate_id", candidateId).maybeSingle();
      if (error) throw error;
      return data ? await sourceFromCandidate(data) : null;
    },
    async record(
      projection,
      canonical,
      digestSource,
      projectionDigest,
      transportDigest,
      actorUserId,
    ) {
      const { data, error } = await admin.rpc(
        "testing_center_record_validation_projection",
        {
          p_projection: projection,
          p_canonical_projection: canonical,
          p_projection_digest_source: digestSource,
          p_projection_digest: projectionDigest,
          p_transport_digest: transportDigest,
          p_actor_user_id: actorUserId,
        },
      );
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw error ?? new Error("validation result missing");
      }
      const row = data[0];
      return {
        validationId: row.result_validation_id,
        decision: row.result_decision,
        flowState: row.result_issue_state,
        candidateState: row.result_candidate_state,
        idempotent: row.result_idempotent,
      } as FeedbackRecordResult;
    },
  };
}

if (import.meta.main) {
  Deno.serve((request) => handleTestingCenterFeedbackRequest(request));
}
