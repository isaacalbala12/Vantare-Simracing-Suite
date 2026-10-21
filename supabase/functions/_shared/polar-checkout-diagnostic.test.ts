/// <reference lib="dom.iterable" />
import { polarCheckoutDiagnostic } from "./polar-checkout-diagnostic.ts";
import { createPolarCheckoutSession, PolarClientError } from "./polar.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Unexpected diagnostic/contract result");
  }
}
const checkout = {
  productId: "17300000-0000-4000-8000-000000000001",
  userId: "17300000-0000-4000-8000-000000000002",
  email: "buyer@example.invalid",
  productKey: "pro_monthly" as const,
  planSku: "pro_monthly" as const,
  environment: "production" as const,
  catalogVersion: "fixture-catalog",
  capabilities: ["vantare.plan.pro"],
  channels: ["stable"] as const,
  launchScopeVersion: null,
  trial: { enabled: false } as const,
  attemptId: "17300000-0000-4000-8000-000000000003",
  dispatchToken: "private-dispatch-nonce",
};
const deps = {
  getAccessToken: () => "private-access-token",
  getBaseUrl: () => "https://api.polar.sh/v1",
  getSuccessUrl: () => "https://fixture.invalid/success",
  getCancelUrl: () => "https://fixture.invalid/cancel",
};

Deno.test("checkout rejection logs diagnostic but never customer names, email, input, ctx or request", async () => {
  const logs: unknown[][] = [];
  const previous = console.error;
  console.error = (...args) => {
    logs.push(args);
  };
  try {
    let rejected: unknown;
    try {
      await createPolarCheckoutSession(checkout, {
        ...deps,
        fetchFn: (input, init) => {
          equal(String(input), "https://api.polar.sh/v1/checkouts/");
          return Promise.resolve(Response.json({
            error: "validation_error",
            type: "request_validation_error",
            request: (init as RequestInit)?.body,
            name: "Ada Lovelace",
            email: checkout.email,
            detail: [
              {
                loc: ["body", "products", 0],
                type: "value_error",
                msg: "Product is a draft.",
                input: checkout.productId,
              },
              {
                loc: ["body", "customer_email"],
                type: "value_error",
                msg: "Invalid buyer@example.invalid for Ada Lovelace",
                input: checkout.email,
                ctx: {
                  name: "Ada Lovelace",
                  request: (init as RequestInit)?.body,
                },
              },
              {
                loc: ["body", "metadata", "Ada Lovelace", checkout.email],
                type: "Ada Lovelace",
                msg: "Name Ada Lovelace",
              },
            ],
          }, { status: 422 }));
        },
      });
    } catch (error) {
      rejected = error;
    }
    if (!(rejected instanceof PolarClientError)) {
      throw new Error("Expected existing public failure");
    }
    equal([rejected.code, rejected.status, rejected.details], [
      "polar_checkout_failed",
      502,
      { polar_status: 422 },
    ]);
    equal(logs, [["polar checkout failed", {
      status: 422,
      product_key: "pro_monthly",
      error: "validation_error",
      type: "request_validation_error",
      detail: [
        {
          loc: ["body", "products", 0],
          type: "value_error",
          msg: "Product is a draft.",
        },
        {
          loc: ["body", "customer_email"],
          type: "value_error",
          msg: "[redacted]",
        },
        {
          loc: ["body", "metadata", "[redacted]", "[redacted]"],
          type: "[redacted]",
          msg: "[redacted]",
        },
      ],
    }]]);
    const serialized = JSON.stringify(logs);
    for (
      const forbidden of [
        checkout.email,
        "Ada",
        "Lovelace",
        checkout.userId,
        checkout.productId,
        checkout.attemptId,
        checkout.dispatchToken,
        "private-access-token",
        "fixture-catalog",
        '"input":',
        '"ctx":',
        '"request":',
      ]
    ) {
      if (serialized.includes(forbidden)) {
        throw new Error("PII/request leaked into diagnostic");
      }
    }
  } finally {
    console.error = previous;
  }
});

Deno.test("diagnostic preserves technical archive/missing errors and bounds messages and paths", async () => {
  const result = await polarCheckoutDiagnostic(
    Response.json({
      error: "Ada Lovelace",
      type: "buyer@example.invalid",
      detail: [
        {
          loc: ["body", "product_price_id"],
          type: "value_error",
          msg: "Price is archived.",
        },
        {
          loc: ["body", "success_url"],
          type: "missing",
          msg: "Field required",
        },
        {
          loc: ["body", ...Array(100).fill("buyer@example.invalid")],
          type: "value_error",
          msg: "Ada Lovelace ".repeat(100),
        },
      ],
    }),
    "buyer@example.invalid",
  );
  equal([result.error, result.type, result.product_key], [
    "[redacted]",
    "[redacted]",
    "[redacted]",
  ]);
  equal(result.detail[0], {
    loc: ["body", "product_price_id"],
    type: "value_error",
    msg: "Price is archived.",
  });
  equal(result.detail[1].msg, "Field required");
  if (
    result.detail.some((item) => item.msg.length > 200 || item.loc.length > 8)
  ) throw new Error("Unbounded diagnostic");
});

Deno.test("non-JSON, oversized and failed response streams only log status/product", async () => {
  const streams = [
    new Response("<html>buyer@example.invalid Ada Lovelace</html>", {
      status: 500,
    }),
    new Response(JSON.stringify({ detail: "Ada Lovelace".repeat(1000) }), {
      status: 422,
    }),
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("Ada Lovelace"));
        },
      }),
      { status: 400 },
    ),
  ];
  for (const response of streams) {
    const result = await polarCheckoutDiagnostic(response, "pro_monthly");
    equal(result, {
      status: response.status,
      product_key: "pro_monthly",
      error: null,
      type: null,
      detail: [],
    });
  }
});

Deno.test("standard CheckoutCreate uses current product contract; native email is optional", async () => {
  const previous = console.error;
  let logs = 0;
  console.error = () => {
    logs++;
  };
  try {
    for (const email of [checkout.email, null]) {
      await createPolarCheckoutSession({ ...checkout, email }, {
        ...deps,
        fetchFn: async (input, init) => {
          const body = await new Request(input, init).json();
          equal(body.products, [checkout.productId]);
          equal(body.product_price_id, undefined);
          equal(body.product_id, undefined);
          equal(body.prices, undefined);
          equal(body.external_customer_id, checkout.userId);
          equal(body.customer_email, email ?? undefined);
          equal(body.customer_name, undefined);
          equal(body.allow_discount_codes, false);
          equal(body.allow_trial, false);
          equal(body.discount_id, undefined);
          equal(body.trial_interval, undefined);
          equal(body.success_url, deps.getSuccessUrl());
          equal(body.return_url, deps.getCancelUrl());
          return Response.json({
            id: "fixture-checkout",
            url: "https://polar.sh/checkout/fixture",
          }, { status: 201 });
        },
      });
    }
    equal(logs, 0);
  } finally {
    console.error = previous;
  }
});

Deno.test("stalled diagnostic body is cancelled instead of blocking the checkout failure", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('{"detail":"buyer@example.invalid'),
        );
      },
      cancel() {
        cancelled = true;
      },
    }),
    { status: 422 },
  );
  // The 250ms production deadline itself is under test; no arbitrary sleep.
  const result = await polarCheckoutDiagnostic(response, "pro_monthly");
  equal(cancelled, true);
  equal(result, {
    status: 422,
    product_key: "pro_monthly",
    error: null,
    type: null,
    detail: [],
  });
});
