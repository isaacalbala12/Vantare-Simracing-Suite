import Stripe from "stripe";

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    // Signature verification does not need a real API key, but the Stripe
    // client requires a non-empty string. STRIPE_SECRET_KEY is also used by
    // the webhook to fetch subscriptions/line items when needed.
    const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "sk_test_dummy";
    stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  }
  return stripe;
}

export function verifyStripeSignature(
  payload: string,
  signature: string,
): Stripe.Event {
  return getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
}
