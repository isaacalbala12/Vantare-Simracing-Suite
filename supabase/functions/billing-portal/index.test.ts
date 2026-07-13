import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AuthResult } from "../_shared/auth.ts";
import { PolarClientError } from "../_shared/polar.ts";
import {
  handlePortalRequest,
  isValidHttpsUrl,
  resolvePortalReturnUrl,
} from "./index.ts";

const AUTH_USER_ID = "auth-uid-from-jwt";
const POLAR_CUSTOMER_ID = "polar_cus_from_db";

async function testAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.length <= "Bearer ".length) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return {
    ok: true,
    token: authHeader.slice("Bearer ".length),
    userId: AUTH_USER_ID,
    email: "user@test.com",
  };
}

function portalDeps(overrides: {
  lookupBillingCustomer?: (
    userId: string,
  ) => Promise<{ providerCustomerId: string } | null>;
  createCustomerSession?: (
    params: {
      customerId?: string;
      externalCustomerId?: string;
      returnUrl: string;
    },
  ) => Promise<{ url: string; customerId: string | null; expiresAt: string | null }>;
  getPortalReturnUrl?: () => string | null | undefined;
} = {}) {
  return {
    requireAuth: testAuth,
    lookupBillingCustomer: overrides.lookupBillingCustomer,
    createCustomerSession: overrides.createCustomerSession,
    getPortalReturnUrl: overrides.getPortalReturnUrl ??
      (() => "https://example.com/account"),
  };
}

function postPortal(
  body?: string,
  token = "test-token",
): Request {
  return new Request("http://localhost/billing-portal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ?? "{}",
  });
}

Deno.test("billing-portal: OPTIONS returns cors", async () => {
  const res = await handlePortalRequest(
    new Request("http://localhost/billing-portal", { method: "OPTIONS" }),
    portalDeps(),
  );
  assertEquals(res.status, 200);
});

Deno.test("billing-portal: GET is 405", async () => {
  const res = await handlePortalRequest(
    new Request("http://localhost/billing-portal", { method: "GET" }),
    portalDeps(),
  );
  assertEquals(res.status, 405);
});

Deno.test("billing-portal: missing Authorization is 401", async () => {
  const res = await handlePortalRequest(
    new Request("http://localhost/billing-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    portalDeps(),
  );
  assertEquals(res.status, 401);
});

Deno.test("billing-portal: empty body is valid with default return url", async () => {
  const res = await handlePortalRequest(
    postPortal(""),
    portalDeps({
      lookupBillingCustomer: async () => ({
        providerCustomerId: POLAR_CUSTOMER_ID,
      }),
      createCustomerSession: async () => ({
        url: "https://sandbox.polar.sh/portal/session_123",
        customerId: POLAR_CUSTOMER_ID,
        expiresAt: null,
      }),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.url, "https://sandbox.polar.sh/portal/session_123");
});

Deno.test("billing-portal: returnUrl HTTPS valid accepted", async () => {
  const res = await handlePortalRequest(
    postPortal(JSON.stringify({ returnUrl: "https://app.example.com/billing" })),
    portalDeps({
      lookupBillingCustomer: async () => ({
        providerCustomerId: POLAR_CUSTOMER_ID,
      }),
      createCustomerSession: async (params) => {
        assertEquals(params.returnUrl, "https://app.example.com/billing");
        return {
          url: "https://sandbox.polar.sh/portal/custom",
          customerId: POLAR_CUSTOMER_ID,
          expiresAt: null,
        };
      },
    }),
  );
  assertEquals(res.status, 200);
});

Deno.test("billing-portal: returnUrl non-HTTPS rejected", async () => {
  const res = await handlePortalRequest(
    postPortal(JSON.stringify({ returnUrl: "http://example.com/account" })),
    portalDeps({
      lookupBillingCustomer: async () => ({
        providerCustomerId: POLAR_CUSTOMER_ID,
      }),
    }),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid_return_url");
});

Deno.test("billing-portal: rejects userId spoof", async () => {
  const res = await handlePortalRequest(
    postPortal(JSON.stringify({ userId: "evil-user" })),
    portalDeps(),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "forbidden_field");
});

Deno.test("billing-portal: rejects customerId spoof", async () => {
  const res = await handlePortalRequest(
    postPortal(JSON.stringify({ customerId: "cus_evil" })),
    portalDeps(),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "forbidden_field");
});

Deno.test("billing-portal: rejects providerCustomerId spoof", async () => {
  const res = await handlePortalRequest(
    postPortal(JSON.stringify({ providerCustomerId: "cus_evil" })),
    portalDeps(),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "forbidden_field");
});

Deno.test("billing-portal: rejects email spoof", async () => {
  const res = await handlePortalRequest(
    postPortal(JSON.stringify({ email: "evil@test.com" })),
    portalDeps(),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "forbidden_field");
});

Deno.test("billing-portal: user without billing_customer returns 404", async () => {
  const res = await handlePortalRequest(
    postPortal(),
    portalDeps({
      lookupBillingCustomer: async () => null,
    }),
  );
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "billing_customer_not_found");
});

Deno.test("billing-portal: uses billing_customer id from DB not body", async () => {
  let capturedCustomerId = "";
  const res = await handlePortalRequest(
    postPortal(),
    portalDeps({
      lookupBillingCustomer: async (userId) => {
        assertEquals(userId, AUTH_USER_ID);
        return { providerCustomerId: POLAR_CUSTOMER_ID };
      },
      createCustomerSession: async (params) => {
        capturedCustomerId = params.customerId ?? "";
        return {
          url: "https://sandbox.polar.sh/portal/session_db",
          customerId: POLAR_CUSTOMER_ID,
          expiresAt: null,
        };
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(capturedCustomerId, POLAR_CUSTOMER_ID);
  const body = await res.json();
  assertEquals(body.url, "https://sandbox.polar.sh/portal/session_db");
  const serialized = JSON.stringify(body);
  assertFalse(serialized.includes("secret-portal-token"));
  assertFalse(serialized.includes("Bearer "));
});

Deno.test("billing-portal: missing POLAR_ACCESS_TOKEN returns 503", async () => {
  const res = await handlePortalRequest(
    postPortal(),
    portalDeps({
      lookupBillingCustomer: async () => ({
        providerCustomerId: POLAR_CUSTOMER_ID,
      }),
      createCustomerSession: async () => {
        throw new PolarClientError(
          "polar_not_configured",
          "POLAR_ACCESS_TOKEN is not configured",
          503,
        );
      },
    }),
  );
  assertEquals(res.status, 503);
});

Deno.test("billing-portal: missing PORTAL_RETURN_URL returns 503", async () => {
  const res = await handlePortalRequest(
    postPortal(),
    portalDeps({
      getPortalReturnUrl: () => null,
      lookupBillingCustomer: async () => ({
        providerCustomerId: POLAR_CUSTOMER_ID,
      }),
    }),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "portal_return_url_not_configured");
});

Deno.test("billing-portal: Polar non-2xx returns 502 without verbose details", async () => {
  const previous = Deno.env.get("POLAR_DEBUG_ERRORS");
  try {
    Deno.env.delete("POLAR_DEBUG_ERRORS");
    const res = await handlePortalRequest(
      postPortal(),
      portalDeps({
        lookupBillingCustomer: async () => ({
          providerCustomerId: POLAR_CUSTOMER_ID,
        }),
        createCustomerSession: async () => {
          throw new PolarClientError(
            "polar_portal_failed",
            "Polar customer portal session could not be created",
            502,
            {
              polar_status: 404,
              polar_error: "customer not found",
              polar_request_body: { customer_id: POLAR_CUSTOMER_ID },
            },
          );
        },
      }),
    );
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, "polar_portal_failed");
    assertFalse("polar_error" in body);
    assertFalse("polar_request_body" in body);
  } finally {
    if (previous === undefined) {
      Deno.env.delete("POLAR_DEBUG_ERRORS");
    } else {
      Deno.env.set("POLAR_DEBUG_ERRORS", previous);
    }
  }
});

Deno.test("billing-portal: Polar response without portal url returns 502", async () => {
  const res = await handlePortalRequest(
    postPortal(),
    portalDeps({
      lookupBillingCustomer: async () => ({
        providerCustomerId: POLAR_CUSTOMER_ID,
      }),
      createCustomerSession: async () => {
        throw new PolarClientError(
          "polar_missing_portal_url",
          "Polar customer session response did not include a portal URL",
          502,
        );
      },
    }),
  );
  assertEquals(res.status, 502);
});

Deno.test("resolvePortalReturnUrl: prefers body over env", () => {
  const result = resolvePortalReturnUrl(
    { returnUrl: "https://client.example.com/back" },
    () => "https://env.example.com/back",
  );
  assertEquals(result, { ok: true, url: "https://client.example.com/back" });
});

Deno.test("isValidHttpsUrl: accepts https only", () => {
  assertEquals(isValidHttpsUrl("https://example.com"), true);
  assertEquals(isValidHttpsUrl("http://example.com"), false);
  assertEquals(isValidHttpsUrl("not-a-url"), false);
});