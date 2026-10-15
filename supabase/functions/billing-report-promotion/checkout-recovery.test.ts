import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { promotionCheckoutDiscount } from "./observe.ts";
Deno.test("P1-2 expired desktop attempt recovers the account right without two remote checkouts", async () => {
  for (
    const status of ["open", "expired", "failed", "confirmed", "succeeded"]
  ) {
    let claims = 0;
    const args: Record<string, unknown>[] = [];
    const admin = () =>
      ({
        rpc: (name: string, input: Record<string, unknown>) => {
          if (name.endsWith("_pending")) {
            return Promise.resolve({
              error: null,
              data: {
                attempt_id: "old",
                checkout_id: "remote",
                product_id: "pro",
              },
            });
          }
          args.push(input);
          return Promise.resolve(
            ++claims === 1
              ? { error: { code: "55000" }, data: null }
              : { error: null, data: "pro1" },
          );
        },
      }) as unknown as SupabaseClient;
    const read = () =>
      Promise.resolve({
        id: "remote",
        productId: "pro",
        accountId: "account",
        status,
        url: "https://sandbox.polar.sh/checkout/one",
      });
    const run = () =>
      promotionCheckoutDiscount(
        admin,
        "account",
        "sandbox",
        "pro",
        new Date("2026-10-30T12:31:00Z"),
        true,
        "new",
        read,
      );
    if (status === "confirmed" || status === "succeeded") {
      await assertRejects(run);
      assertEquals(claims, 1);
    } else if (status === "open") {
      assertEquals(await run(), {
        checkoutUrl: "https://sandbox.polar.sh/checkout/one",
      });
      assertEquals(claims, 1);
    } else {
      assertEquals(await run(), "pro1");
      assertEquals(args[1].p_replaces, "old");
    }
  }
});
