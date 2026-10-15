import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectCheckoutOffer } from "./launch-offer.ts";
import { loadPolarProductMap } from "./mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "./test-fixtures.ts";
Deno.test("R4 creator attribution combines with launch without discounting first invoice twice", () => {
  const raw = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
  raw.creator_discounts = { ISAAC: "00000000-0000-4000-8000-000000001681" };
  raw.checkout_keys.pro_monthly.polar_launch_discount_id =
    "00000000-0000-4000-8000-000000001682";
  const loaded = loadPolarProductMap(JSON.stringify(raw), {
    environment: "sandbox",
  });
  if (!loaded.ok) throw Error("fixture");
  const offer = selectCheckoutOffer(
    loaded.map,
    "pro_monthly",
    loaded.map.checkout_keys.pro_monthly!,
    new Date("2026-10-27T18:00:00Z"),
    "ISAAC",
  );
  assertEquals(offer.ok, true);
  if (offer.ok) {
    assertEquals(
      offer.discountId,
      raw.checkout_keys.pro_monthly.polar_launch_discount_id,
    );
    assertEquals(
      (offer as unknown as { creatorCode: string }).creatorCode,
      "ISAAC",
    );
  }
  const normal = selectCheckoutOffer(
    loaded.map,
    "pro_monthly",
    loaded.map.checkout_keys.pro_monthly!,
    new Date("2026-12-27T18:00:00Z"),
    "ISAAC",
  );
  if (!normal.ok) throw Error("offer");
  assertEquals(normal.discountId, null);
});

import { applyCreatorRenewal } from "./creator-renewal.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
Deno.test("R4 paid receipt retries after failure, records Owner issue, and ACKs only confirmed state", async () => {
  const loaded = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "sandbox",
  });
  if (!loaded.ok) throw Error("fixture");
  const calls: string[] = [];
  let completed = false;
  let fail = true;
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === "billing_creator_renewal_prepare") {
        return Promise.resolve({
          data: completed ? null : {
            token: "lease",
            discount_id: "creator",
            creator_discount_id: "creator",
            initial_discount_id: "launch",
          },
          error: null,
        });
      }
      if (name === "billing_creator_renewal_authorized") {
        return Promise
          .resolve({ data: true, error: null });
      }
      if (name === "billing_creator_renewal_finish") {
        completed = args.p_success === true;
        return Promise.resolve({ data: true, error: null });
      }
      throw Error("unexpected RPC");
    },
  } as unknown as SupabaseClient;
  const input = {
    userId: "account",
    checkoutId: "checkout",
    subscriptionId: "sub",
    orderId: "paid",
    productId: loaded.map.checkout_keys.pro_monthly!.polar_product_id,
    key: "pro_monthly" as const,
    initial: true,
  };
  let writes = 0;
  const synchronize: Parameters<typeof applyCreatorRenewal>[3] = async (
    _id,
    _env,
    expected,
  ) => {
    assertEquals(await expected.authorize(), true);
    if (fail) throw Error("provider unavailable");
    writes++;
  };
  await assertRejects(() =>
    applyCreatorRenewal(client, loaded.map, input, synchronize)
  );
  assertEquals(completed, false);
  fail = false;
  await applyCreatorRenewal(client, loaded.map, input, synchronize);
  await applyCreatorRenewal(client, loaded.map, input, synchronize);
  assertEquals(writes, 1);
  assertEquals(
    calls.filter((n) => n === "billing_creator_renewal_finish").length,
    2,
  );
});
