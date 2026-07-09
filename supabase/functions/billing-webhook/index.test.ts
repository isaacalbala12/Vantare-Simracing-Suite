import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signStandardWebhookForTest } from "../_shared/webhook-verify.ts";
import {
  handleWebhookRequest,
  WEBHOOK_HEADER_ID,
  WEBHOOK_HEADER_SIGNATURE,
  WEBHOOK_HEADER_TIMESTAMP,
} from "./index.ts";
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
  const res = await handleWebhookRequest(
    await signedWebhookRequest({ type: "order.paid", data: {} }),
    { getSecret: () => null },
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "webhook_not_configured");
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
      processEvent: async () => {
        processed = true;
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