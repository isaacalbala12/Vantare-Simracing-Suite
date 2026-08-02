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
  resolveUserId,
} from "./process.ts";
import { MemoryWebhookInbox } from "./test-inbox.ts";
import { MemoryCommercialProjection } from "./commercial-projection.ts";

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

function loadProductionTestMap() {
  const raw = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
  raw.environment = "production";
  return loadPolarProductMap(JSON.stringify(raw), {
    environment: "production",
  });
}

function processDeps(
  mock: ReturnType<typeof createMockSupabase>,
  loadMap = loadTestMap,
) {
  const now = () => new Date("2026-07-09T12:00:00.000Z");
  const projection = new MemoryCommercialProjection();
  return {
    supabase: mock.client,
    inbox: new MemoryWebhookInbox(now),
    loadMap,
    now,
    workerToken: () => crypto.randomUUID(),
    projection,
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
      environment: "sandbox",
      provider_customer_id: "polar_smoke_cus",
      email: "old@example.com",
    }],
  });

  await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: {
        id: "order-real-customer-swap",
        modified_at: RESOURCE_MODIFIED_AT,
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
        customer_id: "real-polar-customer-uuid",
        customer: {
          email: "billing-smoke@example.invalid",
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
  assertEquals(customers[0].environment, "sandbox");
  assertEquals(customers[0].email, "old@example.com");
});

Deno.test("durable webhook resolves customers inside the configured Polar environment", async () => {
  const mock = createMockSupabase({
    billing_customers: [
      {
        user_id: USER_ID,
        provider: "polar",
        environment: "sandbox",
        provider_customer_id: "shared-customer-id",
      },
      {
        user_id: PRODUCTION_USER_ID,
        provider: "polar",
        environment: "production",
        provider_customer_id: "shared-customer-id",
      },
      {
        user_id: "6d8fa13b-3ea1-414f-a2f4-586346e39090",
        provider: "polar",
        environment: null,
        provider_customer_id: "legacy-customer-id",
      },
    ],
  });

  assertEquals(
    await resolveUserId(
      mock.client,
      { customer_id: "shared-customer-id" },
      "sandbox",
    ),
    USER_ID,
  );
  assertEquals(
    await resolveUserId(
      mock.client,
      { customer_id: "shared-customer-id" },
      "production",
    ),
    PRODUCTION_USER_ID,
  );
  assertEquals(
    await resolveUserId(
      mock.client,
      { customer_id: "legacy-customer-id" },
      "sandbox",
    ),
    null,
  );
});

Deno.test("durable webhook stores independent customers per Polar environment", async () => {
  const mock = createMockSupabase();
  const baseEvent = {
    type: "order.paid",
    data: {
      id: "order-environment",
      modified_at: RESOURCE_MODIFIED_AT,
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
      customer_id: "same-provider-customer-id",
    },
  };

  await processPolarWebhookEvent(
    baseEvent,
    "evt_sandbox_customer",
    processDeps(mock),
  );
  await processPolarWebhookEvent(
    baseEvent,
    "evt_production_customer",
    processDeps(mock, loadProductionTestMap),
  );

  const customers = mock.getTableRows("billing_customers");
  assertEquals(customers.length, 2);
  assertEquals(
    customers.map((row) => row.environment).sort(),
    ["production", "sandbox"],
  );
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
        id: "order-without-email",
        modified_at: RESOURCE_MODIFIED_AT,
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
  const deps = processDeps(mock);
  const result = await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: {
        id: "order-lifetime",
        modified_at: RESOURCE_MODIFIED_AT,
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
        customer_id: "polar_cus_launch",
        customer: { email: "buyer@example.com" },
      },
    },
    "evt_order_paid_lifetime",
    deps,
  );

  assertEquals(result, {
    status: "processed",
    action: "granted_lifetime_bundle",
  });

  const grants = [...deps.projection.grants.values()];
  assertEquals(grants.length, 2);
  assertEquals(grants.every((grant) => grant.status === "active"), true);
  assertEquals(mock.getTableRows("user_entitlements").length, 0);
});

Deno.test("processPolarWebhookEvent: subscription.active pro_monthly grants monthly bundle", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const periodEnd = "2026-08-09T12:00:00.000Z";

  const result = await processPolarWebhookEvent(
    {
      type: "subscription.active",
      data: {
        id: "sub_pro_1",
        modified_at: RESOURCE_MODIFIED_AT,
        product_id: PRO_MONTHLY_PRODUCT_ID,
        external_customer_id: USER_ID,
        status: "active",
        current_period_end: periodEnd,
      },
    },
    "evt_sub_active",
    deps,
  );

  assertEquals(result, {
    status: "processed",
    action: "updated_monthly_bundle",
  });

  const grants = [...deps.projection.grants.values()];
  assertEquals(grants, [{
    capability: "vantare.plan.pro",
    status: "active",
    validUntil: periodEnd,
  }]);
  const subscriptions = mock.getTableRows("billing_subscriptions");
  assertEquals(subscriptions.length, 1);
  assertEquals(subscriptions[0].provider_subscription_id, "sub_pro_1");
  assertEquals(subscriptions[0].status, "active");
  assertEquals(subscriptions[0].metadata, {
    checkout_key: "pro_monthly",
    derived: true,
  });
  assertEquals(mock.getTableRows("user_entitlements").length, 0);
});

Deno.test("processPolarWebhookEvent: subscription cancellation cannot revoke an independent lifetime order", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: {
        id: "order-independent-lifetime",
        modified_at: RESOURCE_MODIFIED_AT,
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
      },
    },
    "evt_independent_lifetime",
    deps,
  );

  const result = await processPolarWebhookEvent(
    {
      type: "subscription.canceled",
      data: {
        id: "sub_pro_1",
        modified_at: RESOURCE_MODIFIED_AT,
        product_id: PRO_MONTHLY_PRODUCT_ID,
        external_customer_id: USER_ID,
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: "2026-08-09T12:00:00.000Z",
      },
    },
    "evt_sub_cancel_lifetime",
    deps,
  );

  assertEquals(result, {
    status: "processed",
    action: "updated_monthly_bundle",
  });
  const grants = [...deps.projection.grants.values()];
  assertEquals(
    grants.filter((grant) => grant.status === "active").length,
    2,
  );
  assertEquals(
    grants.filter((grant) => grant.status === "revoked").length,
    1,
  );
});

Deno.test("processPolarWebhookEvent: subscription.canceled revokes monthly without lifetime", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);

  const result = await processPolarWebhookEvent(
    {
      type: "subscription.canceled",
      data: {
        id: "sub_pro_1",
        modified_at: RESOURCE_MODIFIED_AT,
        product_id: PRO_MONTHLY_PRODUCT_ID,
        external_customer_id: USER_ID,
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: "2026-08-09T12:00:00.000Z",
      },
    },
    "evt_sub_cancel_monthly",
    deps,
  );

  assertEquals(result, {
    status: "processed",
    action: "updated_monthly_bundle",
  });

  assertEquals([...deps.projection.grants.values()][0].status, "revoked");
});

Deno.test("processPolarWebhookEvent: subscription.revoked revokes monthly without lifetime", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);

  const result = await processPolarWebhookEvent(
    {
      type: "subscription.revoked",
      data: {
        id: "sub_pro_1",
        modified_at: RESOURCE_MODIFIED_AT,
        product_id: PRO_MONTHLY_PRODUCT_ID,
        external_customer_id: USER_ID,
        status: "revoked",
        current_period_end: "2026-08-09T12:00:00.000Z",
      },
    },
    "evt_sub_revoked",
    deps,
  );

  assertEquals(result, {
    status: "processed",
    action: "revoked_monthly_revoked",
  });
  assertEquals([...deps.projection.grants.values()][0].status, "revoked");
});

Deno.test("processPolarWebhookEvent: order.refunded launch_lifetime revokes lifetime safely", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);

  const result = await processPolarWebhookEvent(
    {
      type: "order.refunded",
      data: {
        id: "order-refund-lifetime",
        modified_at: RESOURCE_MODIFIED_AT,
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
      },
    },
    "evt_refund_lifetime",
    deps,
  );

  assertEquals(result, {
    status: "processed",
    action: "revoked_lifetime_bundle",
  });
  assertEquals(
    [...deps.projection.grants.values()].every((grant) =>
      grant.status === "revoked"
    ),
    true,
  );
});

Deno.test("processPolarWebhookEvent: duplicate event id is idempotent", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const event = {
    type: "order.paid",
    data: {
      id: "order-duplicate",
      modified_at: RESOURCE_MODIFIED_AT,
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
  assertEquals(deps.projection.resources.size, 1);
});

Deno.test("processPolarWebhookEvent: failure between effects retries only the pending effect", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const event = {
    type: "order.paid",
    data: {
      id: "order-effect-retry",
      modified_at: RESOURCE_MODIFIED_AT,
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
      customer_id: "polar_customer_retry",
      customer: { email: "buyer@example.com" },
    },
  };
  mock.failNextUpsert("billing_customers");

  await assertRejects(
    () => processPolarWebhookEvent(event, "evt_effect_retry", deps),
    Error,
    "billing_customers",
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
    action: "resource_duplicate",
  });
  assertEquals(
    deps.inbox.effectAttempts("evt_effect_retry", "billing_customer"),
    2,
  );
  assertEquals(mock.getTableRows("billing_customers").length, 1);
  assertEquals(deps.projection.resources.size, 1);
  assertEquals(mock.getTableRows("license_events").length, 1);
});

Deno.test("processPolarWebhookEvent: active claim defers a concurrent worker and an orphan can resume", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const event = {
    type: "order.paid",
    data: {
      id: "order-concurrent",
      modified_at: RESOURCE_MODIFIED_AT,
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
  assertEquals(deps.projection.resources.size, 0);

  deps.inbox.expireEventLease("evt_concurrent");
  const recovered = await processPolarWebhookEvent(
    event,
    "evt_concurrent",
    deps,
  );
  assertEquals(recovered.status, "processed");
  assertEquals(deps.inbox.snapshot("evt_concurrent").attempts, 2);
  assertEquals(deps.projection.resources.size, 1);
});

Deno.test("replayPolarWebhookInboxItem: audited replay preserves completed effects", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const event = {
    type: "order.paid",
    data: {
      id: "order-manual-replay",
      modified_at: RESOURCE_MODIFIED_AT,
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
      customer_id: "polar_customer_replay",
    },
  };
  mock.failNextUpsert("billing_customers");
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
    2,
  );
});

Deno.test("processPolarWebhookEvent: same provider id with a different body is quarantined", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const first = {
    type: "order.paid",
    data: {
      id: "order-hash-conflict",
      modified_at: RESOURCE_MODIFIED_AT,
      product_id: LAUNCH_PRODUCT_ID,
      external_customer_id: USER_ID,
    },
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
  assertEquals(deps.projection.resources.size, 1);
});

Deno.test("processPolarWebhookEvent: an older event is audited and completed without reversing the resource", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const common = {
    id: "order-out-of-order",
    product_id: LAUNCH_PRODUCT_ID,
    external_customer_id: USER_ID,
  };

  await processPolarWebhookEvent(
    {
      type: "order.refunded",
      data: { ...common, modified_at: "2026-07-09T13:00:00.000Z" },
    },
    "evt_refund_newer",
    deps,
  );
  const stale = await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: { ...common, modified_at: "2026-07-09T12:00:00.000Z" },
    },
    "evt_paid_older",
    deps,
  );

  assertEquals(stale, { status: "processed", action: "stale_noop" });
  assertEquals(deps.inbox.snapshot("evt_paid_older").status, "processed");
  assertEquals(
    [...deps.projection.grants.values()].every((grant) =>
      grant.status === "revoked"
    ),
    true,
  );
  const audits = mock.getTableRows("license_events");
  assertEquals(
    (audits[1].payload as Record<string, unknown>).action,
    "stale_noop",
  );
});

Deno.test("processPolarWebhookEvent: equal resource versions with different bodies are quarantined", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const common = {
    id: "order-version-conflict",
    modified_at: RESOURCE_MODIFIED_AT,
    product_id: LAUNCH_PRODUCT_ID,
    external_customer_id: USER_ID,
  };
  await processPolarWebhookEvent(
    { type: "order.paid", data: common },
    "evt_version_first",
    deps,
  );
  const conflict = await processPolarWebhookEvent(
    { type: "order.refunded", data: common },
    "evt_version_conflict",
    deps,
  );

  assertEquals(conflict, {
    status: "quarantined",
    reason: "resource_version_conflict",
  });
  assertEquals(
    [...deps.projection.grants.values()].every((grant) =>
      grant.status === "active"
    ),
    true,
  );
});

Deno.test("processPolarWebhookEvent: stale subscription events cannot revert the compatibility read-model", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const common = {
    id: "subscription-read-model-order",
    product_id: PRO_MONTHLY_PRODUCT_ID,
    external_customer_id: USER_ID,
    current_period_end: "2026-09-02T13:00:00.000Z",
  };
  await processPolarWebhookEvent(
    {
      type: "subscription.revoked",
      data: {
        ...common,
        status: "revoked",
        modified_at: "2026-08-02T13:00:00.000Z",
      },
    },
    "evt_subscription_newer_revoked",
    deps,
  );
  const stale = await processPolarWebhookEvent(
    {
      type: "subscription.active",
      data: {
        ...common,
        status: "active",
        modified_at: "2026-08-02T12:00:00.000Z",
      },
    },
    "evt_subscription_older_active",
    deps,
  );
  assertEquals(stale, { status: "processed", action: "stale_noop" });
  const subscription = mock.getTableRows("billing_subscriptions")[0];
  assertEquals(subscription.status, "revoked");
  assertEquals(subscription.updated_at, "2026-08-02T13:00:00.000Z");
});

Deno.test("processPolarWebhookEvent: missing resource version is quarantined", async () => {
  const mock = createMockSupabase();
  const deps = processDeps(mock);
  const result = await processPolarWebhookEvent(
    {
      type: "order.paid",
      data: {
        id: "order-without-version",
        product_id: LAUNCH_PRODUCT_ID,
        external_customer_id: USER_ID,
      },
    },
    "evt_without_version",
    deps,
  );
  assertEquals(result, {
    status: "quarantined",
    reason: "missing_resource_modified_at",
  });
  assertEquals(deps.projection.resources.size, 0);
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
