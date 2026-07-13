import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const { data: events } = await supabase
  .from("license_events")
  .select("id,event_type,idempotency_key,user_id,created_at,payload")
  .order("created_at", { ascending: false })
  .limit(20);

const { data: customers } = await supabase
  .from("billing_customers")
  .select("user_id,provider,provider_customer_id,email,updated_at")
  .eq("provider", "polar")
  .order("updated_at", { ascending: false })
  .limit(10);

console.log(JSON.stringify({ events, customers }, null, 2));