// ISA-1620. Offline plan by default; --apply is an explicit operator action.
import table from "./polar-launch-prices.json" with { type: "json" };
import {
  type BillingEnvironment,
  type CheckoutKey,
  loadPolarProductMap,
} from "../_shared/mapping.ts";

type Plan = {
  key: CheckoutKey;
  interval: string;
  normal_cents: number;
  launch_cents: number;
  launch_confirmed: boolean;
  code_suffix: string;
};
export const PRICES = table as Omit<typeof table, "plans"> & { plans: Plan[] };
export type Resource = {
  id: string;
  organization_id: string;
  metadata?: Record<string, string>;
  recurring_interval?: string | null;
  recurring_interval_count?: number;
  is_archived?: boolean;
  prices?: {
    id: string;
    is_archived?: boolean;
    amount_type?: string;
    price_amount?: number;
    price_currency?: string;
    tax_behavior?: string;
  }[];
  trial_interval?: string | null;
  trial_interval_count?: number | null;
  type?: string;
  duration?: string;
  duration_in_months?: number | null;
  amounts?: Record<string, number>;
  code?: string | null;
  products?: { id: string }[];
  starts_at?: string | null;
  ends_at?: string | null;
  max_redemptions?: number | null;
};
export type Http = (
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
) => Promise<unknown>;
type Options = {
  environment: BillingEnvironment;
  creator?: string;
  confirmAnnualLaunch: boolean;
};
export const creatorPrice = (cents: number) =>
  Math.round(cents * (10000 - PRICES.creator_discount_basis_points) / 10000);
const fixedPrice = (cents: number) => ({
  amount_type: "fixed",
  price_amount: cents,
  price_currency: "eur",
  tax_behavior: "inclusive",
});

async function list(
  http: Http,
  kind: string,
  organization: string,
): Promise<Resource[]> {
  const resources: Resource[] = [];
  let page = 1;
  let maxPage = 1;
  do {
    const query = new URLSearchParams({
      organization_id: organization,
      limit: "100",
      page: String(page),
    });
    const response = await http("GET", `/${kind}/?${query}`) as {
      items: Resource[];
      pagination: { max_page: number };
    };
    if (
      !Array.isArray(response.items) ||
      !Number.isInteger(response.pagination?.max_page) ||
      response.pagination.max_page < 0
    ) throw Error(`Incomplete ${kind} list`);
    if (response.items.some((r) => r.organization_id !== organization)) {
      throw Error(`Foreign organization in ${kind}`);
    }
    resources.push(...response.items);
    maxPage = response.pagination.max_page;
    if (maxPage > 1000) throw Error(`Unbounded ${kind} list`);
    page++;
  } while (page <= maxPage);
  if (new Set(resources.map((r) => r.id)).size !== resources.length) {
    throw Error(`Duplicate IDs in ${kind}`);
  }
  return resources;
}

function currentPrice(product: Resource, cents: number) {
  const active = (product.prices ?? []).filter((p) => !p.is_archived);
  const p = active[0];
  return active.length === 1 && p.amount_type === "fixed" &&
      p.price_amount === cents && p.price_currency === "eur" &&
      p.tax_behavior === "inclusive"
    ? p
    : undefined;
}
function offerKey(plan: Plan, creator?: string) {
  return `${plan.key}:${creator ? `creator:${creator}` : "launch"}`;
}
function discountMatches(
  resource: Resource,
  product: string,
  amount: number,
  code: string | null,
  creator: boolean,
) {
  return resource.type === "fixed" &&
    resource.duration === (creator ? "repeating" : "forever") &&
    (creator
      ? resource.duration_in_months === 2
      : !resource.duration_in_months) &&
    resource.amounts?.eur === amount &&
    Object.keys(resource.amounts).length === 1 &&
    (resource.code ?? null) === code && resource.products?.length === 1 &&
    resource.products[0].id === product &&
    !resource.starts_at && !resource.ends_at && !resource.max_redemptions;
}

/** Reuses configured IDs or owned metadata; never guesses product names. */
export async function syncCatalog(http: Http, raw: unknown, options: Options) {
  // A saved result can be used directly as the next input, including new IDs.
  const source = typeof raw === "object" && raw !== null && "map" in raw
    ? raw.map
    : raw;
  const loaded = loadPolarProductMap(JSON.stringify(source), {
    environment: options.environment,
    trialAntiAbuseConfirmed: true,
  });
  if (!loaded.ok) throw Error(loaded.code);
  const map = structuredClone(loaded.map);
  const creator = options.creator?.toUpperCase();
  if (creator && !/^[A-Z0-9]{3,32}$/.test(creator)) {
    throw Error("Creator must contain 3-32 alphanumeric characters");
  }
  const products = await list(http, "products", map.organization_id);
  const discounts = await list(http, "discounts", map.organization_id);
  const selected = new Map<CheckoutKey, Resource | undefined>();
  // Preflight the whole catalogue before the first mutation.
  for (const plan of PRICES.plans) {
    const config = map.checkout_keys[plan.key];
    const matches = products.filter((p) =>
      p.id === config?.polar_product_id ||
      p.metadata?.vantare_checkout_key === plan.key
    );
    if (matches.length > 1) throw Error(`Ambiguous product ${plan.key}`);
    const product = matches[0];
    if (config && (!product || product.id !== config.polar_product_id)) {
      throw Error(`Configured product missing ${plan.key}`);
    }
    if (
      product &&
      (product.is_archived || product.recurring_interval !== plan.interval ||
        (product.recurring_interval_count ?? 1) !== 1)
    ) throw Error(`Invalid product interval/status ${plan.key}`);
    if (
      product && config?.trial.enabled &&
      (product.trial_interval !== "day" || product.trial_interval_count !== 7)
    ) throw Error(`Trial mismatch ${plan.key}`);
    if (
      product && !config &&
      (product.trial_interval || product.trial_interval_count)
    ) throw Error(`Unconfigured trial ${plan.key}`);
    selected.set(plan.key, product);
    if (!plan.launch_confirmed && !options.confirmAnnualLaunch) continue;
    for (const who of creator ? [undefined, creator] : [undefined]) {
      const key = offerKey(plan, who);
      const code = who ? `${who}${plan.code_suffix}` : null;
      const matches = discounts.filter((d) =>
        d.metadata?.vantare_offer_key === key
      );
      if (matches.length > 1) throw Error(`Ambiguous discount ${key}`);
      if (
        discounts.some((d) =>
          code && d.code?.toUpperCase() === code &&
          d.metadata?.vantare_offer_key !== key
        )
      ) throw Error(`Creator code already owned ${code}`);
      const amount = plan.normal_cents -
        (who ? creatorPrice(plan.launch_cents) : plan.launch_cents);
      if (
        matches[0] &&
        (!product ||
          !discountMatches(matches[0], product.id, amount, code, !!who))
      ) throw Error(`Discount drift ${key}; review manually`);
    }
  }
  let writes = 0;
  const offers: Record<
    string,
    { discount_id: string; code: string | null; final_cents: number }
  > = {};
  const pending: string[] = [];
  for (const plan of PRICES.plans) {
    let product = selected.get(plan.key);
    if (!product) {
      product = await http("POST", "/products/", {
        organization_id: map.organization_id,
        name: `Vantare ${plan.key}`,
        visibility: "draft",
        recurring_interval: plan.interval,
        recurring_interval_count: 1,
        prices: [fixedPrice(plan.normal_cents)],
        metadata: { vantare_checkout_key: plan.key },
      }) as Resource;
      writes++;
    } else if (!currentPrice(product, plan.normal_cents)) {
      product = await http("PATCH", `/products/${product.id}`, {
        prices: [fixedPrice(plan.normal_cents)],
      }) as Resource;
      writes++;
    }
    const price = currentPrice(product, plan.normal_cents);
    if (!price || product.organization_id !== map.organization_id) {
      throw Error(`Price response mismatch ${plan.key}`);
    }
    const previous = map.checkout_keys[plan.key];
    const plus = plan.key.startsWith("pro_plus_");
    const config = previous ?? {
      polar_product_id: product.id,
      polar_price_ids: [],
      plan_sku: plan.key,
      billing_type: "subscription" as const,
      lifetime: false,
      active: true,
      capabilities: plus
        ? [
          "vantare.plan.pro",
          "vantare.channel.testers",
          "vantare.channel.nightly",
        ]
        : ["vantare.plan.pro"],
      channels: plus
        ? ["stable", "testers", "nightly"] as const
        : ["stable"] as const,
      launch_scope_version: null,
      trial: { enabled: false } as const,
      entitlement_product_key: "bundle" as const,
    };
    map.checkout_keys[plan.key] = {
      ...config,
      channels: [...config.channels],
      polar_price_ids: [...new Set([...config.polar_price_ids, price.id])],
    };
    map.product_id_to_checkout_key[product.id] = plan.key;
    for (const id of map.checkout_keys[plan.key]!.polar_price_ids) {
      map.price_id_to_checkout_key[id] = plan.key;
    }
    if (!plan.launch_confirmed && !options.confirmAnnualLaunch) {
      pending.push(plan.key);
      continue;
    }
    for (const who of creator ? [undefined, creator] : [undefined]) {
      const key = offerKey(plan, who);
      const code = who ? `${who}${plan.code_suffix}` : null;
      const final = who ? creatorPrice(plan.launch_cents) : plan.launch_cents;
      let discount = discounts.find((d) =>
        d.metadata?.vantare_offer_key === key
      );
      if (!discount) {
        discount = await http("POST", "/discounts/", {
          organization_id: map.organization_id,
          name: `Vantare ${key}`,
          type: "fixed",
          duration: who ? "repeating" : "forever",
          ...(who ? { duration_in_months: 2 } : {}),
          amounts: { eur: plan.normal_cents - final },
          products: [product.id],
          code,
          metadata: { vantare_offer_key: key },
        }) as Resource;
        writes++;
      }
      if (
        !discountMatches(
          discount,
          product.id,
          plan.normal_cents - final,
          code,
          !!who,
        )
      ) throw Error(`Discount response mismatch ${key}`);
      offers[key] = { discount_id: discount.id, code, final_cents: final };
    }
  }
  map.catalog_version = PRICES.catalog_version;
  const validated = loadPolarProductMap(JSON.stringify(map), {
    environment: options.environment,
    trialAntiAbuseConfirmed: true,
  });
  if (!validated.ok) {
    throw Error(`Generated mapping invalid: ${validated.code}`);
  }
  return {
    writes,
    map,
    offers,
    pending,
    creator_commission: PRICES.creator_commission,
  };
}

export function planOffline(creator?: string) {
  if (creator && !/^[A-Za-z0-9]{3,32}$/.test(creator)) {
    throw Error("Invalid creator");
  }
  return {
    ...PRICES,
    plans: PRICES.plans.map((p) => ({
      ...p,
      creator_cents: creatorPrice(p.launch_cents),
      launch_discount_cents: p.normal_cents - p.launch_cents,
      creator_discount_cents: p.normal_cents - creatorPrice(p.launch_cents),
      creator_code: creator ? `${creator.toUpperCase()}${p.code_suffix}` : null,
    })),
  };
}

export function parseArgs(args: string[]) {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (
      ["--apply", "--confirm-production", "--confirm-annual-launch"].includes(
        arg,
      )
    ) {
      if (flags.has(arg)) throw Error(`Duplicate ${arg}`);
      flags.add(arg);
    } else if (
      ["--environment", "--map", "--output", "--creator"].includes(arg)
    ) {
      if (values[arg] || !args[i + 1] || args[i + 1].startsWith("--")) {
        throw Error(`Invalid ${arg}`);
      }
      values[arg] = args[++i];
    } else {throw Error(
        "Unknown option; tokens are accepted only via environment",
      );}
  }
  const environment = values["--environment"];
  if (environment !== "sandbox" && environment !== "production") {
    throw Error("--environment sandbox|production required");
  }
  if (flags.has("--apply") && (!values["--map"] || !values["--output"])) {
    throw Error("--apply requires --map and --output");
  }
  if (
    flags.has("--apply") && environment === "production" &&
    !flags.has("--confirm-production")
  ) throw Error("Production requires --confirm-production");
  if (
    [values["--map"], values["--output"]].some((p) =>
      p && /(^|[\\/])\.env[^\\/]*($|[\\/])/i.test(p)
    )
  ) throw Error("Environment files are forbidden");
  if (values["--map"] && values["--map"] === values["--output"]) {
    throw Error("Output must not overwrite input");
  }
  return { values, flags, environment: environment as BillingEnvironment };
}

if (import.meta.main) {
  try {
    const { values, flags, environment } = parseArgs(Deno.args);
    const creator = values["--creator"];
    const plan = planOffline(creator);
    if (!flags.has("--apply")) {
      console.log(
        JSON.stringify({ environment, offline: true, ...plan }, null, 2),
      );
    } else {
      // Create output exclusively before any HTTP call. Never overwrite evidence.
      const output = await Deno.open(values["--output"], {
        write: true,
        createNew: true,
      });
      try {
        const raw = JSON.parse(await Deno.readTextFile(values["--map"]));
        const token = Deno.env.get("POLAR_ACCESS_TOKEN");
        if (!token) throw Error("POLAR_ACCESS_TOKEN not set");
        const base = environment === "sandbox"
          ? "https://sandbox-api.polar.sh/v1"
          : "https://api.polar.sh/v1";
        const http: Http = async (method, path, body) => {
          let response: Response;
          try {
            response = await fetch(`${base}${path}`, {
              method,
              redirect: "error",
              signal: AbortSignal.timeout(30000),
              headers: {
                "Polar-Version": "2026-10",
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: body ? JSON.stringify(body) : undefined,
            });
          } catch {
            throw Error(
              `Polar transport failed (${method}); inspect catalogue before retrying`,
            );
          }
          if (!response.ok) {
            throw Error(
              `Polar HTTP ${response.status} (${method}); response body withheld`,
            );
          }
          try {
            return await response.json();
          } catch {
            throw Error("Invalid Polar JSON response; body withheld");
          }
        };
        const result = await syncCatalog(http, raw, {
          environment,
          creator,
          confirmAnnualLaunch: flags.has("--confirm-annual-launch"),
        });
        const bytes = new TextEncoder().encode(
          JSON.stringify(result, null, 2) + "\n",
        );
        let offset = 0;
        while (offset < bytes.length) {
          offset += await output.write(bytes.subarray(offset));
        }
        console.log(
          JSON.stringify({
            environment,
            writes: result.writes,
            pending: result.pending,
            output: values["--output"],
          }),
        );
      } finally {
        output.close();
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Catalogue failed");
    Deno.exit(1);
  }
}
