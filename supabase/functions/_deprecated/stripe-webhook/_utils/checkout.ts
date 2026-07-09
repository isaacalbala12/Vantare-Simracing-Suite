import Stripe from "stripe";

function getStripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is required");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

interface CheckoutRequest {
  priceKey: string;
  userId: string;
  email?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export async function handleCreateCheckoutSession(
  _ctx: unknown,
  request: Request,
): Promise<Response> {
  const body: CheckoutRequest = await request.json();
  const mapping = loadPriceMapping();

  // Buscar price_id(s) para el product_key solicitado
  const priceIds: string[] = [];
  for (const [priceId, keys] of Object.entries(mapping)) {
    if (keys.includes(body.priceKey) || (body.priceKey === "suite" && keys.includes("overlays") && keys.includes("engineer"))) {
      if (body.priceKey === "suite" && keys.length >= 2 && keys.includes("overlays") && keys.includes("engineer")) {
        priceIds.push(priceId);
        break;
      }
      if (body.priceKey !== "suite" && keys.includes(body.priceKey)) {
        priceIds.push(priceId);
        break;
      }
    }
  }

  if (priceIds.length === 0) {
    return new Response(JSON.stringify({ error: `No price found for key: ${body.priceKey}` }), { status: 400 });
  }

  const successUrl = body.successUrl ?? "http://127.0.0.1:39261/checkout/callback";
  const cancelUrl = body.cancelUrl ?? "http://127.0.0.1:39261/checkout/callback";

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: priceIds[0], quantity: 1 }],
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: body.userId,
    customer_email: body.email,
  });

  if (!session.url) {
    return new Response(JSON.stringify({ error: "No checkout URL returned" }), { status: 500 });
  }

  // Devuelve JSON { url }, NO un redirect. El frontend lee res.json()
  // y abre Browser.OpenURL(data.url).
  return new Response(JSON.stringify({ url: session.url }), { status: 200 });
}

function loadPriceMapping(): Record<string, string[]> {
  const raw = Deno.env.get("PRICE_ID_TO_PRODUCT_KEYS");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}
