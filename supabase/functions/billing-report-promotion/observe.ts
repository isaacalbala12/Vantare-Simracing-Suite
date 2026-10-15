import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// Product allowlisting and durable ownership are checked again in SQL. The
// campaign stays inert until its catalogue and explicit feature flag are set.
export async function observeReportPromotion(
  admin: SupabaseClient,
  input: {
    account: string;
    environment: string;
    subscription: string;
    product: string;
    data: Record<string, unknown>;
  },
  enabled = Deno.env.get("REPORT_PROMOTION_ENABLED") === "true",
): Promise<void> {
  if (!enabled) return;
  const started = input.data.started_at ?? input.data.created_at;
  const modified = input.data.modified_at ?? input.data.updated_at ??
    input.data.created_at;
  if (
    typeof started !== "string" || !Number.isFinite(Date.parse(started)) ||
    typeof modified !== "string" || !Number.isFinite(Date.parse(modified))
  ) return;
  const { error } = await admin.rpc("report_promotion_observe", {
    p_account: input.account,
    p_environment: input.environment,
    p_subscription: input.subscription,
    p_product: input.product,
    p_started: started,
    p_modified: modified,
    p_discount: typeof input.data.discount_id === "string"
      ? input.data.discount_id
      : null,
  });
  if (error) throw new Error("report_promotion_observation_failed");
}

export async function promotionCheckoutDiscount(
  admin: () => SupabaseClient,
  account: string,
  environment: string,
  product: string,
  now = new Date(),
  enabled = Deno.env.get("REPORT_PROMOTION_ENABLED") === "true",
): Promise<string | null> {
  if (!enabled) return null;
  const { data, error } = await admin().rpc("report_promotion_checkout", {
    p_account: account,
    p_environment: environment,
    p_product: product,
    p_now: now.toISOString(),
  });
  if (error || !(data === null || typeof data === "string")) {
    throw new Error("report_promotion_checkout_unavailable");
  }
  return data;
}
