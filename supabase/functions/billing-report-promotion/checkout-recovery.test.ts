import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { promotionCheckoutDiscount as checkoutWithOffer } from "./observe.ts";
const promotionCheckoutDiscount = (
  ...args: Parameters<typeof checkoutWithOffer>
) => {
  args[8] ??= { discountId: "pro1", key: "pro_monthly" };
  return checkoutWithOffer(...args);
};
Deno.test("P3-D no legacy checkout fallback without a canonical offer", async () => {
  let calls = 0;
  const admin = () =>
    ({
      rpc: () => {
        calls++;
        throw new Error("unexpected RPC");
      },
    }) as unknown as SupabaseClient;
  const error = await assertRejects(() =>
    checkoutWithOffer(
      admin,
      "account",
      "sandbox",
      "pro",
      new Date("2026-10-30"),
      true,
      "new",
    )
  );
  assertEquals(
    (error as Error & { code: string }).code,
    "launch_offer_required",
  );
  assertEquals(calls, 0);
});
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

Deno.test("P3-23 pending reservation uses its actual retry_at and injected clock", async () => {
  for (
    const [retryAt, text] of [
      ["2026-10-30T14:46:00Z", "dentro de 135 minutos"],
      ["2026-10-30T12:31:00Z", "Vuelve a intentarlo ahora"],
      [null, "Vuelve a intentarlo más tarde"],
      ["invalid", "Vuelve a intentarlo más tarde"],
    ] as const
  ) {
    const admin = () =>
      ({
        rpc: (name: string) =>
          Promise.resolve(
            name === "report_promotion_failed"
              ? { data: null, error: null }
              : name.endsWith("_pending")
              ? { data: { attempt_id: "old", retry_at: retryAt }, error: null }
              : { data: null, error: { code: "55000" } },
          ),
      }) as unknown as SupabaseClient;
    const error = await assertRejects(() =>
      promotionCheckoutDiscount(
        admin,
        "account",
        "sandbox",
        "pro",
        new Date("2026-10-30T12:31:00Z"),
        true,
        "new",
      )
    );
    assertStringIncludes((error as Error).message, text);
    assertStringIncludes((error as Error).message, "primer mes se conserva");
    assertEquals((error as Error).message.includes("30 minutos"), false);
  }
});

Deno.test("P3-24 remote owner or product mismatch records an owner incident before failing closed", async () => {
  for (
    const remote of [{ accountId: "other", productId: "pro" }, {
      accountId: "account",
      productId: "other",
    }]
  ) {
    const calls: Record<string, unknown>[] = [];
    const admin = () =>
      ({
        rpc: (name: string, args: Record<string, unknown>) => {
          if (name === "report_promotion_failed") {
            calls.push(args);
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve(
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
          );
        },
      }) as unknown as SupabaseClient;
    const error = await assertRejects(() =>
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
            url: "https://sandbox.polar.sh/checkout/one",
            ...remote,
          }),
      )
    );
    assertEquals((error as Error).message, "promotion_checkout_owner_mismatch");
    assertEquals(calls, [{
      p_account: "account",
      p_environment: "sandbox",
      p_code: "promotion_checkout_owner_mismatch",
      p_now: "2026-10-30T12:31:00.000Z",
    }]);
  }
});

Deno.test("R7 canonical once guard survives false or missing report flag and uses no report coupon", async () => {
  for (const enabled of [false, undefined]) {
    let calls = 0;
    const admin = () =>
      ({
        rpc: (name: string, args: Record<string, unknown>) => {
          assertEquals(name, "billing_launch_checkout");
          assertEquals(args.p_discount, "canonical-once");
          assertEquals(args.p_key, "pro_annual");
          calls++;
          return Promise.resolve({
            data: calls === 1 ? "canonical-once" : null,
            error: null,
          });
        },
      }) as unknown as SupabaseClient;
    const run = () =>
      promotionCheckoutDiscount(
        admin,
        "account",
        "sandbox",
        "annual",
        new Date("2026-11-25T18:00:00Z"),
        enabled,
        "new",
        undefined,
        { discountId: "canonical-once", key: "pro_annual" },
      );
    assertEquals(await run(), "canonical-once");
    assertEquals(await run(), null); // Consumed account never falls back to the offer coupon.
    assertEquals(calls, 2);
  }
});

Deno.test("R7 a known open checkout cannot silently reuse a different creator offer", async () => {
  const admin = () =>
    ({
      rpc: (name: string) =>
        Promise.resolve(
          name === "billing_launch_checkout"
            ? { data: null, error: { code: "55000" } }
            : name === "report_promotion_checkout_pending"
            ? {
              data: {
                attempt_id: "old",
                checkout_id: "remote",
                product_id: "pro",
                catalog_version: "old:creator:OTHER",
              },
              error: null,
            }
            : { data: null, error: null },
        ),
    }) as unknown as SupabaseClient;
  const failure = await assertRejects(() =>
    promotionCheckoutDiscount(
      admin,
      "account",
      "sandbox",
      "pro",
      new Date("2026-11-25T18:00:00Z"),
      false,
      "new",
      () =>
        Promise.resolve({
          id: "remote",
          status: "open",
          accountId: "account",
          productId: "pro",
          url: "https://sandbox.polar.sh/checkout/old",
        }),
      {
        discountId: "once",
        key: "pro_monthly",
        catalogVersion: "new:creator:ISAAC",
      },
    )
  );
  assertEquals(
    (failure as { code?: string }).code,
    "promotion_checkout_plan_change_pending",
  );
});
