import { stopSubscriptionRenewal } from "./polar.ts";
import { getSupabaseAdmin } from "./supabase-admin.ts";
import type { BillingEnvironment, CheckoutKey } from "./mapping.ts";

// Sale configuration lives only in private.founders_sale_config. Never trust a client clock.
export type PurchasePolicy = { reason: string | null };
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
    error || !data ||
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

// Definitive policy: stop renewal, keep the paid period, never issue a refund.
export async function transitionFoundersSubscriptions(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  environment: BillingEnvironment,
  orderId: string,
  stopRenewal = stopSubscriptionRenewal,
): Promise<void> {
  const { data, error } = await supabase.rpc(
    "billing_founders_subscription_transitions",
    {
      p_environment: environment,
      p_order_id: orderId,
    },
  );
  if (error || !Array.isArray(data)) {
    throw new Error("founders_transition_unavailable");
  }
  for (const item of data) {
    if (
      typeof item.subscription_id !== "string" || item.policy !== "end_period"
    ) {
      throw new Error("founders_transition_invalid");
    }
    await stopRenewal(item.subscription_id, environment);
    const receipt = await supabase.rpc("billing_complete_founders_transition", {
      p_environment: environment,
      p_subscription_id: item.subscription_id,
    });
    if (receipt.error) throw new Error("founders_transition_receipt_failed");
  }
}
