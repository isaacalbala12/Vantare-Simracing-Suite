import { MemoryOrderRefundLedger } from "./order-refund-ledger.ts";
import {
  applyPolarWebhookEvent,
  minimizePolarWebhookEvent,
} from "./process.ts";
import { assert } from "../native-account-authorize/testdata/auth.ts";
import { loadPolarProductMap } from "../_shared/mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
Deno.test("subscription order becomes an attributable admin receipt through the signed-webhook processor", async () => {
  const rows: unknown[] = [];
  const supabase = {
    rpc: (name: string, args: unknown) => {
      assert(name === "native_admin_record_payment");
      rows.push(args);
      return Promise.resolve({ error: null });
    },
  } as unknown as SupabaseClient;
  const mapping = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "sandbox",
  });
  assert(mapping.ok);
  const event = minimizePolarWebhookEvent({
    type: "order.paid",
    data: {
      id: "order-test",
      external_customer_id: "00000000-0000-4000-8000-000000001628",
      product_id: "00000000-0000-0000-0000-000000000003",
      subscription_id: "sub-test",
      paid: true,
      applied_balance_amount: 0,
      status: "paid",
      created_at: "2026-09-01T00:00:00Z",
      modified_at: "2026-09-01T00:00:00Z",
      total_amount: 319,
      net_amount: 264,
      tax_amount: 55,
      currency: "eur",
      refunded_amount: 0,
      refunded_tax_amount: 0,
      discount_id: "discount-test",
    },
  });
  const result = await applyPolarWebhookEvent(event, {
    supabase,
    resolveIdentity: () =>
      Promise.resolve("00000000-0000-4000-8000-000000001628"),
    orderRefundLedger: new MemoryOrderRefundLedger(),
    loadMap: () => mapping,
  });
  assert(result.status === "processed" && rows.length === 1);
  const payment = (rows[0] as { p_payment: Record<string, unknown> }).p_payment;
  assert(
    payment.amount_cents === 319 && payment.discount_id === "discount-test" &&
      payment.paid_at === "2026-09-01T00:00:00Z",
  );
});

async function subscriptionLedger() {
  const ledger = new MemoryOrderRefundLedger();
  await ledger.recordOrder({
    environment: "sandbox",
    orderId: "order-test",
    userId: "00000000-0000-4000-8000-000000001628",
    productId: "00000000-0000-0000-0000-000000000003",
    checkoutId: null,
    subscriptionId: "sub-test",
    status: "paid",
    paid: true,
    netAmount: 264,
    currency: "eur",
    reportedRefundedAmount: 0,
    modifiedAt: "2026-09-01T00:00:00Z",
    snapshotHash: "a".repeat(64),
  });
  return ledger;
}
Deno.test("subscription refunds update management AND the common commercial restriction", async () => {
  let persisted = false;
  const ledger = await subscriptionLedger();
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "billing_creator_revocation") return Promise.resolve({ data: null, error: null });
      assert(name === "native_admin_record_refund");
      persisted = true;
      assert((args.p_refund as Record<string, unknown>).amount_cents === 159);
      return Promise.resolve({ data: true, error: null });
    },
  } as unknown as SupabaseClient;
  const mapping = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "sandbox",
  });
  assert(mapping.ok);
  const result = await applyPolarWebhookEvent(
    minimizePolarWebhookEvent({
      type: "refund.updated",
      data: {
        id: "refund-test",
        order_id: "order-test",
        amount: 159,
        tax_amount: 0,
        currency: "eur",
        status: "pending",
        modified_at: "2026-09-02T00:00:00Z",
      },
    }),
    {
      supabase,
      loadMap: () => mapping,
      orderRefundLedger: ledger,
    },
  );
  assert(result.status === "processed" && persisted);
  assert(
    (await ledger.readDecision("sandbox", "order-test"))?.accessState ===
      "revoked",
    "management mirror must not bypass commercial refund restriction",
  );
});

Deno.test("admin commission refunds include VAT paid back to the customer", async () => {
  const mapping = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "sandbox",
  });
  assert(mapping.ok);
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "billing_creator_revocation") return Promise.resolve({ data: null, error: null });
      assert(name === "native_admin_record_refund");
      assert((args.p_refund as Record<string, unknown>).amount_cents === 319);
      return Promise.resolve({ data: true, error: null });
    },
  } as unknown as SupabaseClient;
  const result = await applyPolarWebhookEvent({
    type: "refund.updated",
    data: {
      id: "refund-tax",
      order_id: "order-test",
      amount: 264,
      tax_amount: 55,
      currency: "eur",
      status: "succeeded",
      modified_at: "2026-09-03T00:00:00Z",
    },
  }, {
    supabase,
    loadMap: () => mapping,
    orderRefundLedger: await subscriptionLedger(),
  });
  assert(result.status === "processed");
});

Deno.test("merged paid subscription projects both the promotion invoice and the owner payment", async () => {
  const calls = new Map<string, Record<string, unknown>>();
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      assert(
        ["report_promotion_invoice", "native_admin_record_payment"].includes(
          name,
        ),
      );
      calls.set(name, args);
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;
  const mapping = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "sandbox",
  });
  assert(mapping.ok);
  const event = minimizePolarWebhookEvent({
    type: "order.paid",
    data: {
      id: "combined-order",
      external_customer_id: "00000000-0000-4000-8000-000000001628",
      product_id: "00000000-0000-0000-0000-000000000003",
      subscription_id: "combined-sub",
      paid: true,
      status: "paid",
      billing_reason: "subscription_cycle",
      created_at: "2026-11-26T18:00:00Z",
      modified_at: "2026-11-26T18:00:00Z",
      applied_balance_amount: 0,
      total_amount: 399,
      net_amount: 330,
      tax_amount: 69,
      currency: "eur",
      refunded_amount: 0,
      refunded_tax_amount: 0,
      discount_id: "pro3",
      discount_amount: 200,
      items: [{
        proration: false,
        start_timestamp: "2026-11-26T18:00:00Z",
        end_timestamp: "2026-12-26T18:00:00Z",
      }],
    },
  });
  const result = await applyPolarWebhookEvent(event, {
    supabase,
    loadMap: () => mapping,
    orderRefundLedger: new MemoryOrderRefundLedger(),
    resolveIdentity: () =>
      Promise.resolve("00000000-0000-4000-8000-000000001628"),
  });
  assert(result.status === "processed");
  assert(calls.size === 2);
  assert(calls.get("report_promotion_invoice")?.p_order === "combined-order");
  assert(
    calls.get("report_promotion_invoice")?.p_start === "2026-11-26T18:00:00Z",
  );
  const payment = calls.get("native_admin_record_payment")?.p_payment as Record<
    string,
    unknown
  >;
  assert(
    payment.payment_id === "combined-order" && payment.amount_cents === 399 &&
      payment.discount_id === "pro3",
  );
});
