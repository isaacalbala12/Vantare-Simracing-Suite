import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createPolarCheckoutSession,
  createPolarCustomerSession,
  isPolarDebugErrorsEnabled,
  PolarClientError,
  publicPolarErrorExtras,
} from "./polar.ts";

async function withPolarDebugEnv(
  value: string | undefined,
  fn: () => void | Promise<void>,
): Promise<void> {
  const previous = Deno.env.get("POLAR_DEBUG_ERRORS");
  try {
    if (value === undefined) {
      Deno.env.delete("POLAR_DEBUG_ERRORS");
    } else {
      Deno.env.set("POLAR_DEBUG_ERRORS", value);
    }
    await fn();
  } finally {
    if (previous === undefined) {
      Deno.env.delete("POLAR_DEBUG_ERRORS");
    } else {
      Deno.env.set("POLAR_DEBUG_ERRORS", previous);
    }
  }
}

const baseParams = {
  productId: "00000000-0000-0000-0000-000000000001",
  userId: "auth-uid-123",
  email: "user@test.com",
  productKey: "launch_lifetime",
  planSku: "launch_lifetime",
  entitlementProductKey: "bundle",
};

Deno.test("isPolarDebugErrorsEnabled: only exact true enables debug", async () => {
  await withPolarDebugEnv(undefined, () => {
    assertEquals(isPolarDebugErrorsEnabled(), false);
  });
  await withPolarDebugEnv("false", () => {
    assertEquals(isPolarDebugErrorsEnabled(), false);
  });
  await withPolarDebugEnv("1", () => {
    assertEquals(isPolarDebugErrorsEnabled(), false);
  });
  await withPolarDebugEnv("yes", () => {
    assertEquals(isPolarDebugErrorsEnabled(), false);
  });
  await withPolarDebugEnv("true", () => {
    assertEquals(isPolarDebugErrorsEnabled(), true);
  });
});

Deno.test("publicPolarErrorExtras: omits verbose fields when debug disabled", async () => {
  const details = {
    polar_status: 422,
    polar_error: "body.success_url: invalid URL",
    polar_request_body: { customer_email: "u***@test.com" },
  };

  await withPolarDebugEnv(undefined, () => {
    assertEquals(publicPolarErrorExtras(details), {});
  });
  await withPolarDebugEnv("false", () => {
    assertEquals(publicPolarErrorExtras(details), {});
  });
});

Deno.test("publicPolarErrorExtras: includes sanitized fields when debug enabled", async () => {
  const details = {
    polar_status: 422,
    polar_error: "body.success_url: invalid URL",
    polar_request_body: {
      products: ["prod-1"],
      customer_email: "u***@test.com",
    },
  };

  await withPolarDebugEnv("true", () => {
    assertEquals(publicPolarErrorExtras(details), details);
  });
});

Deno.test("createPolarCheckoutSession: missing POLAR_ACCESS_TOKEN throws 503", async () => {
  await assertRejects(
    () =>
      createPolarCheckoutSession(baseParams, {
        getAccessToken: () => null,
        getSuccessUrl: () => "https://example.com/success",
        getCancelUrl: () => "https://example.com/cancel",
      }),
    PolarClientError,
    "POLAR_ACCESS_TOKEN is not configured",
  );
});

Deno.test("createPolarCheckoutSession: success returns checkout url", async () => {
  let capturedUrl = "";
  let capturedBody = "";

  const result = await createPolarCheckoutSession(baseParams, {
    getAccessToken: () => "test-token",
    getBaseUrl: () => "https://sandbox-api.polar.sh/v1",
    getSuccessUrl: () => "https://example.com/success",
    getCancelUrl: () => "https://example.com/cancel",
    fetchFn: async (url, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = typeof init?.body === "string" ? init.body : "";
      return new Response(
        JSON.stringify({
          id: "chk_123",
          url: "https://sandbox.polar.sh/checkout/chk_123",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  assertEquals(result.url, "https://sandbox.polar.sh/checkout/chk_123");
  assertEquals(capturedUrl, "https://sandbox-api.polar.sh/v1/checkouts/");
  const body = JSON.parse(capturedBody) as Record<string, unknown>;
  assertEquals(body.products, [baseParams.productId]);
  assertEquals(body.external_customer_id, baseParams.userId);
  assertEquals(body.success_url, "https://example.com/success");
  assertEquals(body.return_url, "https://example.com/cancel");
  const metadata = body.metadata as Record<string, string>;
  assertEquals(metadata.user_id, baseParams.userId);
  assertEquals(metadata.product_key, "launch_lifetime");
  assertEquals(metadata.entitlement_product_key, "bundle");
  assertEquals(metadata.source, "desktop");
  assertEquals(metadata.app, "vantare");
});

Deno.test("createPolarCheckoutSession: Polar non-2xx throws 502 with details", async () => {
  let caught: PolarClientError | null = null;
  try {
    await createPolarCheckoutSession(baseParams, {
      getAccessToken: () => "test-token",
      getSuccessUrl: () => "https://example.com/success",
      getCancelUrl: () => "https://example.com/cancel",
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            detail: [{
              loc: ["body", "success_url"],
              msg: "invalid URL",
              type: "value_error",
            }],
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
    });
  } catch (error) {
    caught = error as PolarClientError;
  }

  if (!caught) throw new Error("expected PolarClientError");
  assertEquals(caught.code, "polar_checkout_failed");
  assertEquals(caught.status, 502);
  assertEquals(caught.details.polar_status, 422);
  assertEquals(
    caught.details.polar_error,
    "body.success_url: invalid URL",
  );
  const body = caught.details.polar_request_body as Record<string, unknown>;
  assertEquals(body.products, [baseParams.productId]);
  assertEquals(body.return_url, "https://example.com/cancel");
  assertEquals(body.customer_email, "u***@test.com");
});

const portalBaseParams = {
  customerId: "polar_cus_123",
  returnUrl: "https://example.com/account",
};

Deno.test("createPolarCustomerSession: missing POLAR_ACCESS_TOKEN throws 503", async () => {
  await assertRejects(
    () =>
      createPolarCustomerSession(portalBaseParams, {
        getAccessToken: () => null,
      }),
    PolarClientError,
    "POLAR_ACCESS_TOKEN is not configured",
  );
});

Deno.test("createPolarCustomerSession: success returns customer portal url", async () => {
  let capturedUrl = "";
  let capturedBody = "";

  const result = await createPolarCustomerSession(portalBaseParams, {
    getAccessToken: () => "test-token",
    getBaseUrl: () => "https://sandbox-api.polar.sh/v1",
    fetchFn: async (url, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = typeof init?.body === "string" ? init.body : "";
      return new Response(
        JSON.stringify({
          customer_portal_url: "https://sandbox.polar.sh/portal/session_123",
          token: "secret-portal-token",
          customer_id: "polar_cus_123",
          expires_at: "2026-07-10T00:00:00Z",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  assertEquals(result.url, "https://sandbox.polar.sh/portal/session_123");
  assertEquals(result.customerId, "polar_cus_123");
  assertEquals(capturedUrl, "https://sandbox-api.polar.sh/v1/customer-sessions/");
  const body = JSON.parse(capturedBody) as Record<string, unknown>;
  assertEquals(body.customer_id, portalBaseParams.customerId);
  assertEquals(body.return_url, portalBaseParams.returnUrl);
});

Deno.test("createPolarCustomerSession: external_customer_id fallback", async () => {
  let capturedBody = "";

  await createPolarCustomerSession({
    externalCustomerId: "auth-uid-123",
    returnUrl: "https://example.com/account",
  }, {
    getAccessToken: () => "test-token",
    getBaseUrl: () => "https://sandbox-api.polar.sh/v1",
    fetchFn: async (_url, init?: RequestInit) => {
      capturedBody = typeof init?.body === "string" ? init.body : "";
      return new Response(
        JSON.stringify({
          customer_portal_url: "https://sandbox.polar.sh/portal/session_ext",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const body = JSON.parse(capturedBody) as Record<string, unknown>;
  assertEquals(body.external_customer_id, "auth-uid-123");
  assertEquals(body.customer_id, undefined);
});

Deno.test("createPolarCustomerSession: Polar non-2xx throws 502 with details", async () => {
  let caught: PolarClientError | null = null;
  try {
    await createPolarCustomerSession(portalBaseParams, {
      getAccessToken: () => "test-token",
      fetchFn: async () =>
        new Response(
          JSON.stringify({ detail: "customer not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
    });
  } catch (error) {
    caught = error as PolarClientError;
  }

  if (!caught) throw new Error("expected PolarClientError");
  assertEquals(caught.code, "polar_portal_failed");
  assertEquals(caught.status, 502);
  assertEquals(caught.details.polar_status, 404);
});

Deno.test("createPolarCustomerSession: response without customer_portal_url throws 502", async () => {
  await assertRejects(
    () =>
      createPolarCustomerSession(portalBaseParams, {
        getAccessToken: () => "test-token",
        fetchFn: async () =>
          new Response(JSON.stringify({ token: "secret-portal-token" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
      }),
    PolarClientError,
    "Polar customer session response did not include a portal URL",
  );
});

Deno.test("createPolarCheckoutSession: response without url throws 502", async () => {
  await assertRejects(
    () =>
      createPolarCheckoutSession(baseParams, {
        getAccessToken: () => "test-token",
        getSuccessUrl: () => "https://example.com/success",
        getCancelUrl: () => "https://example.com/cancel",
        fetchFn: async () =>
          new Response(JSON.stringify({ id: "chk_123" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
      }),
    PolarClientError,
    "Polar checkout response did not include a URL",
  );
});