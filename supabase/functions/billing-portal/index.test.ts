import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AuthResult } from "../_shared/auth.ts";
import { handlePortalRequest, resolvePortalReturnUrl } from "./index.ts";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const auth = async (): Promise<AuthResult> => ({
  ok: true,
  token: "token",
  userId: USER_ID,
  email: null,
});
const deps = {
  requireAuth: auth,
  lookupBillingCustomer: async () => ({ providerCustomerId: "polar-customer" }),
  createCustomerSession: async () => ({
    url: "https://sandbox.polar.sh/portal/test",
    customerId: "polar-customer",
    expiresAt: null,
  }),
  getPortalReturnUrl: () => "https://app.vantare.test/account",
  getPortalReturnAllowlist: () =>
    JSON.stringify(["https://app.vantare.test/billing"]),
  getEnvironment: () => "sandbox",
};

function post(body?: Record<string, unknown>) {
  return new Request("http://localhost/billing-portal", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.test("portal uses the server default for an empty body", async () => {
  let returned = "";
  const response = await handlePortalRequest(post(), {
    ...deps,
    createCustomerSession: async (params) => {
      returned = params.returnUrl;
      return {
        url: "https://sandbox.polar.sh/portal/test",
        customerId: null,
        expiresAt: null,
      };
    },
  });
  assertEquals(response.status, 200);
  assertEquals(returned, "https://app.vantare.test/account");
});

Deno.test("portal accepts only an exact allowlisted return URL", () => {
  assertEquals(
    resolvePortalReturnUrl(
      { returnUrl: "https://app.vantare.test/billing" },
      "https://app.vantare.test/account",
      '["https://app.vantare.test/billing"]',
    ),
    { ok: true, url: "https://app.vantare.test/billing" },
  );
  for (
    const value of [
      "https://evil.test/",
      "https://app.vantare.test/billing?redirect=evil",
      "https://app.vantare.test/billing#fragment",
      "https://app.vantare.test.evil.test/billing",
    ]
  ) {
    assertEquals(
      resolvePortalReturnUrl(
        { returnUrl: value },
        "https://app.vantare.test/account",
        "[]",
      ).ok,
      false,
    );
  }
});

Deno.test("portal fails closed on invalid allowlist configuration", () => {
  const result = resolvePortalReturnUrl(
    {},
    "https://app.vantare.test/account",
    "not-json",
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "portal_return_allowlist_invalid");
});

Deno.test("portal rejects customer spoofing and oversized bodies", async () => {
  assertEquals(
    (await handlePortalRequest(post({ customerId: "evil" }), deps)).status,
    400,
  );
  assertEquals(
    (await handlePortalRequest(post({ padding: "x".repeat(5000) }), deps))
      .status,
    413,
  );
});

Deno.test("portal sends the authenticated account to the lookup", async () => {
  let lookedUp = "";
  const response = await handlePortalRequest(post(), {
    ...deps,
    lookupBillingCustomer: async (userId) => {
      lookedUp = userId;
      return { providerCustomerId: "polar-customer" };
    },
  });
  assertEquals(response.status, 200);
  assertEquals(lookedUp, USER_ID);
});

Deno.test("portal rejects a non-UUID account", async () => {
  const response = await handlePortalRequest(post(), {
    ...deps,
    requireAuth: async () => ({
      ok: true,
      token: "token",
      userId: "email@example.test",
      email: null,
    }),
  });
  assertEquals(response.status, 401);
});
