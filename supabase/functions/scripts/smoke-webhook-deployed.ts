/**
 * Smoke test against deployed billing-webhook (sandbox).
 * Usage (secret via env, never commit):
 *   POLAR_WEBHOOK_SECRET=whsec_... deno run --allow-env --allow-net scripts/smoke-webhook-deployed.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signStandardWebhookForTest } from "../_shared/webhook-verify.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function postSignedEvent(
  webhookUrl: string,
  secret: string,
  eventId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signStandardWebhookForTest(
    rawBody,
    secret,
    eventId,
    timestamp,
  );

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": eventId,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    },
    body: rawBody,
  });

  let json: Record<string, unknown> = {};
  try {
    json = await res.json() as Record<string, unknown>;
  } catch {
    json = { raw: await res.text() };
  }

  return { status: res.status, json };
}

async function main() {
  const secret = requireEnv("POLAR_WEBHOOK_SECRET");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const userId = requireEnv("BILLING_SMOKE_USER_ID");
  const launchProduct = requireEnv("BILLING_SMOKE_LAUNCH_PRODUCT_ID");
  const proProduct = requireEnv("BILLING_SMOKE_PRO_PRODUCT_ID");
  const webhookUrl = `${
    supabaseUrl.replace(/\/$/, "")
  }/functions/v1/billing-webhook`;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = crypto.randomUUID().slice(0, 8);

  console.log("1) order.paid launch_lifetime");
  const evtLifetime = `smoke_lifetime_${suffix}`;
  const lifetimePayload = {
    type: "order.paid",
    data: {
      id: `order_smoke_${suffix}`,
      modified_at: new Date().toISOString(),
      product_id: launchProduct,
      external_customer_id: userId,
      customer_id: "polar_smoke_cus",
    },
  };
  const lifetimeRes = await postSignedEvent(
    webhookUrl,
    secret,
    evtLifetime,
    lifetimePayload,
  );
  console.log("   HTTP", lifetimeRes.status);

  const { data: entAfterLifetime, error: entErr } = await supabase
    .from("user_entitlements")
    .select("product_key,status,source,expires_at,metadata")
    .eq("user_id", userId)
    .eq("product_key", "bundle")
    .maybeSingle();
  if (entErr) throw entErr;
  console.log("   entitlement present:", entAfterLifetime !== null);

  const { data: licLifetime } = await supabase
    .from("license_events")
    .select("event_type,idempotency_key")
    .eq("idempotency_key", evtLifetime)
    .maybeSingle();
  console.log("   audit event present:", licLifetime !== null);

  console.log("2) idempotency duplicate");
  const dupRes = await postSignedEvent(
    webhookUrl,
    secret,
    evtLifetime,
    lifetimePayload,
  );
  console.log("   HTTP", dupRes.status);

  console.log("3) subscription.active pro_monthly");
  const evtMonthly = `smoke_monthly_${suffix}`;
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString();
  const monthlyRes = await postSignedEvent(webhookUrl, secret, evtMonthly, {
    type: "subscription.active",
    data: {
      id: `sub_smoke_${suffix}`,
      modified_at: new Date().toISOString(),
      product_id: proProduct,
      external_customer_id: userId,
      status: "active",
      current_period_end: periodEnd,
    },
  });
  console.log("   HTTP", monthlyRes.status);

  const { data: entAfterMonthly } = await supabase
    .from("user_entitlements")
    .select("product_key,status,source,expires_at,metadata")
    .eq("user_id", userId)
    .eq("product_key", "bundle")
    .maybeSingle();
  console.log(
    "   lifetime precedence preserved:",
    entAfterMonthly?.expires_at === null,
  );

  const failures: string[] = [];
  if (lifetimeRes.status !== 202) failures.push("lifetime not 202");
  if (dupRes.status !== 202 || dupRes.json.status !== "duplicate") {
    failures.push("duplicate not idempotent");
  }
  if (monthlyRes.status !== 202) failures.push("monthly not 202");
  if (
    !entAfterLifetime?.source ||
    entAfterLifetime.source !== "billing_projection"
  ) {
    failures.push("source not billing_projection");
  }
  if (entAfterLifetime?.metadata?.derived !== true) {
    failures.push("derived metadata false");
  }
  if (entAfterLifetime?.expires_at !== null) {
    failures.push("expires_at not null for lifetime");
  }
  if (!licLifetime?.idempotency_key) {
    failures.push("license_events missing webhook-id");
  }

  if (failures.length) {
    console.error("SMOKE FAILED:", failures.join(", "));
    Deno.exit(1);
  }

  console.log("SMOKE OK");
}

if (import.meta.main) {
  await main();
}
