import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  creatorPrice,
  type Http,
  parseArgs,
  planOffline,
  PRICES,
  type Resource,
  syncCatalog,
} from "./polar-launch-catalog.ts";
import sandbox from "./polar-product-map.sandbox.json" with { type: "json" };
import {
  loadPolarProductMap,
  resolveCheckoutKeyByPriceId,
} from "../_shared/mapping.ts";

Deno.test("launch table: issue #1620 and creator extra 20% rounded to cents", () => {
  assertEquals(
    PRICES.plans.map(
      (p) => [
        p.key,
        p.normal_cents,
        p.launch_cents,
        creatorPrice(p.launch_cents),
        p.launch_confirmed,
      ],
    ),
    [
      ["pro_monthly", 599, 399, 319, true],
      ["pro_annual", 5990, 3990, 3192, false],
      ["pro_plus_monthly", 999, 699, 559, true],
      ["pro_plus_annual", 9990, 6990, 5592, false],
    ],
  );
});

function fake() {
  let next = 100;
  const id = () =>
    `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
  const products: Resource[] = PRICES.plans.slice(0, 2).map((p) => ({
    id: sandbox.checkout_keys[p.key as "pro_monthly" | "pro_annual"]
      .polar_product_id,
    organization_id: sandbox.organization_id,
    recurring_interval: p.interval,
    recurring_interval_count: 1,
    is_archived: false,
    metadata: {},
    prices: [{
      id: sandbox.checkout_keys[p.key as "pro_monthly" | "pro_annual"]
        .polar_price_ids[0],
      amount_type: "fixed",
      price_amount: p.normal_cents,
      price_currency: "eur",
      tax_behavior: "inclusive",
      is_archived: false,
    }],
    trial_interval: "day",
    trial_interval_count: 7,
  }));
  const discounts: Resource[] = [];
  const writes: unknown[] = [];
  const http: Http = (method, path, body) => {
    const collection = path.startsWith("/products/") ? products : discounts;
    if (method === "GET") {
      return Promise.resolve({
        items: structuredClone(collection),
        pagination: { max_page: 1, total_count: collection.length },
      });
    }
    writes.push({ method, path, body });
    const data = body as Resource;
    if (method === "POST") {
      const resource = { ...data, id: id(), is_archived: false };
      if (data.prices) {
        resource.prices = data.prices.map((p) => ({ ...p, id: id() }));
      }
      if (data.products) {
        resource.products = data.products.map((p) => ({
          id: p as unknown as string,
        }));
      }
      collection.push(resource);
      return Promise.resolve(structuredClone(resource));
    }
    const resource = collection.find((r) => path.split("/")[2] === r.id)!;
    resource.prices = data.prices?.map((p) => ({ ...p, id: id() }));
    return Promise.resolve(structuredClone(resource));
  };
  return { http, products, discounts, writes };
}
const options = {
  environment: "sandbox" as const,
  creator: "ISAAC",
  confirmAnnualLaunch: true,
};

Deno.test("P1-1: creator discounts repeat for two months and reconcile without writes", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  const creatorDiscounts = f.discounts.filter((d) =>
    d.metadata?.vantare_offer_key.includes(":creator:")
  );
  assertEquals(creatorDiscounts.length, 4);
  for (const d of creatorDiscounts) {
    assertEquals(d.duration, "repeating");
    assertEquals(d.duration_in_months, 2);
  }
  for (const d of f.discounts.filter((d) => !creatorDiscounts.includes(d))) {
    assertEquals(d.duration, "forever");
  }
  assertEquals((await syncCatalog(f.http, first, options)).writes, 0);
});

Deno.test("P1-1: unlimited or wrong-length creator discount fails before mutations", async () => {
  for (const duration of ["forever", "repeating"]) {
    const f = fake();
    const first = await syncCatalog(f.http, sandbox, options);
    const d = f.discounts.find((d) =>
      d.metadata?.vantare_offer_key.includes(":creator:")
    )!;
    d.duration = duration;
    Object.assign(d, {
      duration_in_months: duration === "repeating" ? 3 : null,
    });
    const writes = f.writes.length;
    await assertRejects(() => syncCatalog(f.http, first, options));
    assertEquals(f.writes.length, writes);
  }
});

Deno.test("P2-1: accounting output includes both commission periods on the amount paid", async () => {
  const expected = {
    basis: "amount_paid_by_customer",
    requires_active_subscription: true,
    automatic_payouts: false,
    schedule: [
      { from_month: 1, to_month: 1, basis_points: 3000 },
      { from_month: 2, to_month: 12, basis_points: 1000 },
    ],
    after_month_12: "renegotiate",
  };
  const f = fake();
  const result = await syncCatalog(f.http, sandbox, options);
  for (const output of [PRICES, planOffline("ISAAC"), result]) {
    const accounting = output as unknown as Record<string, unknown>;
    assertEquals(accounting.creator_commission, expected);
    assertEquals(accounting.creator_commission_basis_points, undefined);
    assertEquals(accounting.commission_basis_points, undefined);
  }
  // Accounting metadata never enters products or discount requests.
  assertEquals(JSON.stringify(f.writes).includes("commission"), false);
});

Deno.test("catalog: complete mapping, inherited IDs/trials preserved, rerun has zero writes", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  assertEquals(first.writes, 10); // two products + eight discounts
  assertEquals(
    first.map.checkout_keys.pro_monthly?.polar_product_id,
    sandbox.checkout_keys.pro_monthly.polar_product_id,
  );
  assertEquals<unknown>(
    first.map.checkout_keys.pro_monthly?.trial,
    sandbox.checkout_keys.pro_monthly.trial,
  );
  assertEquals(
    first.map.checkout_keys.pro_plus_annual?.capabilities,
    first.map.checkout_keys.pro_plus_monthly?.capabilities,
  );
  const loaded = loadPolarProductMap(JSON.stringify(first.map), {
    environment: "sandbox",
    trialAntiAbuseConfirmed: true,
  });
  assertEquals(loaded.ok, true);
  if (!loaded.ok) throw Error(loaded.message);
  for (const p of PRICES.plans) {
    const config = first.map.checkout_keys[p.key]!;
    for (const id of config.polar_price_ids) {
      assertEquals(resolveCheckoutKeyByPriceId(loaded.map, id).ok, true);
    }
  }
  const second = await syncCatalog(f.http, first, options);
  assertEquals(second.writes, 0);
  assertEquals(second.map, first.map);
  assertEquals(second.offers, first.offers);
});

Deno.test("catalog: pending annual launch not applied without confirmation", async () => {
  const f = fake();
  const r = await syncCatalog(f.http, sandbox, {
    ...options,
    confirmAnnualLaunch: false,
  });
  assertEquals(r.pending, ["pro_annual", "pro_plus_annual"]);
  assertEquals(f.discounts.length, 4);
});

Deno.test("catalog: replacing the base price keeps old price IDs mapped", async () => {
  const f = fake();
  f.products[0].prices![0].price_amount = 499;
  const result = await syncCatalog(f.http, sandbox, options);
  assertEquals(result.writes, 11);
  assertEquals(result.map.checkout_keys.pro_monthly?.polar_price_ids.length, 2);
  assertEquals(
    result.map
      .price_id_to_checkout_key[
        sandbox.checkout_keys.pro_monthly.polar_price_ids[0]
      ],
    "pro_monthly",
  );
});

Deno.test("catalog: discount drift or code collision abort before any writes", async () => {
  for (const collision of [false, true]) {
    const f = fake();
    await syncCatalog(f.http, sandbox, options);
    const writes = f.writes.length;
    if (collision) {
      f.discounts.push({ ...f.discounts[1], id: "foreign-code", metadata: {} });
    } else f.discounts[0].amounts = { eur: 201 };
    await assertRejects(() => syncCatalog(f.http, sandbox, options));
    assertEquals(f.writes.length, writes);
  }
});

Deno.test("catalog: pagination finds duplicate on a later page and fails closed", async () => {
  const f = fake();
  const http: Http = (method, path, body) => {
    if (method === "GET" && path.startsWith("/products/")) {
      const page = new URL(`https://fixture.invalid${path}`).searchParams.get(
        "page",
      );
      return Promise.resolve({
        items: page === "1" ? structuredClone(f.products) : [{
          ...f.products[0],
          id: "later",
          metadata: { vantare_checkout_key: "pro_monthly" },
        }],
        pagination: { max_page: 2 },
      });
    }
    return f.http(method, path, body);
  };
  await assertRejects(() => syncCatalog(http, sandbox, options));
  assertEquals(f.writes.length, 0);
});

Deno.test("catalog: CLI defaults offline and refuses production without confirmation", () => {
  assertEquals(
    parseArgs(["--environment", "sandbox"]).flags.has("--apply"),
    false,
  );
  for (
    const args of [
      [
        "--environment",
        "production",
        "--apply",
        "--map",
        "map.json",
        "--output",
        "result.json",
      ],
      ["--environment", "sandbox", "--apply"],
      ["--environment", "sandbox", "--map", ".env.local"],
      ["--environment", "sandbox", "--token", "never-accepted"],
    ]
  ) {
    let failed = false;
    try {
      parseArgs(args);
    } catch {
      failed = true;
    }
    assertEquals(failed, true);
  }
});

Deno.test("catalog: refuses wrong organization, environment and ambiguous products before writes", async () => {
  for (
    const problem of ["organization", "environment", "duplicate", "interval"]
  ) {
    const f = fake();
    let map = structuredClone(sandbox);
    if (problem === "organization") f.products[0].organization_id = "foreign";
    if (problem === "environment") map = { ...map, environment: "production" };
    if (problem === "duplicate") {
      f.products.push({
        ...f.products[0],
        id: "other",
        metadata: { vantare_checkout_key: "pro_monthly" },
      });
    }
    if (problem === "interval") f.products[1].recurring_interval = "month";
    await assertRejects(() => syncCatalog(f.http, map, options));
    assertEquals(f.writes.length, 0);
  }
});
