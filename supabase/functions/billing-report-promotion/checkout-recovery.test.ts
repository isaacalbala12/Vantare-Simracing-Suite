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
          if (name === "report_promotion_failed") {
            return Promise.resolve({ data: null, error: null });
          }
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

Deno.test("P1-2 checkout recovery verifies remote owner, product and transport before releasing a reservation", async () => {
  const { readPolarCheckoutSession } = await import("../_shared/polar.ts");
  const base = {
    id: "remote",
    status: "open",
    product_id: "pro",
    external_customer_id: "account",
    url: "https://sandbox.polar.sh/checkout/one",
  };
  let gets = 0;
  assertEquals(
    (await readPolarCheckoutSession("remote", "sandbox", {
      getAccessToken: () => "fixture",
      fetchFn: (url, init) => {
        assertEquals(
          String(url),
          "https://sandbox-api.polar.sh/v1/checkouts/remote",
        );
        assertEquals(init?.method, "GET");
        gets++;
        return Promise.resolve(Response.json(base));
      },
    })).accountId,
    "account",
  );
  assertEquals(gets, 1);
  for (
    const extra of [{ external_customer_id: null }, { id: "other" }, {
      url: "https://attacker.invalid/checkout",
    }]
  ) {
    await assertRejects(() =>
      readPolarCheckoutSession("remote", "sandbox", {
        getAccessToken: () => "fixture",
        fetchFn: () => Promise.resolve(Response.json({ ...base, ...extra })),
      })
    );
  }
  for (
    const mismatch of [{ accountId: "other", productId: "pro" }, {
      accountId: "account",
      productId: "other",
    }]
  ) {
    const admin = () =>
      ({
        rpc: (name: string) =>
          Promise.resolve(
            name.endsWith("_pending")
              ? {
                data: {
                  attempt_id: "old",
                  checkout_id: "remote",
                  product_id: "pro",
                },
                error: null,
              }
              : { data: null, error: { code: "55000" } },
          ),
      }) as unknown as SupabaseClient;
    await assertRejects(() =>
      promotionCheckoutDiscount(
        admin,
        "account",
        "sandbox",
        "pro",
        new Date("2026-10-30T12:31:00Z"),
        true,
        "new",
        () =>
          Promise.resolve({
            id: "remote",
            status: "open",
            url: base.url,
            ...mismatch,
          }),
      )
    );
  }
});

Deno.test("P2-9 an open Pro checkout blocks Plus with a specific incident and actionable error", async () => {
  const incidents: string[] = [];
  const admin = () =>
    ({
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === "report_promotion_failed") {
          incidents.push(String(args.p_code));
          return Promise.resolve({ data: null, error: null });
        }
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
        return Promise.resolve({ data: null, error: { code: "55000" } });
      },
    }) as unknown as SupabaseClient;
  const error = await assertRejects(() =>
    promotionCheckoutDiscount(
      admin,
      "account",
      "sandbox",
      "plus",
      new Date("2026-10-30T12:31:00Z"),
      true,
      "new",
      () =>
        Promise.resolve({
          id: "remote",
          accountId: "account",
          productId: "pro",
          status: "open",
          url: "https://sandbox.polar.sh/checkout/one",
        }),
    )
  );
  assertEquals(
    (error as Error & { code?: string }).code,
    "promotion_checkout_plan_change_pending",
  );
  assertEquals(incidents, ["promotion_checkout_plan_change_pending"]);
});
