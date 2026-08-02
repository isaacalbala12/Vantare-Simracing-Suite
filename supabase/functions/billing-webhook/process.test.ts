import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadPolarProductMap,
  resolveCheckoutKeyByProductId,
} from "../_shared/mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import {
  deriveSubscriptionEntitlementStatus,
  minimizePolarWebhookEvent,
  parsePolarWebhookEvent,
  processPolarWebhookEvent,
  replayPolarWebhookInboxItem,
} from "./process.ts";
import { MemoryWebhookInbox } from "./test-inbox.ts";

const LAUNCH_PRODUCT_ID = "00000000-0000-0000-0000-000000000001";
const PRO_MONTHLY_PRODUCT_ID = "00000000-0000-0000-0000-000000000003";
const USER_ID = "4b6d8919-1c89-492d-a0e2-364124c17878";

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
  const state: Record<string, MockRow[]> = JSON.parse(JSON.stringify(tables));
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
            upsertRow(state, table, payload, ["user_id", "provider"]);
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
  return loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON);
}

function processDeps(mock: ReturnType<typeof createMockSupabase>) {
  const now = () => new Date("2026-07-09T12:00:00.000Z");
  return {
    supabase: mock.client,
    inbox: new MemoryWebhookInbox(now),
    loadMap: loadTestMap,
    now,
    workerToken: () => crypto.randomUUID(),
  };
}

Deno.test("parsePolarWebhookEvent: rejects invalid JSON", () => {
  assertEquals(parsePolarWebhookEvent("{"), null);
});

Deno.test("parsePolarWebhookEvent: requires type field", () => {
  assertEquals(parsePolarWebhookEvent(JSON.stringify({ data: {} })), null);
});

Deno.test("mapping: launch_lifetime and pro_monthly map to bundle", () => {
  const map = loadTestMap();
  if (!map.ok) throw new Error("fixture map invalid");

  const lifetime = resolveCheckoutKeyByProductId(map.map, LAUNCH_PRODUCT_ID);
  const monthly = resolveCheckoutKeyByProductId(
    map.map,
    PRO_MONTHLY_PRODUCT_ID,
  );

  assertEquals(lifetime.ok, true);
  assertEquals(monthly.ok, true);
  if (!lifetime.ok || !monthly.ok) return;

  assertEquals(lifetime.key, "launch_lifetime");
  assertEquals(monthly.key, "pro_monthly");
  assertEquals(lifetime.config.entitlement_product_key, "bundle");
  assertEquals(monthly.config.entitlement_product_key, "bundle");
});

Deno.test("processPolarWebhookEvent: unknown product_id is quarantined without granting", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const result = await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: {
        product_id: "unknown-product",
        external_customer_id: USER_ID,
      },
    },
    "evt_unknown_product",
    deps,
  );

  assertEquals(result, { status: "quarantined", reason: "unknown_product_id" });
  assertEquals(mock.getTableRows("license_events").length, 0);
  assertEquals(mock.getTableRows("user_entitlements").length, 0);
  assertEquals(
    deps.inbox.snapshot("evt_unknown_product").status,
    "quarantined",
  );
});

Deno.test("processPolarWebhookEvent: order.paid updates existing billing_customers row for user", async () => {
  const mock = createMockSupabase({
    billing_customers: [{
      user_id: USER_ID,
      provider: "polar",
      provider_customer_id: "polar_smoke_cus",
      email: "old@example.com",
    }],
  });

  await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: {
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
        customer_id: "real-polar-customer-uuid",
        customer: {
          email: "fase16.smoke.test@gmail.com",
          external_id: USER_ID,
        },
      },
    },
    "evt_real_customer_swap",
    processDeps(mock),
  );

  const customers = mock.getTableRows("billing_customers");
  assertEquals(customers.length, 1);
  assertEquals(customers[0].provider_customer_id, "real-polar-customer-uuid");
  assertEquals(customers[0].email, "old@example.com");
});

Deno.test("minimizePolarWebhookEvent: durable payload excludes redundant email PII", () => {
  const minimized = minimizePolarWebhookEvent({
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
      customer_email: "top-level@example.com",
      customer: {
        id: "polar_customer_minimized",
        email: "nested@example.com",
        external_id: USER_ID,
        name: "Sensitive Name",
      },
    },
  });

  assertEquals(minimized, {
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
      customer: {
        id: "polar_customer_minimized",
        external_id: USER_ID,
      },
    },
  });
});

Deno.test("processPolarWebhookEvent: does not persist customer email from the webhook", async () => {
  const mock = createMockSupabase();
  await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: {
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
        customer_id: "polar_customer_without_email",
        customer_email: "top-level@example.com",
        customer: { email: "nested@example.com" },
      },
    },
    "evt_customer_without_email",
    processDeps(mock),
  );

  const customer = mock.getTableRows("billing_customers")[0];
  assertEquals(customer.provider_customer_id, "polar_customer_without_email");
  assertEquals("email" in customer, false);
});

Deno.test("processPolarWebhookEvent: order.paid launch_lifetime grants lifetime bundle", async () => {
  const mock = createMockSupabase();
  const result = await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: {
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
        customer_id: "polar_cus_launch",
        customer: { email: "buyer@example.com" },
      },
    },
    "evt_order_paid_lifetime",
    processDeps(mock),
  );

  assertEquals(result, {
    status: "processed",
    action: "granted_lifetime_bundle",
  });

  const entitlements = mock.getTableRows("user_entitlements");
  assertEquals(entitlements.length, 1);
  assertEquals(entitlements[0].user_id, USER_ID);
  assertEquals(entitlements[0].product_key, "bundle");
  assertEquals(entitlements[0].status, "active");
  assertEquals(entitlements[0].expires_at, null);
  assertEquals(
    (entitlements[0].metadata as Record<string, unknown>).lifetime,
    true,
  );
  assertEquals(
    (entitlements[0].metadata as Record<string, unknown>).plan_sku,
    "launch_lifetime",
  );
});

Deno.test("processPolarWebhookEvent: subscription.active pro_monthly grants monthly bundle", async () => {
  const mock = createMockSupabase();
  const periodEnd = "2026-08-09T12:00:00.000Z";

  const result = await processPolarWebhookEvent(
    {
      type: "subscription.active",
      data: {
        id: "sub_pro_1",
        product_id: PRO_MONTHLY_PRODUCT_ID,
        external_customer_id: USER_ID,
        status: "active",
        current_period_end: periodEnd,
      },
    },
    "evt_sub_active",
    processDeps(mock),
  );

  assertEquals(result, {
    status: "processed",
    action: "updated_monthly_bundle",
  });

  const entitlements = mock.getTableRows("user_entitlements");
  assertEquals(entitlements.length, 1);
  assertEquals(entitlements[0].status, "active");
  assertEquals(entitlements[0].expires_at, periodEnd);
  assertEquals(
    (entitlements[0].metadata as Record<string, unknown>).lifetime,
    false,
  );
  assertEquals(
    (entitlements[0].metadata as Record<string, unknown>).plan_sku,
    "pro_monthly",
  );

  const subscriptions = mock.getTableRows("billing_subscriptions");
  assertEquals(subscriptions.length, 1);
  assertEquals(subscriptions[0].provider_subscription_id, "sub_pro_1");
  assertEquals(subscriptions[0].provider_price_id, null);
});

Deno.test("processPolarWebhookEvent: subscription.canceled skips revoke when lifetime is active", async () => {
  const mock = createMockSupabase({
    user_entitlements: [{
      user_id: USER_ID,
      product_key: "bundle",
      status: "active",
      expires_at: null,
      metadata: { lifetime: true, plan_sku: "launch_lifetime" },
    }],
  });

  const result = await processPolarWebhookEvent(
    {
      type: "subscription.canceled",
      data: {
        id: "sub_pro_1",
        product_id: PRO_MONTHLY_PRODUCT_ID,
        external_customer_id: USER_ID,
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: "2026-08-09T12:00:00.000Z",
      },
    },
    "evt_sub_cancel_lifetime",
    processDeps(mock),
  );

  assertEquals(result, {
    status: "processed",
    action: "subscription_ignored_due_to_lifetime",
  });

  const entitlements = mock.getTableRows("user_entitlements");
  assertEquals(entitlements[0].status, "active");
  assertEquals(entitlements[0].expires_at, null);
});

Deno.test("processPolarWebhookEvent: subscription.canceled revokes monthly without lifetime", async () => {
  const mock = createMockSupabase({
    user_entitlements: [{
      user_id: USER_ID,
      product_key: "bundle",
      status: "active",
      expires_at: "2026-08-09T12:00:00.000Z",
      metadata: { lifetime: false, plan_sku: "pro_monthly" },
    }],
  });

  const result = await processPolarWebhookEvent(
    {
      type: "subscription.canceled",
      data: {
        id: "sub_pro_1",
        product_id: PRO_MONTHLY_PRODUCT_ID,
        external_customer_id: USER_ID,
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: "2026-08-09T12:00:00.000Z",
      },
    },
    "evt_sub_cancel_monthly",
    processDeps(mock),
  );

  assertEquals(result, {
    status: "processed",
    action: "updated_monthly_bundle",
  });

  const entitlements = mock.getTableRows("user_entitlements");
  assertEquals(entitlements[0].status, "expired");
});

Deno.test("processPolarWebhookEvent: subscription.revoked revokes monthly without lifetime", async () => {
  const mock = createMockSupabase({
    user_entitlements: [{
      user_id: USER_ID,
      product_key: "bundle",
      status: "active",
      expires_at: "2026-08-09T12:00:00.000Z",
      metadata: { lifetime: false, plan_sku: "pro_monthly" },
    }],
  });

  const result = await processPolarWebhookEvent(
    {
      type: "subscription.revoked",
      data: {
        id: "sub_pro_1",
        product_id: PRO_MONTHLY_PRODUCT_ID,
        external_customer_id: USER_ID,
        status: "revoked",
        current_period_end: "2026-08-09T12:00:00.000Z",
      },
    },
    "evt_sub_revoked",
    processDeps(mock),
  );

  assertEquals(result, {
    status: "processed",
    action: "revoked_monthly_revoked",
  });
  assertEquals(mock.getTableRows("user_entitlements")[0].status, "revoked");
});

Deno.test("processPolarWebhookEvent: order.refunded launch_lifetime revokes lifetime safely", async () => {
  const mock = createMockSupabase({
    user_entitlements: [{
      user_id: USER_ID,
      product_key: "bundle",
      status: "active",
      expires_at: null,
      metadata: { lifetime: true, checkout_key: "launch_lifetime" },
    }],
  });

  const result = await processPolarWebhookEvent(
    {
      type: "order.refunded",
      data: {
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
      },
    },
    "evt_refund_lifetime",
    processDeps(mock),
  );

  assertEquals(result, {
    status: "processed",
    action: "revoked_lifetime_bundle",
  });
  assertEquals(mock.getTableRows("user_entitlements")[0].status, "revoked");
});

Deno.test("processPolarWebhookEvent: duplicate event id is idempotent", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const event = {
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
    },
  };

  const first = await processPolarWebhookEvent(
    event,
    "evt_duplicate",
    deps,
  );
  const second = await processPolarWebhookEvent(
    event,
    "evt_duplicate",
    deps,
  );

  assertEquals(first, {
    status: "processed",
    action: "granted_lifetime_bundle",
  });
  assertEquals(second, { status: "duplicate" });
  assertEquals(mock.getTableRows("license_events").length, 1);
  assertEquals(mock.getTableRows("user_entitlements").length, 1);
});

Deno.test("processPolarWebhookEvent: failure between effects retries only the pending effect", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const event = {
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
      customer_id: "polar_customer_retry",
      customer: { email: "buyer@example.com" },
    },
  };
  mock.failNextUpsert("user_entitlements");

  await assertRejects(
    () => processPolarWebhookEvent(event, "evt_effect_retry", deps),
    Error,
    "user_entitlements",
  );
  assertEquals(deps.inbox.snapshot("evt_effect_retry").status, "failed");
  assertEquals(
    deps.inbox.snapshot("evt_effect_retry").lastErrorCode,
    "test_fail",
  );

  const scheduled = await processPolarWebhookEvent(
    event,
    "evt_effect_retry",
    deps,
  );
  assertEquals(scheduled, {
    status: "deferred",
    reason: "retry_scheduled",
    nextAttemptAt: "2026-07-09T12:00:30.000Z",
  });
  assertEquals(deps.inbox.snapshot("evt_effect_retry").attempts, 1);

  deps.inbox.makeRetryDue("evt_effect_retry");
  const retried = await processPolarWebhookEvent(
    event,
    "evt_effect_retry",
    deps,
  );
  assertEquals(retried, {
    status: "processed",
    action: "granted_lifetime_bundle",
  });
  assertEquals(
    deps.inbox.effectAttempts("evt_effect_retry", "billing_customer"),
    1,
  );
  assertEquals(
    deps.inbox.effectAttempts("evt_effect_retry", "bundle_entitlement"),
    2,
  );
  assertEquals(mock.getTableRows("billing_customers").length, 1);
  assertEquals(mock.getTableRows("user_entitlements").length, 1);
  assertEquals(mock.getTableRows("license_events").length, 1);
});

Deno.test("processPolarWebhookEvent: active claim defers a concurrent worker and an orphan can resume", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const event = {
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
    },
  };
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(event)),
  );
  const payloadHash = Array.from(
    new Uint8Array(hash),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const receipt = await deps.inbox.receive({
    provider: "polar",
    eventId: "evt_concurrent",
    eventType: event.type,
    payloadHash,
    payload: event,
  });
  const firstClaim = await deps.inbox.claim(
    receipt.id,
    "00000000-0000-4000-8000-000000000001",
  );
  assertEquals(firstClaim.status, "claimed");

  const concurrent = await processPolarWebhookEvent(
    event,
    "evt_concurrent",
    deps,
  );
  assertEquals(concurrent, {
    status: "deferred",
    reason: "processing",
    leaseExpiresAt: "2026-07-09T12:01:00.000Z",
  });
  assertEquals(mock.getTableRows("user_entitlements").length, 0);

  deps.inbox.expireEventLease("evt_concurrent");
  const recovered = await processPolarWebhookEvent(
    event,
    "evt_concurrent",
    deps,
  );
  assertEquals(recovered.status, "processed");
  assertEquals(deps.inbox.snapshot("evt_concurrent").attempts, 2);
  assertEquals(mock.getTableRows("user_entitlements").length, 1);
});

Deno.test("replayPolarWebhookInboxItem: audited replay preserves completed effects", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const event = {
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
      customer_id: "polar_customer_replay",
    },
  };
  mock.failNextUpsert("user_entitlements");
  await assertRejects(() =>
    processPolarWebhookEvent(event, "evt_manual_replay", deps)
  );
  deps.inbox.setMaxAttempts("evt_manual_replay", 1);
  deps.inbox.makeRetryDue("evt_manual_replay");
  const quarantined = await processPolarWebhookEvent(
    event,
    "evt_manual_replay",
    deps,
  );
  assertEquals(quarantined.status, "quarantined");

  const inboxId = deps.inbox.snapshot("evt_manual_replay").id;
  const replayed = await replayPolarWebhookInboxItem(
    inboxId,
    "operator_isa68",
    "mapping_verified",
    deps,
  );
  assertEquals(replayed.status, "processed");
  assertEquals(deps.inbox.replayAudit, [{
    inboxId,
    actorId: "operator_isa68",
    reasonCode: "mapping_verified",
  }]);
  assertEquals(
    deps.inbox.effectAttempts("evt_manual_replay", "billing_customer"),
    1,
  );
  assertEquals(
    deps.inbox.effectAttempts("evt_manual_replay", "bundle_entitlement"),
    2,
  );
});

Deno.test("processPolarWebhookEvent: same provider id with a different body is quarantined", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const first = {
    type: "order.paid",
    data: { product_id: LAUNCH_PRODUCT_ID, external_customer_id: USER_ID },
  };
  await processPolarWebhookEvent(first, "evt_hash_conflict", deps);

  const conflict = await processPolarWebhookEvent(
    {
      ...first,
      data: { ...first.data, customer_id: "changed" },
    },
    "evt_hash_conflict",
    deps,
  );
  assertEquals(conflict, {
    status: "quarantined",
    reason: "payload_hash_mismatch",
  });
  assertEquals(deps.inbox.snapshot("evt_hash_conflict").status, "quarantined");
  assertEquals(mock.getTableRows("user_entitlements").length, 1);
});

Deno.test("deriveSubscriptionEntitlementStatus: canceled with cancel_at_period_end stays active", () => {
  const now = new Date("2026-07-09T12:00:00.000Z");
  const result = deriveSubscriptionEntitlementStatus(
    "canceled",
    true,
    "2026-08-09T12:00:00.000Z",
    now,
  );
  assertEquals(result.status, "active");
  assertEquals(result.expiresAt, "2026-08-09T12:00:00.000Z");
});
