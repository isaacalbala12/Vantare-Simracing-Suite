import type { TestingCenterLinearPilotStore } from "./testing-center-linear-pilot.ts";

export interface TestingCenterLinearRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

function one(data: unknown, error: unknown): Record<string, unknown> {
  if (error || !Array.isArray(data) || data.length !== 1) {
    throw error ?? new Error("testing_center_linear_rpc_result_invalid");
  }
  return data[0] as Record<string, unknown>;
}

export function createTestingCenterLinearPilotStore(
  admin: TestingCenterLinearRpcClient,
): TestingCenterLinearPilotStore {
  return {
    async triage(reportId) {
      const { data, error } = await admin.rpc("testing_center_triage_report", {
        p_report_id: reportId,
      });
      const row = one(data, error);
      if (typeof row.result_effect_id !== "string") {
        throw new Error("testing_center_linear_triage_invalid");
      }
      return { effectId: row.result_effect_id };
    },
    async prepare(effectId) {
      const { data, error } = await admin.rpc(
        "testing_center_prepare_linear_projection",
        { p_effect_id: effectId },
      );
      const row = one(data, error);
      const status = String(row.preparation_status);
      if (status === "paused" || status === "needs_owner") return { status };
      if (
        status !== "prepared" ||
        typeof row.prepared_source_snapshot !== "object" ||
        row.prepared_source_snapshot === null ||
        typeof row.prepared_source_digest !== "string"
      ) throw new Error("testing_center_linear_prepare_invalid");
      return {
        status: "prepared",
        source: {
          ...(row.prepared_source_snapshot as Record<string, unknown>),
          sourceDigest: row.prepared_source_digest,
        } as never,
      };
    },
    async claim(effectId, workerId) {
      const { data, error } = await admin.rpc(
        "testing_center_claim_linear_effect",
        {
          p_effect_id: effectId,
          p_worker_id: workerId,
          p_lease_seconds: 300,
        },
      );
      const row = one(data, error);
      return {
        status: String(row.claim_status) as never,
        fencingToken: Number(row.fencing_token),
      };
    },
    async assertDispatch(input) {
      const { error } = await admin.rpc(
        "testing_center_assert_linear_dispatch",
        {
          p_effect_id: input.projection.effectId,
          p_worker_id: input.workerId,
          p_fencing_token: input.fencingToken,
          p_source_digest: input.projection.sourceDigest,
          p_projection: JSON.parse(input.canonicalProjection),
          p_canonical_projection: input.canonicalProjection,
          p_projection_digest: input.projection.projectionDigest,
        },
      );
      if (error) throw error;
    },
    async complete(input) {
      const { error } = await admin.rpc(
        "testing_center_complete_linear_pilot",
        {
          p_effect_id: input.projection.effectId,
          p_worker_id: input.workerId,
          p_fencing_token: input.fencingToken,
          p_projection_digest: input.projection.projectionDigest,
          p_external_issue_id: input.issue.externalIssueId,
          p_organization_id: input.issue.organizationId,
          p_external_identifier: input.issue.identifier,
          p_external_url: input.issue.url,
          p_bound_by_id: input.workerId,
        },
      );
      if (error) throw error;
    },
    async retry(effectId, workerId, fencingToken, projectionDigest) {
      const { error } = await admin.rpc(
        "testing_center_retry_linear_pilot_token",
        {
          p_effect_id: effectId,
          p_worker_id: workerId,
          p_fencing_token: fencingToken,
          p_projection_digest: projectionDigest,
        },
      );
      if (error) throw error;
    },
    async ambiguous(effectId, workerId, fencingToken) {
      const { error } = await admin.rpc(
        "testing_center_record_linear_ambiguity",
        {
          p_effect_id: effectId,
          p_worker_id: workerId,
          p_fencing_token: fencingToken,
        },
      );
      if (error) throw error;
    },
  };
}
