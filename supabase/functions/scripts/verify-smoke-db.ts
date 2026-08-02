import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const USER_ID = Deno.args[0];
const sinceIso = Deno.args[1] ??
  new Date(Date.now() - 15 * 60 * 1000).toISOString();

if (!USER_ID) {
  console.error("Usage: verify-smoke-db.ts <user_id> [since_iso]");
  Deno.exit(1);
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: events, error: eventsErr } = await supabase
  .from("license_events")
  .select("event_type,created_at")
  .eq("user_id", USER_ID)
  .gte("created_at", sinceIso)
  .order("created_at", { ascending: false })
  .limit(10);

if (eventsErr) throw eventsErr;

const { data: entitlement, error: entErr } = await supabase
  .from("user_entitlements")
  .select("product_key,status,source,expires_at,updated_at")
  .eq("user_id", USER_ID)
  .eq("product_key", "bundle")
  .maybeSingle();

if (entErr) throw entErr;

console.log(JSON.stringify(
  {
    eventCount: events?.length ?? 0,
    eventTypes: [...new Set((events ?? []).map((event) => event.event_type))]
      .sort(),
    entitlement: entitlement
      ? {
        productKey: entitlement.product_key,
        status: entitlement.status,
        source: entitlement.source,
        hasExpiry: entitlement.expires_at !== null,
        updatedAt: entitlement.updated_at,
      }
      : null,
  },
  null,
  2,
));
