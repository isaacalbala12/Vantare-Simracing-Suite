import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type CompensationJob,
  type CompensationStore,
  createCompensationStore,
  createPolarRefundClient,
  deliverCheckoutOwnerAlerts,
  expireUnpaidCheckouts,
  observeCheckoutSession,
  refundUnlicensedCheckout,
  runCheckoutCompensation,
} from "./checkout-compensation.ts";
import { loadPolarProductMap } from "../_shared/mapping.ts";
import {
  SANDBOX_IDS,
  VALID_POLAR_PRODUCT_MAP_JSON,
} from "../_shared/test-fixtures.ts";
import { reconcilePage } from "./worker.ts";
import { MemoryWebhookInbox } from "../billing-webhook/test-inbox.ts";
import { MemoryOrderRefundLedger } from "../billing-webhook/order-refund-ledger.ts";

const ORDER = "42000000-0000-4000-8000-000000000010";
const CHECKOUT = "42000000-0000-4000-8000-000000000011";
const REFUND = "42000000-0000-4000-8000-000000000012";
const SUB = "42000000-0000-4000-8000-000000000013";
const ACCOUNT = "42000000-0000-4000-8000-000000000001";
const job: CompensationJob = {
  environment: "sandbox",
  order_id: ORDER,
  checkout_id: CHECKOUT,
  organization_id: SANDBOX_IDS.organization,
  product_id: SANDBOX_IDS.launchProduct,
  subscription_id: null,
  net_amount: 2500,
  currency: "eur",
  attempt_count: 1,
};
function mapping() {
  const result = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "sandbox",
  });
  if (!result.ok) throw new Error("fixture");
  return result.map;
}
function api(fixture: CompensationJob = job) {
  const order: Record<string, unknown> = {
    id: fixture.order_id,
    checkout_id: fixture.checkout_id,
    organization_id: fixture.organization_id,
    product_id: fixture.product_id,
    subscription_id: fixture.subscription_id,
    currency: "eur",
    paid: true,
    status: "paid",
    billing_reason: fixture.subscription_id
      ? "subscription_create"
      : "purchase",
    net_amount: 2500,
    tax_amount: 525,
    total_amount: 3025,
    refunded_amount: 0,
    refunded_tax_amount: 0,
    applied_balance_amount: 0,
    created_at: "2026-10-15T19:00:00Z",
    modified_at: "2026-10-15T19:00:00Z",
  };
  const refunds: Record<string, unknown>[] = [];
  const requests: { url: URL; init: RequestInit }[] = [];
  const state = {
    fail: false,
    loseResponse: false,
    revoked: false,
    failRevoke: false,
  };
  const fetchFn =
    ((input: RequestInfo | URL, init: RequestInit = {}) =>
      Promise.resolve().then(() => {
        const url = new URL(String(input));
        requests.push({ url, init });
        assertEquals(url.origin, "https://sandbox-api.polar.sh");
        assertEquals(init.redirect, "error");
        assert(init.signal instanceof AbortSignal);
        if (url.pathname === "/v1/orders/" + fixture.order_id) {
          return Response.json(order);
        }
        if (url.pathname === "/v1/refunds/" && init.method === "GET") {
          return Response.json({ items: refunds, pagination: { max_page: 1 } });
        }
        if (url.pathname === "/v1/refunds/" && init.method === "POST") {
          if (state.fail) return new Response(null, { status: 503 });
          const body = JSON.parse(String(init.body));
          assertEquals(
            body.amount,
            fixture.net_amount - Number(order.refunded_amount),
          );
          assertEquals(body.reason, "service_disruption");
          assertEquals(body.revoke_benefits, fixture.subscription_id === null);
          const created = {
            id: REFUND,
            order_id: fixture.order_id,
            organization_id: fixture.organization_id,
            amount: body.amount,
            tax_amount: 525,
            currency: "eur",
            status: "pending",
            metadata: body.metadata,
          };
          refunds.push(created);
          if (state.loseResponse) {
            state.loseResponse = false;
            throw new TypeError("network details never logged");
          }
          return Response.json(created, { status: 201 });
        }
        if (url.pathname === "/v1/subscriptions/" + fixture.subscription_id) {
          if (init.method === "DELETE") {
            if (state.failRevoke) return new Response(null, { status: 503 });
            state.revoked = true;
          }
          return Response.json({
            id: fixture.subscription_id,
            product_id: fixture.product_id,
            organization_id: fixture.organization_id,
            status: state.revoked ? "canceled" : "active",
          });
        }
        throw new Error("unexpected_fixture_request");
      })) as typeof fetch;
  const settle = () => {
    refunds[0].status = "succeeded";
    order.refunded_amount = 2500;
    order.refunded_tax_amount = 525;
    order.status = "refunded";
  };
  return {
    order,
    refunds,
    requests,
    state,
    settle,
    polar: createPolarRefundClient("sandbox", "fixture-token", fetchFn),
    posts: () => requests.filter((r) => r.init.method === "POST").length,
  };
}
class MemoryStore implements CompensationStore {
  now = 0;
  due = 0;
  leaseUntil = 0;
  state = "waiting";
  job = structuredClone(job);
  token = "";
  alert = false;
  alertsDelivered = 0;
  ackLost = false;
  errors: string[] = [];
  observe = () => Promise.resolve();
  claim(environment: string, token: string) {
    if (
      this.state === "refunded" || this.now < this.due ||
      this.now < this.leaseUntil
    ) return Promise.resolve(null);
    assertEquals(environment, this.job.environment);
    this.token = token;
    this.leaseUntil = this.now + 120000;
    return Promise.resolve(structuredClone(this.job));
  }
  finish(
    _job: CompensationJob,
    token: string,
    outcome: string,
    _id: string | null,
    code: string | null,
  ) {
    if (this.ackLost) {
      this.ackLost = false;
      return Promise.reject(new Error("fixture_db_ack_lost"));
    }
    assertEquals(token, this.token);
    this.state = outcome === "refunded" ? "refunded" : "refunding";
    this.leaseUntil = 0;
    this.due = this.now + 30000;
    if (outcome === "retry") {
      this.alert = true;
      this.errors.push(String(code));
    }
    return Promise.resolve();
  }
  alerts() {
    return Promise.resolve(
      this.alert ? [{ order_id: ORDER, code: this.errors.at(-1) }] : [],
    );
  }
  finishAlert(_environment: string, _id: string, delivered: boolean) {
    if (delivered) {
      this.alert = false;
      this.alertsDelivered++;
    }
    return Promise.resolve();
  }
  advance() {
    this.now += 120001;
  }
}
Deno.test("paid orphan with no license is fully refunded including tax; duplicate tick creates exactly one refund", async () => {
  const store = new MemoryStore(), fake = api();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(fake.posts(), 1);
  assertEquals(store.state, "refunding"); // 201 pending is not a completed refund.
  store.advance();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(fake.posts(), 1);
  fake.settle();
  store.advance();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(store.state, "refunded");
  store.advance();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(fake.posts(), 1);
});
Deno.test("Polar failure retries automatically and persists/sends signed Owner alert; failed alert is retried", async () => {
  const store = new MemoryStore(), fake = api();
  fake.state.fail = true;
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(store.errors, ["polar_refund_http_503"]);
  assertEquals(store.alert, true);
  const config = {
    url: "https://owner.example.invalid/billing",
    secret: "x".repeat(32),
  };
  await deliverCheckoutOwnerAlerts(
    "sandbox",
    store,
    config,
    () => Promise.resolve(new Response(null, { status: 503 })),
  );
  assertEquals(store.alert, true);
  let notice: Record<string, unknown> | null = null;
  await deliverCheckoutOwnerAlerts(
    "sandbox",
    store,
    config,
    async (_input, init) => {
      const headers = new Headers(init?.headers);
      const body = String(init?.body);
      notice = JSON.parse(body);
      assert(!body.includes(ORDER));
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(config.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const signature = String(headers.get("X-Vantare-Signature")).replace(
        "sha256=",
        "",
      );
      const bytes = Uint8Array.from(
        signature.match(/../g)!,
        (s) => parseInt(s, 16),
      );
      assert(
        await crypto.subtle.verify(
          "HMAC",
          key,
          bytes,
          new TextEncoder().encode(
            headers.get("X-Vantare-Timestamp") + "." + body,
          ),
        ),
      );
      assertEquals(headers.get("X-Vantare-Alert-Id"), notice?.id);
      return new Response(null, { status: 204 });
    },
  );
  assertEquals(store.alertsDelivered, 1);
  fake.state.fail = false;
  store.advance();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(fake.refunds.length, 1);
  assertEquals(fake.posts(), 2); // One 503 attempt, one actual refund.
});
Deno.test("POST committed but response lost: read-back finds refund and never submits a second refund", async () => {
  const store = new MemoryStore(), fake = api();
  fake.state.loseResponse = true;
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(store.alert, true);
  store.advance();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(fake.posts(), 1);
  fake.settle();
  store.advance();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(store.state, "refunded");
});
Deno.test("DB ACK loss and concurrent ticks recover the lease by reading Polar, not POSTing again", async () => {
  const store = new MemoryStore(), fake = api();
  store.ackLost = true;
  await assertRejects(() =>
    runCheckoutCompensation("sandbox", store, fake.polar)
  );
  await Promise.all([
    runCheckoutCompensation("sandbox", store, fake.polar),
    runCheckoutCompensation("sandbox", store, fake.polar),
  ]);
  assertEquals(fake.posts(), 1);
  store.advance();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(fake.posts(), 1);
});
Deno.test("subscription failure: full refund followed by idempotent revocation prevents renewals", async () => {
  const subJob = {
    ...job,
    subscription_id: SUB,
    product_id: SANDBOX_IDS.proProduct,
  };
  const store = new MemoryStore();
  store.job = subJob;
  const fake = api(subJob);
  fake.state.failRevoke = true;
  await runCheckoutCompensation("sandbox", store, fake.polar);
  fake.settle();
  store.advance();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(store.alert, true);
  assertEquals(store.state, "refunding");
  fake.state.failRevoke = false;
  store.advance();
  await runCheckoutCompensation("sandbox", store, fake.polar);
  assertEquals(store.state, "refunded");
  assertEquals(fake.state.revoked, true);
  assertEquals(fake.posts(), 1);
});
Deno.test("wrong organization/order/currency and nonconverged refund page can never cause a write", async () => {
  for (
    const wrong of [{ organization_id: ACCOUNT }, { id: ACCOUNT }, {
      currency: "usd",
    }]
  ) {
    const fake = api();
    Object.assign(fake.order, wrong);
    await assertRejects(() => refundUnlicensedCheckout(job, fake.polar));
    assertEquals(fake.posts(), 0);
  }
  const fake = api();
  fake.order.refunded_amount = 1000;
  await assertRejects(() => refundUnlicensedCheckout(job, fake.polar));
  assertEquals(fake.posts(), 0);
});
Deno.test("partial previous refund is topped up only to the full net amount, never tax-inclusive over-refund", async () => {
  const fake = api();
  fake.order.refunded_amount = 1000;
  fake.refunds.push({
    id: ACCOUNT,
    order_id: ORDER,
    organization_id: job.organization_id,
    amount: 1000,
    status: "succeeded",
    currency: "eur",
  });
  await refundUnlicensedCheckout(job, fake.polar);
  assertEquals(
    JSON.parse(String(fake.requests.at(-1)?.init.body)).amount,
    1500,
  );
});
Deno.test("observer skips unpaid/renewals/other products and validates known order scope before durable enqueue", async () => {
  const calls: Record<string, unknown>[] = [];
  const store = createCompensationStore(
    {
      rpc: (_name: string, args: Record<string, unknown>) => {
        calls.push(args);
        return Promise.resolve({ data: null, error: null });
      },
    } as never,
  );
  const fake = api(), map = mapping();
  await store.observe({ ...fake.order, paid: false }, map);
  await store.observe(
    { ...fake.order, billing_reason: "subscription_cycle" },
    map,
  );
  await store.observe({ ...fake.order, product_id: ACCOUNT }, map);
  assertEquals(calls.length, 0);
  await store.observe(fake.order, map);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].p_order_id, ORDER);
  assertEquals(calls[0].p_net_amount, 2500);
  assertEquals(calls[0].p_user_id, undefined);
  await assertRejects(() =>
    store.observe({ ...fake.order, organization_id: ACCOUNT }, map)
  );
});
Deno.test("real reconciliation/webhook orphan -> durable compensation observation, never a fabricated license", async () => {
  const fake = api(), map = mapping(), ledger = new MemoryOrderRefundLedger();
  const queue: Record<string, unknown>[] = [];
  const client = {
    rpc: (_name: string, args: Record<string, unknown>) => {
      queue.push(args);
      return Promise.resolve({ data: null, error: null });
    },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  const store = createCompensationStore(client);
  const result = await reconcilePage({
    cursor: { resource: "orders", page: 1 },
    page: { items: [fake.order], maxPage: 1 },
    environment: "sandbox",
    supabase: client,
    observeCheckoutOrder: (order) => store.observe(order, map),
    processDeps: {
      inbox: new MemoryWebhookInbox(),
      orderRefundLedger: ledger,
      loadMap: () => ({ ok: true, map }),
    },
  });
  assertEquals(result.quarantined, 1);
  assertEquals(queue.length, 1);
  assertEquals(queue[0].p_order_id, ORDER);
  assertEquals(ledger.grants.size, 0);
});
Deno.test("unpaid published checkout expires only on Polar terminal status, never local lease/confirmed payment", async () => {
  for (
    const status of ["open", "confirmed", "succeeded", "expired", "failed"]
  ) {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const client = {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return Promise.resolve({
          error: null,
          data: name === "billing_published_checkouts_to_expire"
            ? [{
              user_id: ACCOUNT,
              attempt_id: REFUND,
              checkout_id: CHECKOUT,
              checkout_key: "launch_lifetime",
            }]
            : true,
        });
      },
    } as never;
    const polar = createPolarRefundClient(
      "sandbox",
      "fixture",
      () =>
        Promise.resolve(Response.json({
          id: CHECKOUT,
          product_id: job.product_id,
          organization_id: job.organization_id,
          status,
        })),
    );
    await expireUnpaidCheckouts(client, mapping(), polar);
    assertEquals(
      calls.at(-1)?.args.p_terminal,
      ["expired", "failed"].includes(status),
    );
  }
});
Deno.test("missing/unsafe Owner destination never ACKs the durable notice", async () => {
  const store = new MemoryStore();
  store.alert = true;
  await deliverCheckoutOwnerAlerts("sandbox", store, {
    url: "http://localhost",
    secret: "short",
  }, () => {
    throw new Error("must_not_send");
  });
  assertEquals(store.alert, true);
  assertEquals(store.alertsDelivered, 0);
});

Deno.test("checkout page observes sealed nonce and terminal status without fabricating a binding", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve({ data: true, error: null });
    },
  } as never;
  const checkout = {
    id: CHECKOUT,
    product_id: job.product_id,
    organization_id: job.organization_id,
    status: "expired",
    metadata: { vantare_attempt_id: REFUND, vantare_dispatch_token: SUB },
  };
  await reconcilePage({
    cursor: { resource: "checkouts", page: 1 },
    page: { items: [checkout], maxPage: 1 },
    environment: "sandbox",
    supabase: client,
    observeCheckoutSession: (value) =>
      observeCheckoutSession(client, mapping(), value),
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "billing_observe_checkout_session");
  assertEquals(calls[0].args.p_status, "expired");
  assertEquals(calls[0].args.p_dispatch_token, SUB);
  await observeCheckoutSession(client, mapping(), {
    ...checkout,
    metadata: {},
  });
  assertEquals(calls.length, 1);
});
Deno.test("pending refund cancels subscription immediately; full net without tax is never settled", async () => {
  const subJob = {
    ...job,
    subscription_id: SUB,
    product_id: SANDBOX_IDS.proProduct,
  };
  const fake = api(subJob);
  fake.state.loseResponse = true;
  await assertRejects(() => refundUnlicensedCheckout(subJob, fake.polar));
  assertEquals(fake.state.revoked, false);
  const result = await refundUnlicensedCheckout(subJob, fake.polar);
  assertEquals(result.outcome, "pending");
  assertEquals(fake.state.revoked, true);
  assertEquals(fake.posts(), 1);
  fake.settle();
  fake.order.refunded_tax_amount = 0;
  await assertRejects(() => refundUnlicensedCheckout(subJob, fake.polar));
  assertEquals(fake.posts(), 1);
});
