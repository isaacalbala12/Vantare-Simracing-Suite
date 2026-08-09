// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  LinearWebhookError,
  signTestingCenterLinearWebhookForTest,
  verifyTestingCenterLinearWebhook,
} from "./testing-center-linear-webhook.ts";

const secret = "linear-webhook-secret-that-is-at-least-32-bytes";
const now = new Date("2026-08-03T12:00:00.000Z");
const timestamp = now.getTime();
const ids = {
  delivery: "11111111-1111-4111-8111-111111111111",
  webhook: "22222222-2222-4222-8222-222222222222",
  organization: "33333333-3333-4333-8333-333333333333",
  issue: "44444444-4444-4444-8444-444444444444",
  state: "55555555-5555-4555-8555-555555555555",
};

function rawPayload(overrides: Record<string, unknown> = {}) {
  return new TextEncoder().encode(JSON.stringify({
    action: "update",
    type: "Issue",
    webhookId: ids.webhook,
    organizationId: ids.organization,
    webhookTimestamp: timestamp,
    createdAt: now.toISOString(),
    data: { id: ids.issue, state: { id: ids.state, name: "Ignored" } },
    actor: { name: "Must not be persisted" },
    ...overrides,
  }));
}

async function headers(raw: Uint8Array) {
  return {
    deliveryId: ids.delivery,
    eventName: "Issue",
    signature: await signTestingCenterLinearWebhookForTest(raw, secret),
    timestamp: String(timestamp),
  };
}

Deno.test("Linear signature covers the exact raw body and emits only allowlisted facts", async () => {
  const raw = rawPayload();
  const verified = await verifyTestingCenterLinearWebhook(
    raw,
    await headers(raw),
    secret,
    now,
  );
  assertEquals(verified.action, "update");
  assertEquals(verified.linearStateId, ids.state);
  assertEquals(verified.externalIssueId, ids.issue);
  assertEquals(Object.hasOwn(verified, "actor"), false);
  assertEquals(Object.hasOwn(verified, "data"), false);
  assertEquals(verified.payloadDigest.length, 64);
});

Deno.test("mutating one raw byte after signing fails closed", async () => {
  const raw = rawPayload();
  const signedHeaders = await headers(raw);
  const mutated = new Uint8Array(raw);
  mutated[mutated.length - 2] ^= 1;
  await assertRejects(
    () => verifyTestingCenterLinearWebhook(mutated, signedHeaders, secret, now),
    LinearWebhookError,
    "linear_webhook_signature_invalid",
  );
});

Deno.test("forged signature, stale timestamp and timestamp disagreement fail closed", async () => {
  const raw = rawPayload();
  const validHeaders = await headers(raw);
  await assertRejects(
    () =>
      verifyTestingCenterLinearWebhook(
        raw,
        {
          ...validHeaders,
          signature: "0".repeat(64),
        },
        secret,
        now,
      ),
    LinearWebhookError,
    "linear_webhook_signature_invalid",
  );
  await assertRejects(
    () =>
      verifyTestingCenterLinearWebhook(
        raw,
        {
          ...validHeaders,
          timestamp: String(timestamp - 60_001),
        },
        secret,
        now,
      ),
    LinearWebhookError,
    "linear_webhook_timestamp_invalid",
  );
  const disagreement = rawPayload({ webhookTimestamp: timestamp - 1 });
  const disagreementHeaders = await headers(disagreement);
  await assertRejects(
    () =>
      verifyTestingCenterLinearWebhook(
        disagreement,
        disagreementHeaders,
        secret,
        now,
      ),
    LinearWebhookError,
    "linear_webhook_payload_invalid",
  );
});

Deno.test("only Issue create/update/remove actions and UUID identifiers are accepted", async () => {
  for (
    const overrides of [
      { type: "Project" },
      { action: "archive" },
      { organizationId: "not-a-uuid" },
      { data: { id: ids.issue, state: { id: "not-a-uuid" } } },
    ]
  ) {
    const raw = rawPayload(overrides);
    const signedHeaders = await headers(raw);
    await assertRejects(() =>
      verifyTestingCenterLinearWebhook(raw, signedHeaders, secret, now)
    );
  }
});

Deno.test("non-state update and remove are accepted without inventing a state", async () => {
  for (const action of ["update", "remove"] as const) {
    const raw = rawPayload({ action, data: { id: ids.issue } });
    const verified = await verifyTestingCenterLinearWebhook(
      raw,
      await headers(raw),
      secret,
      now,
    );
    assertEquals(verified.linearStateId, null);
  }
});

Deno.test("create requires a reviewed Linear state identifier", async () => {
  const raw = rawPayload({ action: "create", data: { id: ids.issue } });
  const signedHeaders = await headers(raw);
  await assertRejects(
    () => verifyTestingCenterLinearWebhook(raw, signedHeaders, secret, now),
    LinearWebhookError,
    "linear_webhook_payload_invalid",
  );
});
