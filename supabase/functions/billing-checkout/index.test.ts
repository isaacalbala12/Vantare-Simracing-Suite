import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AuthResult } from "../_shared/auth.ts";
import {
  type CheckoutAttemptStore,
  createCheckoutAttemptStore,
} from "../_shared/checkout-attempts.ts";
import { loadPolarProductMap } from "../_shared/mapping.ts";
import {
  SANDBOX_ENVIRONMENT,
  VALID_POLAR_PRODUCT_MAP_JSON,
  withFounders,
} from "../_shared/test-fixtures.ts";
import { PolarClientError } from "../_shared/polar.ts";
import { handleCheckoutRequest } from "./index.ts";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000020";
const auth = async (): Promise<AuthResult> => ({
  ok: true,
  token: "token",
  userId: USER_ID,
  email: "user@example.test",
});

function memoryStore(): CheckoutAttemptStore {
  const rows = new Map<string, { status: string; key: string; url?: string }>();
  return {
    async claim(input) {
      const existing = rows.get(input.attemptId);
      if (!existing) {
        rows.set(input.attemptId, {
          status: "creating",
          key: input.checkoutKey,
        });
        return { kind: "claimed" };
      }
      if (existing.key !== input.checkoutKey) return { kind: "conflict" };
      if (existing.status === "open") {
        return { kind: "reused", url: existing.url! };
      }
      if (existing.status === "uncertain") return { kind: "uncertain" };
      return { kind: "busy" };
    },
    async complete(input, _id, url) {
      rows.set(input.attemptId, {
        status: "open",
        key: input.checkoutKey,
        url,
      });
    },
    async markUncertain(input) {
      rows.set(input.attemptId, {
        status: "uncertain",
        key: input.checkoutKey,
      });
    },
  };
}

function deps(
  store = memoryStore(),
  createCheckout?: () => Promise<{ url: string; checkoutId: string | null }>,
) {
  return {
    requireAuth: auth,
    loadMap: () =>
      loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
        environment: SANDBOX_ENVIRONMENT,
      }),
    attempts: store,
    promotionDiscount: async () => null as string | null,
    purchasePolicy: async () => ({
      reason: null,
    }),
    createCheckout: createCheckout ??
      (async () => ({
        url: "https://sandbox.polar.sh/checkout/test",
        checkoutId: "checkout-test",
      })),
  };
}

Deno.test("Founders policy denies checkout before creating or reusing a Polar session", async () => {
  for (
    const reason of [
      "founders_sale_closed",
      "founders_already_owned",
      "account_unavailable",
    ]
  ) {
    let contacted = false;
    const result = await handleCheckoutRequest(
      new Request("https://app.invalid", {
        method: "POST",
        body: JSON.stringify({
          productKey: "pro_monthly",
          attemptId: ATTEMPT_ID,
        }),
      }),
      {
        ...deps(),
        purchasePolicy: async () => ({
          reason,
        }),
        createCheckout: async () => {
          contacted = true;
          throw new Error("must not contact Polar");
        },
      },
    );
    assertEquals(result.status, 409);
    assertEquals((await result.json()).error, reason);
    assertEquals(contacted, false);
  }
});

Deno.test("checkout fails closed if eligibility cannot be read", async () => {
  const result = await handleCheckoutRequest(
    new Request("https://app.invalid", {
      method: "POST",
      body: JSON.stringify({
        productKey: "pro_monthly",
        attemptId: ATTEMPT_ID,
      }),
    }),
    {
      ...deps(),
      purchasePolicy: async () => {
        throw new Error("offline");
      },
    },
  );
  assertEquals(result.status, 503);
});

function post(body: Record<string, unknown>, signal?: AbortSignal) {
  return new Request("http://localhost/billing-checkout", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
}

Deno.test("checkout accepts only authenticated UUID and server mapping", async () => {
  let captured: Record<string, unknown> = {};
  const result = await handleCheckoutRequest(
    post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
    deps(memoryStore(), async function (params: unknown) {
      captured = params as Record<string, unknown>;
      return {
        url: "https://sandbox.polar.sh/checkout/test",
        checkoutId: "checkout-test",
      };
    } as never),
  );
  assertEquals(result.status, 200);
  assertEquals(captured.userId, USER_ID);
  assertEquals(captured.productId, "00000000-0000-0000-0000-000000000003");
  assertEquals(captured.environment, "sandbox");
  assertEquals(captured.capabilities, ["vantare.plan.pro"]);
  assertEquals(captured.trial, { enabled: false });
});

Deno.test("checkout rejects spoofing, unknown fields and oversized bodies", async () => {
  for (
    const body of [
      { productKey: "pro_monthly", attemptId: ATTEMPT_ID, userId: USER_ID },
      { productKey: "pro_monthly", attemptId: ATTEMPT_ID, arbitrary: true },
    ]
  ) {
    assertEquals((await handleCheckoutRequest(post(body), deps())).status, 400);
  }
  const huge = post({
    productKey: "pro_monthly",
    attemptId: ATTEMPT_ID,
    padding: "x".repeat(5000),
  });
  assertEquals((await handleCheckoutRequest(huge, deps())).status, 413);
});

Deno.test("checkout fails closed when Pro Plus has no approved Polar ids", async () => {
  const response = await handleCheckoutRequest(
    post({ productKey: "pro_plus_monthly", attemptId: ATTEMPT_ID }),
    deps(),
  );
  assertEquals(response.status, 409);
  assertEquals((await response.json()).error, "mapping_checkout_unavailable");
});

Deno.test("checkout retries reuse one local result without a second Polar call", async () => {
  const store = memoryStore();
  let calls = 0;
  const shared = deps(store, async () => {
    calls++;
    return { url: "https://sandbox.polar.sh/checkout/one", checkoutId: "one" };
  });
  assertEquals(
    (await handleCheckoutRequest(
      post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
      shared,
    )).status,
    200,
  );
  const retry = await handleCheckoutRequest(
    post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
    shared,
  );
  assertEquals(retry.status, 200);
  assertEquals((await retry.json()).reused, true);
  assertEquals(calls, 1);
});

Deno.test("concurrent checkout attempts make at most one Polar call", async () => {
  const store = memoryStore();
  let calls = 0;
  const shared = deps(store, async () => {
    calls++;
    await Promise.resolve();
    return { url: "https://sandbox.polar.sh/checkout/one", checkoutId: "one" };
  });
  const responses = await Promise.all([
    handleCheckoutRequest(
      post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
      shared,
    ),
    handleCheckoutRequest(
      post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
      shared,
    ),
  ]);
  assertEquals(calls, 1);
  assertEquals(responses.map((response) => response.status).sort(), [200, 409]);
});

Deno.test("checkout rejects a non-UUID account before side effects", async () => {
  const response = await handleCheckoutRequest(
    post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
    {
      ...deps(),
      requireAuth: async () => ({
        ok: true,
        token: "token",
        userId: "email@example.test",
        email: null,
      }),
    },
  );
  assertEquals(response.status, 401);
});

Deno.test("checkout propagates request cancellation to Polar", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const called = new Promise<void>((resolve) => started = resolve);
  let receivedSignal: AbortSignal | undefined;
  const request = post(
    { productKey: "pro_monthly", attemptId: ATTEMPT_ID },
    controller.signal,
  );
  const responsePromise = handleCheckoutRequest(
    request,
    {
      ...deps(),
      createCheckout: (_params, options) => {
        receivedSignal = options?.signal;
        started();
        return new Promise((_resolve, reject) => {
          const rejectCancelled = () =>
            reject(
              new PolarClientError(
                "request_cancelled",
                "Request was cancelled",
                503,
              ),
            );
          if (options?.signal?.aborted) rejectCancelled();
          else {
            options?.signal?.addEventListener("abort", rejectCancelled, {
              once: true,
            });
          }
        });
      },
    },
  );

  await called;
  controller.abort();
  const response = await responsePromise;
  assertStrictEquals(receivedSignal, request.signal);
  assertEquals(response.status, 503);
  assertEquals((await response.json()).error, "request_cancelled");
});
Deno.test("P3-3 activated campaign RPC failure is retryable without uncertain checkout attempt", async () => {
  const previous = Deno.env.get("REPORT_PROMOTION_ENABLED");
  Deno.env.set("REPORT_PROMOTION_ENABLED", "true");
  try {
    const store = memoryStore();
    let claims = 0;
    let uncertain = 0;
    let calls = 0;
    let policy = 0;
    const configured = {
      ...deps(store),
      attempts: {
        ...store,
        claim: (input: Parameters<CheckoutAttemptStore["claim"]>[0]) => {
          claims++;
          return store.claim(input);
        },
        markUncertain: (
          input: Parameters<CheckoutAttemptStore["markUncertain"]>[0],
        ) => {
          uncertain++;
          return store.markUncertain(input);
        },
      },
      promotionDiscount: () => {
        assertEquals(Deno.env.get("REPORT_PROMOTION_ENABLED"), "true");
        policy++;
        return policy === 1
          ? Promise.reject(new Error("transient SQL outage"))
          : Promise.resolve("launch1");
      },
      createCheckout: (
        params: Parameters<
          NonNullable<import("./index.ts").CheckoutDeps["createCheckout"]>
        >[0],
      ) => {
        calls++;
        assertEquals(params.discountId, "launch1");
        assertEquals(params.trial, { enabled: false });
        return Promise.resolve({
          url: "https://sandbox.polar.sh/checkout/test",
          checkoutId: "checkout-test",
        });
      },
    };
    const body = { productKey: "pro_monthly", attemptId: ATTEMPT_ID };
    assertEquals(
      (await handleCheckoutRequest(post(body), configured)).status,
      503,
    );
    assertEquals(claims, 0);
    assertEquals(uncertain, 0);
    assertEquals(calls, 0);
    assertEquals(
      (await handleCheckoutRequest(post(body), configured)).status,
      200,
    );
    assertEquals(
      (await handleCheckoutRequest(post(body), configured)).status,
      200,
    );
    assertEquals(calls, 1);
    assertEquals(uncertain, 0);
  } finally {
    if (previous === undefined) Deno.env.delete("REPORT_PROMOTION_ENABLED");
    else Deno.env.set("REPORT_PROMOTION_ENABLED", previous);
  }
});

Deno.test("P1-2 a new desktop attempt reuses the verified launch checkout without another Polar creation", async () => {
  let writes = 0;
  const configured = {
    ...deps(memoryStore()),
    promotionDiscount: () =>
      Promise.resolve({ checkoutUrl: "https://sandbox.polar.sh/checkout/old" }),
    createCheckout: () => {
      writes++;
      throw new Error("must reuse old checkout");
    },
  };
  const response = await handleCheckoutRequest(
    post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
    configured,
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    url: "https://sandbox.polar.sh/checkout/old",
    reused: true,
  });
  assertEquals(writes, 0);
});

Deno.test("P2-9 plan-change waiting is explicit and creates no checkout or uncertain attempt", async () => {
  const { PromotionCheckoutError } = await import(
    "../billing-report-promotion/observe.ts"
  );
  let writes = 0;
  const response = await handleCheckoutRequest(
    post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
    {
      ...deps(memoryStore()),
      promotionDiscount: () =>
        Promise.reject(
          new PromotionCheckoutError(
            "promotion_checkout_plan_change_pending",
            "Hay un pago abierto para otro plan. Espera a que caduque; tu primer mes se conserva.",
            409,
          ),
        ),
      createCheckout: () => {
        writes++;
        throw new Error("must wait");
      },
    },
  );
  assertEquals(response.status, 409);
  const body = await response.json();
  assertEquals(body.error, "promotion_checkout_plan_change_pending");
  assertEquals(typeof body.message, "string");
  assertEquals(writes, 0);
});

Deno.test("Founders uses the existing authenticated idempotent checkout with its configured product", async () => {
  const store = memoryStore();
  let calls = 0;
  const request = () =>
    new Request("https://app.invalid", {
      method: "POST",
      body: JSON.stringify({ productKey: "founders", attemptId: ATTEMPT_ID }),
    });
  const options = {
    ...deps(store),
    loadMap: () =>
      loadPolarProductMap(withFounders(VALID_POLAR_PRODUCT_MAP_JSON), {
        environment: "sandbox",
      }),
    createCheckout: async (
      params: import("../_shared/polar.ts").CreateCheckoutParams,
    ) => {
      calls++;
      assertEquals(params.productId, "00000000-0000-4000-8000-000000001661");
      assertEquals(params.capabilities, [
        "vantare.plan.founders",
        "vantare.channel.nightly",
      ]);
      assertEquals(params.trial, { enabled: false });
      return {
        url: "https://sandbox.polar.sh/checkout/founders",
        checkoutId: "checkout-founders",
      };
    },
  };
  const first = await handleCheckoutRequest(request(), options);
  assertEquals(first.status, 200);
  assertEquals((await first.json()).reused, false);
  const second = await handleCheckoutRequest(request(), options);
  assertEquals(second.status, 200);
  assertEquals((await second.json()).reused, true);
  assertEquals(calls, 1);
});

function campaignDeps(at: string, withDiscount = true) {
  const base = deps();
  const raw = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
  if (withDiscount) {
    raw.checkout_keys.pro_monthly.polar_launch_discount_id =
      "00000000-0000-4000-8000-000000001680";
  }
  raw.creator_discounts = { ISAAC: "00000000-0000-4000-8000-000000001681" };
  return {
    ...base,
    now: () => new Date(at),
    promotionDiscount: async () =>
      Date.parse(at) >= Date.parse("2026-10-26T18:00:00Z") &&
        Date.parse(at) < Date.parse("2026-11-26T18:00:00Z")
        ? raw.checkout_keys.pro_monthly.polar_launch_discount_id ?? null
        : null,
    loadMap: () =>
      loadPolarProductMap(JSON.stringify(raw), { environment: "sandbox" }),
  };
}
Deno.test("once campaign: opening included, closing excluded, normal product and first-period discount", async () => {
  for (
    const [at, id] of [
      ["2026-10-26T17:59:59.999Z", null],
      ["2026-10-26T18:00:00Z", "00000000-0000-4000-8000-000000001680"],
      ["2026-11-26T17:59:59.999Z", "00000000-0000-4000-8000-000000001680"],
      ["2026-11-26T18:00:00Z", null],
    ] as const
  ) {
    let sent: Record<string, unknown> = {};
    const d = campaignDeps(at);
    const response = await handleCheckoutRequest(
      post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
      {
        ...d,
        createCheckout: async (params) => {
          sent = Object.fromEntries(Object.entries(params));
          return {
            url: "https://sandbox.polar.sh/checkout/campaign",
            checkoutId: "test",
          };
        },
      },
    );
    assertEquals(response.status, 200);
    assertEquals(sent.discountId ?? null, id);
    assertEquals(
      sent.productId,
      JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON).checkout_keys.pro_monthly
        .polar_product_id,
    );
    if (id) assertEquals(sent.trial, { enabled: false });
  }
});
Deno.test("once campaign: missing mapping fails closed and creator attribution combines", async () => {
  const missing = await handleCheckoutRequest(
    post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
    campaignDeps("2026-10-26T18:00:00Z", false),
  );
  assertEquals(missing.status, 503);
  const combined = await handleCheckoutRequest(
    post({
      productKey: "pro_monthly",
      attemptId: ATTEMPT_ID,
      creatorCode: "ISAAC",
    }),
    campaignDeps("2026-10-26T18:00:00Z"),
  );
  assertEquals(combined.status, 200);
});
Deno.test("once campaign: outside window only exact configured creator code is accepted", async () => {
  for (
    const [code, status] of [["ISAAC", 200], ["isaac", 400], [
      "OTHER",
      400,
    ]] as const
  ) {
    let sent: Record<string, unknown> = {};
    const d = campaignDeps("2026-11-26T18:00:00Z");
    const response = await handleCheckoutRequest(
      post({
        productKey: "pro_monthly",
        attemptId: ATTEMPT_ID,
        creatorCode: code,
      }),
      {
        ...d,
        createCheckout: async (params) => {
          sent = Object.fromEntries(Object.entries(params));
          return {
            url: "https://sandbox.polar.sh/checkout/creator",
            checkoutId: "test",
          };
        },
      },
    );
    assertEquals(response.status, status);
    if (status === 200) {
      assertEquals(sent.discountId, null);
      assertEquals(sent.creatorCode, "ISAAC");
      assertEquals(sent.trial, { enabled: false });
    }
  }
});
Deno.test("once campaign: offer fingerprint prevents reusing a checkout across offer changes", async () => {
  const versions: string[] = [];
  for (const date of ["2026-10-26T18:00:00Z", "2026-11-26T18:00:00Z"]) {
    const d = campaignDeps(date);
    const response = await handleCheckoutRequest(
      post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
      {
        ...d,
        attempts: {
          ...d.attempts,
          claim: async (input) => {
            versions.push(input.catalogVersion);
            return { kind: "claimed" };
          },
        },
      },
    );
    assertEquals(response.status, 200);
  }
  assertEquals(versions[0] === versions[1], false);
});

Deno.test("R3 inherited creator names are rejected before claiming an attempt", async () => {
  for (
    const code of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
    ]
  ) {
    let claims = 0, created = false;
    const d = campaignDeps("2026-11-26T18:00:00Z");
    const response = await handleCheckoutRequest(
      post({
        productKey: "pro_monthly",
        attemptId: ATTEMPT_ID,
        creatorCode: code,
      }),
      {
        ...d,
        attempts: {
          ...d.attempts,
          claim: async () => {
            claims++;
            return { kind: "claimed" };
          },
        },
        createCheckout: async () => {
          created = true;
          return {
            url: "https://sandbox.polar.sh/checkout/invalid",
            checkoutId: "test",
          };
        },
      },
    );
    assertEquals(response.status, 400);
    assertEquals(claims, 0);
    assertEquals(created, false);
  }
});

Deno.test("R7 consumed launch account never falls back to canonical offer and creator remains attributed", async () => {
  let sent: Record<string, unknown> = {};
  const d = campaignDeps("2026-11-25T18:00:00Z");
  const response = await handleCheckoutRequest(
    post({
      productKey: "pro_monthly",
      attemptId: ATTEMPT_ID,
      creatorCode: "ISAAC",
    }),
    {
      ...d,
      promotionDiscount: async (...args) => {
        assertEquals(args[4]?.toISOString(), "2026-11-25T18:00:00.000Z");
        assertEquals(
          args[8]?.discountId,
          "00000000-0000-4000-8000-000000001680",
        );
        assertEquals(args[8]?.key, "pro_monthly");
        assertEquals(
          args[8]?.catalogVersion?.includes(":creator:ISAAC:"),
          true,
        );
        return null;
      },
      createCheckout: async (params) => {
        sent = Object.fromEntries(Object.entries(params));
        return {
          url: "https://sandbox.polar.sh/checkout/r7",
          checkoutId: "r7",
        };
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(sent.discountId, null);
  assertEquals(sent.creatorCode, "ISAAC");
  assertEquals(sent.trial, { enabled: false });
});

Deno.test("shared checkout refuses old schema, deleted account and family conflict before Polar", async () => {
  for (const scenario of ["old", "deleted", "family"] as const) {
    let calls = 0;
    const rpc = () =>
      Promise.resolve(
        scenario === "deleted" ? { data: null, error: { code: "28000" } } : {
          data: [{
            outcome: scenario === "family" ? "busy" : "claimed",
            checkout_url: null,
            ...(scenario === "old" ? {} : { guard_version: 2 }),
          }],
          error: null,
        },
      );
    const response = await handleCheckoutRequest(
      post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
      {
        ...deps(createCheckoutAttemptStore({ rpc } as never)),
        createCheckout: () => {
          calls++;
          throw new Error("must not reach Polar");
        },
      },
    );
    assertEquals(response.status, scenario === "family" ? 409 : 503);
    assertEquals(calls, 0);
    assertEquals((await response.json()).url, undefined);
  }
});
Deno.test("shared checkout never releases URL when canonical binding completion fails", async () => {
  const calls: string[] = [];
  const rpc = (name: string) => {
    calls.push(name);
    return Promise.resolve({
      data: name === "claim_billing_checkout_attempt"
        ? [{ outcome: "claimed", checkout_url: null, guard_version: 2 }]
        : name === "billing_begin_checkout_request"
        ? { dispatch_token: ATTEMPT_ID }
        : name === "complete_billing_checkout_attempt"
        ? false
        : true,
      error: null,
    });
  };
  const response = await handleCheckoutRequest(
    post({ productKey: "pro_monthly", attemptId: ATTEMPT_ID }),
    deps(createCheckoutAttemptStore({ rpc } as never)),
  );
  assertEquals(response.status, 503);
  assertEquals((await response.json()).url, undefined);
  assertEquals(calls, [
    "claim_billing_checkout_attempt",
    "billing_begin_checkout_request",
    "complete_billing_checkout_attempt",
    "mark_billing_checkout_attempt_uncertain",
  ]);
});
