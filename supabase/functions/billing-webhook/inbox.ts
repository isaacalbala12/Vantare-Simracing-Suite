import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type WebhookInboxState =
  | "received"
  | "processing"
  | "processed"
  | "failed"
  | "quarantined";

export type WebhookDelivery = {
  provider: string;
  eventId: string;
  eventType: string;
  payloadHash: string;
  payload: Record<string, unknown>;
};

export type WebhookReceipt = {
  id: string;
  status: WebhookInboxState;
  payloadMatches: boolean;
};

export type ClaimedWebhook = {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attemptCount: number;
};

export type WebhookClaim =
  | { status: "claimed"; item: ClaimedWebhook }
  | { status: "retry_scheduled"; nextAttemptAt: string }
  | { status: "busy"; leaseExpiresAt: string }
  | { status: "processed" | "quarantined" };

export type EffectClaim = "claimed" | "completed" | "busy";

export interface WebhookInbox {
  receive(delivery: WebhookDelivery): Promise<WebhookReceipt>;
  claim(inboxId: string, leaseToken: string): Promise<WebhookClaim>;
  complete(inboxId: string, leaseToken: string): Promise<void>;
  fail(
    inboxId: string,
    leaseToken: string,
    errorCode: string,
  ): Promise<"failed" | "quarantined">;
  quarantine(
    inboxId: string,
    leaseToken: string,
    reasonCode: string,
  ): Promise<void>;
  claimEffect(
    inboxId: string,
    effectKey: string,
    leaseToken: string,
  ): Promise<EffectClaim>;
  completeEffect(
    inboxId: string,
    effectKey: string,
    leaseToken: string,
  ): Promise<void>;
  failEffect(
    inboxId: string,
    effectKey: string,
    leaseToken: string,
    errorCode: string,
  ): Promise<void>;
  replay(
    inboxId: string,
    actorId: string,
    reasonCode: string,
  ): Promise<void>;
}

type RpcError = { code?: string; message?: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rpcRow(data: unknown, operation: string): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data;
  const row = asRecord(value);
  if (!row) throw new Error(`${operation} returned no row`);
  return row;
}

function rpcFailure(operation: string, error: unknown): Error {
  const typed = asRecord(error) as RpcError | null;
  const code = typed?.code && /^[A-Za-z0-9_]{1,32}$/.test(typed.code)
    ? typed.code
    : "unknown";
  return new Error(`${operation} failed (${code})`);
}

function requiredString(
  row: Record<string, unknown>,
  key: string,
  operation: string,
): string {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`${operation} returned invalid ${key}`);
  }
  return value;
}

function state(value: unknown, operation: string): WebhookInboxState {
  if (
    value === "received" || value === "processing" || value === "processed" ||
    value === "failed" || value === "quarantined"
  ) return value;
  throw new Error(`${operation} returned invalid state`);
}

async function callRpc(
  supabase: SupabaseClient,
  operation: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.rpc(operation, args);
  if (error) throw rpcFailure(operation, error);
  return data;
}

export async function computeWebhookPayloadHash(
  rawBody: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawBody),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function sanitizeWebhookErrorCode(error: unknown): string {
  const row = asRecord(error);
  const code = typeof row?.code === "string" ? row.code.toLowerCase() : "";
  return /^[a-z0-9_]{1,64}$/.test(code) ? code : "processing_failed";
}

export function createSupabaseWebhookInbox(
  supabase: SupabaseClient,
): WebhookInbox {
  return {
    async receive(delivery) {
      const operation = "billing_receive_webhook";
      const row = rpcRow(
        await callRpc(supabase, operation, {
          p_provider: delivery.provider,
          p_provider_event_id: delivery.eventId,
          p_event_type: delivery.eventType,
          p_payload_hash: delivery.payloadHash,
          p_payload: delivery.payload,
        }),
        operation,
      );
      return {
        id: requiredString(row, "inbox_id", operation),
        status: state(row.delivery_status, operation),
        payloadMatches: row.payload_matches === true,
      };
    },

    async claim(inboxId, leaseToken) {
      const operation = "billing_claim_webhook";
      const row = rpcRow(
        await callRpc(supabase, operation, {
          p_inbox_id: inboxId,
          p_lease_token: leaseToken,
          p_lease_seconds: 60,
        }),
        operation,
      );
      const claimStatus = requiredString(row, "claim_status", operation);
      if (claimStatus !== "claimed") {
        if (claimStatus === "busy") {
          return {
            status: claimStatus,
            leaseExpiresAt: requiredString(row, "lease_expires_at", operation),
          };
        }
        if (claimStatus === "retry_scheduled") {
          return {
            status: claimStatus,
            nextAttemptAt: requiredString(row, "next_attempt_at", operation),
          };
        }
        if (
          claimStatus === "processed" || claimStatus === "quarantined"
        ) return { status: claimStatus };
        throw new Error(`${operation} returned invalid claim_status`);
      }
      const payload = asRecord(row.payload);
      if (!payload) throw new Error(`${operation} returned invalid payload`);
      return {
        status: "claimed",
        item: {
          id: requiredString(row, "inbox_id", operation),
          provider: requiredString(row, "provider", operation),
          eventId: requiredString(row, "provider_event_id", operation),
          eventType: requiredString(row, "event_type", operation),
          payload,
          attemptCount: typeof row.attempt_count === "number"
            ? row.attempt_count
            : Number(row.attempt_count),
        },
      };
    },

    async complete(inboxId, leaseToken) {
      const operation = "billing_complete_webhook";
      const row = rpcRow(
        await callRpc(supabase, operation, {
          p_inbox_id: inboxId,
          p_lease_token: leaseToken,
        }),
        operation,
      );
      if (row.completed !== true) throw new Error(`${operation} lost lease`);
    },

    async fail(inboxId, leaseToken, errorCode) {
      const operation = "billing_fail_webhook";
      const row = rpcRow(
        await callRpc(supabase, operation, {
          p_inbox_id: inboxId,
          p_lease_token: leaseToken,
          p_error_code: errorCode,
        }),
        operation,
      );
      const result = state(row.failure_status, operation);
      if (result !== "failed" && result !== "quarantined") {
        throw new Error(`${operation} returned invalid failure_status`);
      }
      return result;
    },

    async quarantine(inboxId, leaseToken, reasonCode) {
      const operation = "billing_quarantine_webhook";
      const row = rpcRow(
        await callRpc(supabase, operation, {
          p_inbox_id: inboxId,
          p_lease_token: leaseToken,
          p_reason_code: reasonCode,
        }),
        operation,
      );
      if (row.quarantined !== true) throw new Error(`${operation} lost lease`);
    },

    async claimEffect(inboxId, effectKey, leaseToken) {
      const operation = "billing_claim_webhook_effect";
      const row = rpcRow(
        await callRpc(supabase, operation, {
          p_inbox_id: inboxId,
          p_effect_key: effectKey,
          p_lease_token: leaseToken,
          p_lease_seconds: 60,
        }),
        operation,
      );
      const result = requiredString(row, "claim_status", operation);
      if (result === "claimed" || result === "completed" || result === "busy") {
        return result;
      }
      throw new Error(`${operation} returned invalid claim_status`);
    },

    async completeEffect(inboxId, effectKey, leaseToken) {
      const operation = "billing_complete_webhook_effect";
      const row = rpcRow(
        await callRpc(supabase, operation, {
          p_inbox_id: inboxId,
          p_effect_key: effectKey,
          p_lease_token: leaseToken,
        }),
        operation,
      );
      if (row.completed !== true) throw new Error(`${operation} lost lease`);
    },

    async failEffect(inboxId, effectKey, leaseToken, errorCode) {
      const operation = "billing_fail_webhook_effect";
      const row = rpcRow(
        await callRpc(supabase, operation, {
          p_inbox_id: inboxId,
          p_effect_key: effectKey,
          p_lease_token: leaseToken,
          p_error_code: errorCode,
        }),
        operation,
      );
      if (row.failed !== true) throw new Error(`${operation} lost lease`);
    },

    async replay(inboxId, actorId, reasonCode) {
      const operation = "billing_replay_webhook";
      const row = rpcRow(
        await callRpc(supabase, operation, {
          p_inbox_id: inboxId,
          p_actor_id: actorId,
          p_reason_code: reasonCode,
        }),
        operation,
      );
      if (row.replay_queued !== true) {
        throw new Error(`${operation} rejected replay`);
      }
    },
  };
}
