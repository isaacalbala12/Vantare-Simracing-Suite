import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AuthResult } from "../_shared/auth.ts";
import { loadPolarProductMap } from "../_shared/mapping.ts";
import { PolarClientError } from "../_shared/polar.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import { handleCheckoutRequest } from "./index.ts";

const AUTH_USER_ID = "auth-uid-from-jwt";
const AUTH_EMAIL = "user@test.com";

const POLAR_FAILURE_DETAILS = {
  polar_status: 422,
  polar_error: "body.success_url: invalid URL",
  polar_request_body: {
    products: ["00000000-0000-0000-0000-000000000001"],
    external_customer_id: AUTH_USER_ID,
    success_url: "https://example.com/success",
    return_url: "https://example.com/cancel",
    customer_email: "u***@test.com",
    metadata: {
      user_id: AUTH_USER_ID,
      product_key: "launch_lifetime",
      plan_sku: "launch_lifetime",
      entitlement_product_key: "bundle",
      source: "desktop",
      app: "vantare",
    },
  },
};

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

function polarFailureDeps() {
  return checkoutDeps({
    createCheckout: async () => {
      throw new PolarClientError(
        "polar_checkout_failed",
        "Polar checkout session could not be created",
        502,
        POLAR_FAILURE_DETAILS,
      );
    },
  });
}

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
    email: AUTH_EMAIL,
  };
}

type CapturedCheckout = {
  productId: string;
  userId: string;
  email: string | null;
  productKey: string;
  planSku: string;
  entitlementProductKey: string;
};

function checkoutDeps(overrides: {
  loadMap?: () => ReturnType<typeof loadPolarProductMap>;
  createCheckout?: (
    params: CapturedCheckout,
  ) => Promise<{ url: string; checkoutId: string | null }>;
} = {}) {
  return {
    requireAuth: testAuth,
    loadMap: overrides.loadMap ??
      (() => loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON)),
    createCheckout: overrides.createCheckout,
  };
}

function postCheckout(
  body: Record<string, unknown>,
  token = "test-token",
): Request {
  return new Request("http://localhost/billing-checkout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("billing-checkout: OPTIONS returns cors", async () => {
  const res = await handleCheckoutRequest(
    new Request("http://localhost/billing-checkout", { method: "OPTIONS" }),
    checkoutDeps(),
  );
  assertEquals(res.status, 200);
});

Deno.test("billing-checkout: GET is 405", async () => {
  const res = await handleCheckoutRequest(
    new Request("http://localhost/billing-checkout", { method: "GET" }),
    checkoutDeps(),
  );
  assertEquals(res.status, 405);
});

Deno.test("billing-checkout: missing Authorization is 401", async () => {
  const res = await handleCheckoutRequest(
    new Request("http://localhost/billing-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productKey: "launch_lifetime" }),
    }),
    checkoutDeps(),
  );
  assertEquals(res.status, 401);
});

Deno.test("billing-checkout: launch_lifetime returns checkout url", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "launch_lifetime" }),
    checkoutDeps({
      createCheckout: async () => ({
        url: "https://sandbox.polar.sh/checkout/launch",
        checkoutId: "chk_launch",
      }),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.url, "https://sandbox.polar.sh/checkout/launch");
});

Deno.test("billing-checkout: pro_monthly returns checkout url", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "pro_monthly" }),
    checkoutDeps({
      createCheckout: async () => ({
        url: "https://sandbox.polar.sh/checkout/pro",
        checkoutId: "chk_pro",
      }),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.url, "https://sandbox.polar.sh/checkout/pro");
});

Deno.test("billing-checkout: uses external_customer_id from auth not body", async () => {
  let capturedUserId = "";
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "launch_lifetime", userId: "spoof-user" }),
    checkoutDeps({
      createCheckout: async (params) => {
        capturedUserId = params.userId;
        return {
          url: "https://sandbox.polar.sh/checkout/x",
          checkoutId: "chk_x",
        };
      },
    }),
  );
  assertEquals(res.status, 400);
  assertEquals(capturedUserId, "");
});

Deno.test("billing-checkout: sends correct product_id and metadata to Polar", async () => {
  let captured: CapturedCheckout | undefined;
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "pro_monthly" }),
    checkoutDeps({
      createCheckout: async (params: CapturedCheckout) => {
        captured = params;
        return {
          url: "https://sandbox.polar.sh/checkout/pro",
          checkoutId: "chk_pro",
        };
      },
    }),
  );
  assertEquals(res.status, 200);
  if (!captured) throw new Error("expected checkout params to be captured");
  assertEquals(captured.userId, AUTH_USER_ID);
  assertEquals(captured.email, AUTH_EMAIL);
  assertEquals(captured.productId, "00000000-0000-0000-0000-000000000003");
  assertEquals(captured.productKey, "pro_monthly");
  assertEquals(captured.planSku, "pro_monthly");
  assertEquals(captured.entitlementProductKey, "bundle");
});

Deno.test("billing-checkout: rejects product_id from client", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({
      productKey: "launch_lifetime",
      product_id: "evil-product",
    }),
    checkoutDeps(),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "forbidden_field");
});

Deno.test("billing-checkout: rejects price_id from client", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "launch_lifetime", price_id: "evil" }),
    checkoutDeps(),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "forbidden_field");
});

Deno.test("billing-checkout: rejects userId spoof", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "launch_lifetime", userId: "evil-user" }),
    checkoutDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("billing-checkout: rejects email spoof", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "launch_lifetime", email: "evil@test.com" }),
    checkoutDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("billing-checkout: invalid productKey is 400", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "suite" }),
    checkoutDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("billing-checkout: mapping invalid returns 503", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "launch_lifetime" }),
    checkoutDeps({
      loadMap: () => ({
        ok: false,
        code: "mapping_missing",
        message: "POLAR_PRODUCT_MAP is not configured",
      }),
    }),
  );
  assertEquals(res.status, 503);
});

Deno.test("billing-checkout: missing POLAR_ACCESS_TOKEN returns 503", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "launch_lifetime" }),
    checkoutDeps({
      createCheckout: async () => {
        throw new PolarClientError(
          "polar_not_configured",
          "POLAR_ACCESS_TOKEN is not configured",
          503,
        );
      },
    }),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "polar_not_configured");
});

Deno.test("billing-checkout: Polar non-2xx returns 502 without verbose details by default", async () => {
  await withPolarDebugEnv(undefined, async () => {
    const res = await handleCheckoutRequest(
      postCheckout({ productKey: "launch_lifetime" }),
      polarFailureDeps(),
    );
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, "polar_checkout_failed");
    assertEquals(body.message, "Polar checkout session could not be created");
    assertFalse("polar_request_body" in body);
    assertFalse("polar_error" in body);
    assertFalse("polar_status" in body);
  });
});

Deno.test("billing-checkout: Polar non-2xx returns 502 without verbose details when debug false", async () => {
  await withPolarDebugEnv("false", async () => {
    const res = await handleCheckoutRequest(
      postCheckout({ productKey: "launch_lifetime" }),
      polarFailureDeps(),
    );
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, "polar_checkout_failed");
    assertFalse("polar_request_body" in body);
    assertFalse("polar_error" in body);
    assertFalse("polar_status" in body);
  });
});

Deno.test("billing-checkout: Polar non-2xx returns sanitized verbose details when debug true", async () => {
  await withPolarDebugEnv("true", async () => {
    const res = await handleCheckoutRequest(
      postCheckout({ productKey: "launch_lifetime" }),
      polarFailureDeps(),
    );
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, "polar_checkout_failed");
    assertEquals(body.polar_status, 422);
    assertEquals(body.polar_error, "body.success_url: invalid URL");
    assertEquals(
      body.polar_request_body.customer_email,
      "u***@test.com",
    );
    assertFalse(
      String(body.polar_request_body.customer_email).includes(AUTH_EMAIL),
    );

    const serialized = JSON.stringify(body);
    assertFalse(serialized.includes("POLAR_ACCESS_TOKEN"));
    assertFalse(serialized.includes("Bearer "));
    assertFalse(serialized.includes("whsec_"));
    assertFalse(serialized.includes("sk_test"));
  });
});

Deno.test("billing-checkout: Polar response without url returns 502", async () => {
  const res = await handleCheckoutRequest(
    postCheckout({ productKey: "pro_monthly" }),
    checkoutDeps({
      createCheckout: async () => {
        throw new PolarClientError(
          "polar_missing_checkout_url",
          "Polar checkout response did not include a URL",
          502,
        );
      },
    }),
  );
  assertEquals(res.status, 502);
});