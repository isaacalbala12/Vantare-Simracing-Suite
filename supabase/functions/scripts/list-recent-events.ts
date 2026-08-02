import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const { data: events, error: eventsError } = await supabase
  .from("license_events")
  .select("event_type,created_at")
  .order("created_at", { ascending: false })
  .limit(20);
if (eventsError) throw eventsError;

const { count: customerCount, error: customersError } = await supabase
  .from("billing_customers")
  .select("*", { count: "exact", head: true })
  .eq("provider", "polar");
if (customersError) throw customersError;

console.log(JSON.stringify(
  {
    recentEventCount: events?.length ?? 0,
    recentEventTypes: [
      ...new Set((events ?? []).map((event) => event.event_type)),
    ].sort(),
    latestEventAt: events?.[0]?.created_at ?? null,
    polarCustomerCount: customerCount ?? 0,
  },
  null,
  2,
));
