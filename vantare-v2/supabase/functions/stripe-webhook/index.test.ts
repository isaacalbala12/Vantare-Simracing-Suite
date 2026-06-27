import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type Stripe from "stripe";
import {
  deriveEntitlementStatus,
  handleCheckoutSessionCompleted,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
  productKeysForPriceIds,
  type WebhookContext,
} from "./index.ts";

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

Deno.test("productKeysForPriceIds maps one price to many keys", () => {
  const mapping = {
    price_founder: ["overlays", "engineer", "ac_lua_pack"],
    price_overlays: ["overlays"],
  };
  assertEquals(
    productKeysForPriceIds(["price_founder"], mapping),
    ["overlays", "engineer", "ac_lua_pack"],
  );
});

Deno.test("productKeysForPriceIds deduplicates keys across prices", () => {
  const mapping = {
    price_overlays: ["overlays"],
    price_bundle: ["overlays", "engineer"],
  };
  assertEquals(
    productKeysForPriceIds(["price_overlays", "price_bundle"], mapping),
    ["overlays", "engineer"],
  );
});

Deno.test("productKeysForPriceIds returns empty for unknown price", () => {
  assertEquals(
    productKeysForPriceIds(["price_unknown"], { price_known: ["overlays"] }),
    [],
  );
});

Deno.test("deriveEntitlementStatus: active subscription with future period end", () => {
  const now = Math.floor(Date.now() / 1000);
  const sub = {
    status: "active",
    current_period_end: now + 86400,
  } as unknown as Stripe.Subscription;
  const result = deriveEntitlementStatus(sub);
  assertEquals(result.status, "active");
  assertEquals(result.expiresAt, new Date((now + 86400) * 1000).toISOString());
});

Deno.test("deriveEntitlementStatus: trialing maps to active", () => {
  const now = Math.floor(Date.now() / 1000);
  const sub = {
    status: "trialing",
    current_period_end: now + 86400,
  } as unknown as Stripe.Subscription;
  const result = deriveEntitlementStatus(sub);
  assertEquals(result.status, "active");
});

Deno.test("deriveEntitlementStatus: past_due maps to grace", () => {
  const now = Math.floor(Date.now() / 1000);
  const sub = {
    status: "past_due",
    current_period_end: now + 86400,
  } as unknown as Stripe.Subscription;
  const result = deriveEntitlementStatus(sub);
  assertEquals(result.status, "grace");
});

Deno.test("deriveEntitlementStatus: incomplete_expired maps to expired", () => {
  const sub = {
    status: "incomplete_expired",
    current_period_end: undefined,
  } as unknown as Stripe.Subscription;
  const result = deriveEntitlementStatus(sub);
  assertEquals(result.status, "expired");
});

Deno.test("deriveEntitlementStatus: unpaid maps to expired", () => {
  const sub = {
    status: "unpaid",
    current_period_end: undefined,
  } as unknown as Stripe.Subscription;
  const result = deriveEntitlementStatus(sub);
  assertEquals(result.status, "expired");
});

Deno.test("deriveEntitlementStatus: canceled with cancel_at_period_end stays active until period end", () => {
  const now = Math.floor(Date.now() / 1000);
  const sub = {
    status: "canceled",
    cancel_at_period_end: true,
    current_period_end: now + 86400,
  } as unknown as Stripe.Subscription;
  const result = deriveEntitlementStatus(sub);
  assertEquals(result.status, "active");
});

Deno.test("deriveEntitlementStatus: canceled without cancel_at_period_end maps to expired", () => {
  const now = Math.floor(Date.now() / 1000);
  const sub = {
    status: "canceled",
    cancel_at_period_end: false,
    current_period_end: now + 86400,
  } as unknown as Stripe.Subscription;
  const result = deriveEntitlementStatus(sub);
  assertEquals(result.status, "expired");
});

Deno.test("deriveEntitlementStatus: expired when period end is in the past", () => {
  const now = Math.floor(Date.now() / 1000);
  const sub = {
    status: "active",
    current_period_end: now - 86400,
  } as unknown as Stripe.Subscription;
  const result = deriveEntitlementStatus(sub);
  assertEquals(result.status, "expired");
});

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

type MockRow = Record<string, unknown>;

interface MockOperation {
  type: "upsert" | "update" | "select";
  table: string;
  payload?: unknown;
  filters?: Array<{ column: string; value: unknown }>;
}

function createMockSupabase(tables: Record<string, MockRow[]> = {}) {
  const state: Record<string, MockRow[]> = JSON.parse(JSON.stringify(tables));
  const ops: MockOperation[] = [];

  function matches(
    row: MockRow,
    filters: Array<{ column: string; value: unknown }>,
  ): boolean {
    return filters.every(({ column, value }) => {
      if (column.includes("->>")) {
        const [col, key] = column.split("->>");
        return (row[col] as Record<string, unknown> | undefined)?.[key] ===
          value;
      }
      return row[column] === value;
    });
  }

  function query(table: string) {
    let filters: Array<{ column: string; value: unknown }> = [];

    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        return chain;
      },
      maybeSingle: () => {
        ops.push({ type: "select", table, filters: [...filters] });
        const rows = (state[table] ?? []).filter((r) => matches(r, filters));
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then: (cb: (result: { data: MockRow[]; error: null }) => unknown) => {
        ops.push({ type: "select", table, filters: [...filters] });
        const rows = (state[table] ?? []).filter((r) => matches(r, filters));
        return Promise.resolve(cb({ data: rows, error: null }));
      },
    };

    return chain;
  }

  return {
    client: {
      from: (table: string) => ({
        select: () => query(table).select(),
        upsert: (payload: unknown, _options?: unknown) => {
          ops.push({ type: "upsert", table, payload });
          return Promise.resolve({ error: null });
        },
        update: (payload: unknown) => ({
          eq: (column: string, value: unknown) => {
            const filters = [{ column, value }];
            return {
              eq: (column2: string, value2: unknown) => {
                filters.push({ column: column2, value: value2 });
                ops.push({ type: "update", table, payload, filters });
                return Promise.resolve({ error: null });
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient,
    operations: ops,
  };
}

function createContext(
  mock: ReturnType<typeof createMockSupabase>,
  overrides: Partial<WebhookContext> = {},
): WebhookContext {
  return {
    supabase: mock.client,
    priceMapping: { price_1: ["overlays"], price_2: ["engineer"] },
    stripeSecretKey: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

Deno.test("handleSubscriptionUpdated creates active entitlement", async () => {
  const mock = createMockSupabase({
    stripe_customers: [{
      user_id: "u1",
      stripe_customer_id: "cus_1",
    }],
  });
  const ctx = createContext(mock);
  const now = Math.floor(Date.now() / 1000);

  await handleSubscriptionUpdated(ctx, {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    current_period_end: now + 86400,
    current_period_start: now,
    cancel_at_period_end: false,
    items: { data: [{ price: "price_1" }] },
  } as unknown as Stripe.Subscription);

  const upserts = mock.operations.filter((op) =>
    op.type === "upsert" && op.table === "user_entitlements"
  );
  assertEquals(upserts.length, 1);
  assertEquals((upserts[0].payload as MockRow).user_id, "u1");
  assertEquals((upserts[0].payload as MockRow).product_key, "overlays");
  assertEquals((upserts[0].payload as MockRow).status, "active");
  assertEquals((upserts[0].payload as MockRow).updated_at !== undefined, true);
});

Deno.test("handleSubscriptionUpdated maps past_due to grace", async () => {
  const mock = createMockSupabase({
    stripe_customers: [{
      user_id: "u1",
      stripe_customer_id: "cus_1",
    }],
  });
  const ctx = createContext(mock);
  const now = Math.floor(Date.now() / 1000);

  await handleSubscriptionUpdated(ctx, {
    id: "sub_1",
    customer: "cus_1",
    status: "past_due",
    current_period_end: now + 86400,
    current_period_start: now,
    cancel_at_period_end: false,
    items: { data: [{ price: "price_1" }] },
  } as unknown as Stripe.Subscription);

  const upserts = mock.operations.filter((op) =>
    op.type === "upsert" && op.table === "user_entitlements"
  );
  assertEquals((upserts[0].payload as MockRow).status, "grace");
});

Deno.test("handleSubscriptionUpdated revokes removed entitlements", async () => {
  const mock = createMockSupabase({
    stripe_customers: [{
      user_id: "u1",
      stripe_customer_id: "cus_1",
    }],
    user_entitlements: [
      {
        user_id: "u1",
        product_key: "overlays",
        status: "active",
        metadata: { subscription_id: "sub_1" },
      },
      {
        user_id: "u1",
        product_key: "engineer",
        status: "active",
        metadata: { subscription_id: "sub_1" },
      },
    ],
  });
  const ctx = createContext(mock);
  const now = Math.floor(Date.now() / 1000);

  // Downgrade from founder (overlays+engineer) to overlays only.
  await handleSubscriptionUpdated(ctx, {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    current_period_end: now + 86400,
    current_period_start: now,
    cancel_at_period_end: false,
    items: { data: [{ price: "price_1" }] },
  } as unknown as Stripe.Subscription);

  const updates = mock.operations.filter((op) =>
    op.type === "update" && op.table === "user_entitlements"
  );
  assertEquals(updates.length, 1);
  assertEquals((updates[0].payload as MockRow).status, "expired");
  const filters = updates[0].filters ?? [];
  const productKeyFilter = filters.find((f) => f.column === "product_key");
  assertEquals(productKeyFilter?.value, "engineer");
});

Deno.test("handleSubscriptionUpdated throws when customer not linked", async () => {
  const mock = createMockSupabase();
  const ctx = createContext(mock);
  const now = Math.floor(Date.now() / 1000);

  await assertRejects(() =>
    handleSubscriptionUpdated(ctx, {
      id: "sub_1",
      customer: "cus_unknown",
      status: "active",
      current_period_end: now + 86400,
      current_period_start: now,
      cancel_at_period_end: false,
      items: { data: [{ price: "price_1" }] },
    } as unknown as Stripe.Subscription)
  );
});

Deno.test("handleSubscriptionDeleted marks entitlements expired", async () => {
  const mock = createMockSupabase({
    stripe_customers: [{
      user_id: "u1",
      stripe_customer_id: "cus_1",
    }],
    user_entitlements: [
      {
        user_id: "u1",
        product_key: "overlays",
        status: "active",
        metadata: { subscription_id: "sub_1" },
      },
    ],
  });
  const ctx = createContext(mock);
  const now = Math.floor(Date.now() / 1000);

  await handleSubscriptionDeleted(ctx, {
    id: "sub_1",
    customer: "cus_1",
    status: "canceled",
    current_period_end: now + 86400,
    current_period_start: now,
    cancel_at_period_end: false,
    items: { data: [{ price: "price_1" }] },
  } as unknown as Stripe.Subscription);

  const updates = mock.operations.filter((op) =>
    op.type === "update" && op.table === "user_entitlements"
  );
  assertEquals(updates.length, 1);
  assertEquals((updates[0].payload as MockRow).status, "expired");
});

Deno.test("handleInvoicePaymentFailed marks active entitlements as grace", async () => {
  const mock = createMockSupabase({
    stripe_customers: [{
      user_id: "u1",
      stripe_customer_id: "cus_1",
    }],
    user_entitlements: [
      {
        user_id: "u1",
        product_key: "overlays",
        status: "active",
        metadata: { subscription_id: "sub_1" },
      },
      {
        user_id: "u1",
        product_key: "engineer",
        status: "active",
        metadata: { subscription_id: "sub_1" },
      },
      {
        user_id: "u1",
        product_key: "ac_lua_pack",
        status: "active",
        metadata: { stripe_session_id: "ses_1" },
      },
    ],
  });
  const ctx = createContext(mock);

  await handleInvoicePaymentFailed(ctx, {
    id: "inv_1",
    customer: "cus_1",
    subscription: "sub_1",
  } as unknown as Stripe.Invoice);

  const updates = mock.operations.filter((op) =>
    op.type === "update" && op.table === "user_entitlements"
  );
  assertEquals(updates.length, 2);
  for (const upd of updates) {
    assertEquals((upd.payload as MockRow).status, "grace");
  }
});

Deno.test("handleCheckoutSessionCompleted for one-time requires STRIPE_SECRET_KEY", async () => {
  const mock = createMockSupabase();
  const ctx = createContext(mock);

  await assertRejects(
    () =>
      handleCheckoutSessionCompleted(ctx, {
        id: "ses_1",
        mode: "payment",
        client_reference_id: "u1",
        customer: "cus_1",
        metadata: { price_id: "price_1" },
      } as unknown as Stripe.Checkout.Session),
    Error,
    "STRIPE_SECRET_KEY is required",
  );
});

Deno.test("handleCheckoutSessionCompleted for subscription without secret logs and returns", async () => {
  const mock = createMockSupabase();
  const ctx = createContext(mock);

  await handleCheckoutSessionCompleted(ctx, {
    id: "ses_1",
    mode: "subscription",
    client_reference_id: "u1",
    customer: "cus_1",
    subscription: "sub_1",
  } as unknown as Stripe.Checkout.Session);

  const upserts = mock.operations.filter((op) =>
    op.type === "upsert" && op.table === "user_entitlements"
  );
  assertEquals(upserts.length, 0);
});
