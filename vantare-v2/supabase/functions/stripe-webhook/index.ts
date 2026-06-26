import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import type Stripe from "stripe";
import { supabaseAdmin } from "./_utils/supabase.ts";
import { verifyStripeSignature } from "./_utils/stripe.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
    });
  }

  const signature = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = verifyStripeSignature(payload, signature);
  } catch (err) {
    console.error("stripe signature verification failed:", err);
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log("unhandled stripe event type:", event.type);
    }
  } catch (err) {
    console.error("webhook handler error:", err);
    return new Response(JSON.stringify({ error: "handler failed" }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});

// The full entitlement/discord-role mapping is intentionally a follow-up to
// keep the Edge Function deployable early. Each handler currently logs the
// event id so we can verify Stripe -> Supabase connectivity end-to-end before
// wiring the price_id -> product_key mapping.

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log("checkout completed", session.id);
  // TODO Mini-Plan B follow-up: resolve price_id -> product_key[], upsert
  // stripe_customers and user_entitlements, emit discord role sync job.
  void supabaseAdmin;
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  console.log("subscription updated", sub.id);
  // TODO Mini-Plan B follow-up: upsert stripe_subscriptions and refresh
  // user_entitlements status / current_period_end.
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  console.log("subscription deleted", sub.id);
  // TODO Mini-Plan B follow-up: mark user_entitlements as expired at period end.
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log("invoice payment failed", invoice.id);
  // TODO Mini-Plan B follow-up: mark user_entitlements as past_due so the
  // desktop app can show the grace banner.
}
