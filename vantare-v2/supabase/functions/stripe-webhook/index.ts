import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import type Stripe from "stripe";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getSupabaseAdmin } from "./_utils/supabase.ts";
import { verifyStripeSignature } from "./_utils/stripe.ts";
import { handleCreateCheckoutSession } from "./_utils/checkout.ts";
import { handleCreatePortalSession } from "./_utils/portal.ts";

/**
 * Webhook runtime context. Handlers receive this object instead of importing
 * `supabaseAdmin` directly so tests can inject an in-memory client.
 */
export interface WebhookContext {
  supabase: SupabaseClient;
  priceMapping: Record<string, string[]>;
  stripeSecretKey: string | null;
}

function createContext(): WebhookContext {
  return {
    supabase: getSupabaseAdmin(),
    priceMapping: loadPriceMapping(),
    stripeSecretKey: Deno.env.get("STRIPE_SECRET_KEY") ?? null,
  };
}

function loadPriceMapping(): Record<string, string[]> {
  const raw = Deno.env.get("PRICE_ID_TO_PRODUCT_KEYS") ?? "{}";
  try {
    return JSON.parse(raw) as Record<string, string[]>;
  } catch (err) {
    console.error("failed to parse PRICE_ID_TO_PRODUCT_KEYS", err);
    return {};
  }
}

export function productKeysForPriceIds(
  priceIds: string[],
  mapping: Record<string, string[]>,
): string[] {
  const keys = new Set<string>();
  for (const priceId of priceIds) {
    for (const key of mapping[priceId] ?? []) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

function timestampToISO(ts: number | undefined): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function resolveCheckoutUserId(session: Stripe.Checkout.Session): string | null {
  const fromRef = session.client_reference_id;
  if (fromRef) return fromRef;
  const fromMeta = session.metadata?.user_id;
  if (fromMeta) return fromMeta;
  return null;
}

async function resolveUserIdByStripeCustomer(
  supabase: SupabaseClient,
  stripeCustomerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (error) throw error;
  return (data?.user_id as string) ?? null;
}

async function upsertStripeCustomer(
  supabase: SupabaseClient,
  userId: string,
  stripeCustomerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("stripe_customers")
    .upsert(
      { user_id: userId, stripe_customer_id: stripeCustomerId },
      { onConflict: "stripe_customer_id" },
    );
  if (error) throw error;
}

async function upsertStripeSubscription(
  supabase: SupabaseClient,
  userId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const firstItem = sub.items.data[0];
  const primaryPriceId = stripeId(firstItem?.price) ?? "";

  const { error } = await supabase
    .from("stripe_subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: sub.id,
        stripe_price_id: primaryPriceId,
        status: sub.status,
        current_period_start: timestampToISO(sub.current_period_start),
        current_period_end: timestampToISO(sub.current_period_end),
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );
  if (error) throw error;
}

interface EntitlementStatus {
  status: string;
  expiresAt: string | null;
}

export function deriveEntitlementStatus(sub: Stripe.Subscription): EntitlementStatus {
  const now = new Date();
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  if (sub.status === "incomplete_expired" || sub.status === "unpaid") {
    return { status: "expired", expiresAt: periodEnd?.toISOString() ?? null };
  }

  if (sub.status === "past_due") {
    return { status: "grace", expiresAt: periodEnd?.toISOString() ?? null };
  }

  if (sub.status === "canceled") {
    if (sub.cancel_at_period_end && periodEnd && periodEnd > now) {
      return { status: "active", expiresAt: periodEnd.toISOString() };
    }
    return { status: "expired", expiresAt: periodEnd?.toISOString() ?? null };
  }

  if (
    (sub.status === "active" || sub.status === "trialing") &&
    periodEnd &&
    periodEnd > now
  ) {
    return { status: "active", expiresAt: periodEnd.toISOString() };
  }

  if (periodEnd && periodEnd > now) {
    return { status: "active", expiresAt: periodEnd.toISOString() };
  }

  return { status: "expired", expiresAt: periodEnd?.toISOString() ?? null };
}

async function syncEntitlements(
  supabase: SupabaseClient,
  userId: string,
  productKeys: string[],
  status: string,
  expiresAt: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  for (const productKey of productKeys) {
    const { error } = await supabase
      .from("user_entitlements")
      .upsert(
        {
          user_id: userId,
          product_key: productKey,
          status,
          expires_at: expiresAt,
          metadata,
          updated_at: now,
        },
        { onConflict: "user_id,product_key" },
      );
    if (error) throw error;
  }
}

async function revokeEntitlementsForSubscription(
  supabase: SupabaseClient,
  userId: string,
  subscriptionId: string,
  exceptProductKeys: string[],
): Promise<void> {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("product_key")
    .eq("user_id", userId)
    .eq("metadata->>subscription_id", subscriptionId);
  if (error) throw error;

  const now = new Date().toISOString();
  for (const row of (data ?? [])) {
    const productKey = (row as { product_key: string }).product_key;
    if (exceptProductKeys.includes(productKey)) continue;

    const { error: updErr } = await supabase
      .from("user_entitlements")
      .update({ status: "expired", expires_at: now, updated_at: now })
      .eq("user_id", userId)
      .eq("product_key", productKey);
    if (updErr) throw updErr;
  }
}

async function fetchStripeSubscription(
  secretKey: string,
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const resp = await fetch(
    `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  if (!resp.ok) {
    throw new Error(`stripe api error ${resp.status}: ${await resp.text()}`);
  }
  return await resp.json() as Stripe.Subscription;
}

async function fetchCheckoutLineItemPriceIds(
  secretKey: string,
  sessionId: string,
): Promise<string[]> {
  const resp = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=100`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  if (!resp.ok) {
    throw new Error(`stripe api error ${resp.status}: ${await resp.text()}`);
  }
  const body = await resp.json() as {
    data: Array<{ price?: { id?: string } | string }>;
  };
  return body.data.map((item) => {
    if (!item.price) return "";
    return typeof item.price === "string" ? item.price : item.price.id ?? "";
  }).filter(Boolean);
}

async function priceIdsFromCheckoutSession(
  ctx: WebhookContext,
  session: Stripe.Checkout.Session,
): Promise<string[]> {
  if (!ctx.stripeSecretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is required to resolve checkout line items",
    );
  }
  return await fetchCheckoutLineItemPriceIds(ctx.stripeSecretKey, session.id);
}

export async function handleCheckoutSessionCompleted(
  ctx: WebhookContext,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = resolveCheckoutUserId(session);
  if (!userId) {
    throw new Error("checkout.session.completed: unable to resolve user_id");
  }

  const customerId = stripeId(session.customer);
  if (customerId) {
    await upsertStripeCustomer(ctx.supabase, userId, customerId);
  }

  if (session.mode === "subscription") {
    const subscriptionId = stripeId(session.subscription);
    if (subscriptionId && ctx.stripeSecretKey) {
      const sub = await fetchStripeSubscription(
        ctx.stripeSecretKey,
        subscriptionId,
      );
      await handleSubscriptionUpdated(ctx, sub);
    } else if (subscriptionId) {
      console.log(
        "checkout.session.completed: subscription event will set entitlements",
        { session_id: session.id },
      );
    }
    await insertLicenseEvent(ctx.supabase, userId, "checkout_complete", {
      session_id: session.id,
      mode: "subscription",
      subscription_id: subscriptionId,
    });
    return;
  }

  const priceIds = await priceIdsFromCheckoutSession(ctx, session);
  const productKeys = productKeysForPriceIds(priceIds, ctx.priceMapping);
  if (productKeys.length === 0) {
    console.log(
      "checkout.session.completed: no product keys mapped",
      { session_id: session.id, price_ids: priceIds },
    );
    return;
  }

  await syncEntitlements(
    ctx.supabase,
    userId,
    productKeys,
    "active",
    null,
    { stripe_session_id: session.id, price_ids: priceIds },
  );
  await insertLicenseEvent(ctx.supabase, userId, "checkout_complete", {
    session_id: session.id,
    product_keys: productKeys,
    customer_id: session.customer as string ?? null,
    mode: session.mode,
  });
  await notifyDiscord(userId, session.customer_email ?? "", productKeys, classifyTier(productKeys));
}

export async function handleSubscriptionUpdated(
  ctx: WebhookContext,
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId = stripeId(sub.customer) ?? "";
  if (!customerId) {
    throw new Error("customer.subscription.updated: missing customer");
  }

  const userId = await resolveUserIdByStripeCustomer(ctx.supabase, customerId);
  if (!userId) {
    throw new Error(
      `customer.subscription.updated: customer not linked to a user`,
    );
  }

  await upsertStripeCustomer(ctx.supabase, userId, customerId);
  await upsertStripeSubscription(ctx.supabase, userId, sub);

  const priceIds = sub.items.data.map((item) => {
    if (!item.price) return "";
    return typeof item.price === "string" ? item.price : item.price.id;
  }).filter(Boolean);

  const productKeys = productKeysForPriceIds(priceIds, ctx.priceMapping);
  const { status, expiresAt } = deriveEntitlementStatus(sub);

  if (productKeys.length > 0) {
    await syncEntitlements(
      ctx.supabase,
      userId,
      productKeys,
      status,
      expiresAt,
      { subscription_id: sub.id, price_ids: priceIds },
    );
    await revokeEntitlementsForSubscription(
      ctx.supabase,
      userId,
      sub.id,
      productKeys,
    );
  } else {
    // No mapped keys: revoke every entitlement tied to this subscription so
    // tier-downgrade or unmapping is handled safely.
    await revokeEntitlementsForSubscription(ctx.supabase, userId, sub.id, []);
  }
  await insertLicenseEvent(ctx.supabase, userId, "subscription_updated", {
    subscription_id: sub.id,
    status: sub.status,
    product_keys: productKeys,
  });
  await notifyDiscord(userId, "", productKeys, classifyTier(productKeys));
}

export async function handleSubscriptionDeleted(
  ctx: WebhookContext,
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId = stripeId(sub.customer);
  if (!customerId) return;

  const userId = await resolveUserIdByStripeCustomer(ctx.supabase, customerId);
  if (!userId) return;

  await upsertStripeSubscription(ctx.supabase, userId, sub);

  const expiresAt = timestampToISO(sub.current_period_end) ??
    new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("user_entitlements")
    .select("product_key")
    .eq("user_id", userId)
    .eq("metadata->>subscription_id", sub.id);
  if (error) throw error;

  for (const row of (data ?? [])) {
    const productKey = (row as { product_key: string }).product_key;
    const { error: updErr } = await ctx.supabase
      .from("user_entitlements")
      .update({
        status: "expired",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("product_key", productKey);
    if (updErr) throw updErr;
  }
  await insertLicenseEvent(ctx.supabase, userId, "subscription_deleted", {
    subscription_id: sub.id,
  });
}

export async function handleInvoicePaymentFailed(
  ctx: WebhookContext,
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId = stripeId(invoice.customer);
  if (!customerId) return;

  const userId = await resolveUserIdByStripeCustomer(ctx.supabase, customerId);
  if (!userId) {
    console.log("invoice.payment_failed: customer not linked", {
      customer_id: customerId,
    });
    return;
  }

  const subscriptionId = stripeId(invoice.subscription);

  const query = ctx.supabase
    .from("user_entitlements")
    .select("product_key")
    .eq("user_id", userId)
    .eq("status", "active");

  const { data, error } = subscriptionId
    ? await query.eq("metadata->>subscription_id", subscriptionId)
    : await query;
  if (error) throw error;

  const now = new Date().toISOString();
  for (const row of (data ?? [])) {
    const productKey = (row as { product_key: string }).product_key;
    const { error: updErr } = await ctx.supabase
      .from("user_entitlements")
      .update({ status: "grace", updated_at: now })
      .eq("user_id", userId)
      .eq("product_key", productKey);
    if (updErr) throw updErr;
  }
  await insertLicenseEvent(ctx.supabase, userId, "payment_failed", {
    invoice_id: invoice.id,
    subscription_id: subscriptionId ?? null,
  });
}
// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

export async function insertLicenseEvent(
  supabase: SupabaseClient,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("license_events")
    .insert({ user_id: userId, event_type: eventType, payload });
  if (error) {
    console.error("insertLicenseEvent failed:", error.message);
    // No lanzar — la escritura de entitlements es más importante que la auditoría.
  }
}

/**
 * Envía un aviso al canal de soporte del equipo vía webhook de
 * Discord (NO asigna roles, solo notifica). Opcional: si no está
 * configurado DISCORD_ROLE_SYNC_WEBHOOK_URL, se salta sin error.
 */
export async function notifyDiscord(
  userId: string,
  email: string,
  productKeys: string[],
  tier: string,
): Promise<void> {
  const webhookUrl = Deno.env.get("DISCORD_ROLE_SYNC_WEBHOOK_URL");
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `💳 Nuevo tier: ${tier} para ${email} (${userId}) — ${productKeys.join(", ")}`,
      }),
    });
    if (!res.ok) {
      console.error("Discord notify failed:", res.status);
    }
  } catch (err) {
    console.error("Discord notify error:", err);
  }
}

function classifyTier(keys: string[]): string {
  if (keys.includes("visionary_backer")) return "visionary_backer";
  if (keys.includes("pro_founder")) return "pro_founder";
  if (keys.includes("founder")) return "founder";
  if (keys.includes("supporter")) return "supporter";
  if (keys.includes("beta_access")) return "beta_access";
  const hasOverlays = keys.includes("overlays");
  const hasEngineer = keys.includes("engineer");
  if (hasOverlays && hasEngineer) return "suite";
  if (hasOverlays) return "overlays";
  if (hasEngineer) return "engineer";
  return "free";
}

// ---------------------------------------------------------------------------
// Frontend-facing endpoints (llamados desde la app, NO desde Stripe)
// Deben ir ANTES de la verificación de firma Stripe (issue 3b).
// ---------------------------------------------------------------------------
async function handleFrontendRequest(req: Request, ctx: WebhookContext): Promise<Response | null> {
  const url = new URL(req.url);

  if (url.pathname === "/create-checkout-session" && req.method === "POST") {
    return await handleCreateCheckoutSession(null, req);
  }

  if (url.pathname === "/create-portal-session" && req.method === "POST") {
    return await handleCreatePortalSession(null, req);
  }

  return null; // No es un endpoint frontend, pasar al webhook
}

async function handleRequest(req: Request, ctx: WebhookContext): Promise<Response> {
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
    console.error("stripe signature verification failed", err);
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          ctx,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          ctx,
          event.data.object as Stripe.Subscription,
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          ctx,
          event.data.object as Stripe.Subscription,
        );
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(
          ctx,
          event.data.object as Stripe.Invoice,
        );
        break;
      default:
        console.log("unhandled stripe event type", { type: event.type });
    }
  } catch (err) {
    console.error("webhook handler error", err);
    return new Response(JSON.stringify({ error: "handler failed" }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}

if (import.meta.main) {
  const ctx = createContext();
  serve(async (req) => await handleRequest(req, ctx));
}
