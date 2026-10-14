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

// Literal customer copy approved by Isaac on 2026-10-14 (textos.json v3).
const approvedCopy = {
  "pro": {
    "name_normal": "Vantare Pro",
    "name_launch": "Vantare Pro · Lanzamiento",
    "description":
      "- **Todos los widgets**, sin la marca Vantare en el overlay.\n- **Cada widget nuevo**, en cuanto sale.\n- Overlays Studio con todos tus widgets, para **Le Mans Ultimate y ACC**.\n- Soporte en **Discord** y por correo.\n- Un equipo activo a la vez · cancelas cuando quieras · **14 días** para pedir el reembolso de la primera compra.",
  },
  "pro_plus": {
    "name_normal": "Vantare Pro Plus",
    "name_launch": "Vantare Pro Plus · Lanzamiento",
    "description":
      "- **Todo lo de Pro**: todos los widgets, sin marca, y cada widget nuevo.\n- **Versiones nightly**: lo nuevo, antes que nadie.\n- **Reconocimiento como apoyo** en Discord.\n- Tu cuota **financia lo que viene** en Vantare.\n- Un equipo activo a la vez · cancelas cuando quieras · **14 días** para pedir el reembolso de la primera compra.",
  },
  "launch_edition": {
    "name": "Vantare Launch Edition",
    "description":
      "- **Pago único, sin cuotas**: licencia para siempre que funciona sin conexión.\n- **Todo lo que tenga Pro** en la versión estable al cerrar la venta, sin la marca Vantare.\n- **Incluye estas funciones cuando se lancen, sin fechas:** Strategy Planner, Análisis de telemetría e Ingeniero local sin límite de uso.\n- Arreglos de errores graves; ninguna otra función nueva.\n- Un equipo activo a la vez · **14 días** para pedir el reembolso.",
  },
};

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
    name: approvedCopy.pro.name_normal,
    description: approvedCopy.pro.description,
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
    name: approvedCopy.launch_edition.name,
    description: approvedCopy.launch_edition.description,
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

Deno.test("customer copy: new subscriptions have commercial names and contracted Markdown", async () => {
  const f = fake();
  const result = await syncCatalog(f.http, sandbox, options);
  for (const plan of PRICES.plans) {
    const copy = plan.key.startsWith("pro_plus_")
      ? approvedCopy.pro_plus
      : approvedCopy.pro;
    const config = result.map.checkout_keys[plan.key]!;
    for (const launch of [false, true]) {
      const product = f.products.find((p) =>
        p.id ===
          (launch ? config.polar_launch_product_id : config.polar_product_id)
      )!;
      assertEquals(
        product.name,
        launch ? copy.name_launch : copy.name_normal,
      );
      assertEquals(product.description, copy.description);
      if (product.metadata?.vantare_catalog_key) {
        assertEquals(
          product.metadata.vantare_catalog_key,
          `${plan.key}:launch`,
        );
      }
    }
  }
});

Deno.test("customer copy: repairs all nine existing products with cosmetic PATCH only, history and rerun preserved", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  for (const [i, product] of f.products.entries()) {
    product.name = `Vantare ${
      product.metadata?.vantare_catalog_key ?? product.id
    }`;
    product.description = "Texto antiguo";
    const historyId = `00000000-0000-4000-8000-${
      String(900 + i).padStart(12, "0")
    }`;
    product.prices!.push({
      ...product.prices![0],
      id: historyId,
      is_archived: true,
    });
    const key = first.map.product_id_to_checkout_key[product.id];
    first.map.checkout_keys[key]!.polar_price_ids.push(historyId);
    first.map.price_id_to_checkout_key[historyId] = key;
  }
  const before = structuredClone(f.products);
  const start = f.writes.length;
  const repaired = await syncCatalog(f.http, first, options);
  assertEquals(repaired.writes, 9);
  const patches = f.writes.slice(start) as {
    method: string;
    path: string;
    body: Record<string, unknown>;
  }[];
  assertEquals(patches.length, 9);
  for (const patch of patches) {
    assertEquals(patch.method, "PATCH");
    assertEquals(patch.path.startsWith("/products/"), true);
    assertEquals(Object.keys(patch.body).sort(), ["description", "name"]);
  }
  for (let i = 0; i < before.length; i++) {
    const { name: _name, description: _description, ...rest } = f.products[i];
    const { name: _oldName, description: _oldDescription, ...oldRest } =
      before[i];
    assertEquals(rest, oldRest);
  }
  const lifetime = f.products.find((p) =>
    p.id === sandbox.checkout_keys.launch_lifetime.polar_product_id
  )!;
  assertEquals(lifetime.name, approvedCopy.launch_edition.name);
  assertEquals(lifetime.description, approvedCopy.launch_edition.description);
  assertEquals(
    repaired.map.checkout_keys.launch_lifetime,
    first.map.checkout_keys.launch_lifetime,
  );
  assertEquals(
    repaired.map.price_id_to_checkout_key,
    first.map.price_id_to_checkout_key,
  );
  assertEquals((await syncCatalog(f.http, repaired, options)).writes, 0);
});

Deno.test("customer copy: Launch Edition missing or recurring aborts before any writes", async () => {
  for (const problem of ["missing", "recurring", "archived"]) {
    const f = fake();
    const index = f.products.findIndex((p) =>
      p.id === sandbox.checkout_keys.launch_lifetime.polar_product_id
    );
    if (problem === "missing") f.products.splice(index, 1);
    if (problem === "recurring") f.products[index].recurring_interval = "month";
    if (problem === "archived") f.products[index].is_archived = true;
    await assertRejects(() => syncCatalog(f.http, sandbox, options));
    assertEquals(f.writes.length, 0);
  }
});

Deno.test("customer copy: a rejected cosmetic update fails, and a committed lost response can be retried", async () => {
  const f = fake();
  const first = await syncCatalog(f.http, sandbox, options);
  f.products[0].name = "Vantare pro_monthly";
  const http: Http = async (method, path, body) => {
    const response = await f.http(method, path, body);
    if (method === "PATCH") {
      throw Error("Simulated response lost after cosmetic PATCH");
    }
    return response;
  };
  await assertRejects(() => syncCatalog(http, first, options));
  assertEquals((await syncCatalog(f.http, first, options)).writes, 0);
  f.products[0].description = "Texto antiguo";
  const rejectsCopy: Http = async (method, path, body) =>
    method === "PATCH"
      ? structuredClone(f.products[0])
      : await f.http(method, path, body);
  await assertRejects(() => syncCatalog(rejectsCopy, first, options));
});

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

Deno.test("decision B: new launch products have no trial; only normal Pro keeps seven days", async () => {
  const f = fake();
  const result = await syncCatalog(f.http, sandbox, options);
  for (const plan of PRICES.plans) {
    const config = result.map.checkout_keys[plan.key]!;
    const normal = f.products.find((p) => p.id === config.polar_product_id)!;
    const launch = f.products.find((p) =>
      p.id === config.polar_launch_product_id
    )!;
    assertEquals(launch.trial_interval ?? null, null);
    assertEquals(launch.trial_interval_count ?? null, null);
    assertEquals(
      normal.trial_interval ?? null,
      plan.key.startsWith("pro_plus_") ? null : "day",
    );
    assertEquals(
      normal.trial_interval_count ?? null,
      plan.key.startsWith("pro_plus_") ? null : 7,
    );
    assertEquals(config.trial.enabled, !plan.key.startsWith("pro_plus_"));
  }
  const posts = f.writes as { path: string; body: Resource }[];
  for (
    const post of posts.filter((p) =>
      p.path === "/products/" && p.body.metadata?.vantare_catalog_key
    )
  ) {
    assertEquals(post.body.trial_interval, undefined);
    assertEquals(post.body.trial_interval_count, undefined);
  }
  assertEquals((await syncCatalog(f.http, result, options)).writes, 0);
});

Deno.test("decision B: repairs every launch trial with isolated idempotent PATCH before creating or reusing creator links", async () => {
  for (const mode of ["new-link", "existing-link", "no-creator"]) {
    const f = fake();
    let saved = await syncCatalog(f.http, sandbox, options);
    for (const p of f.products) p.visibility = "public";
    if (mode === "existing-link") {
      saved = await syncCatalog(f.http, saved, options);
    }
    const overrides = [
      { trial_interval: "day", trial_interval_count: 7 },
      { trial_interval: "month", trial_interval_count: 2 },
      { trial_interval: "day", trial_interval_count: null },
      { trial_interval: null, trial_interval_count: 7 },
    ];
    const launch = PRICES.plans.map((plan, i) => {
      const config = saved.map.checkout_keys[plan.key]!;
      const product = f.products.find((p) =>
        p.id === config.polar_launch_product_id
      )!;
      Object.assign(product, overrides[i]);
      const archived = {
        ...product.prices![0],
        id: `00000000-0000-4000-8000-00000000090${i}`,
        is_archived: true,
      };
      product.prices!.push(archived);
      config.polar_price_ids.push(archived.id);
      saved.map.price_id_to_checkout_key[archived.id] = plan.key;
      return product;
    });
    const before = structuredClone(f.products);
    const start = f.writes.length;
    const http: Http = (method, path, body) => {
      if (method === "POST" && path === "/checkout-links/") {
        for (const p of launch) {
          assertEquals(p.trial_interval, null);
          assertEquals(p.trial_interval_count, null);
        }
      }
      return f.http(method, path, body);
    };
    const opts = mode === "no-creator"
      ? { environment: "sandbox" as const }
      : options;
    const repaired = await syncCatalog(http, saved, opts);
    assertEquals(repaired.writes, mode === "new-link" ? 5 : 4);
    const patches = f.writes.slice(start, start + 4) as {
      method: string;
      path: string;
      body: unknown;
    }[];
    assertEquals(
      patches.map((p) => p.path).sort(),
      launch.map((p) => `/products/${p.id}`).sort(),
    );
    for (const patch of patches) {
      assertEquals(patch.method, "PATCH");
      assertEquals(patch.body, {
        trial_interval: null,
        trial_interval_count: null,
      });
    }
    for (let i = 0; i < before.length; i++) {
      const expected = structuredClone(before[i]);
      if (launch.some((p) => p.id === expected.id)) {
        expected.trial_interval = null;
        expected.trial_interval_count = null;
      }
      assertEquals(f.products[i], expected);
    }
    assertEquals(repaired.map, saved.map);
    if (mode === "existing-link") {
      assertEquals(repaired.creator_link, saved.creator_link);
    }
    const after = f.writes.length;
    assertEquals((await syncCatalog(http, repaired, opts)).writes, 0);
    assertEquals(f.writes.length, after);
  }
});

Deno.test("decision B: creator preflight rejects residual trials from every launch product POST or PATCH", async () => {
  for (const plan of PRICES.plans) {
    for (
      const boundary of ["create", "trial-patch", "price-patch", "copy-patch"]
    ) {
      for (
        const existingLink of boundary === "create" ? [false] : [false, true]
      ) {
        const f = fake();
        let input: unknown = sandbox;
        let targetId: string | undefined;
        if (boundary !== "create") {
          let saved = await syncCatalog(f.http, sandbox, options);
          for (const p of f.products) p.visibility = "public";
          if (existingLink) saved = await syncCatalog(f.http, saved, options);
          input = saved;
          targetId = saved.map.checkout_keys[plan.key]!.polar_launch_product_id;
          const target = f.products.find((p) => p.id === targetId)!;
          if (boundary === "trial-patch") target.trial_interval = "day";
          if (boundary === "price-patch") target.prices![0].price_amount = 1;
          if (boundary === "copy-patch") target.name = "Nombre antiguo";
        }
        const start = f.writes.length;
        const http: Http = async (method, path, body) => {
          const result = await f.http(method, path, body);
          const isTarget = boundary === "create"
            ? method === "POST" &&
              (body as Resource)?.metadata?.vantare_catalog_key ===
                `${plan.key}:launch`
            : method === "PATCH" && path === `/products/${targetId}`;
          // Simulate a successful response that still carries a trial (even one field).
          if (isTarget) {
            return {
              ...(result as Resource),
              trial_interval: null,
              trial_interval_count: 7,
            };
          }
          return result;
        };
        await assertRejects(
          () => syncCatalog(http, input, options),
          /Launch product trial/,
        );
        assertEquals(f.links.length, existingLink ? 1 : 0);
        const writes = f.writes.slice(start) as { path: string }[];
        assertEquals(
          writes.every((w) => w.path.startsWith("/products/")),
          true,
        );
      }
    }
  }
});

Deno.test("decision B: trial repair checks identity and safely retries a committed PATCH with lost response", async () => {
  for (const failure of ["id", "organization", "timeout"]) {
    const f = fake();
    const saved = await syncCatalog(f.http, sandbox, options);
    for (const p of f.products) p.visibility = "public";
    const target = f.products.find((p) =>
      p.id === saved.map.checkout_keys.pro_annual!.polar_launch_product_id
    )!;
    target.trial_interval = "day";
    target.trial_interval_count = 7;
    const before = structuredClone(target);
    const start = f.writes.length;
    const http: Http = async (method, path, body) => {
      const result = await f.http(method, path, body);
      if (method === "PATCH" && path === `/products/${target.id}`) {
        if (failure === "timeout") throw Error("Simulated lost response");
        return {
          ...(result as Resource),
          [failure === "id" ? "id" : "organization_id"]:
            "00000000-0000-4000-8000-000000000999",
        };
      }
      return result;
    };
    await assertRejects(() => syncCatalog(http, saved, options));
    assertEquals(f.writes.length - start, 1);
    assertEquals(f.links.length, 0);
    assertEquals(target, {
      ...before,
      trial_interval: null,
      trial_interval_count: null,
    });
    const retried = await syncCatalog(f.http, saved, options);
    assertEquals(retried.writes, 1); // only the creator link, trial repair already committed
    assertEquals(retried.map, saved.map);
    assertEquals((await syncCatalog(f.http, retried, options)).writes, 0);
  }
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

Deno.test("checkout theme: new and reused creator URLs force dark without API writes or losing parameters", async () => {
  const f = fake();
  const draft = await syncCatalog(f.http, sandbox, options);
  for (const product of f.products) product.visibility = "public";
  const created = await syncCatalog(f.http, draft, options);
  assertEquals(
    new URL(created.creator_link!.url!).searchParams.get("theme"),
    "dark",
  );
  assertEquals(f.links[0].url, "https://sandbox.polar.sh/checkout/fixture");
  const body = (f.writes.at(-1) as { body: Record<string, unknown> }).body;
  assertEquals(body.theme, undefined); // not a CheckoutLinkCreate field
  f.links[0].url =
    "https://sandbox.polar.sh/checkout/fixture?product_id=chosen&utm_source=ISAAC&locale=en&theme=light#plans";
  const before = f.writes.length;
  const reused = await syncCatalog(f.http, created, options);
  const url = new URL(reused.creator_link!.url!);
  assertEquals(url.searchParams.getAll("theme"), ["dark"]);
  assertEquals(url.searchParams.get("product_id"), "chosen");
  assertEquals(url.searchParams.get("utm_source"), "ISAAC");
  assertEquals(url.searchParams.get("locale"), "en");
  assertEquals(url.hash, "#plans");
  assertEquals(reused.creator_link!.id, created.creator_link!.id);
  assertEquals(reused.creator_link!.code, "ISAAC");
  assertEquals(reused.writes, 0);
  assertEquals(f.writes.length, before);
  assertEquals(new URL(f.links[0].url).searchParams.get("theme"), "light");
  assertEquals(
    (await syncCatalog(f.http, reused, options)).creator_link,
    reused.creator_link,
  );
});

for (
  const override of [
    { trial_interval: "month", trial_interval_count: 2 },
    { trial_interval: "day", trial_interval_count: 7 },
    { trial_interval: "month", trial_interval_count: null },
    { trial_interval: null, trial_interval_count: 2 },
  ]
) {
  Deno.test(`R2 P2: creator link trial override ${JSON.stringify(override)} aborts before writes`, async () => {
    const f = fake();
    const draft = await syncCatalog(f.http, sandbox, options);
    for (const p of f.products) p.visibility = "public";
    const ready = await syncCatalog(f.http, draft, options);
    for (const plan of PRICES.plans) {
      const product = f.products.find((p) =>
        p.id === ready.map.checkout_keys[plan.key]!.polar_launch_product_id
      )!;
      assertEquals(
        product.trial_interval ?? null,
        null,
      );
      assertEquals(
        product.trial_interval_count ?? null,
        null,
      );
    }
    Object.assign(f.links[0], override);
    // This known price requires PATCH; link drift must reject before that write.
    f.products[0].prices![0].price_amount = 499;
    const writes = f.writes.length;
    await assertRejects(() => syncCatalog(f.http, ready, options));
    assertEquals(f.writes.length, writes);
    assertEquals(f.products[0].prices![0].price_amount, 499);
  });
}

Deno.test("decision B: absent or null creator link trials inherit launch products without trial on rerun", async () => {
  const f = fake();
  const draft = await syncCatalog(f.http, sandbox, options);
  for (const p of f.products) p.visibility = "public";
  const ready = await syncCatalog(f.http, draft, options);
  assertEquals(f.links[0].trial_interval, undefined);
  assertEquals(f.links[0].trial_interval_count, undefined);
  assertEquals((await syncCatalog(f.http, ready, options)).writes, 0);
  Object.assign(f.links[0], {
    trial_interval: null,
    trial_interval_count: null,
  });
  assertEquals((await syncCatalog(f.http, ready, options)).writes, 0);
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
    "/checkout-links/",
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
    assertEquals(saved.map.catalog_version, "isa-1620-launch-v2");
    assertEquals(saved.writes, 7);
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
