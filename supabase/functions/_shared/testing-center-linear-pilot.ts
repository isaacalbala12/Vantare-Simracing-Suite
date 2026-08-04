import {
  buildTestingCenterLinearIssueProjection,
  type LinearIssueProjection,
  type TestingCenterLinearProjectionInput,
} from "./testing-center-linear-projection.ts";
import type {
  TestingCenterLinearCreatedIssue,
  TestingCenterLinearDispatchResult,
} from "./testing-center-linear-api.ts";
import { readJsonObject } from "./request.ts";

const EFFECT_ID = /^effect_[0-9a-f]{64}$/;
const REPORT_ID = /^report_[0-9a-f]{64}$/;
const WORKER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENCODER = new TextEncoder();

export type TestingCenterLinearPilotClaim = {
  status:
    | "claimed"
    | "paused"
    | "busy"
    | "retry_scheduled"
    | "needs_owner"
    | "completed"
    | "not_selected"
    | "not_prepared"
    | "exhausted"
    | "dry_run_completed";
  fencingToken: number;
};

export interface TestingCenterLinearPilotStore {
  triage(reportId: string): Promise<{ effectId: string }>;
  prepare(effectId: string): Promise<
    | { status: "prepared"; source: TestingCenterLinearProjectionInput }
    | { status: "paused" | "needs_owner" }
  >;
  claim(
    effectId: string,
    workerId: string,
  ): Promise<TestingCenterLinearPilotClaim>;
  assertDispatch(input: {
    projection: LinearIssueProjection;
    canonicalProjection: string;
    workerId: string;
    fencingToken: number;
  }): Promise<void>;
  complete(input: {
    projection: LinearIssueProjection;
    workerId: string;
    fencingToken: number;
    issue: TestingCenterLinearCreatedIssue;
  }): Promise<void>;
  retry(
    effectId: string,
    workerId: string,
    fencingToken: number,
    projectionDigest: string,
  ): Promise<void>;
  ambiguous(
    effectId: string,
    workerId: string,
    fencingToken: number,
  ): Promise<void>;
}

export type TestingCenterLinearPilotDeps = {
  store: TestingCenterLinearPilotStore;
  dispatch: (
    projection: LinearIssueProjection,
  ) => Promise<TestingCenterLinearDispatchResult>;
  pilotSecret: string;
  workerId: string;
};

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBytes = ENCODER.encode(left);
  const rightBytes = ENCODER.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function handleTestingCenterLinearPilotRequest(
  request: Request,
  deps: TestingCenterLinearPilotDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (
    deps.pilotSecret.length < 32 || deps.pilotSecret.length > 4096 ||
    !constantTimeTextEqual(authorization, `Bearer ${deps.pilotSecret}`)
  ) return json({ code: "unauthorized" }, 401);
  if (!WORKER_ID.test(deps.workerId)) {
    return json({ code: "pilot_configuration_invalid" }, 503);
  }
  const parsed = await readJsonObject(request, 2048);
  const input = parsed.ok ? parsed.value : null;
  if (
    !input || !exactKeys(input, ["contractVersion", "reportId"]) ||
    input.contractVersion !== "testing-center.linear-pilot.v1" ||
    typeof input.reportId !== "string" || !REPORT_ID.test(input.reportId)
  ) return json({ code: "invalid_request" }, 400);

  let effectId: string;
  try {
    const triage = await deps.store.triage(input.reportId);
    effectId = triage.effectId;
    if (!EFFECT_ID.test(effectId)) throw new Error("invalid effect");
  } catch {
    return json({ code: "pilot_triage_rejected" }, 409);
  }
  let prepared: Awaited<ReturnType<TestingCenterLinearPilotStore["prepare"]>>;
  try {
    prepared = await deps.store.prepare(effectId);
  } catch {
    return json({ code: "pilot_store_unavailable" }, 503);
  }
  if (prepared.status !== "prepared") {
    return json({ code: prepared.status }, 409);
  }

  let projection: LinearIssueProjection;
  try {
    projection = await buildTestingCenterLinearIssueProjection(prepared.source);
  } catch {
    return json({ code: "projection_invalid" }, 409);
  }
  let claim: TestingCenterLinearPilotClaim;
  try {
    claim = await deps.store.claim(effectId, deps.workerId);
  } catch {
    return json({ code: "pilot_store_unavailable" }, 503);
  }
  if (claim.status !== "claimed") {
    return json({ code: claim.status }, 409);
  }
  const canonicalProjection = JSON.stringify({
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
    serverMetadataDigest: await crypto.subtle.digest(
      "SHA-256",
      ENCODER.encode(JSON.stringify(projection.serverMetadata)),
    ).then((digest) =>
      Array.from(
        new Uint8Array(digest),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("")
    ),
  });
  try {
    await deps.store.assertDispatch({
      projection,
      canonicalProjection,
      workerId: deps.workerId,
      fencingToken: claim.fencingToken,
    });
  } catch {
    return json({ code: "dispatch_gate_rejected" }, 409);
  }

  let result: TestingCenterLinearDispatchResult;
  try {
    result = await deps.dispatch(projection);
  } catch {
    try {
      await deps.store.ambiguous(effectId, deps.workerId, claim.fencingToken);
    } catch {
      // Never retry an unexpected failure after the dispatch gate opened.
    }
    return json({ code: "linear_response_ambiguous" }, 409);
  }
  if (result.status === "retryable") {
    try {
      await deps.store.retry(
        effectId,
        deps.workerId,
        claim.fencingToken,
        projection.projectionDigest,
      );
    } catch {
      return json({ code: "pilot_store_unavailable" }, 503);
    }
    return json({ code: result.errorCode }, 503);
  }
  if (result.status === "ambiguous") {
    try {
      await deps.store.ambiguous(effectId, deps.workerId, claim.fencingToken);
    } catch {
      return json({ code: "pilot_store_unavailable" }, 503);
    }
    return json({ code: result.errorCode }, 409);
  }
  try {
    await deps.store.complete({
      projection,
      workerId: deps.workerId,
      fencingToken: claim.fencingToken,
      issue: result.issue,
    });
  } catch {
    try {
      await deps.store.ambiguous(effectId, deps.workerId, claim.fencingToken);
    } catch {
      // The external result is already ambiguous; never retry issueCreate.
    }
    return json({ code: "linear_completion_ambiguous" }, 409);
  }
  return json({
    contractVersion: "testing-center.linear-pilot-result.v1",
    status: "created",
    reportId: input.reportId,
    effectId,
    identifier: result.issue.identifier,
    url: result.issue.url,
  });
}
