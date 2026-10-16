import {
  assertEquals,
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
    resource: "checkouts",
    page: 1,
  });
  assertEquals(advanceCursor({ resource: "checkouts", page: 1 }, 1), {
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
  // Previously recorded history, not admission of a new retired-product payment.
  await ledger.recordOrder({
    environment: "sandbox",
    orderId: "order-orphan",
    userId,
    productId: "00000000-0000-0000-0000-000000000001",
    checkoutId: "checkout-server",
    status: "paid",
    paid: true,
    netAmount: 3000,
    currency: "eur",
    reportedRefundedAmount: 0,
    modifiedAt: "2026-10-07T10:00:00Z",
    snapshotHash: "historical-fixture",
  });
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
  const retry = await reconcilePage(args);
  assertEquals(retry.failed.length, 1);
  assertEquals(retry.next, args.cursor);
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

Deno.test("P2-5 reconciliation repairs the invoice ledger even when the same inbox snapshot is already completed", async () => {
  const account = "4b6d8919-1c89-492d-a0e2-364124c17878";
  const invoices = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === "report_promotion_invoice") {
        invoices.set(String(args.p_order), args);
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: { user_id: account }, error: null }),
        upsert: () => Promise.resolve({ error: null }),
        insert: () => Promise.resolve({ error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  const item = {
    id: "renewal-with-lost-webhook",
    checkout_id: "checkout",
    customer_id: "customer",
    subscription_id: "sub",
    product_id: "00000000-0000-0000-0000-000000000003",
    status: "paid",
    paid: true,
    billing_reason: "subscription_cycle",
    net_amount: 399,
    applied_balance_amount: 0,
    refunded_amount: 0,
    currency: "eur",
    discount_id: "pro3",
    discount_amount: 200,
    created_at: "2026-11-26T18:00:00Z",
    items: [{
      proration: false,
      start_timestamp: "2026-11-26T18:00:00Z",
      end_timestamp: "2026-12-26T18:00:00Z",
    }],
  };
  const args = {
    cursor: { resource: "orders" as const, page: 1 },
    page: { items: [item], maxPage: 1 },
    environment: "sandbox" as const,
    supabase,
    processDeps: {
      inbox: new MemoryWebhookInbox(() => new Date("2026-11-27T12:00:00Z")),
      orderRefundLedger: new MemoryOrderRefundLedger(),
      projection: new MemoryCommercialProjection(),
      lifecycle: new MemorySubscriptionLifecycleStore(),
      resolveIdentity: () => Promise.resolve(account),
      loadMap: () =>
        loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
          environment: "sandbox",
        }),
    },
  };
  await reconcilePage(args);
  invoices.clear();
  calls.length = 0; // Simulate a historical completed effect with the promotion projection missing.
  assertEquals((await reconcilePage(args)).quarantined, 0);
  assertEquals(invoices.size, 1);
  assertEquals(invoices.get(item.id)?.p_source, "reconciliation");
  await reconcilePage(args);
  assertEquals(invoices.size, 1);
});

Deno.test("P3-18 a poisoned item does not abort the page and its retry cannot lose the cursor", async () => {
  const account = "4b6d8919-1c89-492d-a0e2-364124c17878";
  let poison = true;
  let now = new Date("2026-11-27T12:00:00Z");
  const invoices = new Map<string, unknown>();
  const gaps: string[] = [];
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "report_promotion_invoice_missing") {
        gaps.push(String(args.p_order));
      }
      if (name === "report_promotion_invoice") {
        if (args.p_order === "bad" && poison) {
          return Promise.resolve({
            data: null,
            error: { code: "fixture_invoice_outage" },
          });
        }
        invoices.set(String(args.p_order), args);
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: { user_id: account }, error: null }),
        insert: () => Promise.resolve({ error: null }),
        upsert: () => Promise.resolve({ error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  const item = (id: string) => ({
    id,
    subscription_id: "sub",
    product_id: "00000000-0000-0000-0000-000000000003",
    status: "paid",
    paid: true,
    billing_reason: "subscription_cycle",
    net_amount: 399,
    refunded_amount: 0,
    applied_balance_amount: 0,
    currency: "eur",
    discount_id: "pro3",
    discount_amount: 200,
    created_at: "2026-11-26T18:00:00Z",
    items: [{
      proration: false,
      start_timestamp: "2026-11-26T18:00:00Z",
      end_timestamp: "2026-12-26T18:00:00Z",
    }],
  });
  const args = {
    cursor: { resource: "orders" as const, page: 1 },
    page: { items: [item("bad"), item("good")], maxPage: 1 },
    environment: "sandbox" as const,
    supabase,
    processDeps: {
      inbox: new MemoryWebhookInbox(() => now),
      orderRefundLedger: new MemoryOrderRefundLedger(),
      projection: new MemoryCommercialProjection(),
      lifecycle: new MemorySubscriptionLifecycleStore(),
      resolveIdentity: () => Promise.resolve(account),
      now: () => now,
      loadMap: () =>
        loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
          environment: "sandbox",
        }),
    },
  };
  const first: { next: unknown; failed?: unknown[] } = await reconcilePage(
    args,
  );
  assertEquals(first.failed?.length, 1);
  assertEquals(first.next, args.cursor);
  assertEquals(invoices.has("good"), true);
  assertEquals(gaps.includes("bad"), true);
  poison = false;
  now = new Date("2026-11-27T12:10:00Z");
  const recovered: { next: unknown; failed?: unknown[] } = await reconcilePage(
    args,
  );
  assertEquals(recovered.failed?.length, 0);
  assertEquals(recovered.next, { resource: "subscriptions", page: 1 });
  assertEquals(invoices.size, 2);
});

Deno.test("P3-25 every failed non-order item has a durable sanitized incident and later items still run", async () => {
  for (const resource of ["subscriptions", "refunds", "disputes"] as const) {
    const incidents: Record<string, unknown>[] = [];
    let reads = 0;
    const supabase = {
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === "billing_reconciliation_item_failed") {
          incidents.push(args);
          return Promise.resolve({ data: null, error: null });
        }
        reads++;
        return Promise.reject(
          new Error("fixture transport with private remote prose"),
        );
      },
    } as unknown as SupabaseClient;
    const cursor = { resource, page: 1 };
    const items = ["bad-one", "bad-two"].map((id) => ({
      id,
      order_id: "order",
      status: "won",
      created_at: "2026-10-30T12:00:00Z",
      customer_email: "private@example.invalid",
    }));
    const result = await reconcilePage({
      cursor,
      page: { items, maxPage: 1 },
      environment: "sandbox",
      supabase,
      processDeps: {
        inbox: new MemoryWebhookInbox(),
        loadMap: () => {
          reads++;
          throw new Error("fixture transport");
        },
      },
    });
    assertEquals(result.failed.length, 2);
    assertEquals(result.failed.every((f) => f.incident_recorded), true);
    assertEquals(result.next, cursor);
    assertEquals(
      incidents.map((i) => [i.p_environment, i.p_resource, i.p_resource_id]),
      [
        ["sandbox", resource, "bad-one"],
        ["sandbox", resource, "bad-two"],
      ],
    );
    assertEquals(
      incidents.every((i) => /^[a-f0-9]{64}$/.test(String(i.p_item_key))),
      true,
    );
    assertEquals(JSON.stringify(incidents).includes("private"), false);
    assertEquals(reads >= 2, true);
  }
});

Deno.test("P3-25 incident-store outage retains the cursor; unidentified items have stable separate digests", async () => {
  const keys: string[] = [];
  let outage = true;
  const supabase = {
    rpc: (_name: string, args: Record<string, unknown>) => {
      keys.push(String(args.p_item_key));
      assertEquals(args.p_resource_id, null);
      return Promise.resolve({
        data: null,
        error: outage ? { code: "fixture" } : null,
      });
    },
  } as unknown as SupabaseClient;
  const args = {
    cursor: { resource: "disputes" as const, page: 3 },
    environment: "sandbox" as const,
    supabase,
    page: { items: [{ status: "bad-one" }, { status: "bad-two" }], maxPage: 3 },
  };
  const first = await reconcilePage(args);
  assertEquals(first.failed.map((f) => f.incident_recorded), [false, false]);
  assertEquals(first.next, args.cursor);
  outage = false;
  const retry = await reconcilePage(args);
  assertEquals(retry.failed.map((f) => f.incident_recorded), [true, true]);
  assertEquals(keys.slice(0, 2), keys.slice(2));
  assertEquals(keys[0] === keys[1], false);
});

Deno.test("one poison observation emits an incident and does not freeze the other item or cursor", async () => {
  const observed: string[] = [], incidents: string[] = [];
  const result = await reconcilePage({
    cursor: { resource: "orders", page: 2 },
    page: {
      maxPage: 3,
      items: [{ id: "poison", paid: false }, { id: "healthy", paid: false }],
    },
    environment: "sandbox",
    supabase: {} as SupabaseClient,
    observeCheckoutOrder: (item) => {
      observed.push(String(item.id));
      return item.id === "poison"
        ? Promise.reject(new Error("invalid_polar_amount"))
        : Promise.resolve();
    },
    observationFailure: (item) => {
      incidents.push(String(item.id));
      return Promise.resolve();
    },
  });
  assertEquals(observed, ["poison", "healthy"]);
  assertEquals(incidents, ["poison"]);
  assertEquals(result.next, { resource: "orders", page: 3 });
  assertEquals(result.observed, 2);
});
