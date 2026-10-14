import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reconcilePage } from "../functions/billing-reconcile/worker.ts";
import { loadPolarProductMap } from "../functions/_shared/mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../functions/_shared/test-fixtures.ts";
const config = JSON.parse(await new Response(Deno.stdin.readable).text());
const db = createClient(config.url, config.key, {
  auth: { persistSession: false },
});
const items = ["deleted", "live"].map((id) => ({
  id: "probe-order-" + id,
  checkout_id: "probe-checkout-" + id,
  customer_id: "probe-customer-" + id,
  product_id: "00000000-0000-0000-0000-000000000001",
  status: "paid",
  paid: true,
  billing_reason: "purchase",
  net_amount: 3000,
  applied_balance_amount: 0,
  refunded_amount: 0,
  currency: "eur",
  created_at: "2026-10-08T10:00:00Z",
}));
for (let attempt = 1; attempt <= 2; attempt++) {
  const r = await reconcilePage({
    cursor: { resource: "orders", page: 1 },
    page: { maxPage: 2, items },
    environment: "sandbox",
    supabase: db,
    processDeps: {
      loadMap: () =>
        loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
          environment: "sandbox",
        }),
    },
  });
  assertEquals(r.next, { resource: "orders", page: 2 });
  assertEquals(r.quarantined, 1);
  const r2 = await reconcilePage({
    cursor: r.next,
    page: { maxPage: 2, items: [items[1]] },
    environment: "sandbox",
    supabase: db,
    processDeps: {
      loadMap: () =>
        loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
          environment: "sandbox",
        }),
    },
  });
  assertEquals(r2.next, { resource: "subscriptions", page: 1 });
  console.log("attempt", attempt, "two pages advanced");
}
const { data: orders, error } = await db.from("billing_orders").select(
  "provider_order_id",
).in("provider_order_id", ["probe-order-live", "probe-order-deleted"]);
if (error) throw error;
assertEquals(orders, [{ provider_order_id: "probe-order-live" }]);
const inbox = await db.from("billing_webhook_inbox").select("payload");
if (inbox.error) throw inbox.error;
assertEquals(
  inbox.data.filter((r) =>
    JSON.stringify(r.payload).includes("probe-customer-deleted")
  ).length,
  0,
);
console.log(
  "live account reconciled idempotently; no deleted payload persisted PASS",
);

// Contradictory durable links must remain failures, even when one is deleted.
await assertRejects(
  () =>
    reconcilePage({
      cursor: { resource: "orders", page: 1 },
      page: {
        maxPage: 1,
        items: [{
          ...items[1],
          id: "conflicted-order",
          customer_id: "probe-customer-deleted",
        }],
      },
      environment: "sandbox",
      supabase: db,
      processDeps: {
        loadMap: () =>
          loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
            environment: "sandbox",
          }),
      },
    }),
  Error,
  "billing_receive_webhook failed (28000)",
);
console.log("conflicting live/deleted bindings still abort PASS");
