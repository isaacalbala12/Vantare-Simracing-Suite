import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { synchronizeRenewalDiscount } from "./polar.ts";
import captured from "./fixtures/creator-renewal-sandbox.json" with {
  type: "json",
};

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
  subscriptionId = captured.launch.id,
) {
  const methods: string[] = [];
  return {
    methods,
    run: () =>
      synchronizeRenewalDiscount(subscriptionId, "sandbox", options, {
        getAccessToken: () => "offline-test-token",
        fetchFn: (_url, init) => {
          methods.push(init!.method!);
          if (init!.method === "PATCH") {
            assertEquals(JSON.parse(String(init!.body)), {
              discount_id: options.discountId,
            });
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

const annualExpected = {
  ...expected,
  productId: captured.annualLaunch.product_id,
  priceIds: [captured.annualLaunch.price_id],
  normalCents: 5999,
  interval: "year",
  discountId: captured.annualCreator.discount_id,
  managedIds: [null, captured.annualLaunch.discount_id, captured.annualCreator.discount_id],
};
Deno.test("ISA-1682 real annual 3990/5999 -> creator 4799 -> retry without PATCH", async () => {
  assertEquals(captured.annualLaunch.price_id === captured.launch.price_id, false);
  const test = replay([captured.annualLaunch, captured.annualCreator, captured.annualCreator], annualExpected, captured.annualLaunch.id);
  await test.run();
  await test.run();
  assertEquals(test.methods, ["GET", "PATCH", "GET"]);
});

Deno.test("ISA-1682 annual normal 5999 uses the real annual price and creator response", async () => {
  // Normal amount/no coupon constructed; both annual price and PATCH are real.
  const test = replay([{ ...captured.annualLaunch, amount: 5999, discount_id: null, discount: null }, captured.annualCreator], annualExpected, captured.annualLaunch.id);
  await test.run();
  assertEquals(test.methods, ["GET", "PATCH"]);
});

for (const [name, changes] of Object.entries({
  "creator normal amount": { amount: 599 },
  "creator zero amount": { amount: 0 },
  "creator arbitrary amount": { amount: 300 },
  "wrong discount identity": { discount: { ...captured.creator.discount, id: "foreign" } },
  "absent discount definition": { discount: null },
  "invalid percentage": { discount: { ...captured.creator.discount, basis_points: 10001 } },
  "fractional percentage": { discount: { ...captured.creator.discount, basis_points: 2000.5 } },
  "unknown discount type": { discount: { ...captured.creator.discount, type: "other" } },
})) {
  for (const stage of ["GET", "PATCH"] as const) {
    Deno.test(`ISA-1682 refuses ${name} on ${stage}`, async () => {
      const invalid = { ...captured.creator, ...changes };
      const test = replay(stage === "GET" ? [invalid] : [captured.launch, invalid]);
      await assertRejects(test.run);
      assertEquals(test.methods, stage === "GET" ? ["GET"] : ["GET", "PATCH"]);
    });
  }
}

for (const changes of [
  { amount: 400 },
  { discount: { ...captured.launch.discount, amounts: { usd: 200 } } },
  { discount: { ...captured.launch.discount, amounts: { eur: -200 } } },
  { discount: { ...captured.launch.discount, amounts: { eur: 200.5 } } },
]) {
  Deno.test("ISA-1682 inconsistent fixed launch amount or EUR discount blocks PATCH", async () => {
    const test = replay([{ ...captured.launch, ...changes }]);
    await assertRejects(test.run);
    assertEquals(test.methods, ["GET"]);
  });
}

Deno.test("ISA-1682 no discount requires normal amount and null definition", async () => {
  for (const changes of [{ amount: 0 }, { discount: captured.creator.discount }]) {
    const test = replay([{ ...captured.normal, id: captured.launch.id, ...changes }]);
    await assertRejects(test.run);
    assertEquals(test.methods, ["GET"]);
  }
});

Deno.test("ISA-1682 half-cent rounds the saving up, not the final amount", async () => {
  const definition = { ...captured.creator.discount, basis_points: 5000 };
  const test = replay([{ ...captured.creator, amount: 299, discount: definition }]);
  await test.run();
  assertEquals(test.methods, ["GET"]);
  const invalid = replay([{ ...captured.creator, amount: 300, discount: definition }]);
  await assertRejects(invalid.run);
  assertEquals(invalid.methods, ["GET"]);
});

for (const prices of [undefined, null, [], [captured.launch.price, captured.launch.price]]) {
  Deno.test("ISA-1682 prices cardinality fails before authorization or PATCH", async () => {
    let authorizations = 0;
    const test = replay([{ ...captured.launch, prices }], {
      ...expected,
      authorize: () => { authorizations++; return Promise.resolve(true); },
    });
    await assertRejects(test.run);
    assertEquals(test.methods, ["GET"]);
    assertEquals(authorizations, 0);
  });
}

const invalid = {
  "foreign subscription": { id: "foreign" },
  "foreign product": { product_id: "foreign" },
  "foreign discount": { discount_id: "foreign" },
  "missing discount": { discount_id: undefined },
  "foreign price": {
    price_id: "foreign",
    prices: [{ ...captured.launch.price, id: "foreign" }],
  },
  "conflicting price ID": { price_id: "foreign" },
  "missing prices": { prices: null },
  "empty prices": { prices: [] },
  "extra price": { prices: [captured.launch.price, captured.launch.price] },
  "wrong base amount": {
    prices: [{ ...captured.launch.price, price_amount: 399 }],
  },
  "wrong price product": {
    prices: [{ ...captured.launch.price, product_id: "foreign" }],
  },
  "custom price": {
    prices: [{ ...captured.launch.price, amount_type: "custom" }],
  },
  "non-catalog price": {
    prices: [{ ...captured.launch.price, source: "custom" }],
  },
  "USD base": { prices: [{ ...captured.launch.price, price_currency: "usd" }] },
  "USD subscription": { currency: "usd" },
  "wrong interval": { recurring_interval: "year" },
  "wrong price interval": {
    prices: [{ ...captured.launch.price, recurring_interval: "year" }],
  },
  "multiple cycles": { recurring_interval_count: 2 },
  "inactive": { status: "canceled" },
  "malformed amount": { amount: "479" },
  "negative amount": { amount: -1 },
  "excessive amount": { amount: 600 },
};
for (const [name, changes] of Object.entries(invalid)) {
  for (const stage of ["GET", "PATCH"] as const) {
    Deno.test(`ISA-1680 refuses ${name} on ${stage}`, async () => {
      const response = { ...captured.creator, ...changes };
      const test = replay(
        stage === "GET" ? [response] : [captured.launch, response],
      );
      await assertRejects(test.run);
      assertEquals(test.methods, stage === "GET" ? ["GET"] : ["GET", "PATCH"]);
    });
  }
}

Deno.test("ISA-1680 lost response retries an already discounted GET without writing again", async () => {
  const test = replay([{ ...captured.normal, id: captured.launch.id }, {
    error: "lost response",
  }, captured.creator]);
  await assertRejects(test.run);
  await test.run();
  assertEquals(test.methods, ["GET", "PATCH", "GET"]);
});

Deno.test("ISA-1680 durable authorization still blocks discounted subscription", async () => {
  const test = replay([captured.launch], {
    ...expected,
    authorize: () => Promise.resolve(false),
  });
  await assertRejects(test.run);
  assertEquals(test.methods, ["GET"]);
});

Deno.test("ISA-1680 refuses an unmanaged target before calling Polar", async () => {
  const test = replay([], { ...expected, discountId: "foreign" });
  await assertRejects(test.run);
  assertEquals(test.methods, []);
});

Deno.test("ISA-1680 refuses a PATCH that confirms a different managed discount", async () => {
  const test = replay([captured.launch, captured.launch]);
  await assertRejects(test.run);
  assertEquals(test.methods, ["GET", "PATCH"]);
});

Deno.test("ISA-1680 requires an authorized price even when the discount is already applied", async () => {
  const test = replay([captured.creator], { ...expected, priceIds: [] });
  await assertRejects(test.run);
  assertEquals(test.methods, ["GET"]);
});

Deno.test("ISA-1680 current prices need no deprecated price_id or price interval", async () => {
  const current = {
    ...captured.creator,
    price_id: undefined,
    prices: [{
      ...captured.creator.price,
      recurring_interval: undefined,
    }],
  };
  const test = replay([current]);
  await test.run();
  assertEquals(test.methods, ["GET"]);
});
