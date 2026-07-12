import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const USER_ID = Deno.args[0] ?? "4b6d8919-1c89-492d-a0e2-364124c17878";
const startedAt = new Date().toISOString();
const timeoutMs = Number(Deno.env.get("POLL_TIMEOUT_MS") ?? "180000");
const intervalMs = 5000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  const { data: events, error } = await supabase
    .from("license_events")
    .select("id,event_type,idempotency_key,payload,created_at")
    .eq("user_id", USER_ID)
    .gte("created_at", startedAt)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const polarReal = (events ?? []).filter((e) => {
    const key = String(e.idempotency_key ?? "");
    return !key.startsWith("smoke_");
  });

  if (polarReal.length > 0) {
    console.log("POLAR_EVENT_DETECTED");
    console.log(JSON.stringify(polarReal, null, 2));
    Deno.exit(0);
  }

  console.log(`waiting... (${new Date().toISOString()})`);
  await new Promise((r) => setTimeout(r, intervalMs));
}

console.error("TIMEOUT waiting for Polar webhook event");
Deno.exit(1);