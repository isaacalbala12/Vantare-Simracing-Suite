import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
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
    if (denyAt === 2) await assertRejects(() => runPromotionBatch(deps));
    else assertEquals((await runPromotionBatch(deps)).completed, 0);
    assertEquals(calls.includes("PATCH"), false);
    assertEquals(calls.includes("report_promotion_ack"), false);
  }
});
Deno.test("kill switch and failed Polar operation leave pending change unacknowledged", async () => {
  const { deps, calls } = fixture();
  deps.client.change = () => {
    throw new Error("timeout");
  };
  await assertRejects(() => runPromotionBatch(deps));
  assertEquals(calls.includes("report_promotion_ack"), false);
  deps.enabled = () => false;
  await assertRejects(() => runPromotionBatch(deps));
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
