import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  handleTestingCenterLinearWebhookRequest,
  type TestingCenterLinearWebhookStore,
} from "../_shared/testing-center-linear-webhook-handler.ts";

function productionStore(): TestingCenterLinearWebhookStore {
  const admin = getSupabaseAdmin();
  return {
    async reconcile(event) {
      const { data, error } = await admin.rpc(
        "testing_center_reconcile_linear_webhook",
        {
          p_delivery_id: event.deliveryId,
          p_webhook_id: event.webhookId,
          p_organization_id: event.organizationId,
          p_external_issue_id: event.externalIssueId,
          p_event_name: event.eventName,
          p_event_action: event.action,
          p_webhook_timestamp_ms: event.webhookTimestampMs,
          p_event_created_at: event.eventCreatedAt,
          p_linear_state_id: event.linearStateId,
          p_payload_digest: event.payloadDigest,
        },
      );
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw error ??
          new Error("testing_center_linear_webhook_result_invalid");
      }
      return {
        deliveryStatus: String(data[0].delivery_status),
        currentObservedState: String(data[0].current_observed_state),
      };
    },
  };
}

export function handleRequest(request: Request): Promise<Response> {
  return handleTestingCenterLinearWebhookRequest(request, {
    secret: Deno.env.get("LINEAR_WEBHOOK_SECRET") ?? "",
    store: productionStore(),
  });
}

if (import.meta.main) Deno.serve(handleRequest);
