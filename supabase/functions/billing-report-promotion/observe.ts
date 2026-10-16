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

export class PromotionCheckoutError extends Error {
  constructor(public code: string, message: string, public status = 503) {
    super(message);
    this.name = "PromotionCheckoutError";
  }
}
// SQL is authoritative for the reservation deadline (the attempt may live longer).
function pendingRetryMessage(retryAt: unknown, now: Date): string {
  const retry = typeof retryAt === "string" ? Date.parse(retryAt) : NaN;
  const minutes = Math.ceil((retry - now.getTime()) / 60_000);
  const action = !Number.isFinite(minutes)
    ? "Vuelve a intentarlo más tarde."
    : minutes <= 0
    ? "Vuelve a intentarlo ahora."
    : "Podrás reintentarlo dentro de " + minutes +
      (minutes === 1 ? " minuto." : " minutos.");
  return "El intento anterior sigue en curso. " + action +
    " Tu primer mes se conserva.";
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
  launchOffer?: { discountId: string | null; key: string; catalogVersion?: string },
): Promise<string | null | { checkoutUrl: string }> {
  if (launchOffer ? !launchOffer.discountId : !enabled) return null;
  if (!attemptId) {
    throw new PromotionCheckoutError(
      "promotion_attempt_required",
      "Es necesario iniciar un intento de pago válido.",
      400,
    );
  }
  const args = {
    p_account: account,
    p_environment: environment,
    p_product: product,
    p_now: now.toISOString(),
    ...(attemptId ? { p_attempt: attemptId } : {}),
  };
  const rpc = launchOffer ? "billing_launch_checkout" : "report_promotion_checkout";
  const offerArgs = {
    ...args,
    ...(launchOffer
      ? { p_discount: launchOffer.discountId, p_key: launchOffer.key }
      : {}),
  };
  let { data, error } = await admin().rpc(rpc, offerArgs);
  if (error?.code === "55000" && attemptId) {
    const pending = await admin().rpc("report_promotion_checkout_pending", {
      p_account: account,
      p_environment: environment,
      p_now: now.toISOString(),
    });
    if (pending.error) throw new Error("promotion_checkout_store_unavailable");
    const incident = async (code: string) => {
      const { error } = await admin().rpc("report_promotion_failed", {
        p_account: account,
        p_environment: environment,
        p_code: code,
        p_now: now.toISOString(),
      });
      if (error) throw new Error("promotion_checkout_incident_unavailable");
    };
    if (!pending.data?.checkout_id || !pending.data?.attempt_id) {
      await incident("promotion_checkout_recovery_required");
      throw new PromotionCheckoutError(
        "promotion_checkout_recovery_pending",
        pendingRetryMessage(pending.data?.retry_at, now),
      );
    }
    const previous = pending.data;
    let remote: Awaited<ReturnType<typeof readPolarCheckoutSession>>;
    try {
      remote = await readCheckout(
        previous.checkout_id,
        environment as "sandbox" | "production",
      );
    } catch {
      await incident("promotion_checkout_recovery_required");
      throw new PromotionCheckoutError(
        "promotion_checkout_recovery_required",
        "No se ha podido comprobar el pago anterior. Vuelve a intentarlo; tu primer mes sigue reservado.",
      );
    }
    if (
      remote.accountId !== account || remote.productId !== previous.product_id
    ) {
      await incident("promotion_checkout_owner_mismatch");
      throw new Error("promotion_checkout_owner_mismatch");
    }
    if (remote.status === "open") {
      if (remote.productId === product && (!launchOffer?.catalogVersion || previous.catalog_version === launchOffer.catalogVersion)) return { checkoutUrl: remote.url };
      await incident("promotion_checkout_plan_change_pending");
      throw new PromotionCheckoutError(
        "promotion_checkout_plan_change_pending",
        "Hay un pago abierto para otro plan u oferta. Espera a que caduque antes de cambiar; tu primer mes se conserva.",
        409,
      );
    }
    if (!["expired", "failed"].includes(remote.status)) {
      await incident("promotion_checkout_recovery_required");
      throw new PromotionCheckoutError(
        "promotion_checkout_payment_pending",
        "El pago anterior se está confirmando. Espera su resultado antes de iniciar otro; tu primer mes sigue reservado.",
      );
    }
    ({ data, error } = await admin().rpc(rpc, {
      ...offerArgs,
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
  configured = true, // Accounting survives false or missing activation flag.
  source: "webhook" | "reconciliation" = "webhook",
): Promise<void> {
  if (
    !configured ||
    !([
      "subscription_cycle",
      "subscription_cycle_after_trial",
      "subscription_create",
    ].includes(
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
    typeof item.end_timestamp !== "string" ||
    !Number.isFinite(Date.parse(data.created_at)) ||
    !Number.isFinite(Date.parse(item.start_timestamp)) ||
    !Number.isFinite(Date.parse(item.end_timestamp)) ||
    Date.parse(item.end_timestamp) <= Date.parse(item.start_timestamp)
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
