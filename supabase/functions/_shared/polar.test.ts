import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createPolarCheckoutSession,
  createPolarCustomerSession,
  PolarClientError,
  publicPolarErrorExtras,
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

Deno.test("Polar checkout sends explicit no-trial and versioned capability metadata", async () => {
  let body: Record<string, unknown> = {};
  const result = await createPolarCheckoutSession(
    checkout,
    checkoutDeps(async (_url, init) => {
      body = JSON.parse(String(init?.body));
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
    checkoutDeps(async (_url, init) => {
      body = JSON.parse(String(init?.body));
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
          (async (_url, init) => {
            await new Promise((_resolve, reject) =>
              init?.signal?.addEventListener(
                "abort",
                () => reject(new DOMException("aborted", "AbortError")),
              )
            );
            throw new Error("unreachable");
          }) as typeof fetch,
        ),
        timeoutMs: 1000,
      }),
    PolarClientError,
    "did not respond in time",
  );
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
    fetchFn: async (_url, init) => {
      body = JSON.parse(String(init?.body));
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
