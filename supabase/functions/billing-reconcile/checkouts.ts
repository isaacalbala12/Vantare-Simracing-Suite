import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { BillingEnvironment } from "../_shared/mapping.ts";
import { isUuid } from "../_shared/request.ts";

// Only API-derived snapshots, never a browser request or webhook metadata alone.
// The RPC requires the matching durable, authenticated server attempt.
export async function recoverCheckout(
  admin: Pick<SupabaseClient, "rpc">,
  environment: BillingEnvironment,
  item: Record<string, unknown>,
): Promise<void> {
  const metadata = item.metadata as Record<string, unknown> | undefined;
  const customer = item.customer as Record<string, unknown> | undefined;
  const account = item.external_customer_id ?? customer?.external_id;
  if (!isUuid(account) || !metadata || metadata.app !== "vantare") return;
  const attemptId = metadata.vantare_attempt_id;
  // Legacy attempts without correlation remain closed; absence is not proof.
  // There are no existing users/payments to migrate in this installation.
  if (!isUuid(attemptId)) return;
  if (
    typeof item.id !== "string" || typeof item.url !== "string" ||
    typeof item.expires_at !== "string" ||
    typeof item.created_at !== "string" ||
    typeof metadata.product_key !== "string" ||
    typeof metadata.catalog_version !== "string"
  ) throw new Error("invalid_checkout_snapshot");
  const url = new URL(item.url);
  if (
    url.protocol !== "https:" || url.username || url.password ||
    url.hostname !==
      (environment === "sandbox" ? "sandbox.polar.sh" : "polar.sh")
  ) throw new Error("invalid_checkout_snapshot");
  const { error } = await admin.rpc("recover_billing_checkout_attempt", {
    p_user_id: account,
    p_attempt_id: attemptId,
    p_environment: environment,
    p_checkout_key: metadata.product_key,
    p_catalog_version: metadata.catalog_version,
    p_checkout_id: item.id,
    p_checkout_url: url.toString(),
    p_created_at: item.created_at,
    p_expires_at: item.expires_at,
  });
  if (error) throw new Error("checkout_recovery_unavailable");
}
