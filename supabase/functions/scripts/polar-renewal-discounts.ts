// VANTA-83 / VANTA-39. Operator-only provisioning; never activates a campaign.
import prices from "./polar-launch-prices.json" with { type: "json" };
import {
  type BillingEnvironment,
  type CheckoutKey,
  loadPolarProductMap,
  type PolarProductMap,
} from "../_shared/mapping.ts";
import { prepareLaunchOffersSql } from "./prepare-launch-offers-sql.ts";
export type Creator = { code: string; id: string };
type Body = {
  name: string;
  type: "percentage" | "fixed";
  duration: "repeating";
  duration_in_months: number;
  products: string[];
  metadata: Record<string, string>;
  basis_points?: number;
  amounts?: Record<string, number>;
  code: null;
  organization_id: string;
};
export type Offer = {
  key: string;
  family: "creator" | "remainder" | "reports";
  body: Body;
  creator?: Creator;
  productKey?: CheckoutKey;
  originalKey?: string;
};
type Discount = Record<string, unknown> & {
  id: string;
  organization_id: string;
  metadata?: Record<string, string>;
};
export type Http = (
  method: "GET" | "POST",
  path: string,
  body?: unknown,
) => Promise<unknown>;
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(v);
const q = (v: string | number) => "'" + String(v).replaceAll("'", "''") + "'";
export function discountPlan(
  raw: unknown,
  environment: BillingEnvironment,
  creators: Creator[],
) {
  const loaded = loadPolarProductMap(JSON.stringify(raw), { environment });
  if (!loaded.ok) throw Error(loaded.code);
  const map = structuredClone(loaded.map);
  const codes = new Set<string>(), ids = new Set<string>();
  for (const c of creators) {
    if (
      !c || !/^[A-Z0-9]{3,32}$/.test(c.code) || !uuid(c.id) ||
      codes.has(c.code) || ids.has(c.id)
    ) throw Error("Invalid or duplicate creator identity");
    codes.add(c.code);
    ids.add(c.id);
  }
  for (const plan of prices.plans) {
    const p = map.checkout_keys[plan.key as CheckoutKey];
    if (
      !p || p.billing_type !== "subscription" || p.polar_launch_product_id ||
      !p.polar_launch_discount_id || p.trial.enabled
    ) throw Error("Complete normal subscription catalogue required");
  }
  const offers: Offer[] = [];
  function add(
    key: string,
    family: Offer["family"],
    name: string,
    months: number,
    products: string[],
    extra: Partial<Body>,
    details: Partial<Offer> = {},
  ) {
    offers.push({
      key,
      family,
      ...details,
      body: {
        name,
        type: "percentage",
        duration: "repeating",
        duration_in_months: months,
        products,
        code: null,
        organization_id: map.organization_id,
        ...extra,
        metadata: {
          vantare_offer_key: key,
          vantare_environment: environment,
          vantare_catalog_version: prices.catalog_version,
          vantare_family: family,
          ...extra.metadata,
        },
      },
    });
  }
  for (const c of creators) {
    for (const annual of [false, true]) {
      const key = `creator:${c.code}:${
        annual ? "annual-renewals-v4" : "renewals-v4"
      }`;
      add(
        key,
        "creator",
        `Vantare ${c.code} · 20 % renovaciones ${
          annual ? "anuales" : "mensuales"
        }`,
        annual
          ? prices.creator_renewals.annual_duration_months
          : prices.creator_renewals.monthly_duration_months,
        prices.plans.filter((p) => p.interval === (annual ? "year" : "month"))
          .map((p) =>
            map.checkout_keys[p.key as CheckoutKey]!.polar_product_id
          ),
        {
          basis_points: prices.creator_discount_basis_points,
          metadata: { vantare_creator_id: c.id },
        },
        { creator: c },
      );
    }
    for (const key of ["pro_monthly", "pro_plus_monthly"] as const) {
      for (
        let months = 1;
        months < prices.creator_renewals.monthly_duration_months;
        months++
      ) {
        const originalKey = `creator:${c.code}:renewals-v4`;
        add(
          `creator:${c.code}:remainder:${key}:${months}m-v1`,
          "remainder",
          `Vantare ${c.code} · 20 % ${
            key === "pro_monthly" ? "Pro" : "Pro Plus"
          } · remanente ${months} meses`,
          months,
          [map.checkout_keys[key]!.polar_product_id],
          {
            basis_points: prices.creator_discount_basis_points,
            metadata: {
              vantare_creator_id: c.id,
              vantare_original_offer_key: originalKey,
            },
          },
          { creator: c, productKey: key, originalKey },
        );
      }
    }
  }
  for (const key of ["pro_monthly", "pro_plus_monthly"] as const) {
    for (const months of [1, 3, 6]) {
      const amount = key === "pro_monthly" ? 200 : 300;
      add(
        `reports:${key}:${months}m-v1`,
        "reports",
        `Vantare ${key === "pro_monthly" ? "Pro" : "Pro Plus"} · informes ${
          amount / 100
        } € · ${months} meses`,
        months,
        [map.checkout_keys[key]!.polar_product_id],
        { type: "fixed", amounts: { eur: amount } },
        { productKey: key },
      );
    }
  }
  return {
    map,
    offers,
    creator_roster_required: creators.length === 0,
    creator_template: {
      base_months: [11, 12],
      remainder_months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      coupons_per_creator: 22,
    },
    reports_enabled: false,
  };
}
function matches(d: Discount, o: Offer): boolean {
  const b = o.body,
    scope = Array.isArray(d.products)
      ? d.products.map((p) =>
        typeof p === "string" ? p : (p as { id: string }).id
      )
      : [];
  return uuid(d.id) && d.organization_id === b.organization_id &&
    d.is_archived !== true &&
    d.type === b.type && d.duration === "repeating" &&
    d.duration_in_months === b.duration_in_months && !d.code && !d.starts_at &&
    !d.ends_at && !d.max_redemptions && !d.max_redemptions_per_customer &&
    scope.length === b.products.length &&
    new Set(scope).size === scope.length &&
    b.products.every((id) => scope.includes(id)) &&
    (b.type === "percentage"
      ? d.basis_points === b.basis_points
      : JSON.stringify(d.amounts) === JSON.stringify(b.amounts)) &&
    Object.entries(b.metadata).every(([k, v]) => d.metadata?.[k] === v);
}
async function list(
  http: Http,
  kind: string,
  org: string,
): Promise<Discount[]> {
  const result: Discount[] = [];
  let last = 1;
  for (let page = 1; page <= last; page++) {
    const data = await http(
      "GET",
      `/${kind}/?organization_id=${org}&limit=100&page=${page}`,
    ) as {
      items: Discount[];
      pagination: { max_page: number; total_count: number };
    };
    if (
      !Array.isArray(data.items) ||
      !Number.isInteger(data.pagination?.max_page) ||
      data.pagination.max_page < 0 || data.pagination.max_page > 1000 ||
      !Number.isInteger(data.pagination.total_count)
    ) throw Error("Incomplete inventory");
    if (page !== 1 && last !== data.pagination.max_page) {
      throw Error("Inventory changed during pagination");
    }
    last = data.pagination.max_page;
    if (data.items.some((d) => !uuid(d.id) || d.organization_id !== org)) {
      throw Error("Foreign or invalid inventory");
    }
    result.push(...data.items);
    if (page >= last && result.length !== data.pagination.total_count) {
      throw Error("Incomplete inventory count");
    }
  }
  if (new Set(result.map((d) => d.id)).size !== result.length) {
    throw Error("Duplicate inventory IDs");
  }
  return result;
}
export async function provision(
  http: Http,
  raw: unknown,
  environment: BillingEnvironment,
  creators: Creator[],
  apply = false,
  checkpoint: (value: unknown) => Promise<void> = async () => {},
  reportsOnly = false,
) {
  const plan = discountPlan(raw, environment, creators);
  if (apply && plan.creator_roster_required && !reportsOnly) {
    throw Error(
      "Creator roster required; --reports-only explicitly limits provisioning to six reports coupons",
    );
  }
  // No global catalogue reset. GET verifies scope and immutable prices; no product mutation.
  const org = await http(
    "GET",
    `/organizations/${plan.map.organization_id}`,
  ) as Discount;
  if (org.id !== plan.map.organization_id) throw Error("Organization mismatch");
  for (const p of prices.plans) {
    const conf = plan.map.checkout_keys[p.key as CheckoutKey]!;
    const product = await http("GET", `/products/${conf.polar_product_id}`) as
      & Discount
      & { prices: Record<string, unknown>[] };
    const active = product.prices?.filter((v) => !v.is_archived);
    if (
      product.id !== conf.polar_product_id ||
      product.organization_id !== plan.map.organization_id ||
      product.is_archived || product.recurring_interval !== p.interval ||
      product.recurring_interval_count !== 1 || product.trial_interval ||
      product.trial_interval_count || active?.length !== 1 ||
      active[0].price_amount !== p.normal_cents ||
      active[0].price_currency !== "eur" || active[0].amount_type !== "fixed" ||
      !conf.polar_price_ids.includes(String(active[0].id))
    ) throw Error("Normal product/price mismatch");
  }
  const inventory = await list(http, "discounts", plan.map.organization_id);
  const resolved = new Map<string, Discount>();
  // Validate every existing candidate before any POST. Never silently repair drift.
  for (const o of plan.offers) {
    const mapped = o.family === "creator"
      ? (o.key.includes("annual-renewals")
        ? plan.map.creator_annual_discounts
        : plan.map.creator_discounts)?.[o.creator!.code]
      : undefined;
    const found = inventory.filter((d) =>
      d.metadata?.vantare_offer_key === o.key || (mapped && d.id === mapped)
    );
    if (
      found.length > 1 || (mapped && found[0]?.id !== mapped) ||
      (found[0] && !matches(found[0], o))
    ) throw Error(`Discount drift: ${o.key}`);
    if (found[0]) resolved.set(o.key, found[0]);
  }
  const actions = plan.offers.map((o) => ({
    action: resolved.has(o.key) ? "reuse" : "create",
    ...o,
    id: resolved.get(o.key)?.id ?? null,
  }));
  let writes = 0;
  if (apply) {
    for (const o of plan.offers) {
      if (!resolved.has(o.key)) {
        const created = await http("POST", "/discounts/", o.body) as Discount;
        if (
          !matches(created, o) || inventory.some((d) => d.id === created.id) ||
          [...resolved.values()].some((d) => d.id === created.id)
        ) {
          throw Error(
            "Created discount response mismatch; reconcile inventory before retry",
          );
        }
        resolved.set(o.key, created);
        writes++;
        await checkpoint({
          completed: false,
          writes,
          created_ids: [...resolved].map(([key, d]) => ({ key, id: d.id })),
        });
      }
    }
  }
  const map = structuredClone(plan.map);
  for (const o of plan.offers.filter((o) => o.family === "creator")) {
    const id = resolved.get(o.key)?.id;
    if (!id) continue;
    const field = o.key.includes("annual-renewals")
      ? "creator_annual_discounts"
      : "creator_discounts";
    map[field] ??= {};
    map[field]![o.creator!.code] = id;
  }
  const pending = plan.offers.filter((o) => !resolved.has(o.key)).map((o) =>
    o.key
  );
  const registry = plan.offers.map((o) => ({
    key: o.key,
    id: resolved.get(o.key)?.id ?? null,
    family: o.family,
    product_key: o.productKey ?? null,
    products: o.body.products,
    months: o.body.duration_in_months,
    creator_id: o.creator?.id ?? null,
    original_discount_id: o.originalKey
      ? resolved.get(o.originalKey)?.id ?? null
      : null,
  }));
  const complete = pending.length === 0;
  return {
    environment,
    read_only: !apply,
    offline: false,
    writes,
    completed: complete,
    production_apply_ready: !plan.creator_roster_required || reportsOnly,
    production_apply_blockers: plan.creator_roster_required && !reportsOnly
      ? ["creator_roster_required"]
      : [],
    map_ready: complete && (!plan.creator_roster_required || reportsOnly),
    creator_roster_required: plan.creator_roster_required,
    creator_template: plan.creator_template,
    actions,
    pending,
    registry,
    map: { ...map, renewal_discount_catalog: registry },
    operator_sql: complete ? registrationSql(map, plan.offers, resolved) : null,
    activation:
      "NOT_PERFORMED; reports remain disabled; register creators and SQL before checkout",
    checked_at: new Date().toISOString(),
  };
}
function registrationSql(
  map: PolarProductMap,
  offers: Offer[],
  ids: Map<string, Discount>,
) {
  const lines = [
    "-- Operator only: review live validation receipt; does NOT enable report enrollment.",
    "begin;",
    "select pg_advisory_xact_lock(hashtextextended('vantare-renewal-catalog:'||" +
    q(map.environment) + ",0));",
  ];
  function insert(
    table: string,
    columns: string[],
    values: (string | number)[],
    conflict: string[],
    stable = columns,
  ) {
    lines.push(
      `insert into private.${table}(${columns.join(",")}) values(${
        values.map(q).join(",")
      }) on conflict(${conflict.join(",")}) do nothing;`,
    );
    const expected = stable.map((c) =>
      `${c}::text is not distinct from ${q(values[columns.indexOf(c)])}`
    ).join(" and ");
    lines.push(
      `do $verify$ begin if not exists(select 1 from private.${table} where ${expected}) then raise exception 'renewal_catalog_registry_drift'; end if; end $verify$;`,
    );
  }
  for (const key of ["pro_monthly", "pro_plus_monthly"] as const) {
    const id = (months: number) => ids.get(`reports:${key}:${months}m-v1`)!.id;
    const plus = key === "pro_plus_monthly";
    insert("report_promotion_catalog", [
      "environment",
      "product_id",
      "plan",
      "normal_cents",
      "launch_cents",
      "launch_discount",
      "reward3_discount",
      "reward6_discount",
    ], [
      map.environment,
      map.checkout_keys[key]!.polar_product_id,
      plus ? "pro_plus" : "pro",
      plus ? 999 : 599,
      plus ? 699 : 399,
      id(1),
      id(3),
      id(6),
    ], ["environment", "product_id"]);
  }
  for (const o of offers.filter((o) => o.family === "remainder")) {
    const columns = [
      "environment",
      "product_id",
      "creator_discount_id",
      "duration_months",
      "discount_id",
      "validated_at",
    ];
    insert(
      "report_creator_remainders",
      columns,
      [
        map.environment,
        o.body.products[0],
        ids.get(o.originalKey!)!.id,
        o.body.duration_in_months,
        ids.get(o.key)!.id,
        new Date().toISOString(),
      ],
      ["environment", "product_id", "creator_discount_id", "duration_months"],
      columns.slice(0, -1),
    );
  }
  for (
    const c of new Map(
      offers.filter((o) => o.creator).map((o) => [o.creator!.code, o.creator!]),
    ).values()
  ) {
    const monthly = ids.get(`creator:${c.code}:renewals-v4`)!.id,
      annual = ids.get(`creator:${c.code}:annual-renewals-v4`)!.id;
    lines.push(
      `-- Creator ${c.code}: must already exist in Owner; never create a fake person or enable a code here.`,
    );
    lines.push(
      `do $creator$ begin if not exists(select 1 from private.admin_creators where environment=${
        q(map.environment)
      } and creator_id=${q(c.id)}::uuid and code=${
        q(c.code)
      } and status='active' and discount_id=${
        q(monthly)
      } and annual_discount_id=${
        q(annual)
      }::uuid) then raise exception 'creator_owner_registration_required'; end if; end $creator$;`,
    );
  }
  lines.push(
    "-- Canonical first-period registry; no enrollment activation.",
    prepareLaunchOffersSql(JSON.stringify(map), map.environment).split("\n")
      .filter((line) => line !== "begin;" && line !== "commit;").join("\n"),
    "commit;",
  );
  return lines.join("\n");
}
export function parseRenewalArgs(args: string[]) {
  const v: Record<string, string> = {}, flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (
      ["--online", "--apply", "--confirm-production", "--reports-only"]
        .includes(a)
    ) {
      if (flags.has(a)) throw Error("Duplicate flag");
      flags.add(a);
    } else if (
      ["--environment", "--map", "--creators", "--output"].includes(a)
    ) {
      if (v[a] || !args[i + 1] || args[i + 1].startsWith("--")) {
        throw Error("Missing/duplicate option");
      }
      v[a] = args[++i];
    } else throw Error("Unknown option; token only via environment");
  }
  if (
    !["sandbox", "production"].includes(v["--environment"]) || !v["--map"] ||
    !v["--creators"] || !v["--output"] ||
    (flags.has("--online") && flags.has("--apply")) ||
    (flags.has("--apply") && v["--environment"] === "production" &&
      !flags.has("--confirm-production"))
  ) {
    throw Error(
      "Require --environment --map --creators --output; production --apply requires --confirm-production",
    );
  }
  if (
    new Set([v["--map"], v["--creators"], v["--output"]]).size !== 3 ||
    [v["--map"], v["--creators"]].includes(v["--output"]) ||
    Object.values(v).some((s) => /(^|[\\/])\.env[^\\/]*$/i.test(s))
  ) throw Error("Unsafe file paths");
  return { v, flags, environment: v["--environment"] as BillingEnvironment };
}
export async function runRenewalCatalog(
  args: string[],
  fetcher: typeof fetch = fetch,
) {
  const { v, flags, environment } = parseRenewalArgs(args);
  const raw = JSON.parse(await Deno.readTextFile(v["--map"]));
  const creators = JSON.parse(
    await Deno.readTextFile(v["--creators"]),
  ) as Creator[];
  if (!Array.isArray(creators)) throw Error("Creator roster must be an array");
  const plan = discountPlan(raw, environment, creators);
  // Reserve exclusive output before HTTP/writes; fsync a journal after every successful creation.
  const output = await Deno.open(v["--output"], {
    createNew: true,
    write: true,
  });
  const save = async (value: unknown) => {
    await output.seek(0, Deno.SeekMode.Start);
    await output.truncate(0);
    const b = new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n");
    let n = 0;
    while (n < b.length) n += await output.write(b.subarray(n));
    await output.sync();
  };
  try {
    if (!flags.has("--online") && !flags.has("--apply")) {
      const result = {
        environment,
        offline: true,
        writes: 0,
        production_apply_ready: false,
        map_ready: false,
        ...plan,
        activation: "NOT_PERFORMED",
      };
      await save(result);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const token = Deno.env.get("POLAR_ACCESS_TOKEN");
    if (!token) throw Error("POLAR_ACCESS_TOKEN not set");
    const http: Http = async (method, path, body) => {
      if (flags.has("--online") && method !== "GET") {
        throw Error("Read-only plan prohibits mutation");
      }
      let response: Response;
      try {
        response = await fetcher(
          (environment === "production"
            ? "https://api.polar.sh/v1"
            : "https://sandbox-api.polar.sh/v1") + path,
          {
            method,
            redirect: "error",
            signal: AbortSignal.timeout(30000),
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "User-Agent": "Vantare-Renewal-Catalog/1661",
              "Polar-Version": "2026-10",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          },
        );
      } catch {
        throw Error("Polar transport failed; reconcile before retry");
      }
      if (!response.ok) {
        throw Error(`Polar HTTP ${response.status}; body withheld`);
      }
      try {
        return await response.json();
      } catch {
        throw Error("Polar invalid JSON; body withheld");
      }
    };
    const result = await provision(
      http,
      raw,
      environment,
      creators,
      flags.has("--apply"),
      save,
      flags.has("--reports-only"),
    );
    await save(result);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    output.close();
  }
}
if (import.meta.main) {
  try {
    await runRenewalCatalog(Deno.args);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Renewal catalogue failed");
    Deno.exit(1);
  }
}
