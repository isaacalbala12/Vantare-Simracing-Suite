import Stripe from "stripe";

function getStripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is required");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

interface PortalRequest {
  stripeCustomerId: string;
  returnUrl?: string;
}

export async function handleCreatePortalSession(
  _ctx: unknown,
  request: Request,
): Promise<Response> {
  const body: PortalRequest = await request.json();
  if (!body.stripeCustomerId) {
    return new Response(JSON.stringify({ error: "stripeCustomerId required" }), { status: 400 });
  }
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: body.stripeCustomerId,
    return_url: body.returnUrl ?? "http://127.0.0.1:39261/checkout/callback",
  });
  if (!session.url) {
    return new Response(JSON.stringify({ error: "No portal URL returned" }), { status: 500 });
  }
  return new Response(JSON.stringify({ url: session.url }), { status: 200 });
}
