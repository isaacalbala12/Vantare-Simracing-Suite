import {
  deepStrictEqual as assertEquals,
  rejects as assertRejects,
} from "node:assert/strict";
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
  resolveCheckoutKey,
  resolveCheckoutKeyByPriceId,
  resolveCheckoutKeyByProductId,
} from "../_shared/mapping.ts";

Deno.test("launch table: issue #1620 and creator extra 20% rounded to cents", () => {
  assertEquals(
    PRICES.plans.map(
      (p) => [
        p.key,
        p.normal_cents,
        p.launch_cents,
        creatorPrice(p.launch_cents),
      ],
    ),
    [
      ["pro_monthly", 599, 399, 319],
      ["pro_annual", 5990, 3990, 3192],
      ["pro_plus_monthly", 999, 699, 559],
      ["pro_plus_annual", 9990, 6990, 5592],
    ],
  );
});

function fake() {
  const organization = {
    id: sandbox.organization_id,
    customer_portal_settings: { subscription: { update_plan: false } },
  };
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
    visibility: "public",
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
  const links: Resource[] = [];
  const writes: unknown[] = [];
  const http: Http = (method, path, body) => {
    if (method === "GET" && path.startsWith("/organizations/")) {
      return Promise.resolve(structuredClone(organization));
    }
    const collection = path.startsWith("/products/")
      ? products
      : path.startsWith("/discounts/")
      ? discounts
      : links;
    if (method === "GET") {
      return Promise.resolve({
        items: structuredClone(collection),
        pagination: { max_page: 1, total_count: collection.length },
      });
    }
    if (method === "POST" && path.startsWith("/checkout-links/")) {
      const ids = (body as { products: string[] }).products;
      if (
        ids.some((id) =>
          products.find((p) => p.id === id)?.visibility === "draft"
        )
      ) {
        return Promise.reject(Error("Product is a draft"));
      }
    }
    writes.push({ method, path, body });
    const data = body as Resource;
    if (method === "POST") {
      const resource = {
        ...data,
        organization_id: data.organization_id ?? sandbox.organization_id,
        id: id(),
        is_archived: false,
        ...(path.startsWith("/checkout-links/")
          ? {
            url: "https://sandbox.polar.sh/checkout/fixture",
            client_secret: "fixture-not-exported",
          }
          : {}),
      };
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
  return { http, products, discounts, links, writes, organization };
}
const options = {
  environment: "sandbox" as const,
  creator: "ISAAC",
};

Deno.test("P1-1: creator discounts repeat for two months and reconcile without writes", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  const creatorDiscounts = f.discounts.filter((d) =>
    d.metadata?.vantare_offer_key?.startsWith("creator:")
  );
  assertEquals(creatorDiscounts.length, 1);
  for (const d of creatorDiscounts) {
    assertEquals(d.duration, "repeating");
    assertEquals(d.duration_in_months, 2);
  }
  assertEquals((await syncCatalog(f.http, first, options)).writes, 0);
});

Deno.test("P1-1: unlimited or wrong-length creator discount fails before mutations", async () => {
  for (const duration of ["forever", "repeating"]) {
    const f = fake();
    const first = await syncCatalog(f.http, sandbox, options);
    const d = f.discounts.find((d) =>
      d.metadata?.vantare_offer_key?.startsWith("creator:")
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
  assertEquals(first.writes, 7); // six draft products + one discount, link waits for publication
  assertEquals(
    first.map.checkout_keys.pro_monthly?.polar_product_id,
    sandbox.checkout_keys.pro_monthly.polar_product_id,
  );
  assertEquals(
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

Deno.test("catalog: decided annual launch prices are created without a confirmation gate", async () => {
  const f = fake();
  const r = await syncCatalog(f.http, sandbox, options);
  for (const p of PRICES.plans) {
    const id = r.map.checkout_keys[p.key]!.polar_launch_product_id;
    assertEquals(
      f.products.find((r) => r.id === id)!.prices![0].price_amount,
      p.launch_cents,
    );
  }
  assertEquals(f.discounts.length, 1);
});

Deno.test("catalog: replacing the base price keeps old price IDs mapped", async () => {
  const f = fake();
  f.products[0].prices![0].price_amount = 499;
  const result = await syncCatalog(f.http, sandbox, options);
  assertEquals(result.writes, 8);
  assertEquals(result.map.checkout_keys.pro_monthly?.polar_price_ids.length, 3);
  assertEquals(
    result.map
      .price_id_to_checkout_key[
        sandbox.checkout_keys.pro_monthly.polar_price_ids[0]
      ],
    "pro_monthly",
  );
});

Deno.test("P2-3: stale input requires saved observed active and archived IDs before PATCH", async () => {
  const f = fake();
  const active = "00000000-0000-4000-8000-000000000900";
  const archived = "00000000-0000-4000-8000-000000000901";
  const original = f.products[0].prices![0];
  f.products[0].prices = [
    { ...original, id: active, price_amount: 799 },
    { ...original, id: archived, price_amount: 499, is_archived: true },
  ];
  await assertRejects(() => syncCatalog(f.http, sandbox, options));
  assertEquals(f.writes.length, 0);
  const registered = structuredClone(sandbox);
  for (const id of [active, archived]) {
    registered.checkout_keys.pro_monthly.polar_price_ids.push(id);
    registered
      .price_id_to_checkout_key[
        id as keyof typeof registered.price_id_to_checkout_key
      ] = "pro_monthly";
  }
  const result = await syncCatalog(f.http, registered, options);
  for (const id of [active, archived, original.id]) {
    assertEquals(result.map.price_id_to_checkout_key[id], "pro_monthly");
    assertEquals(
      result.map.checkout_keys.pro_monthly!.polar_price_ids.includes(id),
      true,
    );
    assertEquals(resolveCheckoutKeyByPriceId(result.map, id).ok, true);
  }
  const second = await syncCatalog(f.http, result, options);
  assertEquals(second.writes, 0);
  assertEquals(second.map, result.map);
});

Deno.test("P2-3: observed price already owned by another plan aborts before writes", async () => {
  const f = fake();
  f.products[0].prices![0].id =
    sandbox.checkout_keys.pro_annual.polar_price_ids[0];
  f.products[0].prices![0].price_amount = 799;
  await assertRejects(() => syncCatalog(f.http, sandbox, options));
  assertEquals(f.writes.length, 0);
});

Deno.test("catalog: discount drift or code collision abort before any writes", async () => {
  for (const collision of [false, true]) {
    const f = fake();
    await syncCatalog(f.http, sandbox, options);
    const writes = f.writes.length;
    if (collision) {
      f.discounts.push({ ...f.discounts[0], id: "foreign-code", metadata: {} });
    } else f.discounts[0].basis_points = 1900;
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

Deno.test("P2-2: one exact creator code covers only separate launch products", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  assertEquals(f.discounts.length, 1);
  const d = f.discounts[0];
  assertEquals(d.code, "ISAAC");
  assertEquals(d.type, "percentage");
  assertEquals(d.basis_points, 2000);
  assertEquals(d.duration, "repeating");
  assertEquals(d.duration_in_months, 2);
  assertEquals(d.amounts, undefined);
  const launchIds: string[] = [];
  for (const p of PRICES.plans) {
    const config = first.map.checkout_keys[p.key]!;
    const launchId = config!.polar_launch_product_id!;
    launchIds.push(launchId);
    assertEquals(launchId === config!.polar_product_id, false);
    const product = f.products.find((r) => r.id === launchId)!;
    assertEquals(product.prices![0].price_amount, p.launch_cents);
    assertEquals(resolveCheckoutKeyByProductId(first.map, launchId).ok, true);
    const launch = resolveCheckoutKeyByProductId(first.map, launchId);
    assertEquals(launch.ok && launch.key, p.key);
    // App checkout continues to select the normal product with the same rights.
    const normal = resolveCheckoutKey(first.map, p.key);
    assertEquals(
      normal.ok && normal.config.polar_product_id,
      config!.polar_product_id,
    );
  }
  assertEquals(d.products!.map((p) => p.id).sort(), launchIds.sort());
  for (const p of PRICES.plans) {
    assertEquals(
      d.products!.some((r) =>
        r.id === first.map.checkout_keys[p.key]!.polar_product_id
      ),
      false,
    );
    assertEquals(
      planOffline("ISAAC").plans.find((r) => r.key === p.key)!.creator_code,
      "ISAAC",
    );
  }
  assertEquals(
    d.products!.some((r) =>
      r.id === sandbox.checkout_keys.launch_lifetime.polar_product_id
    ),
    false,
  );
});

Deno.test("P2-2: creator spelling is preserved and a second creator reuses launch products", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, {
    ...options,
    creator: "Isaac",
  });
  assertEquals(f.discounts.length, 1);
  assertEquals(f.discounts[0].code, "Isaac");
  const productIds = f.products.map((p) => p.id);
  const second = await syncCatalog(f.http, first, {
    ...options,
    creator: "MARIA",
  });
  assertEquals(f.discounts.length, 2);
  assertEquals(f.discounts[1].code, "MARIA");
  assertEquals(f.products.map((p) => p.id), productIds);
  assertEquals(
    (await syncCatalog(f.http, second, { ...options, creator: "MARIA" }))
      .writes,
    0,
  );
});

Deno.test("P2-2: own creator link selects only launch products and pins its discount", async () => {
  const f = fake();
  const draft = await syncCatalog(f.http, sandbox, options);
  assertEquals(draft.creator_link, null);
  assertEquals(
    draft.creator_link_pending,
    "publish_launch_products_then_rerun",
  );
  assertEquals(f.links.length, 0);
  // Simulate the separately authorized activation, never done by syncCatalog.
  for (const p of f.products) p.visibility = "public";
  const first = await syncCatalog(f.http, draft, options);
  assertEquals(first.writes, 1);
  assertEquals(first.creator_link_pending, null);
  assertEquals(f.links.length, 1);
  const link = f.links[0];
  assertEquals(link.discount_id, f.discounts[0].id);
  assertEquals(link.allow_discount_codes, false);
  assertEquals(
    link.products!.map((r) => r.id).sort(),
    f.discounts[0].products!.map((r) => r.id).sort(),
  );
  assertEquals(JSON.stringify(first).includes("fixture-not-exported"), false);
  assertEquals((await syncCatalog(f.http, first, options)).writes, 0);
  link.allow_discount_codes = true;
  const writes = f.writes.length;
  await assertRejects(() => syncCatalog(f.http, first, options));
  assertEquals(f.writes.length, writes);
});

Deno.test("P2-2: launch product mapping is explicit, symmetric and fails closed", () => {
  const id = "00000000-0000-4000-8000-000000000850";
  const raw = structuredClone(sandbox) as unknown as Record<string, unknown>;
  const keys = raw.checkout_keys as Record<string, Record<string, unknown>>;
  keys.pro_monthly.polar_launch_product_id = id;
  const inverse = raw.product_id_to_checkout_key as Record<string, string>;
  inverse[id] = "pro_monthly";
  const load = () =>
    loadPolarProductMap(JSON.stringify(raw), {
      environment: "sandbox",
      trialAntiAbuseConfirmed: true,
    });
  assertEquals(load().ok, true);
  delete inverse[id];
  assertEquals(load().ok, false);
  inverse[id] = "pro_annual";
  assertEquals(load().ok, false);
  inverse[id] = "pro_monthly";
  keys.pro_monthly.polar_launch_product_id = keys.pro_monthly.polar_product_id;
  assertEquals(load().ok, false);
  keys.pro_monthly.polar_launch_product_id = "invalid";
  assertEquals(load().ok, false);
});

Deno.test("catalog: launch products without a creator are base prices with no discounts or links", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, { environment: "sandbox" });
  assertEquals(f.discounts.length, 0);
  assertEquals(f.links.length, 0);
  assertEquals(first.creator_link, null);
  assertEquals(first.writes, 6);
  for (const p of PRICES.plans) {
    assertEquals(first.offers[`${p.key}:launch`].discount_id, null);
    assertEquals(first.offers[`${p.key}:launch`].final_cents, p.launch_cents);
    assertEquals(first.offers[`${p.key}:launch`].renewal_cents, p.launch_cents);
  }
  const next = await syncCatalog(f.http, sandbox, options); // recover partial run via owned metadata
  assertEquals(next.writes, 1);
  assertEquals(next.map, first.map);
});

Deno.test("catalog: scope/percentage drift and legacy composite discounts abort before writes", async () => {
  for (
    const problem of [
      "normal-scope",
      "empty-scope",
      "extra-scope",
      "duplicate-scope",
      "percentage",
      "legacy",
    ]
  ) {
    const f = fake();
    const first = await syncCatalog(f.http, sandbox, options);
    const d = f.discounts[0];
    if (problem === "normal-scope") {
      d.products![0].id = first.map.checkout_keys.pro_monthly!.polar_product_id;
    }
    if (problem === "empty-scope") d.products = [];
    if (problem === "extra-scope") {
      d.products!.push({
        id: sandbox.checkout_keys.launch_lifetime.polar_product_id,
      });
    }
    if (problem === "duplicate-scope") d.products![0] = d.products![1];
    if (problem === "percentage") d.basis_points = 2100;
    if (problem === "legacy") {
      d.metadata = { vantare_offer_key: "pro_monthly:creator:ISAAC" };
    }
    // An unrelated normal price also needs updating; preflight still writes nothing.
    f.products[0].prices![0].price_amount = 499;
    const writes = f.writes.length;
    await assertRejects(() => syncCatalog(f.http, first, options));
    assertEquals(f.writes.length, writes);
  }
});

Deno.test("P2-3: launch price replacement requires saved active and archived IDs", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  const launch = f.products.find((p) =>
    p.id === first.map.checkout_keys.pro_monthly!.polar_launch_product_id
  )!;
  const original = launch.prices![0];
  const active = "00000000-0000-4000-8000-000000000910";
  const archived = "00000000-0000-4000-8000-000000000911";
  launch.prices = [{ ...original, id: active, price_amount: 499 }, {
    ...original,
    id: archived,
    is_archived: true,
  }];
  const writes = f.writes.length;
  await assertRejects(() => syncCatalog(f.http, first, options));
  assertEquals(f.writes.length, writes);
  const registered = structuredClone(first);
  for (const id of [active, archived]) {
    registered.map.checkout_keys.pro_monthly!.polar_price_ids.push(id);
    registered.map.price_id_to_checkout_key[id] = "pro_monthly";
  }
  const next = await syncCatalog(f.http, registered, options);
  assertEquals(next.writes, 1);
  for (const id of [active, archived, original.id]) {
    assertEquals(resolveCheckoutKeyByPriceId(next.map, id).ok, true);
  }
  assertEquals((await syncCatalog(f.http, next, options)).writes, 0);
});

Deno.test("catalog: normal product cannot also claim a launch slot", async () => {
  const f = fake();
  f.products[0].metadata = { vantare_catalog_key: "pro_monthly:launch" };
  await assertRejects(() => syncCatalog(f.http, sandbox, options));
  assertEquals(f.writes.length, 0);
});

for (const visibility of ["public", "private"] as const) {
  Deno.test(`R1 P1: activated ${visibility} launch products create one idempotent creator link`, async () => {
    const f = fake();
    const draft = await syncCatalog(f.http, sandbox, options);
    for (const p of f.products) Object.assign(p, { visibility });
    const activated = await syncCatalog(f.http, draft, options);
    assertEquals(activated.creator_link?.id, f.links[0]?.id);
    assertEquals(activated.creator_link_pending, null);
    assertEquals(activated.writes, 1);
    assertEquals(f.links.length, 1);
    assertEquals((await syncCatalog(f.http, activated, options)).writes, 0);
  });
}

Deno.test("R1 P1: a remaining draft launch product keeps creator link pending", async () => {
  const f = fake();
  const draft = await syncCatalog(f.http, sandbox, options);
  for (const p of f.products) Object.assign(p, { visibility: "public" });
  f.products.find((p) => p.metadata?.vantare_catalog_key)!.visibility = "draft";
  const partial = await syncCatalog(f.http, draft, options);
  assertEquals(partial.creator_link, null);
  assertEquals(partial.writes, 0);
  assertEquals(f.links.length, 0);
});

Deno.test("R1 P2 scope: enabled portal plan changes block creator setup before writes", async () => {
  const f = fake();
  f.organization.customer_portal_settings.subscription.update_plan = true;
  await assertRejects(() => syncCatalog(f.http, sandbox, options));
  assertEquals(f.writes.length, 0);
});

Deno.test("R1 P2 scope: absent, malformed or foreign portal settings fail closed", async () => {
  for (
    const response of [
      {},
      { id: sandbox.organization_id },
      { id: sandbox.organization_id, customer_portal_settings: {} },
      {
        id: sandbox.organization_id,
        customer_portal_settings: { subscription: { update_plan: "false" } },
      },
      {
        id: "foreign",
        customer_portal_settings: { subscription: { update_plan: false } },
      },
    ]
  ) {
    const f = fake();
    const http: Http = (method, path, body) =>
      method === "GET" && path.startsWith("/organizations/")
        ? Promise.resolve(response)
        : f.http(method, path, body);
    await assertRejects(() => syncCatalog(http, sandbox, options));
    assertEquals(f.writes.length, 0);
  }
});

Deno.test("R1 P2 scope: existing creator discounts require portal guard even without creator option", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  f.organization.customer_portal_settings.subscription.update_plan = true;
  f.products[0].prices![0].price_amount = 499;
  const writes = f.writes.length;
  await assertRejects(() =>
    syncCatalog(f.http, first, { environment: "sandbox" })
  );
  assertEquals(f.writes.length, writes);
});

for (const launch of [false, true]) {
  Deno.test(`R1 P2 history: ${launch ? "launch" : "normal"} unmapped prices block PATCH and survive timeout after registration`, async () => {
    const f = fake();
    const first = await syncCatalog(f.http, sandbox, options);
    // Use the last plan so an early mutation in another slot would also be detected.
    const config = first.map.checkout_keys.pro_plus_annual!;
    const product = f.products.find((p) =>
      p.id ===
        (launch ? config.polar_launch_product_id : config.polar_product_id)
    )!;
    const original = product.prices![0];
    const active = "00000000-0000-4000-8000-000000000920";
    const archived = "00000000-0000-4000-8000-000000000921";
    product.prices = [
      { ...original, id: active, price_amount: 7990 },
      { ...original, id: archived, is_archived: true },
    ];
    const writes = f.writes.length;
    await assertRejects(() => syncCatalog(f.http, first, options));
    assertEquals(f.writes.length, writes);
    assertEquals(product.prices[0].id, active);

    // Operator saves both forward/inverse mappings before any destructive PATCH.
    const registered = structuredClone(first);
    for (const id of [active, archived]) {
      registered.map.checkout_keys.pro_plus_annual!.polar_price_ids.push(id);
      registered.map.price_id_to_checkout_key[id] = "pro_plus_annual";
    }
    const snapshot = structuredClone(registered);
    const timeout: Http = async (method, path, body) => {
      const response = await f.http(method, path, body);
      if (method === "PATCH") {
        throw Error("Simulated response lost after server committed PATCH");
      }
      return response;
    };
    await assertRejects(() => syncCatalog(timeout, registered, options));
    assertEquals(f.writes.length, writes + 1);
    assertEquals(product.prices.some((p) => p.id === active), false);
    assertEquals(registered, snapshot);
    const recovered = await syncCatalog(f.http, registered, options);
    for (const id of [original.id, active, archived, product.prices[0].id]) {
      assertEquals(resolveCheckoutKeyByPriceId(recovered.map, id).ok, true);
    }
    assertEquals(recovered.writes, 0);
    assertEquals((await syncCatalog(f.http, recovered, options)).writes, 0);
  });
}
