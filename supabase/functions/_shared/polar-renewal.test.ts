import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { synchronizeRenewalDiscount } from "./polar.ts";
import captured from "./fixtures/creator-renewal-sandbox.json" with { type: "json" };

// Field projection of real sandbox GET/PATCH responses, VANTA-117, 2026-10-16.
// Customer, checkout, metadata and payment details are deliberately absent.
const expected = {
  productId: captured.launch.product_id,
  priceIds: [captured.launch.price_id],
  normalCents: 599,
  interval: "month",
  discountId: captured.creator.discount_id,
  managedIds: [null, captured.launch.discount_id, captured.creator.discount_id],
  authorize: () => Promise.resolve(true),
};

function replay(
  responses: unknown[],
  options: typeof expected = expected,
) {
  const methods: string[] = [];
  return {
    methods,
    run: () => synchronizeRenewalDiscount(captured.launch.id, "sandbox", options, {
      getAccessToken: () => "offline-test-token",
      fetchFn: (_url, init) => {
        methods.push(init!.method!);
        if (init!.method === "PATCH") {
          assertEquals(JSON.parse(String(init!.body)), { discount_id: options.discountId });
        }
        if (!responses.length) throw Error("unexpected extra request");
        return Promise.resolve(Response.json(responses.shift()));
      },
    }),
  };
}

for (const name of ["launch", "normal"] as const) {
  Deno.test(`ISA-1680 real ${name} ${captured[name].amount} -> creator 479 -> retry without PATCH`, async () => {
    const test = replay([
      { ...captured[name], id: captured.launch.id },
      captured.creator,
      captured.creator,
    ]);
    await test.run();
    await test.run();
    assertEquals(test.methods, ["GET", "PATCH", "GET"]);
  });
}

for (const initialAmount of [3990, 5999]) {
  Deno.test(`ISA-1680 annual ${initialAmount}/5999 base -> creator 4799`, async () => {
    // Same captured subscription shape; amounts from the real annual order.
    const annual = structuredClone(captured.launch);
    annual.amount = initialAmount;
    annual.recurring_interval = "year";
    annual.price.price_amount = 5999;
    annual.price.recurring_interval = "year";
    annual.prices = [annual.price];
    const test = replay([annual, { ...annual, amount: 4799, discount_id: expected.discountId }], {
      ...expected, normalCents: 5999, interval: "year",
    });
    await test.run();
    assertEquals(test.methods, ["GET", "PATCH"]);
  });
}

const invalid = {
  "foreign product": { product_id: "foreign" },
  "foreign discount": { discount_id: "foreign" },
  "foreign price": { price_id: "foreign", prices: [{ ...captured.launch.price, id: "foreign" }] },
  "conflicting price ID": { price_id: "foreign" },
  "missing prices": { prices: null },
  "extra price": { prices: [captured.launch.price, captured.launch.price] },
  "wrong base amount": { prices: [{ ...captured.launch.price, price_amount: 399 }] },
  "wrong price product": { prices: [{ ...captured.launch.price, product_id: "foreign" }] },
  "custom price": { prices: [{ ...captured.launch.price, amount_type: "custom" }] },
  "USD base": { prices: [{ ...captured.launch.price, price_currency: "usd" }] },
  "USD subscription": { currency: "usd" },
  "wrong interval": { recurring_interval: "year" },
  "wrong price interval": { prices: [{ ...captured.launch.price, recurring_interval: "year" }] },
  "multiple cycles": { recurring_interval_count: 2 },
  "inactive": { status: "canceled" },
  "malformed amount": { amount: "479" },
};
for (const [name, changes] of Object.entries(invalid)) {
  for (const stage of ["GET", "PATCH"] as const) {
    Deno.test(`ISA-1680 refuses ${name} on ${stage}`, async () => {
      const response = { ...captured.creator, ...changes };
      const test = replay(stage === "GET" ? [response] : [captured.launch, response]);
      await assertRejects(test.run);
      assertEquals(test.methods, stage === "GET" ? ["GET"] : ["GET", "PATCH"]);
    });
  }
}

Deno.test("ISA-1680 lost response retries an already discounted GET without writing again", async () => {
  const test = replay([captured.normal, { error: "lost response" }, captured.creator]);
  await assertRejects(test.run);
  await test.run();
  assertEquals(test.methods, ["GET", "PATCH", "GET"]);
});

Deno.test("ISA-1680 durable authorization still blocks discounted subscription", async () => {
  const test = replay([captured.launch], {
    ...expected, authorize: () => Promise.resolve(false),
  });
  await assertRejects(test.run);
  assertEquals(test.methods, ["GET"]);
});
