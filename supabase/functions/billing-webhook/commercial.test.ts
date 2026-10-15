import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadPolarProductMap } from "../_shared/mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import {
  processPolarWebhookEvent,
  resolveUserId,
} from "../billing-webhook/process.ts";
import { MemoryWebhookInbox } from "../billing-webhook/test-inbox.ts";
import { MemoryCommercialProjection } from "../billing-webhook/commercial-projection.ts";
import { MemorySubscriptionLifecycleStore } from "../billing-webhook/subscription-lifecycle-store.ts";
import { MemoryOrderRefundLedger } from "../billing-webhook/order-refund-ledger.ts";

const LAUNCH_PRODUCT_ID = "00000000-0000-0000-0000-000000000001";
const PRO_MONTHLY_PRODUCT_ID = "00000000-0000-0000-0000-000000000003";
const USER_ID = "4b6d8919-1c89-492d-a0e2-364124c17878";
const PRODUCTION_USER_ID = "5c7e902a-2d90-403e-b1f3-475235d28989";
const RESOURCE_MODIFIED_AT = "2026-07-09T12:00:00.000Z";

type MockRow = Record<string, unknown>;
type MockFilter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "is"; column: string; value: null };

interface MockOperation {
  type: "upsert" | "select" | "insert";
  table: string;
  payload?: unknown;
  filters?: MockFilter[];
}

function rowMatches(row: MockRow, filters: MockFilter[]): boolean {
  return filters.every((filter) => {
    if (filter.kind === "is") {
      return row[filter.column] == null;
    }
    return row[filter.column] === filter.value;
  });
}

function upsertRow(
  state: Record<string, MockRow[]>,
  table: string,
  payload: MockRow,
  conflictKeys: string[],
): void {
  const rows = state[table] ??= [];
  const index = rows.findIndex((row) =>
    conflictKeys.every((key) => row[key] === payload[key])
  );
  if (index >= 0) {
    rows[index] = { ...rows[index], ...payload };
  } else {
    rows.push({ ...payload });
  }
}

function createMockSupabase(tables: Record<string, MockRow[]> = {}) {
  const state: Record<string, MockRow[]> = JSON.parse(
    JSON.stringify({
      billing_customers: [{
        provider: "polar",
        environment: "sandbox",
        provider_customer_id: "fixture-customer",
        user_id: USER_ID,
      }],
      ...tables,
    }),
  );
  const ops: MockOperation[] = [];
  const upsertFailures = new Map<string, number>();

  function query(table: string) {
    const filters: MockFilter[] = [];

    const chain = {
      select: (_columns?: string) => chain,
      eq: (column: string, value: unknown) => {
        filters.push({ kind: "eq", column, value });
        return chain;
      },
      is: (column: string, value: null) => {
        filters.push({ kind: "is", column, value });
        return chain;
      },
      maybeSingle: () => {
        ops.push({ type: "select", table, filters: [...filters] });
        const rows = (state[table] ?? []).filter((row) =>
          rowMatches(row, filters)
        );
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
    };

    return chain;
  }

  return {
    client: {
      // No promotion catalogue or admin refund attribution in this fixture.
      // Both server-only projections are explicit; unknown RPCs still fail.
      rpc: (name: string) => {
        if (name === "native_admin_record_refund") {
          return Promise.resolve({ data: false, error: null });
        }
        if (
          !["report_promotion_invoice", "report_promotion_invoice_missing"]
            .includes(name)
        ) {
          throw new Error("unexpected fixture RPC: " + name);
        }
        return Promise.resolve({ data: null, error: null });
      },
      from: (table: string) => ({
        select: (columns?: string) => query(table).select(columns),
        insert: (payload: MockRow) => {
          ops.push({ type: "insert", table, payload });
          if (table === "license_events") {
            const duplicate = (state[table] ?? []).some((row) =>
              row.event_type === payload.event_type &&
              row.idempotency_key === payload.idempotency_key
            );
            if (duplicate) {
              return Promise.resolve({ error: { code: "23505" } });
            }
          }
          (state[table] ??= []).push({ ...payload });
          return Promise.resolve({ error: null });
        },
        upsert: (payload: MockRow, options?: { onConflict?: string }) => {
          ops.push({ type: "upsert", table, payload });
          const failures = upsertFailures.get(table) ?? 0;
          if (failures > 0) {
            upsertFailures.set(table, failures - 1);
            return Promise.resolve({
              error: { code: "TEST_FAIL", message: "private test failure" },
            });
          }
          const conflict = options?.onConflict ?? "";
          const conflictKeys = conflict.split(",").map((key) => key.trim());

          if (table === "user_entitlements") {
            upsertRow(state, table, payload, ["user_id", "product_key"]);
          } else if (table === "billing_customers") {
            upsertRow(state, table, payload, conflictKeys);
          } else if (table === "billing_subscriptions") {
            upsertRow(state, table, payload, [
              "provider",
              "provider_subscription_id",
            ]);
          } else if (conflictKeys.length > 0 && conflictKeys[0]) {
            upsertRow(state, table, payload, conflictKeys);
          } else {
            (state[table] ??= []).push({ ...payload });
          }

          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient,
    operations: ops,
    getTableRows: (table: string) => state[table] ?? [],
    failNextUpsert: (table: string, count = 1) => {
      upsertFailures.set(table, count);
    },
  };
}

function loadTestMap() {
  return loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "sandbox",
  });
}

function processDeps(
  mock: ReturnType<typeof createMockSupabase>,
  loadMap = loadTestMap,
) {
  const now = () => new Date("2026-07-09T12:00:00.000Z");
  const projection = new MemoryCommercialProjection();
  const lifecycle = new MemorySubscriptionLifecycleStore();
  const orderRefundLedger = new MemoryOrderRefundLedger();
  return {
    supabase: mock.client,
    inbox: new MemoryWebhookInbox(now),
    loadMap,
    now,
    workerToken: () => crypto.randomUUID(),
    projection,
    lifecycle,
    orderRefundLedger,
  };
}

function paidOrderData(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-default",
    modified_at: RESOURCE_MODIFIED_AT,
    product_id: LAUNCH_PRODUCT_ID,
    external_customer_id: USER_ID,
    customer_id: "fixture-customer",
    status: "paid",
    paid: true,
    billing_reason: "purchase",
    subscription_id: null,
    net_amount: 3000,
    applied_balance_amount: 0,
    refunded_amount: 0,
    currency: "eur",
    ...overrides,
  };
}

function succeededRefundData(overrides: Record<string, unknown> = {}) {
  return {
    id: "refund-default",
    order_id: "order-default",
    payment_id: "payment-default",
    modified_at: "2026-07-09T12:05:00.000Z",
    status: "succeeded",
    amount: 3000,
    tax_amount: 0,
    currency: "eur",
    ...overrides,
  };
}

Deno.test("ISA1608 BLOCKER: ordinary refund without payment_id must revoke Launch", async () => {
  const deps = processDeps(createMockSupabase());
  await processPolarWebhookEvent(
    { type: "order.paid", data: paidOrderData({ id: "order-real-refund" }) },
    "evt_real_paid",
    deps,
  );
  await processPolarWebhookEvent(
    {
      type: "refund.updated",
      data: succeededRefundData({
        order_id: "order-real-refund",
        payment_id: null,
      }),
    },
    "evt_real_refund",
    deps,
  );
  assertEquals(
    [...deps.orderRefundLedger.grants.values()].every((value) =>
      value === "revoked"
    ),
    true,
  );
});
Deno.test("ISA1608 BLOCKER: refunded Pro subscription must revoke immediately", async () => {
  const deps = processDeps(createMockSupabase());
  await processPolarWebhookEvent(
    {
      type: "subscription.active",
      data: {
        id: "sub-refund-required",
        modified_at: RESOURCE_MODIFIED_AT,
        product_id: PRO_MONTHLY_PRODUCT_ID,
        external_customer_id: USER_ID,
        customer_id: "fixture-customer",
        status: "active",
        current_period_end: "2026-09-09T12:00:00.000Z",
      },
    },
    "evt_sub_active",
    deps,
  );
  await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: paidOrderData({
        id: "order-pro-required",
        product_id: PRO_MONTHLY_PRODUCT_ID,
        billing_reason: "subscription_cycle",
        subscription_id: "sub-refund-required",
      }),
    },
    "evt_pro_paid",
    deps,
  );
  await processPolarWebhookEvent(
    {
      type: "refund.updated",
      data: succeededRefundData({ order_id: "order-pro-required" }),
    },
    "evt_pro_refund",
    deps,
  );
  assertEquals([...deps.projection.grants.values()][0].status, "revoked");
});
Deno.test("ISA1608 BLOCKER: issued partial refund must remove its Launch source", async () => {
  const deps = processDeps(createMockSupabase());
  await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: paidOrderData({ id: "order-partial-required" }),
    },
    "evt_partial_paid",
    deps,
  );
  await processPolarWebhookEvent(
    {
      type: "refund.updated",
      data: succeededRefundData({
        order_id: "order-partial-required",
        amount: 1000,
      }),
    },
    "evt_partial_refund",
    deps,
  );
  assertEquals(
    [...deps.orderRefundLedger.grants.values()].every((value) =>
      value === "revoked"
    ),
    true,
  );
});
Deno.test("ISA1608 BLOCKER: aggregate order.refunded without refund.updated must revoke", async () => {
  const deps = processDeps(createMockSupabase());
  await processPolarWebhookEvent(
    { type: "order.paid", data: paidOrderData({ id: "order-aggregate" }) },
    "evt_aggregate_paid",
    deps,
  );
  const result = await processPolarWebhookEvent(
    {
      type: "order.refunded",
      data: paidOrderData({
        id: "order-aggregate",
        status: "refunded",
        refunded_amount: 3000,
        modified_at: "2026-07-09T12:10:00Z",
      }),
    },
    "evt_aggregate_refunded",
    deps,
  );
  assertEquals(
    [...deps.orderRefundLedger.grants.values()].every((value) =>
      value === "revoked"
    ),
    true,
    JSON.stringify(result),
  );
});

Deno.test("commercial ownership requires durable bindings; external UUID/email never suffice", async () => {
  const mock = createMockSupabase({
    billing_customers: [],
    billing_checkout_bindings: [{
      environment: "sandbox",
      provider_checkout_id: "owned",
      user_id: USER_ID,
    }],
  });
  for (
    const data of [
      { external_customer_id: USER_ID },
      { metadata: { user_id: USER_ID } },
      { customer: { email: "same@example.invalid" } },
      { checkout_id: "unknown", external_customer_id: USER_ID },
    ]
  ) {
    assertEquals(await resolveUserId(mock.client, data, "sandbox"), null);
  }
  assertEquals(
    await resolveUserId(mock.client, {
      checkout_id: "owned",
      external_customer_id: PRODUCTION_USER_ID,
    }, "sandbox"),
    USER_ID,
  );
  assertEquals(
    await resolveUserId(mock.client, { checkout_id: "owned" }, "production"),
    null,
  );
  const conflict = createMockSupabase({
    billing_checkout_bindings: [{
      environment: "sandbox",
      provider_checkout_id: "owned",
      user_id: PRODUCTION_USER_ID,
    }],
  });
  assertEquals(
    await resolveUserId(conflict.client, {
      checkout_id: "owned",
      customer_id: "fixture-customer",
    }, "sandbox"),
    null,
  );
});

Deno.test("late Pro renewal cannot lift refund; canceled restores paid-through without affecting other source", async () => {
  const deps = processDeps(createMockSupabase());
  const sub = {
    id: "sub-late",
    modified_at: RESOURCE_MODIFIED_AT,
    product_id: PRO_MONTHLY_PRODUCT_ID,
    external_customer_id: USER_ID,
    customer_id: "fixture-customer",
    status: "active",
    current_period_end: "2026-09-09T12:00:00Z",
  };
  await processPolarWebhookEvent(
    { type: "subscription.active", data: sub },
    "late-active",
    deps,
  );
  await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: paidOrderData({
        id: "invoice-late",
        product_id: PRO_MONTHLY_PRODUCT_ID,
        billing_reason: "subscription_cycle",
        subscription_id: sub.id,
      }),
    },
    "late-invoice",
    deps,
  );
  await processPolarWebhookEvent(
    {
      type: "refund.created",
      data: succeededRefundData({
        id: "pending-late",
        order_id: "invoice-late",
        status: "pending",
        amount: 1000,
        payment_id: null,
      }),
    },
    "late-pending",
    deps,
  );
  assertEquals([...deps.projection.grants.values()][0].status, "revoked");
  await processPolarWebhookEvent(
    {
      type: "subscription.updated",
      data: { ...sub, modified_at: "2026-07-09T12:06:00Z" },
    },
    "late-renewal",
    deps,
  );
  assertEquals([...deps.projection.grants.values()][0].status, "revoked");
  assertEquals([...deps.projection.baseGrants.values()][0].status, "active");
  await processPolarWebhookEvent(
    {
      type: "refund.updated",
      data: succeededRefundData({
        id: "pending-late",
        order_id: "invoice-late",
        status: "canceled",
        amount: 1000,
        payment_id: null,
        modified_at: "2026-07-09T12:07:00Z",
      }),
    },
    "late-canceled",
    deps,
  );
  assertEquals([...deps.projection.grants.values()][0].status, "active");
  assertEquals(
    [...deps.projection.grants.values()][0].validUntil,
    "2026-09-09T12:00:00.000Z",
  );
  assertEquals(
    deps.orderRefundLedger.grants.size,
    0,
    "Pro invoices cannot create perpetual order grants",
  );
});
