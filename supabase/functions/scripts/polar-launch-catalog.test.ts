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
  runCatalog,
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
        creatorPrice(p.normal_cents),
      ],
    ),
    [
      ["pro_monthly", 599, 399, 479],
      ["pro_annual", 5999, 3990, 4799],
      ["pro_plus_monthly", 999, 699, 799],
      ["pro_plus_annual", 9990, 6990, 7992],
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
    name: "Vantare Pro",
    description:
      "- Toda la aplicación publicada en **Stable**.\n- Soporte en **Discord**.",
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
  products.push({
    id: sandbox.checkout_keys.launch_lifetime.polar_product_id,
    organization_id: sandbox.organization_id,
    name: "Vantare Launch Edition",
    description:
      "- Acceso de por vida a los módulos existentes al comprar y sus mejoras, incluido **Engineer** en la edición inicial.\n- Acceso a tests, encuestas y builds de **Testers**, sin Nightly.\n- Los módulos completamente nuevos pueden venderse aparte.",
    recurring_interval: null,
    is_archived: false,
    visibility: "public",
    metadata: { vantare_checkout_key: "launch_lifetime" },
    prices: [{
      id: sandbox.checkout_keys.launch_lifetime.polar_price_ids[0],
      amount_type: "fixed",
      price_amount: 3000,
      price_currency: "eur",
      tax_behavior: "inclusive",
    }],
  });
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
    Object.assign(resource, data);
    if (data.prices) {
      resource.prices = data.prices.map((p) => ({ ...p, id: id() }));
    }
    return Promise.resolve(structuredClone(resource));
  };
  return { http, products, discounts, links, writes, organization };
}
const options = {
  environment: "sandbox" as const,
  creator: "ISAAC",
};

Deno.test("once launch discounts use normal products and renew at normal prices; rerun is inert", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  assertEquals(first.writes, 8);
  assertEquals(f.products.length, 5); // four normal plans + historical Launch, never separate launch products
  for (const plan of PRICES.plans) {
    const config = first.map.checkout_keys[plan.key]!;
    assertEquals(config.polar_launch_product_id, undefined);
    const product = f.products.find((p) => p.id === config.polar_product_id)!;
    assertEquals(
      product.prices!.filter((p) => !p.is_archived)[0].price_amount,
      plan.normal_cents,
    );
    const discount = f.discounts.find((d) =>
      d.id === config.polar_launch_discount_id
    )!;
    assertEquals(discount.duration, "once");
    assertEquals(discount.type, "fixed");
    assertEquals(discount.duration_in_months ?? null, null);
    assertEquals(discount.amounts, {
      eur: plan.normal_cents - plan.launch_cents,
    });
    assertEquals(discount.starts_at, PRICES.launch_windows.sandbox.starts_at);
    assertEquals(discount.ends_at, PRICES.launch_windows.sandbox.ends_at);
    assertEquals(discount.products, [{ id: product.id }]);
    assertEquals(discount.code ?? null, null);
    assertEquals(
      first.offers[`${plan.key}:launch`].renewal_cents,
      plan.normal_cents,
    );
  }
  const loaded = loadPolarProductMap(JSON.stringify(first.map), {
    environment: "sandbox",
    trialAntiAbuseConfirmed: true,
  });
  assertEquals(loaded.ok, true);
  assertEquals((await syncCatalog(f.http, first, options)).writes, 0);
  assertEquals(f.links, []);
});
Deno.test("offline plan is production-ready with once fixed EUR amounts and normal renewals", () => {
  const plan = planOffline("ISAAC");
  assertEquals(plan.production_apply_ready, false);
  assertEquals(plan.production_model_ready, true);
  assertEquals(plan.production_apply_blockers, ["live_inventory_not_checked"]);
  assertEquals(
    plan.plans.map(
      (p) => [
        p.launch_discount.duration,
        p.launch_discount.amounts.eur,
        p.renewal_cents,
      ],
    ),
    [["once", 200, 599], ["once", 2009, 5999], ["once", 300, 999], [
      "once",
      3000,
      9990,
    ]],
  );
  assertEquals(plan.creator_discount?.combinable_with_launch, true);
  assertEquals(plan.application_checkout.allow_discount_codes, false);
  assertEquals(plan.founders.ends_at, null);
  assertEquals(plan.creator_commission, PRICES.creator_commission);
});
Deno.test("creator discount is separate and scoped to normal products; mapping preserves exact case", async () => {
  const f = fake();
  const result = await syncCatalog(f.http, sandbox, {
    ...options,
    creator: "MiCodigo",
  });
  const id = result.map.creator_discounts?.MiCodigo;
  const discount = f.discounts.find((d) => d.id === id)!;
  assertEquals(discount.type, "percentage");
  assertEquals(discount.duration, "repeating");
  assertEquals(
    discount.duration_in_months,
    PRICES.creator_renewals.monthly_duration_months,
  );
  assertEquals(
    discount.products!.map((p) => p.id).sort(),
    PRICES.plans.filter((p) => p.interval === "month").map((p) =>
      result.map.checkout_keys[p.key]!.polar_product_id
    )
      .sort(),
  );
  const annual = f.discounts.find((d) =>
    d.id === result.map.creator_annual_discounts?.MiCodigo
  )!;
  assertEquals(
    annual.duration_in_months,
    PRICES.creator_renewals.annual_duration_months,
  );
  assertEquals(
    annual.products!.map((p) => p.id).sort(),
    PRICES.plans.filter((p) => p.interval === "year").map((p) =>
      result.map.checkout_keys[p.key]!.polar_product_id
    ).sort(),
  );
  assertEquals(annual.code ?? null, null);
  assertEquals(discount.code ?? null, null);
  assertEquals(result.map.creator_discounts?.MICODIGO, undefined);
  assertEquals(result.offers["pro_monthly:creator:MiCodigo"].final_cents, 599);
});
Deno.test("retired Launch never enters offers or writes; historical lookup remains refundable", async () => {
  const f = fake();
  const id = sandbox.checkout_keys.launch_lifetime.polar_product_id;
  f.products.splice(f.products.findIndex((p) => p.id === id), 1);
  const result = await syncCatalog(f.http, sandbox, options);
  assertEquals(
    result.map.checkout_keys.launch_lifetime,
    sandbox.checkout_keys.launch_lifetime,
  );
  assertEquals(resolveCheckoutKey(result.map, "launch_lifetime").ok, false);
  assertEquals(result.offers.launch_lifetime, undefined);
  assertEquals(
    f.writes.some((w) => (w as { path: string }).path.includes(id)),
    false,
  );
});
Deno.test("discount drift in duration, amount, dates, scope or code aborts before mutations", async () => {
  for (
    const mutation of [
      { duration: "forever" },
      { is_archived: true },
      { amounts: { eur: 199 } },
      { ends_at: null },
      { products: [] },
      { code: "LEAK" },
    ]
  ) {
    const f = fake();
    const first = await syncCatalog(f.http, sandbox, options);
    Object.assign(f.discounts.find((d) => d.duration === "once")!, mutation);
    f.products[0].description = "Needs repair";
    const count = f.writes.length;
    await assertRejects(() => syncCatalog(f.http, first, options));
    assertEquals(f.writes.length, count);
  }
});
Deno.test("price replacement preserves registered historical prices and fails closed on unregistered history", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  const p = f.products[0];
  const old = p.prices![0].id;
  p.prices![0].price_amount = 499;
  const second = await syncCatalog(f.http, first, options);
  assertEquals(resolveCheckoutKeyByPriceId(second.map, old).ok, true);
  assertEquals(
    resolveCheckoutKeyByPriceId(second.map, p.prices![0].id).ok,
    true,
  );
  p.prices = [{
    ...p.prices![0],
    id: "00000000-0000-4000-8000-000000000999",
    price_amount: 499,
  }];
  const count = f.writes.length;
  await assertRejects(() => syncCatalog(f.http, second, options));
  assertEquals(f.writes.length, count);
});
Deno.test("lost product, price or discount responses can be safely retried by metadata and history", async () => {
  for (const path of ["/products/", "/discounts/"]) {
    const f = fake();
    let fail = true;
    const http: Http = async (method, resource, body) => {
      const result = await f.http(method, resource, body);
      if (fail && method === "POST" && resource === path) {
        fail = false;
        throw Error("lost response");
      }
      return result;
    };
    await assertRejects(() => syncCatalog(http, sandbox, options));
    const second = await syncCatalog(f.http, sandbox, options);
    assertEquals(f.products.length, 5);
    assertEquals(f.discounts.length, 6);
    assertEquals((await syncCatalog(f.http, second, options)).writes, 0);
  }
});
Deno.test("organization, foreign price ownership, ambiguity and creator guards fail before writes", async () => {
  for (
    const mode of ["organization", "price-owner", "ambiguous", "portal", "code"]
  ) {
    const f = fake();
    const input = structuredClone(sandbox);
    if (mode === "organization") f.organization.id = "foreign";
    if (mode === "price-owner") {
      f.products[0].prices![0].id =
        input.checkout_keys.pro_annual.polar_price_ids[0];
    }
    if (mode === "ambiguous") {
      f.products.push({
        ...f.products[0],
        id: "00000000-0000-4000-8000-000000000777",
        metadata: { vantare_checkout_key: "pro_monthly" },
      });
    }
    if (mode === "portal") {
      f.organization.customer_portal_settings.subscription.update_plan = true;
    }
    if (mode === "code") {
      f.discounts.push({
        id: "foreign",
        organization_id: sandbox.organization_id,
        code: "isaac",
      });
    }
    await assertRejects(() => syncCatalog(f.http, input, options));
    assertEquals(f.writes.length, 0);
  }
});
Deno.test("CLI requires explicit production confirmation and refuses unsafe paths", () => {
  for (
    const args of [
      ["--environment", "production", "--apply", "--map", "a", "--output", "b"],
      ["--environment", "production", "--apply", "--confirm-production"],
      ["--environment", "sandbox", "--map", ".env"],
      ["--environment", "sandbox", "--map", "same", "--output", "same"],
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
  assertEquals(
    parseArgs(["--environment", "production"]).flags.has("--apply"),
    false,
  );
});
Deno.test("Founders: ES one-time founder price, no deadline, no creation of Isaac product", async () => {
  const f = fake();
  const plan = planOffline();
  assertEquals(plan.founders.amount_cents, 5000);
  assertEquals(plan.founders.ends_at, null);
  assertEquals(plan.founders.description.includes("beta pública"), true);
  assertEquals(plan.founders.name.includes("Precio de fundador"), true);
  const input = structuredClone(sandbox) as unknown as Record<string, any>;
  const id = "00000000-0000-4000-8000-000000001661";
  input.checkout_keys.founders = {
    ...input.checkout_keys.launch_lifetime,
    polar_product_id: id,
    polar_price_ids: ["00000000-0000-4000-8000-000000001662"],
    plan_sku: "founders",
    capabilities: ["vantare.plan.founders", "vantare.channel.nightly"],
    channels: ["stable", "nightly"],
    launch_scope_version: null,
  };
  input.product_id_to_checkout_key[id] = "founders";
  input.price_id_to_checkout_key["00000000-0000-4000-8000-000000001662"] =
    "founders";
  f.products.push({
    id,
    organization_id: sandbox.organization_id,
    name: "Old",
    recurring_interval: null,
    prices: [{
      id: "00000000-0000-4000-8000-000000001662",
      amount_type: "fixed",
      price_amount: 5000,
      price_currency: "eur",
      tax_behavior: null,
    }],
  });
  const result = await syncCatalog(f.http, input, options);
  assertEquals(result.offers.founders.final_cents, 5000);
  assertEquals(result.offers.founders.renewal_cents, 0);
  assertEquals((await syncCatalog(f.http, result, options)).writes, 0);
});

Deno.test("sandbox: organization-token POSTs omit organization_id in every resource", async () => {
  const f = fake();
  const posted = new Set<string>();
  let verified = false;
  const http: Http = async (method, path, body) => {
    if (
      method === "GET" && path === `/organizations/${sandbox.organization_id}`
    ) {
      verified = true;
    }
    if (method === "POST") {
      assertEquals(verified, true);
      assertEquals(Object.hasOwn(body as object, "organization_id"), false);
      posted.add(path);
    }
    return await f.http(method, path, body);
  };
  const first = await syncCatalog(http, sandbox, options);
  for (const product of f.products) product.visibility = "public";
  const linked = await syncCatalog(http, first, options);
  assertEquals([...posted].sort(), [
    "/discounts/",
    "/products/",
  ]);
  assertEquals((await syncCatalog(http, linked, options)).writes, 0);
});

Deno.test("sandbox: organization identity is checked even without creator offers", async () => {
  const f = fake();
  f.organization.id = "foreign";
  await assertRejects(() =>
    syncCatalog(f.http, sandbox, { environment: "sandbox" })
  );
  assertEquals(f.writes.length, 0);
});

Deno.test("sandbox output: failed apply leaves no file and same path can be retried", async () => {
  const dir = await Deno.makeTempDir({ prefix: "catalog-1620-" });
  const input = `${dir}/input.json`;
  const output = `${dir}/output.json`;
  const tokenBefore = Deno.env.get("POLAR_ACCESS_TOKEN");
  Deno.env.set("POLAR_ACCESS_TOKEN", "fixture-organization-token");
  try {
    await Deno.writeTextFile(input, JSON.stringify(sandbox));
    const args = [
      "--environment",
      "sandbox",
      "--map",
      input,
      "--output",
      output,
      "--creator",
      "ISAAC",
      "--apply",
    ];
    const f = fake();
    let fail = true;
    let requests = 0;
    const fetcher: typeof fetch = async (url, init) => {
      requests++;
      await assertRejects(() => Deno.stat(output), Deno.errors.NotFound);
      if (fail && init?.method === "POST") {
        return new Response("{}", { status: 422 });
      }
      const path = new URL(String(url)).pathname.replace(/^\/v1/, "") +
        new URL(String(url)).search;
      return Response.json(
        await f.http(
          init?.method as "GET" | "POST" | "PATCH",
          path,
          init?.body ? JSON.parse(String(init.body)) : undefined,
        ),
      );
    };
    await assertRejects(() => runCatalog(args, fetcher));
    await assertRejects(() => Deno.stat(output), Deno.errors.NotFound);
    fail = false;
    await runCatalog(args, fetcher);
    const saved = JSON.parse(await Deno.readTextFile(output));
    assertEquals(saved.map.catalog_version, PRICES.catalog_version);
    assertEquals(saved.writes, 8);
    const before = requests;
    const contents = await Deno.readTextFile(output);
    await assertRejects(
      () => runCatalog(args, fetcher),
      Deno.errors.AlreadyExists,
    );
    assertEquals(requests, before);
    assertEquals(await Deno.readTextFile(output), contents);
  } finally {
    if (tokenBefore === undefined) Deno.env.delete("POLAR_ACCESS_TOKEN");
    else Deno.env.set("POLAR_ACCESS_TOKEN", tokenBefore);
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("sandbox diagnostics: 4xx exposes only type/loc/msg with token redacted", async () => {
  const dir = await Deno.makeTempDir({ prefix: "catalog-1620-" });
  const input = `${dir}/input.json`;
  const output = `${dir}/output.json`;
  const token = "fixture-organization-token";
  const tokenBefore = Deno.env.get("POLAR_ACCESS_TOKEN");
  Deno.env.set("POLAR_ACCESS_TOKEN", token);
  const validation = {
    type: "organization_token",
    loc: ["body", "organization_id"],
    msg:
      "Setting organization_id is disallowed when using an organization token.",
  };
  try {
    await Deno.writeTextFile(input, JSON.stringify(sandbox));
    const args = [
      "--environment",
      "sandbox",
      "--map",
      input,
      "--output",
      output,
      "--apply",
    ];
    for (const status of [400, 401, 403, 422, 429]) {
      const f = fake();
      const fetcher: typeof fetch = async (url, init) => {
        if (init?.method === "GET") {
          const parsed = new URL(String(url));
          return Response.json(
            await f.http(
              "GET",
              parsed.pathname.replace(/^\/v1/, "") + parsed.search,
            ),
          );
        }
        return Response.json({
          detail: [{
            ...validation,
            input: token,
            ctx: { Authorization: `Bearer ${token}` },
          }],
          headers: { Authorization: `Bearer ${token}` },
          client_secret: "fixture-private-body",
        }, { status, headers: { "X-Private": "fixture-private-header" } });
      };
      await assertRejects(() => runCatalog(args, fetcher), (error: unknown) => {
        const message = (error as Error).message;
        assertEquals(
          message.startsWith(`Polar HTTP ${status} (POST); validation: `),
          true,
        );
        assertEquals(JSON.parse(message.split("; validation: ")[1]), [
          validation,
        ]);
        for (
          const hidden of [
            token,
            "Authorization",
            "fixture-private-body",
            "fixture-private-header",
            "input",
            "ctx",
          ]
        ) assertEquals(message.includes(hidden), false);
        return true;
      });
    }
    // Even allowlisted values may echo the credential; never print it.
    const echoed = {
      type: token,
      loc: ["body", token, 0],
      msg: `Invalid Bearer ${token}`,
    };
    await assertRejects(
      () =>
        runCatalog(
          args,
          () => Promise.resolve(Response.json(echoed, { status: 422 })),
        ),
      (error: unknown) => {
        const message = (error as Error).message;
        assertEquals(message.includes(token), false);
        assertEquals(JSON.parse(message.split("; validation: ")[1]), [{
          type: "[REDACTED]",
          loc: ["body", "[REDACTED]", 0],
          msg: "Invalid Bearer [REDACTED]",
        }]);
        return true;
      },
    );
    for (
      const [status, body] of [
        [422, "not JSON"],
        [400, '{"detail":"fixture-private-body"}'],
        [422, '{"detail":[null,{"type":{},"loc":[],"msg":"bad"}]}'],
        [500, JSON.stringify({ detail: [validation] })],
      ] as const
    ) {
      await assertRejects(
        () =>
          runCatalog(
            args,
            () => Promise.resolve(new Response(body, { status })),
          ),
        { message: `Polar HTTP ${status} (GET); response body withheld` },
      );
    }
    await assertRejects(() => Deno.stat(output), Deno.errors.NotFound);
  } finally {
    if (tokenBefore === undefined) Deno.env.delete("POLAR_ACCESS_TOKEN");
    else Deno.env.set("POLAR_ACCESS_TOKEN", tokenBefore);
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("production apply uses normal-price products and once discounts with explicit confirmation (mock HTTP)", async () => {
  const dir = await Deno.makeTempDir({ prefix: "once-production-" });
  const input = `${dir}/input.json`, output = `${dir}/output.json`;
  const token = Deno.env.get("POLAR_ACCESS_TOKEN");
  Deno.env.set("POLAR_ACCESS_TOKEN", "fixture-only");
  try {
    const raw = { ...structuredClone(sandbox), environment: "production" };
    await Deno.writeTextFile(input, JSON.stringify(raw));
    const f = fake();
    let calls = 0;
    await runCatalog([
      "--environment",
      "production",
      "--map",
      input,
      "--output",
      output,
      "--apply",
      "--confirm-production",
    ], async (url, init) => {
      const parsed = new URL(String(url));
      assertEquals(parsed.host, "api.polar.sh");
      calls++;
      return Response.json(
        await f.http(
          init?.method as "GET" | "POST" | "PATCH",
          parsed.pathname.replace(/^\/v1/, "") + parsed.search,
          init?.body ? JSON.parse(String(init.body)) : undefined,
        ),
      );
    });
    assertEquals(calls > 0, true);
    const result = JSON.parse(await Deno.readTextFile(output));
    assertEquals(result.map.environment, "production");
    assertEquals(result.production_apply_ready, true);
    assertEquals(result.production_preflight.verified, true);
    assertEquals(result.offers["pro_annual:launch"].final_cents, 3990);
    assertEquals(result.offers["pro_annual:launch"].renewal_cents, 5999);
    assertEquals(f.discounts.every((d) => d.duration === "once"), true);
  } finally {
    if (token === undefined) Deno.env.delete("POLAR_ACCESS_TOKEN");
    else Deno.env.set("POLAR_ACCESS_TOKEN", token);
    await Deno.remove(dir, { recursive: true });
  }
});
Deno.test("pagination ambiguity and existing creator portal drift stop before writes", async () => {
  const f = fake();
  const http: Http = async (method, path, body) => {
    if (method === "GET" && path.startsWith("/products/")) {
      return {
        items: [structuredClone(f.products[0])],
        pagination: { max_page: 2 },
      };
    }
    return await f.http(method, path, body);
  };
  await assertRejects(() => syncCatalog(http, sandbox, options));
  assertEquals(f.writes.length, 0);
  const first = await syncCatalog(f.http, sandbox, options);
  f.organization.customer_portal_settings.subscription.update_plan = true;
  const count = f.writes.length;
  await assertRejects(() =>
    syncCatalog(f.http, first, { environment: "sandbox" })
  );
  assertEquals(f.writes.length, count);
});

Deno.test("R3 production aborts before writes on live customers, active subscriptions or orders", async () => {
  for (const resource of ["customers", "subscriptions", "orders"]) {
    const f = fake();
    const input = { ...structuredClone(sandbox), environment: "production" };
    const http: Http = async (method, path, body) => {
      if (method === "GET" && path.startsWith(`/${resource}/`)) {
        return {
          items: [{
            id: "fixture-associated",
            organization_id: sandbox.organization_id,
          }],
          pagination: { max_page: 1, total_count: 1 },
        };
      }
      return await f.http(method, path, body);
    };
    await assertRejects(() =>
      syncCatalog(http, input, { environment: "production" })
    );
    assertEquals(f.writes.length, 0);
  }
});
Deno.test("R3 production refuses unavailable or incomplete inventory before writes", async () => {
  for (
    const response of [{ items: [], pagination: { max_page: 1 } }, {
      items: [],
      pagination: { max_page: 2, total_count: 1 },
    }, null]
  ) {
    const f = fake();
    const http: Http = async (method, path, body) =>
      method === "GET" && path.startsWith("/customers/")
        ? response
        : await f.http(method, path, body);
    await assertRejects(() =>
      syncCatalog(http, {
        ...structuredClone(sandbox),
        environment: "production",
      }, { environment: "production" })
    );
    assertEquals(f.writes.length, 0);
  }
});

Deno.test("R3 readiness is derived from valid price model and live verification", () => {
  const original = PRICES.plans[0].normal_cents;
  try {
    PRICES.plans[0].normal_cents = PRICES.plans[0].launch_cents;
    const plan = planOffline();
    assertEquals(plan.production_model_ready, false);
    assertEquals(plan.production_apply_ready, false);
    assertEquals(
      plan.production_apply_blockers.includes("invalid_price_model_or_window"),
      true,
    );
  } finally {
    PRICES.plans[0].normal_cents = original;
  }
});

Deno.test("R3 checks the last affected product and transport failures before any write", async () => {
  for (const mode of ["last-product", "transport"]) {
    const f = fake();
    const first = await syncCatalog(f.http, sandbox, options);
    const input = {
      ...first,
      map: { ...first.map, environment: "production" },
    };
    const target = first.map.checkout_keys.pro_plus_annual!.polar_product_id;
    const count = f.writes.length;
    const http: Http = async (method, path, body) => {
      const query = new URL(`https://local.invalid${path}`);
      if (mode === "transport" && path.startsWith("/customers/")) {
        throw Error("inventory unavailable");
      }
      if (
        mode === "last-product" && path.startsWith("/subscriptions/") &&
        query.searchParams.get("product_id") === target
      ) {
        assertEquals(query.searchParams.get("active"), "true");
        return {
          items: [{ id: "fixture-active-sub" }],
          pagination: { max_page: 1, total_count: 1 },
        };
      }
      return await f.http(method, path, body);
    };
    await assertRejects(() =>
      syncCatalog(http, input, { environment: "production", creator: "ISAAC" })
    );
    assertEquals(f.writes.length, count);
  }
});
