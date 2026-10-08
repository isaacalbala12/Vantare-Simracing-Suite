import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { advanceCursor, reconcilePage, reconciliationEvent } from "./worker.ts";
import { serviceKeyMatches } from "./index.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { MemoryWebhookInbox } from "../billing-webhook/test-inbox.ts";
import { MemoryOrderRefundLedger } from "../billing-webhook/order-refund-ledger.ts";
import { MemoryCommercialProjection } from "../billing-webhook/commercial-projection.ts";
import { MemorySubscriptionLifecycleStore } from "../billing-webhook/subscription-lifecycle-store.ts";
import { loadPolarProductMap } from "../_shared/mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
Deno.test("reconciler traverses every page then orders/subscriptions/refunds/disputes without truncation", () => {
  assertEquals(advanceCursor({ resource: "orders", page: 1 }, 3), {
    resource: "orders",
    page: 2,
  });
  assertEquals(advanceCursor({ resource: "orders", page: 3 }, 3), {
    resource: "subscriptions",
    page: 1,
  });
  assertEquals(advanceCursor({ resource: "subscriptions", page: 1 }, 1), {
    resource: "refunds",
    page: 1,
  });
  assertEquals(advanceCursor({ resource: "refunds", page: 1 }, 1), {
    resource: "disputes",
    page: 1,
  });
  assertEquals(advanceCursor({ resource: "disputes", page: 1 }, 1), {
    resource: "orders",
    page: 1,
  });
  assertThrows(() => advanceCursor({ resource: "orders", page: 2 }, 1));
});
Deno.test("reconciliation skips unpaid orders and minimizes customer PII", () => {
  assertEquals(reconciliationEvent("orders", { paid: false }), null);
  const event = reconciliationEvent("refunds", {
    id: "refund-test",
    order_id: "order-test",
    created_at: "2026-10-08T10:00:00Z",
    customer_email: "private@example.invalid",
  });
  assertEquals(event?.data.customer_email, undefined);
  assertEquals(event?.data.created_at, "2026-10-08T10:00:00Z");
});
Deno.test("reconciler requires exact nonempty server key", () => {
  assertEquals(serviceKeyMatches("", ""), false);
  assertEquals(
    serviceKeyMatches("fixture-server-key", "fixture-server-key"),
    true,
  );
  assertEquals(
    serviceKeyMatches("fixture-server-key", "fixture-server-kez"),
    false,
  );
});

Deno.test("orphan recovers automatically after durable binding appears; DB outage retries without duplicate grants", async () => {
  const userId = "4b6d8919-1c89-492d-a0e2-364124c17878";
  let bound = false;
  let outage = false;
  let now = new Date("2026-10-08T12:00:00Z");
  const inbox = new MemoryWebhookInbox(() => now);
  const ledger = new MemoryOrderRefundLedger();
  const supabase = {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            error: null,
            data: table === "billing_webhook_inbox"
              ? { id: "inbox-1" }
              : table === "billing_checkout_bindings" && bound
              ? { user_id: userId }
              : null,
          }),
        insert: () => Promise.resolve({ error: null }),
        upsert: () =>
          Promise.resolve({
            error: outage ? { code: "fixture_db_outage" } : null,
          }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  const processDeps = {
    inbox,
    orderRefundLedger: ledger,
    projection: new MemoryCommercialProjection(),
    lifecycle: new MemorySubscriptionLifecycleStore(),
    loadMap: () =>
      loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
        environment: "sandbox",
      }),
    now: () => now,
  };
  const args = {
    cursor: { resource: "orders" as const, page: 1 },
    environment: "sandbox" as const,
    supabase,
    processDeps,
    page: {
      maxPage: 1,
      items: [{
        id: "order-orphan",
        checkout_id: "checkout-server",
        customer_id: "customer-server",
        external_customer_id: userId,
        product_id: "00000000-0000-0000-0000-000000000001",
        status: "paid",
        paid: true,
        billing_reason: "purchase",
        net_amount: 3000,
        applied_balance_amount: 0,
        refunded_amount: 0,
        currency: "eur",
        created_at: "2026-10-08T10:00:00Z",
        modified_at: null,
      }],
    },
  };
  assertEquals((await reconcilePage(args)).quarantined, 1);
  assertEquals(ledger.grants.size, 0);
  bound = true;
  outage = true;
  await assertRejects(() => reconcilePage(args));
  assertEquals(ledger.grants.size, 0);
  outage = false;
  now = new Date("2026-10-08T12:10:00Z");
  assertEquals((await reconcilePage(args)).quarantined, 0);
  assertEquals([...ledger.grants.entries()].sort(), [
    ["sandbox:order-orphan:vantare.channel.testers", "active"],
    ["sandbox:order-orphan:vantare.edition.launch_v1", "active"],
  ]);
  await reconcilePage(args);
  assertEquals(ledger.grants.size, 2);
  assertEquals(inbox.replayAudit.length, 1);
});
