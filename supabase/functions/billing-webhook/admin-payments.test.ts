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
    loadMap: () => mapping,
  });
  assert(result.status === "processed" && rows.length === 1);
  const payment = (rows[0] as { p_payment: Record<string, unknown> }).p_payment;
  assert(
    payment.amount_cents === 319 && payment.discount_id === "discount-test" &&
      payment.paid_at === "2026-09-01T00:00:00Z",
  );
});

Deno.test("subscription refund events update the admin projection without revoking subscription grants", async () => {
  let persisted = false;
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
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
    { supabase, loadMap: () => mapping },
  );
  assert(result.status === "processed" && persisted);
});

Deno.test("admin commission refunds include VAT paid back to the customer", async () => {
  const mapping = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "sandbox",
  });
  assert(mapping.ok);
  const supabase = {
    rpc: (_name: string, args: Record<string, unknown>) => {
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
  }, { supabase, loadMap: () => mapping });
  assert(result.status === "processed");
});
