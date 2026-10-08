import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dryRunHttp, type Http, syncProPrices } from "./polar-pro-prices.ts";

const ORG = "00000000-0000-0000-0000-000000000100";
const MONTHLY = "00000000-0000-0000-0000-000000000003";

type FakePrice = Record<string, unknown> & { id: string };
type FakeProduct = {
  id: string;
  recurring_interval: string;
  is_archived: boolean;
  metadata: Record<string, string>;
  prices: FakePrice[];
  trial_interval?: string;
  trial_interval_count?: number;
};

/** Minimal in-memory Polar: PATCH archives omitted prices, as Polar does. */
function fakePolar(interval = "month") {
  let next = 1;
  const products = new Map<string, FakeProduct>([[MONTHLY, {
    id: MONTHLY,
    recurring_interval: interval,
    is_archived: false,
    metadata: {},
    prices: [{
      id: "price-old",
      is_archived: false,
      amount_type: "fixed",
      price_amount: 499,
      price_currency: "eur",
      tax_behavior: "inclusive",
    }],
  }]]);
  const writes: string[] = [];
  const newPrices = (body: { prices: Record<string, unknown>[] }) =>
    body.prices.map((price) => ({
      ...price,
      id: `price-${next++}`,
      is_archived: false,
    }));
  const http: Http = (method, path, body) => {
    if (method !== "GET") writes.push(`${method} ${path}`);
    const b = body as { prices: Record<string, unknown>[] } & FakeProduct;
    if (method === "GET" && path.startsWith("/products/?")) {
      return Promise.resolve({
        items: [...products.values()].filter((product) =>
          !product.is_archived &&
          product.metadata.vantare_checkout_key === "pro_annual"
        ),
      });
    }
    if (method === "POST") {
      const product: FakeProduct = {
        id: `product-${next++}`,
        recurring_interval: b.recurring_interval,
        is_archived: false,
        metadata: b.metadata,
        trial_interval: b.trial_interval,
        trial_interval_count: b.trial_interval_count,
        prices: newPrices(b),
      };
      products.set(product.id, product);
      return Promise.resolve(structuredClone(product));
    }
    const product = products.get(path.split("/")[2]);
    if (!product) return Promise.reject(new Error("404"));
    if (method === "PATCH") {
      if (b.trial_interval) {
        product.trial_interval = b.trial_interval;
        product.trial_interval_count = b.trial_interval_count;
      }
      for (const price of product.prices) price.is_archived = true;
      product.prices.push(...newPrices(b));
    }
    return Promise.resolve(structuredClone(product));
  };
  return { http, writes, products };
}

Deno.test("polar-pro-prices: first run sets 5,99/mes and creates 59,90/año, second run is a no-op", async () => {
  const polar = fakePolar();
  const options = { organizationId: ORG, proMonthlyProductId: MONTHLY };

  const first = await syncProPrices(polar.http, options);
  assertEquals(first.writes, 2);
  assertEquals(polar.writes, [`PATCH /products/${MONTHLY}`, "POST /products/"]);
  const monthly = polar.products.get(MONTHLY)!;
  assertEquals(
    monthly.prices.map((price) => [price.price_amount, price.is_archived]),
    [[499, true], [599, false]],
  );
  const annual = polar.products.get(first.pro_annual.product_id)!;
  assertEquals(monthly.trial_interval, "day");
  assertEquals(monthly.trial_interval_count, 7);
  assertEquals(annual.recurring_interval, "year");
  assertEquals(annual.trial_interval, "day");
  assertEquals(annual.trial_interval_count, 7);
  assertEquals(annual.prices[0].price_amount, 5990);
  assertEquals(annual.prices[0].tax_behavior, "inclusive");

  const second = await syncProPrices(polar.http, options);
  assertEquals(second.writes, 0);
  assertEquals(second.pro_monthly, first.pro_monthly);
  assertEquals(second.pro_annual, first.pro_annual);
  assertEquals(polar.writes.length, 2);
});

Deno.test("polar-pro-prices: refuses a monthly product id that is not monthly", async () => {
  const polar = fakePolar("year");
  await assertRejects(() =>
    syncProPrices(polar.http, {
      organizationId: ORG,
      proMonthlyProductId: MONTHLY,
    })
  );
  assertEquals(polar.writes, []);
});

Deno.test("polar-pro-prices: dry-run prints every planned write without network", async () => {
  const lines: string[] = [];
  const result = await syncProPrices(dryRunHttp((line) => lines.push(line)), {
    organizationId: ORG,
    proMonthlyProductId: MONTHLY,
  });
  assertEquals(result.writes, 2);
  assertEquals(lines.map((line) => line.split(" ").slice(0, 3).join(" ")), [
    `DRY-RUN GET /products/${MONTHLY}`,
    `DRY-RUN PATCH /products/${MONTHLY}`,
    `DRY-RUN GET /products/?organization_id=${ORG}&is_archived=false&metadata%5Bvantare_checkout_key%5D=pro_annual`,
    "DRY-RUN POST /products/",
  ]);
});
