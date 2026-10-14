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
};
export const PRICES = table as Omit<typeof table, "plans"> & { plans: Plan[] };
export type Resource = {
  id: string;
  organization_id: string;
  metadata?: Record<string, string>;
  recurring_interval?: string | null;
  recurring_interval_count?: number;
  is_archived?: boolean;
  visibility?: "draft" | "public" | "private";
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
  basis_points?: number;
  discount_id?: string | null;
  allow_discount_codes?: boolean;
  url?: string;
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
function creatorCode(creator?: string) {
  if (creator !== undefined && !/^[A-Za-z0-9]{3,32}$/.test(creator)) {
    throw Error("Creator must contain 3-32 alphanumeric characters");
  }
  return creator;
}
function sameProducts(resource: Resource, ids: string[]) {
  const actual = resource.products?.map((p) => p.id) ?? [];
  return actual.length === ids.length && new Set(actual).size === ids.length &&
    ids.every((id) => actual.includes(id));
}
function discountMatches(resource: Resource, ids: string[], code: string) {
  return resource.type === "percentage" && resource.basis_points === 2000 &&
    resource.duration === "repeating" && resource.duration_in_months === 2 &&
    resource.code === code && sameProducts(resource, ids) &&
    !resource.starts_at && !resource.ends_at && !resource.max_redemptions;
}
function linkMatches(resource: Resource, ids: string[], discountId: string) {
  // A shared link must inherit each product's trial: Pro seven days, Plus none.
  return sameProducts(resource, ids) && resource.discount_id === discountId &&
    resource.trial_interval == null && resource.trial_interval_count == null &&
    resource.allow_discount_codes === false && !!resource.url;
}

/** Reuses configured IDs or owned metadata; never guesses product names. */
export async function syncCatalog(http: Http, raw: unknown, options: Options) {
  const source = typeof raw === "object" && raw !== null && "map" in raw
    ? raw.map
    : raw;
  const loaded = loadPolarProductMap(JSON.stringify(source), {
    environment: options.environment,
    trialAntiAbuseConfirmed: true,
  });
  if (!loaded.ok) throw Error(loaded.code);
  const map = structuredClone(loaded.map);
  const creator = creatorCode(options.creator);
  const products = await list(http, "products", map.organization_id);
  const discounts = await list(http, "discounts", map.organization_id);
  // Organization tokens scope POSTs implicitly; verify their expected organization.
  const organization = await http(
    "GET",
    `/organizations/${map.organization_id}`,
  ) as {
    id?: string;
    customer_portal_settings?: { subscription?: { update_plan?: boolean } };
  } | null;
  if (organization?.id !== map.organization_id) {
    throw Error("Unexpected Polar organization");
  }
  // Product scope limits redemption, not an already attached subscription discount.
  if (
    (creator ||
      discounts.some((d) =>
        d.metadata?.vantare_offer_key?.startsWith("creator:")
      )) &&
    organization.customer_portal_settings?.subscription?.update_plan !== false
  ) {
    throw Error(
      "Creator offers require portal plan changes disabled; review organization settings",
    );
  }
  const links = creator
    ? await list(http, "checkout-links", map.organization_id)
    : [];
  const selected = new Map<string, Resource | undefined>();
  const priceOwners = new Map(Object.entries(map.price_id_to_checkout_key));
  const productOwners = new Map<string, string>();
  for (const [key, config] of Object.entries(map.checkout_keys)) {
    productOwners.set(config.polar_product_id, key);
    if (config.polar_launch_product_id) {
      productOwners.set(config.polar_launch_product_id, `${key}:launch`);
    }
  }
  // Both normal and launch products are preflighted before the first mutation.
  for (const plan of PRICES.plans) {
    const config = map.checkout_keys[plan.key];
    for (const launch of [false, true]) {
      const key = launch ? `${plan.key}:launch` : plan.key;
      const configuredId = launch
        ? config?.polar_launch_product_id
        : config?.polar_product_id;
      const matches = products.filter((p) =>
        p.id === configuredId ||
        (launch
          ? p.metadata?.vantare_catalog_key === key
          : p.metadata?.vantare_checkout_key === key)
      );
      if (matches.length > 1) throw Error(`Ambiguous product ${key}`);
      const product = matches[0];
      if (product) {
        const owner = productOwners.get(product.id);
        if (owner && owner !== key) {
          throw Error(`Product belongs to another catalog slot ${key}`);
        }
        productOwners.set(product.id, key);
      }
      if (configuredId && (!product || product.id !== configuredId)) {
        throw Error(`Configured product missing ${key}`);
      }
      if (
        product &&
        (product.is_archived || product.recurring_interval !== plan.interval ||
          (product.recurring_interval_count ?? 1) !== 1)
      ) {
        throw Error(`Invalid product interval/status ${key}`);
      }
      if (
        product && (config?.trial.enabled
          ? product.trial_interval !== "day" ||
            product.trial_interval_count !== 7
          : !!product.trial_interval || !!product.trial_interval_count)
      ) {
        throw Error(`Trial mismatch ${key}`);
      }
      for (const price of product?.prices ?? []) {
        const owner = priceOwners.get(price.id);
        if (owner && owner !== plan.key) {
          throw Error(`Observed price belongs to another plan ${key}`);
        }
        priceOwners.set(price.id, plan.key);
      }
      // PATCH hides replaced prices from future GETs. Memory cannot recover them
      // after a committed PATCH whose response was lost: require durable input first.
      if (
        product &&
        !currentPrice(
          product,
          launch ? plan.launch_cents : plan.normal_cents,
        ) &&
        (product.prices ?? []).some((p) =>
          map.price_id_to_checkout_key[p.id] !== plan.key
        )
      ) {
        throw Error(
          `Save observed price IDs in the input map before updating ${key}`,
        );
      }
      selected.set(key, product);
    }
  }
  // Old fixed launch/composite discounts need manual review, never silent migration.
  if (
    discounts.some((d) =>
      PRICES.plans.some((p) =>
        d.metadata?.vantare_offer_key?.startsWith(`${p.key}:`)
      )
    )
  ) {
    throw Error(
      "Legacy launch discounts present; review manually before applying v2",
    );
  }
  const idsBefore = PRICES.plans.map((p) =>
    selected.get(`${p.key}:launch`)?.id
  );
  const knownIds = idsBefore.filter((id): id is string => !!id);
  const discountKey = creator ? `creator:${creator}` : undefined;
  const matchingDiscounts = discounts.filter((d) =>
    discountKey && d.metadata?.vantare_offer_key === discountKey
  );
  if (matchingDiscounts.length > 1) throw Error("Ambiguous creator discount");
  let discount = matchingDiscounts[0] as Resource | undefined;
  if (
    creator &&
    discounts.some((d) =>
      d.code?.toUpperCase() === creator.toUpperCase() && d.id !== discount?.id
    )
  ) {
    throw Error(`Creator code already owned ${creator}`);
  }
  if (
    discount &&
    (!creator || knownIds.length !== PRICES.plans.length ||
      !discountMatches(discount, knownIds, creator))
  ) {
    throw Error("Creator discount drift; review manually");
  }
  const matchingLinks = links.filter((l) =>
    l.metadata?.vantare_creator_link === creator
  );
  if (matchingLinks.length > 1) throw Error("Ambiguous creator link");
  let link = matchingLinks[0] as Resource | undefined;
  if (link && (!discount || !linkMatches(link, knownIds, discount.id))) {
    throw Error("Creator link drift; review manually");
  }

  let writes = 0;
  const launchIds: string[] = [];
  let launchProductsPublished = true;
  const offers: Record<
    string,
    {
      product_id: string;
      discount_id: string | null;
      code: string | null;
      final_cents: number;
      renewal_cents: number;
    }
  > = {};
  for (const plan of PRICES.plans) {
    const previous = map.checkout_keys[plan.key];
    const plus = plan.key.startsWith("pro_plus_");
    const config = previous ?? {
      polar_product_id: "",
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
    const priceIds = new Set(config.polar_price_ids);
    const pair: Resource[] = [];
    for (const launch of [false, true]) {
      const key = launch ? `${plan.key}:launch` : plan.key;
      const cents = launch ? plan.launch_cents : plan.normal_cents;
      let product = selected.get(key);
      // Snapshot before PATCH may omit replaced/archived prices.
      for (const p of product?.prices ?? []) priceIds.add(p.id);
      if (!product) {
        product = await http("POST", "/products/", {
          name: `Vantare ${key}`,
          visibility: "draft",
          recurring_interval: plan.interval,
          recurring_interval_count: 1,
          ...(config.trial.enabled
            ? { trial_interval: "day", trial_interval_count: 7 }
            : {}),
          prices: [fixedPrice(cents)],
          metadata: launch
            ? { vantare_catalog_key: key }
            : { vantare_checkout_key: key },
        }) as Resource;
        writes++;
      } else if (!currentPrice(product, cents)) {
        product = await http("PATCH", `/products/${product.id}`, {
          prices: [fixedPrice(cents)],
        }) as Resource;
        writes++;
      }
      const price = currentPrice(product, cents);
      if (!price || product.organization_id !== map.organization_id) {
        throw Error(`Price response mismatch ${key}`);
      }
      priceIds.add(price.id);
      pair.push(product);
      map.product_id_to_checkout_key[product.id] = plan.key;
    }
    map.checkout_keys[plan.key] = {
      ...config,
      channels: [...config.channels],
      polar_product_id: pair[0].id,
      polar_launch_product_id: pair[1].id,
      polar_price_ids: [...priceIds],
    };
    for (const id of priceIds) map.price_id_to_checkout_key[id] = plan.key;
    launchIds.push(pair[1].id);
    launchProductsPublished &&= pair[1].visibility === "public" ||
      pair[1].visibility === "private";
    offers[`${plan.key}:launch`] = {
      product_id: pair[1].id,
      discount_id: null,
      code: null,
      final_cents: plan.launch_cents,
      renewal_cents: plan.launch_cents,
    };
  }
  if (creator) {
    if (!discount) {
      discount = await http("POST", "/discounts/", {
        name: `Vantare ${creator}`,
        type: "percentage",
        basis_points: PRICES.creator_discount_basis_points,
        duration: "repeating",
        duration_in_months: 2,
        products: launchIds,
        code: creator,
        metadata: { vantare_offer_key: discountKey },
      }) as Resource;
      writes++;
    }
    if (
      discount.organization_id !== map.organization_id ||
      !discountMatches(discount, launchIds, creator)
    ) {
      throw Error("Creator discount response mismatch");
    }
    // Polar rejects links to draft products. Publishing is a separate operator step.
    if (!link && launchProductsPublished) {
      link = await http("POST", "/checkout-links/", {
        payment_processor: "stripe",
        products: launchIds,
        discount_id: discount.id,
        allow_discount_codes: false,
        label: `Vantare ${creator}`,
        metadata: { vantare_creator_link: creator },
      }) as Resource;
      writes++;
    }
    if (
      link && (link.organization_id !== map.organization_id ||
        !linkMatches(link, launchIds, discount.id))
    ) {
      throw Error("Creator link response mismatch");
    }
    for (const plan of PRICES.plans) {
      offers[`${plan.key}:creator:${creator}`] = {
        product_id: map.checkout_keys[plan.key]!.polar_launch_product_id!,
        discount_id: discount.id,
        code: creator,
        final_cents: creatorPrice(plan.launch_cents),
        renewal_cents: plan.launch_cents,
      };
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
    creator_link: link ? { id: link.id, url: link.url, code: creator } : null,
    creator_link_pending: creator && !link
      ? "publish_launch_products_then_rerun"
      : null,
    distribution: PRICES.distribution,
    creator_plan_changes: PRICES.creator_plan_changes,
    creator_commission: PRICES.creator_commission,
  };
}

export function planOffline(creator?: string) {
  const code = creatorCode(creator);
  return {
    ...PRICES,
    creator_discount: code
      ? {
        code,
        type: "percentage",
        basis_points: PRICES.creator_discount_basis_points,
        duration: "repeating",
        duration_in_months: 2,
        scope: "launch_products_only",
        checkout_link: "one_per_creator",
      }
      : null,
    plans: PRICES.plans.map((p) => ({
      ...p,
      creator_cents: creatorPrice(p.launch_cents),
      creator_code: code ?? null,
      renewal_cents_after_creator: p.launch_cents,
    })),
  };
}

export function parseArgs(args: string[]) {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (
      ["--apply", "--confirm-production"].includes(
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

// Never dump validation input, context, headers or the raw response body.
async function validationDetails(response: Response, token: string) {
  if (response.status < 400 || response.status >= 500) return "";
  try {
    const data: unknown = await response.json();
    const detail = data && typeof data === "object" && "detail" in data
      ? data.detail
      : data;
    const errors = (Array.isArray(detail) ? detail : [detail]).flatMap(
      (entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { type, loc, msg } = entry;
        if (
          typeof type !== "string" || typeof msg !== "string" ||
          !Array.isArray(loc) ||
          !loc.every((part) =>
            typeof part === "string" || typeof part === "number"
          )
        ) return [];
        const redact = (value: string) => value.replaceAll(token, "[REDACTED]");
        return [{
          type: redact(type),
          loc: loc.map((part) =>
            typeof part === "string" ? redact(part) : part
          ),
          msg: redact(msg),
        }];
      },
    );
    return errors.length ? `validation: ${JSON.stringify(errors)}` : "";
  } catch {
    return "";
  }
}

export async function runCatalog(
  args: string[],
  fetcher: typeof fetch = fetch,
) {
  const { values, flags, environment } = parseArgs(args);
  const creator = values["--creator"];
  const plan = planOffline(creator);
  if (!flags.has("--apply")) {
    console.log(
      JSON.stringify({ environment, offline: true, ...plan }, null, 2),
    );
  } else {
    // Check before HTTP, but create only after successful synchronization.
    try {
      await Deno.lstat(values["--output"]);
      throw new Deno.errors.AlreadyExists(
        "Output already exists; use a new path",
      );
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    const raw = JSON.parse(await Deno.readTextFile(values["--map"]));
    const token = Deno.env.get("POLAR_ACCESS_TOKEN");
    if (!token) throw Error("POLAR_ACCESS_TOKEN not set");
    const base = environment === "sandbox"
      ? "https://sandbox-api.polar.sh/v1"
      : "https://api.polar.sh/v1";
    const http: Http = async (method, path, body) => {
      let response: Response;
      try {
        response = await fetcher(`${base}${path}`, {
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
          `Polar HTTP ${response.status} (${method}); ${
            await validationDetails(response, token) || "response body withheld"
          }`,
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
    });
    const bytes = new TextEncoder().encode(
      JSON.stringify(result, null, 2) + "\n",
    );
    // Exclusive creation also protects an output created since the preflight.
    const output = await Deno.open(values["--output"], {
      write: true,
      createNew: true,
    });
    let complete = false;
    try {
      let offset = 0;
      while (offset < bytes.length) {
        offset += await output.write(bytes.subarray(offset));
      }
      await output.sync();
      complete = true;
    } finally {
      output.close();
      if (!complete) await Deno.remove(values["--output"]);
    }
    console.log(
      JSON.stringify({
        environment,
        writes: result.writes,
        creator_link_id: result.creator_link?.id ?? null,
        creator_link_pending: result.creator_link_pending,
        output: values["--output"],
      }),
    );
  }
}

if (import.meta.main) {
  try {
    await runCatalog(Deno.args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Catalogue failed");
    Deno.exit(1);
  }
}
