import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PolarDiscountClient, synchronizeDiscount } from "./polar.ts";

Deno.test("discount change uses PATCH only, no product or proration, then GET retry avoids a second write", async () => {
  let discount: string | null = null;
  const calls: string[] = [];
  const client = new PolarDiscountClient(
    "sandbox",
    "test",
    (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "PATCH") {
        assertEquals(JSON.parse(String(init.body)), { discount_id: "reward3" });
        discount = "reward3";
      }
      return Promise.resolve(Response.json({
        id: "sub",
        discount_id: discount,
        product_id: "product",
        amount: 599,
        currency: "eur",
        recurring_interval: "month",
        recurring_interval_count: 1,
        status: "active",
      }));
    },
  );
  const expected = {
    subscriptionId: "sub",
    productId: "product",
    normalCents: 599,
    discountId: "reward3",
  };
  assertEquals(await synchronizeDiscount(client, expected), true);
  assertEquals(await synchronizeDiscount(client, expected), false);
  assertEquals(calls.filter((c) => c.startsWith("PATCH")).length, 1);
});
Deno.test("lost PATCH response is recovered by GET without restarting repeating discount", async () => {
  let discount: string | null = null;
  let writes = 0;
  const client = new PolarDiscountClient(
    "sandbox",
    "test",
    (_url, init) => {
      if (init?.method === "PATCH") {
        discount = "reward6";
        writes++;
        throw new Error("lost response");
      }
      return Promise.resolve(Response.json({
        id: "sub",
        discount_id: discount,
        product_id: "product",
        amount: 599,
        currency: "eur",
        recurring_interval: "month",
        recurring_interval_count: 1,
        status: "active",
      }));
    },
  );
  const expected = {
    subscriptionId: "sub",
    productId: "product",
    normalCents: 599,
    discountId: "reward6",
  };
  await assertRejects(() => synchronizeDiscount(client, expected));
  assertEquals(await synchronizeDiscount(client, expected), false);
  assertEquals(writes, 1);
});
Deno.test("unexpected product, canceled subscription, unknown discount and remote errors fail closed", async () => {
  for (
    const remote of [
      {
        product_id: "changed",
        amount: 599,
        currency: "eur",
        recurring_interval: "month",
        recurring_interval_count: 1,
        status: "active",
        discount_id: null,
      },
      {
        product_id: "product",
        amount: 599,
        currency: "eur",
        recurring_interval: "month",
        recurring_interval_count: 1,
        status: "canceled",
        discount_id: null,
      },
      {
        product_id: "product",
        amount: 599,
        currency: "eur",
        recurring_interval: "month",
        recurring_interval_count: 1,
        status: "active",
        discount_id: "unmanaged",
      },
    ]
  ) {
    const client = new PolarDiscountClient(
      "sandbox",
      "test",
      () => Promise.resolve(Response.json({ id: "sub", ...remote })),
    );
    await assertRejects(() =>
      synchronizeDiscount(client, {
        subscriptionId: "sub",
        productId: "product",
        normalCents: 599,
        discountId: "reward",
        managedDiscountIds: [],
      })
    );
  }
  const client = new PolarDiscountClient(
    "sandbox",
    "test",
    () => Promise.resolve(new Response("private remote data", { status: 500 })),
  );
  await assertRejects(
    () => client.read("sub"),
    Error,
    "polar_discount_http_500",
  );
});
Deno.test("removing reward after spam uses explicit null", async () => {
  let seen: unknown;
  const client = new PolarDiscountClient("sandbox", "test", (_url, init) => {
    if (init?.method === "PATCH") seen = JSON.parse(String(init.body));
    return Promise.resolve(
      Response.json({
        id: "sub",
        discount_id: init?.method === "PATCH" ? null : "reward",
        product_id: "product",
        amount: 599,
        currency: "eur",
        recurring_interval: "month",
        recurring_interval_count: 1,
        status: "active",
      }),
    );
  });
  await synchronizeDiscount(client, {
    subscriptionId: "sub",
    productId: "product",
    normalCents: 599,
    discountId: null,
    managedDiscountIds: ["reward"],
  });
  assertEquals(seen, { discount_id: null });
});
Deno.test("annual, launch-price and wrong-currency subscriptions are never mutated", async () => {
  for (
    const remote of [
      {
        amount: 399,
        currency: "eur",
        recurring_interval: "month",
        recurring_interval_count: 1,
      },
      {
        amount: 599,
        currency: "eur",
        recurring_interval: "year",
        recurring_interval_count: 1,
      },
      {
        amount: 599,
        currency: "usd",
        recurring_interval: "month",
        recurring_interval_count: 1,
      },
    ]
  ) {
    const client = new PolarDiscountClient(
      "sandbox",
      "test",
      () =>
        Promise.resolve(
          Response.json({
            id: "sub",
            product_id: "product",
            status: "active",
            discount_id: null,
            ...remote,
          }),
        ),
    );
    await assertRejects(() =>
      synchronizeDiscount(client, {
        subscriptionId: "sub",
        productId: "product",
        normalCents: 599,
        discountId: "reward",
      })
    );
  }
});
