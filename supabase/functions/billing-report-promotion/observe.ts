import { readPolarCheckoutSession } from "../_shared/polar.ts";
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
  readCheckout = readPolarCheckoutSession,
): Promise<string | null | { checkoutUrl: string }> {
  if (!enabled) return null;
  const args = {
    p_account: account,
    p_environment: environment,
    p_product: product,
    p_now: now.toISOString(),
    ...(attemptId ? { p_attempt: attemptId } : {}),
  };
  let { data, error } = await admin().rpc("report_promotion_checkout", args);
  if (error?.code === "55000" && attemptId) {
    const pending = await admin().rpc("report_promotion_checkout_pending", {
      p_account: account,
      p_environment: environment,
      p_now: now.toISOString(),
    });
    if (
      pending.error || !pending.data?.checkout_id || !pending.data?.attempt_id
    ) {
      throw new Error("promotion_checkout_pending");
    }
    const previous = pending.data;
    const remote = await readCheckout(
      previous.checkout_id,
      environment as "sandbox" | "production",
    );
    if (
      remote.accountId !== account || remote.productId !== previous.product_id
    ) {
      throw new Error("promotion_checkout_owner_mismatch");
    }
    if (remote.status === "open" && remote.productId === product) {
      return { checkoutUrl: remote.url };
    }
    if (!["expired", "failed"].includes(remote.status)) {
      throw new Error("promotion_checkout_pending");
    }
    ({ data, error } = await admin().rpc("report_promotion_checkout", {
      ...args,
      p_replaces: previous.attempt_id,
    }));
  }
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
  source: "webhook" | "reconciliation" = "webhook",
): Promise<void> {
  if (
    !configured ||
    !(["subscription_cycle", "subscription_create"].includes(
      String(data.billing_reason),
    )) ||
    data.paid !== true || typeof data.id !== "string"
  ) return;
  const missing = async () => {
    const { error } = await admin.rpc("report_promotion_invoice_missing", {
      p_environment: environment,
      p_order: data.id,
    });
    if (error) throw new Error("report_promotion_invoice_gap_failed");
  };
  if (!Array.isArray(data.items)) {
    await missing();
    return;
  }
  const items = data.items.filter((item) =>
    item && typeof item === "object" && item.proration === false
  );
  if (items.length !== 1) {
    await missing();
    return;
  }
  const item = items[0];
  if (
    typeof data.id !== "string" || typeof data.created_at !== "string" ||
    !Number.isInteger(data.discount_amount) ||
    Number(data.discount_amount) < 0 ||
    typeof item.start_timestamp !== "string" ||
    typeof item.end_timestamp !== "string"
  ) {
    await missing();
    return;
  }
  const { error } = await admin.rpc("report_promotion_invoice", {
    p_environment: environment,
    p_order: data.id,
    p_discount: typeof data.discount_id === "string" ? data.discount_id : null,
    p_amount: data.discount_amount,
    p_billed: data.created_at,
    p_start: item.start_timestamp,
    p_end: item.end_timestamp,
    ...(source === "reconciliation" ? { p_source: source } : {}),
    ...(data.billing_reason === "subscription_create"
      ? { p_initial: true }
      : {}),
  });
  if (error) throw new Error("report_promotion_invoice_failed");
}
