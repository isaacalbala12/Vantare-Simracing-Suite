import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type PromotionDeps, runPromotionBatch } from "./index.ts";
import { observeReportPromotion } from "./observe.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function fixture() {
  let discount: string | null = null;
  const calls: string[] = [];
  const deps: PromotionDeps = {
    environment: "sandbox",
    now: () => new Date("2026-11-01T12:00:00Z"),
    enabled: () => true,
    rpc: (name) => {
      calls.push(name);
      return Promise.resolve(
        name.endsWith("accounts") ? ["account"] : name.endsWith("prepare")
          ? {
            id: "op",
            subscription_id: "sub",
            product_id: "product",
            amount: 599,
            currency: "eur",
            recurring_interval: "month",
            recurring_interval_count: 1,
            discount_id: "reward",
            managed_discount_ids: [],
            normal_cents: 599,
          }
          : true,
      );
    },
    client: {
      read: () => {
        calls.push("GET");
        return Promise.resolve({
          id: "sub",
          product_id: "product",
          amount: 599,
          currency: "eur",
          recurring_interval: "month",
          recurring_interval_count: 1,
          status: "active",
          discount_id: discount,
        });
      },
      change: (_id, value) => {
        calls.push("PATCH");
        discount = value;
        return Promise.resolve({
          id: "sub",
          product_id: "product",
          amount: 599,
          currency: "eur",
          recurring_interval: "month",
          recurring_interval_count: 1,
          status: "active",
          discount_id: discount,
        });
      },
    },
  };
  return { deps, calls };
}
Deno.test("worker claims, rechecks before write, ACKs and retry does not PATCH again", async () => {
  const { deps, calls } = fixture();
  assertEquals((await runPromotionBatch(deps)).completed, 1);
  await runPromotionBatch(deps);
  assertEquals(calls.filter((c) => c === "PATCH").length, 1);
  assertEquals(calls.slice(0, 7), [
    "report_promotion_accounts",
    "report_promotion_prepare",
    "report_promotion_claim",
    "GET",
    "report_promotion_claim",
    "PATCH",
    "report_promotion_ack",
  ]);
});
Deno.test("deleted account at claim or after GET cannot PATCH or ACK", async () => {
  for (const denyAt of [1, 2]) {
    const { deps, calls } = fixture();
    const original = deps.rpc;
    let claim = 0;
    deps.rpc = (name, args) =>
      name.endsWith("claim") && ++claim >= denyAt
        ? Promise.resolve(false)
        : original(name, args);
    if (denyAt === 2) {
      assertEquals((await runPromotionBatch(deps)).failed.length, 1);
    } else assertEquals((await runPromotionBatch(deps)).completed, 0);
    assertEquals(calls.includes("PATCH"), false);
    assertEquals(calls.includes("report_promotion_ack"), false);
  }
});
Deno.test("kill switch and failed Polar operation leave pending change unacknowledged", async () => {
  const { deps, calls } = fixture();
  deps.client.change = () => {
    throw new Error("timeout");
  };
  assertEquals((await runPromotionBatch(deps)).failed.length, 1);
  assertEquals(calls.includes("report_promotion_ack"), false);
  deps.enabled = () => false;
  assertEquals((await runPromotionBatch(deps)).disabled, true);
});
Deno.test("observation disabled is inert; enabled uses only allowlisted billing facts", async () => {
  const calls: unknown[] = [];
  const admin = {
    rpc: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve({ error: null });
    },
  } as unknown as SupabaseClient;
  const input = {
    account: "a",
    subscription: "s",
    product: "p",
    environment: "sandbox",
    data: {
      started_at: "2026-10-26T18:00:00Z",
      modified_at: "2026-10-27T18:00:00Z",
      discount_id: "creator",
      email: "never exported",
    },
  };
  await observeReportPromotion(admin, input, false);
  assertEquals(calls.length, 0);
  await observeReportPromotion(admin, input, true);
  assertEquals(calls, [["report_promotion_observe", {
    p_account: "a",
    p_environment: "sandbox",
    p_subscription: "s",
    p_product: "p",
    p_started: input.data.started_at,
    p_modified: input.data.modified_at,
    p_discount: "creator",
  }]]);
});
Deno.test("first checkout is inert while disabled, then asks SQL with the injected clock", async () => {
  const { promotionCheckoutDiscount } = await import("./observe.ts");
  const calls: unknown[] = [];
  const admin = () =>
    ({
      rpc: (...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve({ data: "launch1", error: null });
      },
    }) as unknown as SupabaseClient;
  const now = new Date("2026-10-26T18:00:00Z");
  assertEquals(
    await promotionCheckoutDiscount(admin, "a", "sandbox", "pro", now, false),
    null,
  );
  assertEquals(calls.length, 0);
  assertEquals(
    await promotionCheckoutDiscount(admin, "a", "sandbox", "pro", now, true),
    "launch1",
  );
  assertEquals(calls, [["report_promotion_checkout", {
    p_account: "a",
    p_environment: "sandbox",
    p_product: "pro",
    p_now: now.toISOString(),
  }]]);
});
Deno.test("launch checkout uses exactly one discount, disables trial and code stacking", async () => {
  const { createPolarCheckoutSession } = await import("../_shared/polar.ts");
  let body: Record<string, unknown> = {};
  await createPolarCheckoutSession({
    productId: "pro",
    userId: "a",
    email: null,
    productKey: "pro_monthly",
    planSku: "pro_monthly",
    environment: "sandbox",
    catalogVersion: "test",
    capabilities: [],
    channels: [],
    launchScopeVersion: null,
    trial: { enabled: false },
    discountId: "launch1",
  }, {
    getAccessToken: () => "test",
    getSuccessUrl: () => "https://example.invalid/success",
    getCancelUrl: () => "https://example.invalid/cancel",
    fetchFn: (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Promise.resolve(
        Response.json({
          id: "checkout",
          url: "https://sandbox.polar.sh/checkout/test",
        }),
      );
    },
  });
  assertEquals(body.discount_id, "launch1");
  assertEquals(body.allow_trial, false);
  assertEquals(body.allow_discount_codes, false);
  assertEquals(body.trial_interval, undefined);
});
Deno.test("P2-2 paid invoice projection carries actual cycle and excludes line-item PII", async () => {
  const { observePromotionInvoice } = await import("./observe.ts");
  const { minimizePolarWebhookEvent } = await import(
    "../billing-webhook/process.ts"
  );
  const calls: unknown[] = [];
  const admin = {
    rpc: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve({ error: null });
    },
  } as unknown as SupabaseClient;
  const data = {
    id: "order",
    paid: true,
    billing_reason: "subscription_cycle",
    discount_id: "reward3",
    discount_amount: 200,
    created_at: "2026-12-26T18:00:00Z",
    items: [{
      proration: false,
      start_timestamp: "2026-12-26T18:00:00Z",
      end_timestamp: "2027-01-26T18:00:00Z",
      label: "private customer text",
    }],
  };
  const replay = minimizePolarWebhookEvent({ type: "order.paid", data });
  assertEquals(JSON.stringify(replay).includes("private customer text"), false);
  await observePromotionInvoice(admin, "sandbox", replay.data, true);
  assertEquals(calls, [["report_promotion_invoice", {
    p_environment: "sandbox",
    p_order: "order",
    p_discount: "reward3",
    p_amount: 200,
    p_billed: data.created_at,
    p_start: data.items[0].start_timestamp,
    p_end: data.items[0].end_timestamp,
  }]]);
  await observePromotionInvoice(admin, "sandbox", {
    ...data,
    billing_reason: "subscription_update",
  }, true);
  assertEquals(calls.length, 1);
});
Deno.test("P2-3 poisoned first customer is durably marked and cannot starve the next customer", async () => {
  const { deps, calls } = fixture();
  const original = deps.rpc;
  const failures: unknown[] = [];
  deps.rpc = (name, args) =>
    name.endsWith("accounts")
      ? Promise.resolve(["bad", "good"])
      : name.endsWith("prepare")
      ? Promise.resolve({
        id: String(args.p_account),
        subscription_id: String(args.p_account),
        product_id: "product",
        discount_id: "reward",
        managed_discount_ids: [],
        normal_cents: 599,
      })
      : name.endsWith("failed")
      ? (failures.push(args), Promise.resolve(null))
      : original(name, args);
  const read = deps.client.read;
  deps.client.read = (id) => {
    if (id === "bad") throw new Error("polar_discount_unmanaged");
    return read(id);
  };
  const result = await runPromotionBatch(deps);
  assertEquals(result.completed, 1);
  assertEquals(result.failed, [{
    account_id: "bad",
    code: "polar_discount_unmanaged",
  }]);
  assertEquals(failures.length, 1);
  assertEquals(calls.includes("PATCH"), true);
});
Deno.test("P2-3 elapsed budget returns the last processed cursor without skipping the next customer", async () => {
  const { deps } = fixture();
  const rpc = deps.rpc;
  let now = Date.parse("2026-11-01T12:00:00Z");
  deps.now = () => new Date(now);
  deps.rpc = (name, args) =>
    name.endsWith("accounts")
      ? Promise.resolve(["first", "second"])
      : rpc(name, args);
  const change = deps.client.change;
  deps.client.change = (id, value) => {
    now += 46000;
    return change(id, value);
  };
  const result = await runPromotionBatch(deps);
  assertEquals(result.completed, 1);
  assertEquals(result.next_cursor, "first");
});

Deno.test("P3-9 conversion after trial is a settled recurring invoice", async () => {
  const {observePromotionInvoice} = await import("./observe.ts");
  const calls: unknown[] = [];
  const admin = {rpc:(...args:unknown[]) => {calls.push(args);return Promise.resolve({error:null});}} as unknown as SupabaseClient;
  await observePromotionInvoice(admin,"sandbox",{
    id:"after-trial",paid:true,billing_reason:"subscription_cycle_after_trial",discount_id:"reward3",discount_amount:200,
    created_at:"2026-12-26T18:00:00Z",items:[{proration:false,start_timestamp:"2026-12-26T18:00:00Z",end_timestamp:"2027-01-26T18:00:00Z"}]
  },true);
  assertEquals(calls.length,1);
  assertEquals((calls[0] as unknown[])[0],"report_promotion_invoice");
});
Deno.test("P3-13 deleting the activation flag never disables settled invoice accounting", async () => {
  const {observePromotionInvoice} = await import("./observe.ts");
  const saved = Deno.env.get("REPORT_PROMOTION_ENABLED");
  try {
    Deno.env.delete("REPORT_PROMOTION_ENABLED");
    let recorded = 0;
    const admin = {rpc:()=>{recorded++;return Promise.resolve({error:null});}} as unknown as SupabaseClient;
    await observePromotionInvoice(admin,"sandbox",{
      id:"flag-absent",paid:true,billing_reason:"subscription_cycle",discount_id:"reward3",discount_amount:200,
      created_at:"2026-12-26T18:00:00Z",items:[{proration:false,start_timestamp:"2026-12-26T18:00:00Z",end_timestamp:"2027-01-26T18:00:00Z"}]
    });
    assertEquals(recorded,1);
  } finally {
    if(saved===undefined) Deno.env.delete("REPORT_PROMOTION_ENABLED"); else Deno.env.set("REPORT_PROMOTION_ENABLED",saved);
  }
});
