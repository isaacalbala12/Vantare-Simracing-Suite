import Stripe from "stripe";

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const stripe = new Stripe("", { apiVersion: "2025-02-24.acacia" });

export function verifyStripeSignature(
  payload: string,
  signature: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
