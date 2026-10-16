import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  discountPlan,
  type Http,
  parseRenewalArgs,
  provision,
  runRenewalCatalog,
} from "./polar-renewal-discounts.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import prices from "./polar-launch-prices.json" with { type: "json" };
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const creators = [{ code: "ISAAC", id: id(1661) }];
function fixture() {
  const raw = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
  // Build a full normal catalogue from the same fixture metadata as the runtime loader.
  for (const [i, p] of prices.plans.entries()) {
    const plus = p.key.startsWith("pro_plus");
    raw.checkout_keys[p.key] = {
      ...raw.checkout_keys.pro_monthly,
      polar_product_id: id(10 + i),
      polar_price_ids: [id(20 + i)],
      polar_launch_discount_id: id(30 + i),
      plan_sku: p.key,
      capabilities: plus
        ? [
          "vantare.plan.pro",
          "vantare.channel.testers",
          "vantare.channel.nightly",
        ]
        : ["vantare.plan.pro"],
      channels: plus ? ["stable", "testers", "nightly"] : ["stable"],
    };
  }
  raw.product_id_to_checkout_key = {};
  raw.price_id_to_checkout_key = {};
  for (
    const [key, conf] of Object.entries(raw.checkout_keys) as [
      string,
      { polar_product_id: string; polar_price_ids: string[] },
    ][]
  ) {
    raw.product_id_to_checkout_key[conf.polar_product_id] = key;
    for (const p of conf.polar_price_ids) raw.price_id_to_checkout_key[p] = key;
  }
  return raw;
}
function fake() {
  const raw = fixture();
  const inventory: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const http: Http = (method, path, body) => {
    calls.push(method + " " + path);
    if (method === "POST") {
      const d = { ...body as object, id: id(100 + inventory.length) };
      inventory.push(d);
      return Promise.resolve(d);
    }
    if (path.startsWith("/organizations/")) {
      return Promise.resolve({ id: raw.organization_id });
    }
    if (path.startsWith("/products/")) {
      const i = prices.plans.findIndex((p) =>
        raw.checkout_keys[p.key].polar_product_id === path.split("/").pop()
      );
      const p = prices.plans[i];
      return Promise.resolve({
        id: id(10 + i),
        organization_id: raw.organization_id,
        recurring_interval: p.interval,
        recurring_interval_count: 1,
        prices: [{
          id: id(20 + i),
          amount_type: "fixed",
          price_amount: p.normal_cents,
          price_currency: "eur",
        }],
      });
    }
    return Promise.resolve({
      items: inventory,
      pagination: { max_page: 1, total_count: inventory.length },
    });
  };
  return { raw, http, inventory, calls };
}
Deno.test("renewal plan has 2 base +20 per-product remainders +6 reports, all API-only", () => {
  const p = discountPlan(fixture(), "sandbox", creators);
  assertEquals(p.offers.length, 28);
  for (const o of p.offers) {
    assertEquals(o.body.code, null);
    assertEquals(o.body.duration, "repeating");
    assertEquals(o.body.products.length, o.family === "creator" ? 2 : 1);
  }
  assertEquals(
    p.offers.filter((o) => o.family === "reports").map(
      (o) => [o.body.amounts, o.body.duration_in_months],
    ),
    [
      [{ eur: 200 }, 1],
      [{ eur: 200 }, 3],
      [{ eur: 200 }, 6],
      [{ eur: 300 }, 1],
      [{ eur: 300 }, 3],
      [{ eur: 300 }, 6],
    ],
  );
  assertThrows(() => discountPlan(fixture(), "production", creators));
});
Deno.test("online is GET-only, apply creates only missing discounts, replay writes zero and complete map/SQL bind actual IDs", async () => {
  const f = fake();
  const online = await provision(f.http, f.raw, "sandbox", creators);
  assertEquals(online.writes, 0);
  assertEquals(online.pending.length, 28);
  assertEquals(online.map_ready, false);
  assertEquals(online.operator_sql, null);
  assertEquals(f.calls.every((c) => c.startsWith("GET")), true);
  const result = await provision(f.http, f.raw, "sandbox", creators, true);
  assertEquals(result.writes, 28);
  assertEquals(result.map_ready, true);
  assertEquals(result.map.creator_discounts?.ISAAC, id(100));
  assertEquals(result.map.creator_annual_discounts?.ISAAC, id(101));
  assertEquals(
    result.operator_sql?.includes("report_creator_remainders"),
    true,
  );
  assertEquals(result.operator_sql?.includes("enrollment_enabled=true"), false);
  assertEquals(
    result.registry.filter((r) => r.family === "remainder").every((r) =>
      r.original_discount_id === id(100)
    ),
    true,
  );
  assertEquals(
    (await provision(f.http, result.map, "sandbox", creators, true)).writes,
    0,
  );
});
Deno.test("preflight validates all candidates before first write, including foreign product/public code/duplicate key/drift", async () => {
  for (const mutation of ["code", "products", "months", "duplicate"]) {
    const f = fake();
    await provision(f.http, f.raw, "sandbox", creators, true);
    if (mutation === "code") f.inventory[27].code = "PUBLIC";
    if (mutation === "products") f.inventory[27].products = [id(999)];
    if (mutation === "months") f.inventory[27].duration_in_months = 99;
    if (mutation === "duplicate") {
      f.inventory.push({ ...f.inventory[27], id: id(999) });
    }
    f.calls.length = 0;
    await assertRejects(() =>
      provision(f.http, f.raw, "sandbox", creators, true)
    );
    assertEquals(f.calls.every((c) => c.startsWith("GET")), true);
  }
});
Deno.test("lost POST response reconciles by metadata instead of creating another coupon", async () => {
  const f = fake();
  let fail = true;
  const http: Http = async (...args) => {
    const result = await f.http(...args);
    if (args[0] === "POST" && fail) {
      fail = false;
      throw Error("lost");
    }
    return result;
  };
  await assertRejects(() => provision(http, f.raw, "sandbox", creators, true));
  assertEquals(f.inventory.length, 1);
  assertEquals(
    (await provision(http, f.raw, "sandbox", creators, true)).writes,
    27,
  );
  assertEquals(f.inventory.length, 28);
});
Deno.test("creator identity and production apply cannot be inferred or silently switched", () => {
  assertThrows(() =>
    discountPlan(fixture(), "sandbox", [{ code: "constructor", id: id(1) }])
  );
  assertThrows(() =>
    discountPlan(fixture(), "sandbox", [...creators, ...creators])
  );
  assertThrows(() =>
    parseRenewalArgs([
      "--environment",
      "production",
      "--map",
      "map.json",
      "--creators",
      "c.json",
      "--output",
      "out.json",
      "--apply",
    ])
  );
  assertThrows(() =>
    parseRenewalArgs([
      "--environment",
      "production",
      "--map",
      "map.json",
      "--creators",
      "c.json",
      "--output",
      "out.json",
      "--online",
      "--apply",
      "--confirm-production",
    ])
  );
});

Deno.test("CLI online saves actual IDs and never writes remotely; exclusive output blocks a second run", async () => {
  const f = fake();
  const dir = await Deno.makeTempDir();
  const previous = Deno.env.get("POLAR_ACCESS_TOKEN"), log = console.log;
  try {
    await Deno.writeTextFile(dir + "/map.json", JSON.stringify(f.raw));
    await Deno.writeTextFile(dir + "/creators.json", JSON.stringify(creators));
    Deno.env.set("POLAR_ACCESS_TOKEN", "synthetic-fixture");
    console.log = () => {};
    const args = [
      "--environment",
      "sandbox",
      "--map",
      dir + "/map.json",
      "--creators",
      dir + "/creators.json",
      "--output",
      dir + "/online.json",
      "--online",
    ];
    const fetcher = (async (input, init) => {
      assertEquals(init?.method, "GET");
      const url = new URL(String(input));
      return Response.json(
        await f.http("GET", url.pathname.replace(/^\/v1/, "") + url.search),
      );
    }) as typeof fetch;
    await runRenewalCatalog(args, fetcher);
    const result = JSON.parse(await Deno.readTextFile(dir + "/online.json"));
    assertEquals(result.writes, 0);
    assertEquals(result.read_only, true);
    assertEquals(
      result.registry.every((r: { id: null }) => r.id === null),
      true,
    );
    const calls = f.calls.length;
    await assertRejects(() => runRenewalCatalog(args, fetcher));
    assertEquals(f.calls.length, calls);
  } finally {
    console.log = log;
    if (previous === undefined) Deno.env.delete("POLAR_ACCESS_TOKEN");
    else Deno.env.set("POLAR_ACCESS_TOKEN", previous);
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("missing roster cannot silently apply a partial creator catalogue", async () => {
  const f = fake();
  await assertRejects(() => provision(f.http, f.raw, "sandbox", [], true));
  assertEquals(f.calls.length, 0);
  const online = await provision(f.http, f.raw, "sandbox", []);
  assertEquals(online.production_apply_ready, false);
  const reportOnly = await provision(
    f.http,
    f.raw,
    "sandbox",
    [],
    true,
    async () => {},
    true,
  );
  assertEquals(reportOnly.writes, 6);
  assertEquals(reportOnly.map_ready, true);
});
