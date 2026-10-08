import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { BillingEnvironment } from "../_shared/mapping.ts";
import { computeWebhookPayloadHash } from "./inbox.ts";

export type DisputeSnapshot = {
  id: string;
  orderId: string;
  modifiedAt: string;
  blocked: boolean;
};

export function parseDisputeSnapshot(
  value: Record<string, unknown>,
): DisputeSnapshot | null {
  if (
    typeof value.id !== "string" || value.id.length < 1 ||
    value.id.length > 200 ||
    typeof value.order_id !== "string" || value.order_id.length < 1 ||
    value.order_id.length > 200
  ) return null;
  const states = [
    "early_warning",
    "needs_response",
    "under_review",
    "lost",
    "won",
    "prevented",
  ];
  if (typeof value.status !== "string" || !states.includes(value.status)) {
    return null;
  }
  const modifiedAt = value.modified_at ?? value.created_at;
  if (
    typeof modifiedAt !== "string" || !Number.isFinite(Date.parse(modifiedAt))
  ) return null;
  return {
    id: value.id,
    orderId: value.order_id,
    modifiedAt: new Date(modifiedAt).toISOString(),
    // Polar's won/lost is from the merchant's perspective. Isaac's explicit
    // rule restores access when the customer wins (merchant lost). A prevented
    // dispute has an issued refund; its independent refund restriction remains.
    blocked: value.status !== "lost" && value.status !== "prevented",
  };
}

export async function applyPolarDisputeSnapshot(
  supabase: SupabaseClient,
  environment: BillingEnvironment,
  payload: Record<string, unknown>,
): Promise<"applied" | "missing_order"> {
  const dispute = parseDisputeSnapshot(payload);
  if (!dispute) {
    throw Object.assign(new Error("invalid_dispute_snapshot"), {
      code: "invalid_dispute_snapshot",
    });
  }
  const { data, error } = await supabase.rpc(
    "billing_record_dispute_snapshot",
    {
      p_environment: environment,
      p_dispute_id: dispute.id,
      p_order_id: dispute.orderId,
      p_blocked: dispute.blocked,
      p_modified_at: dispute.modifiedAt,
      p_snapshot_hash: await computeWebhookPayloadHash(JSON.stringify(dispute)),
    },
  );
  if (error) {
    throw Object.assign(new Error("dispute_projection_failed"), {
      code: error.code,
    });
  }
  if (data !== "applied" && data !== "missing_order") {
    throw new Error("invalid_dispute_projection_result");
  }
  return data;
}
