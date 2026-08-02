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

export function createCheckoutAttemptStore(): CheckoutAttemptStore {
  const client = getSupabaseAdmin();
  return {
    async claim(input) {
      const { error } = await client.from("billing_checkout_attempts").insert({
        user_id: input.userId,
        attempt_id: input.attemptId,
        checkout_key: input.checkoutKey,
        environment: input.environment,
        catalog_version: input.catalogVersion,
        status: "creating",
      });
      if (!error) return { kind: "claimed" };
      if (error.code !== "23505") {
        throw new Error("checkout_attempt_claim_failed");
      }

      const { data, error: lookupError } = await client
        .from("billing_checkout_attempts")
        .select(
          "checkout_key, environment, catalog_version, status, checkout_url",
        )
        .eq("user_id", input.userId)
        .eq("attempt_id", input.attemptId)
        .maybeSingle();
      if (lookupError || !data) {
        throw new Error("checkout_attempt_lookup_failed");
      }
      if (
        data.checkout_key !== input.checkoutKey ||
        data.environment !== input.environment ||
        data.catalog_version !== input.catalogVersion
      ) {
        return { kind: "conflict" };
      }
      if (
        data.status === "open" && typeof data.checkout_url === "string" &&
        data.checkout_url
      ) {
        return { kind: "reused", url: data.checkout_url };
      }
      if (data.status === "uncertain") return { kind: "uncertain" };
      return { kind: "busy" };
    },

    async complete(input, checkoutId, url) {
      const { error } = await client.from("billing_checkout_attempts").update({
        status: "open",
        provider_checkout_id: checkoutId,
        checkout_url: url,
        updated_at: new Date().toISOString(),
      }).eq("user_id", input.userId).eq("attempt_id", input.attemptId).eq(
        "status",
        "creating",
      );
      if (error) throw new Error("checkout_attempt_complete_failed");
    },

    async markUncertain(input) {
      const { error } = await client.from("billing_checkout_attempts").update({
        status: "uncertain",
        updated_at: new Date().toISOString(),
      }).eq("user_id", input.userId).eq("attempt_id", input.attemptId).eq(
        "status",
        "creating",
      );
      if (error) throw new Error("checkout_attempt_uncertain_failed");
    },
  };
}
