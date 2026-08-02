import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  computeWebhookPayloadHash,
  createSupabaseWebhookInbox,
  sanitizeWebhookErrorCode,
} from "./inbox.ts";

type RpcResult = { data: unknown; error: unknown };

function mockRpcClient(results: Record<string, RpcResult>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve(results[name] ?? { data: null, error: null });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

Deno.test("computeWebhookPayloadHash: is deterministic SHA-256", async () => {
  assertEquals(
    await computeWebhookPayloadHash('{"type":"order.paid"}'),
    "01b0b5f9951b28a5fed637a7346bd7594dd6dcf87b997075c7be9252b4675646",
  );
});

Deno.test("sanitizeWebhookErrorCode: never persists messages or PII", () => {
  assertEquals(
    sanitizeWebhookErrorCode(
      new Error("buyer@example.com failed: secret-token"),
    ),
    "processing_failed",
  );
  assertEquals(
    sanitizeWebhookErrorCode({ code: "PGRST116", message: "private" }),
    "pgrst116",
  );
});

Deno.test("SupabaseWebhookInbox: receive delegates identity and hash to the atomic RPC", async () => {
  const mock = mockRpcClient({
    billing_receive_webhook: {
      data: [{
        inbox_id: "inbox-1",
        delivery_status: "received",
        payload_matches: true,
      }],
      error: null,
    },
  });
  const inbox = createSupabaseWebhookInbox(mock.client);

  const result = await inbox.receive({
    provider: "polar",
    environment: "sandbox",
    eventId: "evt-1",
    eventType: "order.paid",
    payloadHash: "a".repeat(64),
    payload: { type: "order.paid", data: {} },
  });

  assertEquals(result, {
    id: "inbox-1",
    status: "received",
    payloadMatches: true,
  });
  assertEquals(mock.calls[0], {
    name: "billing_receive_webhook",
    args: {
      p_provider: "polar",
      p_environment: "sandbox",
      p_provider_event_id: "evt-1",
      p_event_type: "order.paid",
      p_payload_hash: "a".repeat(64),
      p_payload: { type: "order.paid", data: {} },
    },
  });
});

Deno.test("SupabaseWebhookInbox: database errors retain context without exposing payload", async () => {
  const mock = mockRpcClient({
    billing_claim_webhook: {
      data: null,
      error: {
        code: "42501",
        message: "permission denied for buyer@example.com",
      },
    },
  });
  const inbox = createSupabaseWebhookInbox(mock.client);

  await assertRejects(
    () => inbox.claim("inbox-1", "00000000-0000-4000-8000-000000000001"),
    Error,
    "billing_claim_webhook failed (42501)",
  );
});

Deno.test("SupabaseWebhookInbox: scheduled retry retains its durable next_attempt_at", async () => {
  const mock = mockRpcClient({
    billing_claim_webhook: {
      data: [{
        claim_status: "retry_scheduled",
        next_attempt_at: "2026-08-02T12:00:30+00:00",
      }],
      error: null,
    },
  });
  const inbox = createSupabaseWebhookInbox(mock.client);

  assertEquals(
    await inbox.claim(
      "inbox-1",
      "00000000-0000-4000-8000-000000000001",
    ),
    {
      status: "retry_scheduled",
      nextAttemptAt: "2026-08-02T12:00:30+00:00",
    },
  );
});

Deno.test("SupabaseWebhookInbox: busy claim retains its durable lease expiry", async () => {
  const mock = mockRpcClient({
    billing_claim_webhook: {
      data: [{
        claim_status: "busy",
        lease_expires_at: "2026-08-02T12:01:00+00:00",
      }],
      error: null,
    },
  });
  const inbox = createSupabaseWebhookInbox(mock.client);

  assertEquals(
    await inbox.claim(
      "inbox-1",
      "00000000-0000-4000-8000-000000000002",
    ),
    {
      status: "busy",
      leaseExpiresAt: "2026-08-02T12:01:00+00:00",
    },
  );
});
