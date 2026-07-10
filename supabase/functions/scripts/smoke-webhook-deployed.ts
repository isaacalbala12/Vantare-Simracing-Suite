/**
 * Smoke test against deployed billing-webhook (sandbox).
 * Usage (secret via env, never commit):
 *   POLAR_WEBHOOK_SECRET=whsec_... deno run --allow-env --allow-net scripts/smoke-webhook-deployed.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signStandardWebhookForTest } from "../_shared/webhook-verify.ts";

const WEBHOOK_URL =
  "https://ombjshwzqgeisazijduq.supabase.co/functions/v1/billing-webhook";
const USER_ID = "4b6d8919-1c89-492d-a0e2-364124c17878";
const LAUNCH_PRODUCT = "fd15a961-ed86-4cbc-9ffa-f8c16716b22f";
const PRO_PRODUCT = "41cffd72-bd41-4904-a0e4-9083243d26d7";

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function postSignedEvent(
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

  const res = await fetch(WEBHOOK_URL, {
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
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = crypto.randomUUID().slice(0, 8);

  console.log("1) order.paid launch_lifetime");
  const evtLifetime = `smoke_lifetime_${suffix}`;
  const lifetimeRes = await postSignedEvent(secret, evtLifetime, {
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT,
      external_customer_id: USER_ID,
      customer_id: "polar_smoke_cus",
      customer: { email: "fase16.smoke.test@gmail.com" },
    },
  });
  console.log("   HTTP", lifetimeRes.status, lifetimeRes.json);

  const { data: entAfterLifetime, error: entErr } = await supabase
    .from("user_entitlements")
    .select("product_key,status,source,expires_at,metadata")
    .eq("user_id", USER_ID)
    .eq("product_key", "bundle")
    .maybeSingle();
  if (entErr) throw entErr;
  console.log("   entitlement:", entAfterLifetime);

  const { data: licLifetime } = await supabase
    .from("license_events")
    .select("event_type,idempotency_key")
    .eq("idempotency_key", evtLifetime)
    .maybeSingle();
  console.log("   license_event:", licLifetime);

  console.log("2) idempotency duplicate");
  const dupRes = await postSignedEvent(secret, evtLifetime, {
    type: "order.paid",
    data: {
      product_id: LAUNCH_PRODUCT,
      external_customer_id: USER_ID,
    },
  });
  console.log("   HTTP", dupRes.status, dupRes.json);

  console.log("3) subscription.active pro_monthly");
  const evtMonthly = `smoke_monthly_${suffix}`;
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthlyRes = await postSignedEvent(secret, evtMonthly, {
    type: "subscription.active",
    data: {
      id: `sub_smoke_${suffix}`,
      product_id: PRO_PRODUCT,
      external_customer_id: USER_ID,
      status: "active",
      current_period_end: periodEnd,
    },
  });
  console.log("   HTTP", monthlyRes.status, monthlyRes.json);

  const { data: entAfterMonthly } = await supabase
    .from("user_entitlements")
    .select("product_key,status,source,expires_at,metadata")
    .eq("user_id", USER_ID)
    .eq("product_key", "bundle")
    .maybeSingle();
  console.log("   entitlement (lifetime should win):", entAfterMonthly);

  const failures: string[] = [];
  if (lifetimeRes.status !== 202) failures.push("lifetime not 202");
  if (dupRes.status !== 202 || dupRes.json.status !== "duplicate") {
    failures.push("duplicate not idempotent");
  }
  if (monthlyRes.status !== 202) failures.push("monthly not 202");
  if (!entAfterLifetime?.source || entAfterLifetime.source !== "polar") {
    failures.push("source not polar");
  }
  if (entAfterLifetime?.metadata?.lifetime !== true) {
    failures.push("lifetime metadata false");
  }
  if (entAfterLifetime?.expires_at !== null) {
    failures.push("expires_at not null for lifetime");
  }
  if (!licLifetime?.idempotency_key) failures.push("license_events missing webhook-id");

  if (failures.length) {
    console.error("SMOKE FAILED:", failures.join(", "));
    Deno.exit(1);
  }

  console.log("SMOKE OK");
}

if (import.meta.main) {
  await main();
}