import {
  handleTestingCenterLinearWebhookRequest,
  type TestingCenterLinearWebhookStore,
} from "../_shared/testing-center-linear-webhook-handler.ts";
import { signTestingCenterLinearWebhookForTest } from "../_shared/testing-center-linear-webhook.ts";

const secret = "linear-webhook-secret-that-is-long-enough";
const timestamp = 1785854400000;
const payload = {
  action: "create",
  type: "Issue",
  createdAt: "2026-08-04T12:00:00.000Z",
  webhookTimestamp: timestamp,
  webhookId: "10000000-0000-4000-8000-000000000001",
  organizationId: "10000000-0000-4000-8000-000000000002",
  data: {
    id: "10000000-0000-4000-8000-000000000003",
    stateId: "10000000-0000-4000-8000-000000000004",
  },
};

async function signedRequest(body = JSON.stringify(payload)) {
  const bytes = new TextEncoder().encode(body);
  return new Request("https://example.test/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "linear-delivery": "10000000-0000-4000-8000-000000000005",
      "linear-event": "Issue",
      "linear-signature": await signTestingCenterLinearWebhookForTest(
        bytes,
        secret,
      ),
      "linear-timestamp": String(timestamp),
    },
    body,
  });
}

function store(calls: unknown[]): TestingCenterLinearWebhookStore {
  return {
    reconcile(event) {
      calls.push(event);
      return Promise.resolve({
        deliveryStatus: "applied",
        currentObservedState: "linear_created",
      });
    },
  };
}

Deno.test("signed raw Linear webhook is reconciled without persisting body", async () => {
  const calls: unknown[] = [];
  const response = await handleTestingCenterLinearWebhookRequest(
    await signedRequest(),
    { secret, store: store(calls), now: new Date(timestamp) },
  );
  if (response.status !== 200 || calls.length !== 1) {
    throw new Error(await response.text());
  }
  const serialized = JSON.stringify(calls[0]);
  if (serialized.includes("signature") || serialized.includes("rawBody")) {
    throw new Error("raw or signature-bearing request was passed to storage");
  }
});

Deno.test("invalid signature is rejected before reconciliation", async () => {
  const calls: unknown[] = [];
  const request = await signedRequest();
  request.headers.set("linear-signature", "0".repeat(64));
  const response = await handleTestingCenterLinearWebhookRequest(request, {
    secret,
    store: store(calls),
    now: new Date(timestamp),
  });
  if (response.status !== 401 || calls.length !== 0) {
    throw new Error("invalid signature reached reconciliation");
  }
});

Deno.test("store failure returns non-200 so Linear retries delivery", async () => {
  const response = await handleTestingCenterLinearWebhookRequest(
    await signedRequest(),
    {
      secret,
      now: new Date(timestamp),
      store: { reconcile: () => Promise.reject(new Error("database offline")) },
    },
  );
  if (response.status !== 503) {
    throw new Error("failed reconciliation was acknowledged");
  }
});

Deno.test("chunked oversized body is rejected before signature or storage", async () => {
  const calls: unknown[] = [];
  const response = await handleTestingCenterLinearWebhookRequest(
    new Request("https://example.test/webhook", {
      method: "POST",
      body: new Uint8Array(256 * 1024 + 1),
    }),
    { secret, store: store(calls), now: new Date(timestamp) },
  );
  if (response.status !== 413 || calls.length !== 0) {
    throw new Error("oversized webhook reached verification or storage");
  }
});
