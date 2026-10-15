import { getSupabaseAdmin } from "./supabase-admin.ts";
import type { BillingEnvironment, CheckoutKey } from "./mapping.ts";

// Dates live only in private.founders_sale_config. Never trust a client clock.
export type PurchasePolicy = { reason: string | null; closes_at: string };
export async function purchasePolicy(
  userId: string,
  environment: BillingEnvironment,
  productKey: CheckoutKey,
): Promise<PurchasePolicy> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "billing_purchase_policy",
    {
      p_user_id: userId,
      p_environment: environment,
      p_checkout_key: productKey,
    },
  );
  if (
    error || !data || typeof data.closes_at !== "string" ||
    !(data.reason === null || typeof data.reason === "string")
  ) {
    throw new Error("purchase_policy_unavailable");
  }
  return data as PurchasePolicy;
}

export async function foundersPaymentAllowed(paidAt: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "billing_founders_payment_allowed",
    {
      p_paid_at: paidAt,
    },
  );
  if (error || typeof data !== "boolean") {
    throw new Error("founders_policy_unavailable");
  }
  return data;
}
