import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { CheckoutKey } from "./mapping.ts";
import { getSupabaseAdmin } from "./supabase-admin.ts";

export type CheckoutAttempt = {
  userId: string;
  attemptId: string;
  checkoutKey: CheckoutKey;
  environment: "sandbox" | "production";
  catalogVersion: string;
};

export type CheckoutClaim =
  | { kind: "claimed" }
  | { kind: "reused"; url: string }
  | { kind: "busy" }
  | { kind: "uncertain" }
  | { kind: "expired" }
  | { kind: "conflict" };

export interface CheckoutAttemptStore {
  claim(input: CheckoutAttempt): Promise<CheckoutClaim>;
  complete(
    input: CheckoutAttempt,
    checkoutId: string | null,
    url: string,
  ): Promise<void>;
  markUncertain(input: CheckoutAttempt): Promise<void>;
}

type RpcClient = Pick<SupabaseClient, "rpc">;

function singleRpcRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function createCheckoutAttemptStore(
  client: RpcClient = getSupabaseAdmin(),
): CheckoutAttemptStore {
  return {
    async claim(input) {
      const { data, error } = await client.rpc(
        "claim_billing_checkout_attempt",
        {
          p_user_id: input.userId,
          p_attempt_id: input.attemptId,
          p_checkout_key: input.checkoutKey,
          p_environment: input.environment,
          p_catalog_version: input.catalogVersion,
        },
      );
      if (error) throw new Error("checkout_attempt_claim_failed");
      const row = singleRpcRow(data);
      switch (row?.outcome) {
        case "claimed":
        case "busy":
        case "uncertain":
        case "expired":
        case "conflict":
          return { kind: row.outcome };
        case "reused":
          if (typeof row.checkout_url === "string" && row.checkout_url) {
            return { kind: "reused", url: row.checkout_url };
          }
      }
      throw new Error("checkout_attempt_claim_invalid_result");
    },

    async complete(input, checkoutId, url) {
      const { data, error } = await client.rpc(
        "complete_billing_checkout_attempt",
        {
          p_user_id: input.userId,
          p_attempt_id: input.attemptId,
          p_provider_checkout_id: checkoutId,
          p_checkout_url: url,
        },
      );
      if (error || data !== true) {
        throw new Error("checkout_attempt_complete_failed");
      }
    },

    async markUncertain(input) {
      const { data, error } = await client.rpc(
        "mark_billing_checkout_attempt_uncertain",
        { p_user_id: input.userId, p_attempt_id: input.attemptId },
      );
      if (error || data !== true) {
        throw new Error("checkout_attempt_uncertain_failed");
      }
    },
  };
}
