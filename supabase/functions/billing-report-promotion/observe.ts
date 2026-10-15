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
  attemptId?: string,
): Promise<string | null> {
  if (!enabled) return null;
  const { data, error } = await admin().rpc("report_promotion_checkout", {
    p_account: account,
    p_environment: environment,
    p_product: product,
    p_now: now.toISOString(),
    ...(attemptId ? { p_attempt: attemptId } : {}),
  });
  if (error || !(data === null || typeof data === "string")) {
    throw new Error("report_promotion_checkout_unavailable");
  }
  return data;
}

export async function observePromotionInvoice(
  admin: SupabaseClient,
  environment: string,
  data: Record<string, unknown>,
  configured = Deno.env.get("REPORT_PROMOTION_ENABLED") !== undefined,
): Promise<void> {
  if (
    !configured ||
    !(["subscription_cycle", "subscription_create"].includes(
      String(data.billing_reason),
    )) ||
    data.paid !== true || !Array.isArray(data.items)
  ) return;
  const items = data.items.filter((item) =>
    item && typeof item === "object" && item.proration === false
  );
  if (items.length !== 1) return;
  const item = items[0];
  if (
    typeof data.id !== "string" || typeof data.created_at !== "string" ||
    !Number.isInteger(data.discount_amount) ||
    Number(data.discount_amount) < 0 ||
    typeof item.start_timestamp !== "string" ||
    typeof item.end_timestamp !== "string"
  ) return;
  const { error } = await admin.rpc("report_promotion_invoice", {
    p_environment: environment,
    p_order: data.id,
    p_discount: typeof data.discount_id === "string" ? data.discount_id : null,
    p_amount: data.discount_amount,
    p_billed: data.created_at,
    p_start: item.start_timestamp,
    p_end: item.end_timestamp,
    ...(data.billing_reason === "subscription_create"
      ? { p_initial: true }
      : {}),
  });
  if (error) throw new Error("report_promotion_invoice_failed");
}
