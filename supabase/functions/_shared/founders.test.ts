import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { transitionFoundersSubscriptions } from "./founders.ts";
Deno.test("Founders transition retries failed cancellation and only acknowledges confirmed effects", async () => {
  const receipts: string[] = [];
  let attempts = 0;
  const client = {
    rpc: (name: string) =>
      Promise.resolve(
        name === "billing_founders_subscription_transitions"
          ? {
            data: [{ subscription_id: "sub_pro", policy: "end_period" }],
            error: null,
          }
          : (receipts.push(name), { error: null }),
      ),
  } as unknown as SupabaseClient;
  const cancel = async () => {
    if (++attempts === 1) throw Error("offline");
  };
  await assertRejects(() =>
    transitionFoundersSubscriptions(client, "sandbox", "order", cancel)
  );
  assertEquals(receipts, []);
  await transitionFoundersSubscriptions(client, "sandbox", "order", cancel);
  assertEquals(receipts, ["billing_complete_founders_transition"]);
});
Deno.test("No pending transitions means no Polar requests (completed, deleted, refunded)", async () => {
  const client = {
    rpc: () => Promise.resolve({ data: [], error: null }),
  } as unknown as SupabaseClient;
  await transitionFoundersSubscriptions(
    client,
    "sandbox",
    "order",
    async () => {
      throw Error("unexpected network effect");
    },
  );
});
