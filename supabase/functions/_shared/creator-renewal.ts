import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { CheckoutKey, PolarProductMap } from "./mapping.ts";
import table from "../scripts/polar-launch-prices.json" with { type: "json" };
import { synchronizeRenewalDiscount } from "./polar.ts";

export async function applyCreatorRenewal(
  client: SupabaseClient,
  map: PolarProductMap,
  input: {
    userId: string;
    checkoutId: string | null;
    subscriptionId: string | null;
    orderId: string;
    productId: string;
    key: CheckoutKey;
    initial: boolean;
  },
  synchronize: typeof synchronizeRenewalDiscount = synchronizeRenewalDiscount,
): Promise<void> {
  const plan = table.plans.find((p) => p.key === input.key);
  if (!plan || !input.subscriptionId) return;
  const entry = map.checkout_keys[input.key];
  const launchDiscount = entry && "polar_launch_discount_id" in entry &&
      typeof entry.polar_launch_discount_id === "string"
    ? entry.polar_launch_discount_id
    : null;
  // No attribution can be created from editable webhook metadata or a renewal.
  const { data: operation, error } = await client.rpc(
    "billing_creator_renewal_prepare",
    {
      p_environment: map.environment,
      p_user: input.userId,
      p_checkout: input.initial ? input.checkoutId : null,
      p_subscription: input.subscriptionId,
      p_order: input.orderId,
      p_product: input.productId,
      p_key: input.key,
      p_initial_discount: launchDiscount,
      p_creator_savings: Math.round(
        plan.normal_cents * table.creator_discount_basis_points / 10000,
      ),
    },
  );
  if (error) throw new Error("creator_renewal_prepare_failed");
  if (!operation) return;
  if (operation.busy) throw new Error("creator_renewal_busy");
  const params = {
    p_environment: map.environment,
    p_subscription: input.subscriptionId,
    p_token: operation.token,
  };
  try {
    await synchronize(input.subscriptionId, map.environment, {
      productId: input.productId,
      discountId: operation.discount_id,
      managedIds: [
        null,
        operation.initial_discount_id,
        operation.creator_discount_id,
        operation.report_discount_id,
        ...(operation.managed_report_ids ?? []),
      ],
      normalCents: plan.normal_cents,
      interval: plan.interval,
      authorize: async () => {
        const result = await client.rpc(
          "billing_creator_renewal_authorized",
          params,
        );
        if (result.error) throw new Error("creator_authorization_failed");
        return result.data === true;
      },
    });
    const ack = await client.rpc("billing_creator_renewal_finish", {
      ...params,
      p_success: true,
    });
    if (ack.error || ack.data !== true) {
      throw new Error("creator_renewal_ack_failed");
    }
  } catch (error) {
    const failed = await client.rpc("billing_creator_renewal_finish", {
      ...params,
      p_success: false,
    });
    if (failed.error || failed.data !== true) {
      throw new Error("creator_renewal_incident_failed");
    }
    throw error;
  }
}
