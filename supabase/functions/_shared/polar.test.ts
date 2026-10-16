import { withdrawCreatorDiscount } from "./polar.ts";
import { synchronizeRenewalDiscount } from "./polar.ts";
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createPolarCheckoutSession,
  createPolarCustomerSession,
  getPolarCustomerStateByExternalId,
  PolarClientError,
  publicPolarErrorExtras,
  stopSubscriptionRenewal,
} from "./polar.ts";

const checkout = {
  productId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-4000-8000-000000000010",
  email: "user@example.test",
  productKey: "pro_monthly" as const,
  planSku: "pro_monthly" as const,
  environment: "sandbox" as const,
  catalogVersion: "catalog-v2",
  capabilities: ["vantare.plan.pro"],
  channels: ["stable"] as const,
  launchScopeVersion: null,
  trial: { enabled: false } as const,
};

function checkoutDeps(fetchFn: typeof fetch) {
  return {
    fetchFn,
    getAccessToken: () => "token",
    getBaseUrl: () => "https://sandbox-api.polar.sh/v1",
    getSuccessUrl: () => "https://app.vantare.test/success",
    getCancelUrl: () => "https://app.vantare.test/cancel",
  };
}

Deno.test("Founders checkout cannot use trial or discount codes", async () => {
  let body: Record<string, unknown> = {};
  await createPolarCheckoutSession(
    {
      ...checkout,
      productKey: "founders",
      planSku: "founders",
      capabilities: ["vantare.plan.founders"],
    },
    checkoutDeps(async (input, init) => {
      body = await new Request(input, init).json();
      return new Response(
        JSON.stringify({
          id: "founders",
          url: "https://sandbox.polar.sh/checkout/founders",
        }),
        { status: 201 },
      );
    }),
  );
  assertEquals(body.allow_trial, false);
  assertEquals(body.allow_discount_codes, false);
  assertEquals(body.expires_at, undefined); // Not a CheckoutCreate input in Polar.
});

Deno.test("Polar checkout sends explicit no-trial and versioned capability metadata", async () => {
  let body: Record<string, unknown> = {};
  const result = await createPolarCheckoutSession(
    checkout,
    checkoutDeps(async (input, init) => {
      body = await new Request(input, init).json();
      return new Response(
        JSON.stringify({
          id: "checkout",
          url: "https://sandbox.polar.sh/checkout/test",
        }),
        { status: 201 },
      );
    }),
  );
  assertEquals(result.url, "https://sandbox.polar.sh/checkout/test");
  assertEquals(body.allow_trial, false);
  assertEquals(
    (body.metadata as Record<string, unknown>).creator_code,
    undefined,
  );
  assertEquals(body.trial_interval, undefined);
  const metadata = body.metadata as Record<string, unknown>;
  assertEquals(metadata.user_id, checkout.userId);
  assertEquals(metadata.catalog_version, "catalog-v2");
  assertEquals(metadata.capabilities, '["vantare.plan.pro"]');
  assertEquals(metadata.channels, '["stable"]');
});

Deno.test("Polar checkout sends exactly seven days only when configured", async () => {
  let body: Record<string, unknown> = {};
  await createPolarCheckoutSession(
    {
      ...checkout,
      trial: {
        enabled: true,
        interval: "day",
        interval_count: 7,
        provider_anti_abuse_confirmed: true,
      },
    },
    checkoutDeps(async (input, init) => {
      body = await new Request(input, init).json();
      return new Response(
        JSON.stringify({ url: "https://sandbox.polar.sh/checkout/test" }),
        { status: 201 },
      );
    }),
  );
  assertEquals(body.allow_trial, true);
  assertEquals(body.trial_interval, "day");
  assertEquals(body.trial_interval_count, 7);
});

Deno.test("Polar client fails closed on API or hosted URL environment mismatch", async () => {
  await assertRejects(
    () =>
      createPolarCheckoutSession(checkout, {
        ...checkoutDeps(fetch),
        getBaseUrl: () => "https://api.polar.sh/v1",
      }),
    PolarClientError,
    "Polar API host does not match",
  );
  await assertRejects(
    () =>
      createPolarCheckoutSession(
        checkout,
        checkoutDeps(async () =>
          new Response(
            JSON.stringify({ url: "https://polar.sh/checkout/wrong" }),
            { status: 201 },
          )
        ),
      ),
    PolarClientError,
    "invalid checkout URL",
  );
});

Deno.test("Polar client supports cancellation and a bounded timeout", async () => {
  await assertRejects(
    () =>
      createPolarCheckoutSession(checkout, {
        ...checkoutDeps(
          async (input, init) => {
            const signal = new Request(input, init).signal;
            await new Promise((_resolve, reject) =>
              signal.addEventListener(
                "abort",
                () => reject(new DOMException("aborted", "AbortError")),
              )
            );
            throw new Error("unreachable");
          },
        ),
        timeoutMs: 50,
      }),
    PolarClientError,
    "did not respond in time",
  );
});

Deno.test("Polar timeout remains active while the response body is read", async () => {
  await assertRejects(
    () =>
      createPolarCheckoutSession(checkout, {
        ...checkoutDeps(
          async (input, init) => {
            const signal = new Request(input, init).signal;
            const body = new ReadableStream<Uint8Array>({
              start(controller) {
                const timer = setTimeout(() => {
                  controller.enqueue(
                    new TextEncoder().encode(JSON.stringify({
                      url: "https://sandbox.polar.sh/checkout/late",
                    })),
                  );
                  controller.close();
                }, 250);
                signal.addEventListener("abort", () => {
                  clearTimeout(timer);
                  controller.error(new DOMException("aborted", "AbortError"));
                }, { once: true });
              },
            });
            return new Response(body, {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          },
        ),
        timeoutMs: 50,
      }),
    PolarClientError,
    "did not respond in time",
  );
});

Deno.test("Polar never starts a request after caller cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assertRejects(
    () =>
      createPolarCheckoutSession(checkout, {
        ...checkoutDeps(async () => {
          calls++;
          return new Response("{}");
        }),
        signal: controller.signal,
      }),
    PolarClientError,
    "Request was cancelled",
  );
  assertEquals(calls, 0);
});

Deno.test("public Polar errors never expose provider bodies or account metadata", async () => {
  const previous = Deno.env.get("POLAR_DEBUG_ERRORS");
  Deno.env.set("POLAR_DEBUG_ERRORS", "true");
  try {
    assertEquals(publicPolarErrorExtras({ polar_status: 422 }), {
      polar_status: 422,
    });
  } finally {
    if (previous === undefined) Deno.env.delete("POLAR_DEBUG_ERRORS");
    else Deno.env.set("POLAR_DEBUG_ERRORS", previous);
  }
});

Deno.test("Polar portal uses the requested environment and validates hosted URL", async () => {
  let body: Record<string, unknown> = {};
  const result = await createPolarCustomerSession({
    customerId: "customer",
    returnUrl: "https://app.vantare.test/account",
    environment: "sandbox",
  }, {
    getAccessToken: () => "token",
    getBaseUrl: () => "https://sandbox-api.polar.sh/v1",
    fetchFn: async (input, init) => {
      body = await new Request(input, init).json();
      return new Response(
        JSON.stringify({
          customer_portal_url: "https://sandbox.polar.sh/portal/test",
        }),
        { status: 201 },
      );
    },
  });
  assertEquals(result.url, "https://sandbox.polar.sh/portal/test");
  assertEquals(body.return_url, "https://app.vantare.test/account");
});

Deno.test("Polar Customer State is normalized without lifetime-order assumptions", async () => {
  const result = await getPolarCustomerStateByExternalId(
    checkout.userId,
    "sandbox",
    {
      ...checkoutDeps(async (input) => {
        assertEquals(
          String(input),
          `https://sandbox-api.polar.sh/v1/customers/external/${checkout.userId}/state`,
        );
        return new Response(JSON.stringify({
          customer: { id: "customer-1", external_id: checkout.userId },
          active_subscriptions: [{
            id: "subscription-1",
            product_id: checkout.productId,
            status: "active",
            modified_at: "2026-08-02T10:00:00Z",
            current_period_end: "2026-09-02T10:00:00Z",
          }],
          granted_benefits: [],
        }));
      }),
      now: () => new Date("2026-08-02T12:00:00Z"),
    },
  );
  assertEquals(result.activeSubscriptions[0], {
    id: "subscription-1",
    productId: checkout.productId,
    status: "active",
    modifiedAt: "2026-08-02T10:00:00.000Z",
    currentPeriodEnd: "2026-09-02T10:00:00Z",
  });
  assertEquals(result.grantedBenefits, []);
});

Deno.test("Polar Customer State honors Retry-After seconds and HTTP dates", async () => {
  for (const retryAfter of ["2", "Sun, 02 Aug 2026 12:00:03 GMT"]) {
    let requests = 0;
    const delays: number[] = [];
    await getPolarCustomerStateByExternalId(checkout.userId, "sandbox", {
      ...checkoutDeps(async () => {
        requests++;
        if (requests === 1) {
          return new Response("", {
            status: 429,
            headers: { "Retry-After": retryAfter },
          });
        }
        return new Response(JSON.stringify({
          customer: { id: "customer-1", external_id: checkout.userId },
          active_subscriptions: [],
          granted_benefits: [],
        }));
      }),
      now: () => new Date("2026-08-02T12:00:00Z"),
      sleep: (milliseconds) => {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    });
    assertEquals(requests, 2);
    assertEquals(delays, [retryAfter === "2" ? 2000 : 3000]);
  }
});

Deno.test("Founders transition stops renewal idempotently without revoke or refund", async () => {
  const requests: unknown[] = [];
  const deps = checkoutDeps(async (input, init?: RequestInit) => {
    assertEquals(
      String(input),
      "https://sandbox-api.polar.sh/v1/subscriptions/sub_founders",
    );
    assertEquals(init?.method, "PATCH");
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "sub_founders", cancel_at_period_end: true });
  });
  await stopSubscriptionRenewal("sub_founders", "sandbox", deps);
  await stopSubscriptionRenewal("sub_founders", "sandbox", deps);
  assertEquals(requests, [{ cancel_at_period_end: true }, {
    cancel_at_period_end: true,
  }]);
  await assertRejects(() =>
    stopSubscriptionRenewal(
      "sub_founders",
      "sandbox",
      checkoutDeps(async () =>
        Response.json({ id: "sub_founders", cancel_at_period_end: false })
      ),
    )
  );
});

Deno.test("once checkout sends one server-selected discount, no trial or customer discount entry", async () => {
  let body: Record<string, unknown> = {};
  await createPolarCheckoutSession(
    {
      ...checkout,
      creatorCode: "ISAAC",
      discountId: "00000000-0000-4000-8000-000000001680",
    },
    checkoutDeps(async (input, init) => {
      body = await new Request(input, init).json();
      return Response.json({
        id: "test",
        url: "https://sandbox.polar.sh/checkout/once",
      });
    }),
  );
  assertEquals(body.discount_id, "00000000-0000-4000-8000-000000001680");
  assertEquals(body.allow_discount_codes, false);
  assertEquals(body.allow_trial, false);
  assertEquals(
    (body.metadata as Record<string, unknown>).creator_code,
    "ISAAC",
  );
  assertEquals(body.trial_interval, undefined);
});

Deno.test("R4 renewal GET recovers lost PATCH response without restarting repeating and refuses foreign discounts", async () => {
  let discount: string | null = "launch";
  let writes = 0;
  const deps = checkoutDeps(async (_url, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      writes++;
      assertEquals(JSON.parse(String(init.body)), { discount_id: "creator" });
      discount = "creator";
    }
    return Response.json({
      id: "sub",
      product_id: checkout.productId,
      status: "active",
      amount: 599,
      currency: "eur",
      recurring_interval: "month",
      recurring_interval_count: 1,
      discount_id: discount,
    });
  });
  const expected = {
    productId: checkout.productId,
    discountId: "creator",
    managedIds: [null, "launch"],
    normalCents: 599,
    interval: "month",
    authorize: () => Promise.resolve(true),
  };
  await synchronizeRenewalDiscount("sub", "sandbox", expected, deps);
  await synchronizeRenewalDiscount("sub", "sandbox", expected, deps);
  assertEquals(writes, 1);
  discount = "foreign";
  await assertRejects(() =>
    synchronizeRenewalDiscount("sub", "sandbox", expected, deps)
  );
  assertEquals(writes, 1);
  discount = "launch";
  await assertRejects(() =>
    synchronizeRenewalDiscount("sub", "sandbox", {
      ...expected,
      authorize: () => Promise.resolve(false),
    }, deps)
  );
  assertEquals(writes, 1);
});

Deno.test("R5 refunded creator coupon is removed once, foreign report coupon is preserved", async () => {
  let current: string | null = "creator";
  let writes = 0;
  const deps = checkoutDeps(async (_url, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      writes++;
      assertEquals(JSON.parse(String(init.body)), { discount_id: null });
      current = null;
    }
    return Response.json({
      id: "sub",
      product_id: checkout.productId,
      discount_id: current,
    });
  });
  const expected = {
    productId: checkout.productId,
    creatorDiscountId: "creator",
    authorize: () => Promise.resolve(true),
  };
  await withdrawCreatorDiscount("sub", "sandbox", expected, deps);
  await withdrawCreatorDiscount("sub", "sandbox", expected, deps);
  assertEquals(writes, 1);
  current = "reports";
  await withdrawCreatorDiscount("sub", "sandbox", expected, deps);
  assertEquals(current, "reports");
  assertEquals(writes, 1);
  current = "creator";
  await assertRejects(() =>
    withdrawCreatorDiscount("sub", "sandbox", {
      ...expected,
      authorize: () => Promise.resolve(false),
    }, deps)
  );
  assertEquals(writes, 1);
});

Deno.test("R7 invalid launch offers fail before transport and public codes stay disabled without a coupon", async () => {
  let calls = 0;
  const deps = checkoutDeps(async () => {
    calls++;
    return new Response(
      JSON.stringify({ id: "r7", url: "https://sandbox.polar.sh/checkout/r7" }),
      { status: 201 },
    );
  });
  for (
    const invalid of [
      { ...checkout, discountId: "invalid" },
      {
        ...checkout,
        productKey: "founders" as const,
        discountId: "00000000-0000-4000-8000-000000001680",
      },
      {
        ...checkout,
        trial: {
          enabled: true as const,
          interval: "day" as const,
          interval_count: 7 as const,
          provider_anti_abuse_confirmed: true as const,
        },
        discountId: "00000000-0000-4000-8000-000000001680",
      },
    ]
  ) {
    const error = await assertRejects(
      () => createPolarCheckoutSession(invalid, deps),
      PolarClientError,
    );
    assertEquals(error.code, "invalid_checkout_offer");
  }
  assertEquals(calls, 0);
  let payload: Record<string, unknown> = {};
  await createPolarCheckoutSession(
    { ...checkout, creatorCode: "ISAAC" },
    checkoutDeps(async (_url, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: "r7",
          url: "https://sandbox.polar.sh/checkout/r7",
        }),
        { status: 201 },
      );
    }),
  );
  assertEquals(payload.allow_discount_codes, false);
  assertEquals(payload.discount_id, undefined);
  assertEquals(
    (payload.metadata as Record<string, unknown>).creator_code,
    "ISAAC",
  );
});

Deno.test("R7 creator withdrawal includes only validated remainders and preserves reports", async () => {
  for (const initial of ["remainder", "reports"]) {
    let current: string | null = initial;
    let patches = 0;
    await withdrawCreatorDiscount("sub-r7", "sandbox", {
      productId: "product",
      creatorDiscountId: "original",
      managedCreatorDiscountIds: ["remainder"],
      authorize: async () => true,
    }, {
      getAccessToken: () => "fixture",
      fetchFn: (_url, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          patches++;
          assertEquals(JSON.parse(String(init.body)), { discount_id: null });
          current = null;
        }
        return Promise.resolve(
          Response.json({
            id: "sub-r7",
            product_id: "product",
            discount_id: current,
          }),
        );
      },
    });
    assertEquals(patches, initial === "remainder" ? 1 : 0);
    assertEquals(current, initial === "remainder" ? null : "reports");
  }
});
