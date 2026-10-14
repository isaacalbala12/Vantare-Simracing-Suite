import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reconcilePage } from "../functions/billing-reconcile/worker.ts";
import { loadPolarProductMap } from "../functions/_shared/mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../functions/_shared/test-fixtures.ts";
const config = JSON.parse(await new Response(Deno.stdin.readable).text());
const endpoint = new URL(config.url);
if (
  endpoint.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
) {
  throw new Error("loopback fixture required");
}
const db = createClient(config.url, config.key, {
  auth: { persistSession: false },
});
if (Deno.args.includes("--disputes")) {
  const items = ["deleted", "live"].map((id) => ({
    id: "dispute-" + id,
    order_id: "dispute-order-" + id,
    status: "lost",
    modified_at: "2026-10-14T12:00:00Z",
  }));
  for (let retry = 0; retry < 2; retry++) {
    const result = await reconcilePage({
      cursor: { resource: "disputes", page: 1 },
      page: { maxPage: 1, items },
      environment: "sandbox",
      supabase: db,
    });
    assertEquals(result.next, { resource: "orders", page: 1 });
    assertEquals(result.quarantined, 1);
  }
  const blocks = await db.from("billing_access_blocks").select("cause_id").in(
    "cause_id",
    ["dispute-deleted", "dispute-live"],
  );
  if (blocks.error) throw blocks.error;
  assertEquals(blocks.data, [{ cause_id: "dispute-live" }]);
  console.log(
    "disputes: deleted then live, two passes and cursor advance PASS",
  );
  Deno.exit(0);
}
if (Deno.args.includes("--outage")) {
  await assertRejects(
    () =>
      reconcilePage({
        cursor: { resource: "orders", page: 1 },
        page: { maxPage: 1, items: [{ id: "outage", paid: true }] },
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
    "billing_receive_webhook failed (42501)",
  );
  console.log("real SQL RPC outage remains a page failure PASS");
  Deno.exit(0);
}
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
