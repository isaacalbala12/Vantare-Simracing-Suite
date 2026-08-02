import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signStandardWebhookForTest } from "../_shared/webhook-verify.ts";
import {
  handleWebhookRequest,
  MAX_WEBHOOK_BODY_BYTES,
  WEBHOOK_HEADER_ID,
  WEBHOOK_HEADER_SIGNATURE,
  WEBHOOK_HEADER_TIMESTAMP,
} from "./index.ts";
import { computeWebhookPayloadHash } from "./inbox.ts";
import type { BillingSignal } from "./observability.ts";
import type { ProcessResult } from "./process.ts";

const TEST_WEBHOOK_SECRET = "whsec_dGVzdC13ZWJob29rLXNlY3JldC1rZXkhIQ==";
const LAUNCH_PRODUCT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "4b6d8919-1c89-492d-a0e2-364124c17878";

async function signedWebhookRequest(
  body: unknown,
  options: {
    secret?: string | null;
    eventId?: string;
    timestamp?: string;
    signature?: string;
  } = {},
): Promise<Request> {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const eventId = options.eventId ?? "evt_test_123";
  const timestamp = options.timestamp ??
    String(Math.floor(Date.now() / 1000));
  const secret = options.secret === undefined
    ? TEST_WEBHOOK_SECRET
    : options.secret;
  const signature = options.signature ??
    (secret
      ? await signStandardWebhookForTest(rawBody, secret, eventId, timestamp)
      : "v1,invalid");

  return new Request("http://localhost/billing-webhook", {
    method: "POST",
    headers: {
      [WEBHOOK_HEADER_ID]: eventId,
      [WEBHOOK_HEADER_TIMESTAMP]: timestamp,
      [WEBHOOK_HEADER_SIGNATURE]: signature,
      "Content-Type": "application/json",
    },
    body: rawBody,
  });
}

function fakeSupabase(): SupabaseClient {
  return {
    from: () => ({
      insert: () => Promise.resolve({ error: null }),
      upsert: () => Promise.resolve({ error: null }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            is: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          is: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

Deno.test("billing-webhook: missing POLAR_WEBHOOK_SECRET is 503", async () => {
  const signals: BillingSignal[] = [];
  const res = await handleWebhookRequest(
    await signedWebhookRequest({ type: "order.paid", data: {} }),
    {
      getSecret: () => null,
      signalSink: {
        emit(signal) {
          signals.push(signal);
        },
      },
    },
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "webhook_not_configured");
  assertEquals(signals.map((signal) => signal.code), ["endpoint_disabled"]);
});

Deno.test("billing-webhook: missing signature headers is 400", async () => {
  const res = await handleWebhookRequest(
    new Request("http://localhost/billing-webhook", {
      method: "POST",
      body: "{}",
    }),
    { getSecret: () => TEST_WEBHOOK_SECRET },
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "missing_webhook_headers");
});

Deno.test("billing-webhook: invalid signature is 403", async () => {
  const res = await handleWebhookRequest(
    await signedWebhookRequest(
      { type: "order.paid", data: { product_id: LAUNCH_PRODUCT_ID } },
      { signature: "v1,not-a-valid-signature" },
    ),
    { getSecret: () => TEST_WEBHOOK_SECRET },
  );
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "invalid_webhook_signature");
});

Deno.test("billing-webhook: rejects declared oversized bodies before verification", async () => {
  const request = await signedWebhookRequest("{}");
  request.headers.set(
    "Content-Length",
    String(MAX_WEBHOOK_BODY_BYTES + 1),
  );
  let verifyCalls = 0;
  let persistCalls = 0;

  const res = await handleWebhookRequest(request, {
    getSecret: () => TEST_WEBHOOK_SECRET,
    verifyWebhook: async () => {
      verifyCalls += 1;
    },
    getSupabase: () => {
      persistCalls += 1;
      return fakeSupabase();
    },
  });

  assertEquals(res.status, 413);
  assertEquals((await res.json()).error, "webhook_body_too_large");
  assertEquals(verifyCalls, 0);
  assertEquals(persistCalls, 0);
});

Deno.test("billing-webhook: cancels an oversized chunked stream before verification", async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_WEBHOOK_BODY_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      canceled = true;
    },
  });
  let verifyCalls = 0;
  let persistCalls = 0;
  const request = new Request("http://localhost/billing-webhook", {
    method: "POST",
    headers: {
      [WEBHOOK_HEADER_ID]: "evt_oversized_stream",
      [WEBHOOK_HEADER_TIMESTAMP]: "1785657600",
      [WEBHOOK_HEADER_SIGNATURE]: "v1,not-used",
      "Content-Type": "application/json",
    },
    body: stream,
  });

  const res = await handleWebhookRequest(request, {
    getSecret: () => TEST_WEBHOOK_SECRET,
    verifyWebhook: async () => {
      verifyCalls += 1;
    },
    getSupabase: () => {
      persistCalls += 1;
      return fakeSupabase();
    },
  });

  assertEquals(res.status, 413);
  assertEquals((await res.json()).error, "webhook_body_too_large");
  assertEquals(canceled, true);
  assertEquals(verifyCalls, 0);
  assertEquals(persistCalls, 0);
});

Deno.test("billing-webhook: invalid JSON payload is 400", async () => {
  const res = await handleWebhookRequest(
    await signedWebhookRequest("{not-json"),
    { getSecret: () => TEST_WEBHOOK_SECRET },
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid_webhook_payload");
});

Deno.test("billing-webhook: valid signed event returns 202", async () => {
  let processed = false;
  let receivedPayloadHash: string | undefined;
  const payload = {
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
    },
  };
  const rawBody = JSON.stringify(payload);
  const res = await handleWebhookRequest(
    await signedWebhookRequest(rawBody),
    {
      getSecret: () => TEST_WEBHOOK_SECRET,
      getSupabase: () => fakeSupabase(),
      processEvent: async (_event, _eventId, deps) => {
        processed = true;
        receivedPayloadHash = deps.payloadHash;
        return { status: "processed", action: "granted_lifetime_bundle" };
      },
    },
  );

  assertEquals(res.status, 202);
  assertEquals(processed, true);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.status, "processed");
  assertEquals(body.action, "granted_lifetime_bundle");
  assertEquals(receivedPayloadHash, await computeWebhookPayloadHash(rawBody));
});

Deno.test("billing-webhook: verifies and hashes the exact untrimmed body", async () => {
  const rawBody =
    ` \n{\"type\":\"order.paid\",\"data\":{\"product_id\":\"${LAUNCH_PRODUCT_ID}\",\"external_customer_id\":\"${USER_ID}\"}}\r\n `;
  let receivedPayloadHash: string | undefined;

  const res = await handleWebhookRequest(
    await signedWebhookRequest(rawBody),
    {
      getSecret: () => TEST_WEBHOOK_SECRET,
      getSupabase: () => fakeSupabase(),
      processEvent: async (_event, _eventId, deps) => {
        receivedPayloadHash = deps.payloadHash;
        return { status: "processed", action: "granted_lifetime_bundle" };
      },
    },
  );

  assertEquals(res.status, 202);
  assertEquals(receivedPayloadHash, await computeWebhookPayloadHash(rawBody));
});

Deno.test("billing-webhook: duplicate event id returns 202 without reprocessing", async () => {
  let calls = 0;
  const processEvent = async (): Promise<ProcessResult> => {
    calls += 1;
    return calls === 1
      ? { status: "processed", action: "granted_lifetime_bundle" }
      : { status: "duplicate" };
  };

  const deps = {
    getSecret: () => TEST_WEBHOOK_SECRET,
    getSupabase: () => fakeSupabase(),
    processEvent,
  };

  const payload = {
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
    },
  };

  const first = await handleWebhookRequest(
    await signedWebhookRequest(payload, { eventId: "evt_dup_http" }),
    deps,
  );
  const second = await handleWebhookRequest(
    await signedWebhookRequest(payload, { eventId: "evt_dup_http" }),
    deps,
  );

  assertEquals(first.status, 202);
  assertEquals(second.status, 202);
  const secondBody = await second.json();
  assertEquals(secondBody.status, "duplicate");
  assertEquals(calls, 2);
});

Deno.test("billing-webhook: ignored unknown product still returns 202", async () => {
  const res = await handleWebhookRequest(
    await signedWebhookRequest({
      type: "order.paid",
      data: {
        product_id: "unknown-product-id",
        external_customer_id: USER_ID,
      },
    }),
    {
      getSecret: () => TEST_WEBHOOK_SECRET,
      getSupabase: () => fakeSupabase(),
      processEvent: async () => ({
        status: "ignored",
        reason: "unknown_product_id",
      }),
    },
  );

  assertEquals(res.status, 202);
  const body = await res.json();
  assertEquals(body.status, "ignored");
  assertEquals(body.reason, "unknown_product_id");
});

Deno.test("billing-webhook: scheduled retry stays provider-retryable without a scheduler", async () => {
  const nextAttemptAt = "2026-08-02T12:00:30.000Z";
  const res = await handleWebhookRequest(
    await signedWebhookRequest({
      type: "order.paid",
      data: {
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
      },
    }),
    {
      getSecret: () => TEST_WEBHOOK_SECRET,
      getSupabase: () => fakeSupabase(),
      now: () => new Date("2026-08-02T12:00:00.000Z"),
      processEvent: async () => ({
        status: "deferred",
        reason: "retry_scheduled",
        nextAttemptAt,
      }),
    },
  );

  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "webhook_retry_scheduled");
  assertEquals(body.next_attempt_at, nextAttemptAt);
  assertEquals(body.ok, undefined);
  assertEquals(res.headers.get("Retry-After"), "30");
});

Deno.test("billing-webhook: concurrent busy claim remains provider-retryable", async () => {
  const leaseExpiresAt = "2026-08-02T12:01:00.000Z";
  const res = await handleWebhookRequest(
    await signedWebhookRequest({
      type: "order.paid",
      data: {
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
      },
    }),
    {
      getSecret: () => TEST_WEBHOOK_SECRET,
      getSupabase: () => fakeSupabase(),
      now: () => new Date("2026-08-02T12:00:00.000Z"),
      processEvent: async () => ({
        status: "deferred",
        reason: "processing",
        leaseExpiresAt,
      }),
    },
  );

  assertEquals(res.status, 503);
  assertEquals(res.headers.get("Retry-After"), "60");
  const body = await res.json();
  assertEquals(body.error, "webhook_processing_busy");
  assertEquals(body.lease_expires_at, leaseExpiresAt);
  assertEquals(body.ok, undefined);
});

Deno.test("billing-webhook: processing failure is retryable without leaking the cause", async () => {
  const signals: BillingSignal[] = [];
  const res = await handleWebhookRequest(
    await signedWebhookRequest({
      type: "order.paid",
      data: {
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
      },
    }),
    {
      getSecret: () => TEST_WEBHOOK_SECRET,
      getSupabase: () => fakeSupabase(),
      processEvent: () =>
        Promise.reject(new Error("buyer@example.com secret-token")),
      signalSink: {
        emit(signal) {
          signals.push(signal);
        },
      },
    },
  );

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "webhook_processing_failed");
  assertEquals(
    body.message,
    "The verified event is stored and will be retried safely",
  );
  assertEquals(JSON.stringify(body).includes("buyer@example.com"), false);
  assertEquals(JSON.stringify(body).includes("secret-token"), false);
  assertEquals(signals.length, 1);
  assertEquals(signals[0].code, "webhook_processing_failed");
  assertEquals(signals[0].reasonCode, "processing_failed");
  assertEquals(JSON.stringify(signals).includes("buyer@example.com"), false);
});
