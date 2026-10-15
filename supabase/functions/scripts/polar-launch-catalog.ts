import productionFounders from "./founders-production-config.json" with {
  type: "json",
};
import productionInventory from "./polar-production-inventory.json" with {
  type: "json",
};
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
  name?: string;
  description?: string | null;
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
    tax_behavior?: string | null;
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

// Customer copy from product-contract.md; interval is shown by Polar's price.
// Product name/description are single strings, not localized fields in Polar.
function productCopy(key: CheckoutKey, launch = false) {
  if (key === "founders") {
    return {
      name: "Vantare Founders · Precio de fundador",
      description:
        "- Pago único de **50 €**: todos los módulos y widgets presentes y futuros, para siempre.\n- Disponible desde la **beta pública**, sin fecha de fin. El precio subirá más adelante, sin fecha prevista.\n- Sin caducidad ni renovación. No incluye roles privados ni Nightly.",
    };
  }
  const plus = key.startsWith("pro_plus_");
  return {
    name: (plus ? "Vantare Pro Plus" : "Vantare Pro") +
      (launch ? " · Precio de lanzamiento" : ""),
    description: plus
      ? "- Todo **Vantare Pro**: aplicación publicada en Stable y soporte en Discord.\n- Acceso a **Nightly/Beta privada**, tests, encuestas y previews activas."
      : "- Toda la aplicación publicada en **Stable**.\n- Soporte en **Discord**.",
  };
}

function copyMatches(product: Resource, copy: ReturnType<typeof productCopy>) {
  return product.name === copy.name && product.description === copy.description;
}

async function patchProductCopy(
  http: Http,
  product: Resource,
  copy: ReturnType<typeof productCopy>,
) {
  // Deliberately separate from price reconciliation: never send prices here.
  const updated = await http(
    "PATCH",
    `/products/${product.id}`,
    copy,
  ) as Resource;
  if (
    updated.id !== product.id ||
    updated.organization_id !== product.organization_id ||
    !copyMatches(updated, copy)
  ) throw Error("Product copy response mismatch");
  return updated;
}

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

function currentPrice(
  product: Resource,
  cents: number,
  allowUnknownTax = false,
) {
  const active = (product.prices ?? []).filter((p) => !p.is_archived);
  const p = active[0];
  return active.length === 1 && p.amount_type === "fixed" &&
      p.price_amount === cents && p.price_currency === "eur" &&
      (p.tax_behavior === "inclusive" ||
        (allowUnknownTax &&
          (p.tax_behavior == null || p.tax_behavior === "exclusive")))
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
function noTrial(resource: Resource) {
  return resource.trial_interval == null &&
    resource.trial_interval_count == null;
}
function launchDiscountMatches(
  discount: Resource,
  plan: Plan,
  productId: string,
  window: typeof PRICES.launch_windows.production,
) {
  return !discount.is_archived && discount.type === "fixed" &&
    discount.duration === "once" &&
    discount.duration_in_months == null &&
    discount.amounts?.eur === plan.normal_cents - plan.launch_cents &&
    Object.keys(discount.amounts ?? {}).length === 1 &&
    sameProducts(discount, [productId]) && !discount.code &&
    !discount.max_redemptions &&
    Date.parse(discount.starts_at ?? "") ===
      Date.parse(window.starts_at) &&
    Date.parse(discount.ends_at ?? "") ===
      Date.parse(window.ends_at);
}
function creatorMatches(discount: Resource, code: string, ids: string[]) {
  return !discount.is_archived && discount.type === "percentage" &&
    discount.basis_points === PRICES.creator_discount_basis_points &&
    discount.duration === "repeating" && discount.duration_in_months === 2 &&
    discount.code === code &&
    sameProducts(discount, ids) && !discount.starts_at && !discount.ends_at &&
    !discount.max_redemptions;
}
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
  const window = PRICES.launch_windows[options.environment];
  const products = await list(http, "products", map.organization_id);
  const discounts = await list(http, "discounts", map.organization_id);
  const organization = await http(
    "GET",
    `/organizations/${map.organization_id}`,
  ) as {
    id?: string;
    customer_portal_settings?: { subscription?: { update_plan?: boolean } };
  };
  if (organization?.id !== map.organization_id) {
    throw Error("Unexpected Polar organization");
  }
  // Discounts remain attached across plan changes. Retain the existing operational guard.
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
  const selected = new Map<string, Resource | undefined>();
  const selectedDiscounts = new Map<string, Resource | undefined>();
  const priceOwners = new Map(Object.entries(map.price_id_to_checkout_key));
  const productOwners = new Map<string, string>();
  for (const [key, config] of Object.entries(map.checkout_keys)) {
    productOwners.set(config.polar_product_id, key);
    if (config.polar_launch_product_id) {
      productOwners.set(
        config.polar_launch_product_id,
        `${key}:historical-launch`,
      );
    }
  }
  const founderId = map.checkout_keys.founders?.polar_product_id;
  const founders = founderId
    ? products.find((p) => p.id === founderId)
    : undefined;
  if (
    founderId &&
    (!founders || founders.is_archived || founders.recurring_interval != null ||
      !noTrial(founders) || !currentPrice(founders, 5000, true))
  ) throw Error("Invalid or missing Founders product");
  // Preflight every configured resource and price history before the first write.
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
    const owner = product && productOwners.get(product.id);
    if (owner && owner !== plan.key) {
      throw Error(`Product belongs to another catalog slot ${plan.key}`);
    }
    if (
      product &&
      (product.is_archived || product.recurring_interval !== plan.interval ||
        (product.recurring_interval_count ?? 1) !== 1)
    ) throw Error(`Invalid product interval/status ${plan.key}`);
    if (
      product &&
      (config?.trial.enabled
        ? product.trial_interval !== "day" || product.trial_interval_count !== 7
        : !noTrial(product))
    ) throw Error(`Trial mismatch ${plan.key}`);
    for (const price of product?.prices ?? []) {
      const priceOwner = priceOwners.get(price.id);
      if (priceOwner && priceOwner !== plan.key) {
        throw Error(`Observed price belongs to another plan ${plan.key}`);
      }
      priceOwners.set(price.id, plan.key);
    }
    if (
      product && !currentPrice(product, plan.normal_cents) &&
      (product.prices ?? []).some((p) =>
        map.price_id_to_checkout_key[p.id] !== plan.key
      )
    ) {
      throw Error(
        `Save observed price IDs in the input map before updating ${plan.key}`,
      );
    }
    selected.set(plan.key, product);
    const offerKey = `${plan.key}:launch-once-v3`;
    const found = discounts.filter((d) =>
      d.id === config?.polar_launch_discount_id ||
      d.metadata?.vantare_offer_key === offerKey
    );
    if (found.length > 1) throw Error(`Ambiguous launch discount ${plan.key}`);
    const discount = found[0];
    if (
      config?.polar_launch_discount_id &&
      discount?.id !== config.polar_launch_discount_id
    ) throw Error(`Configured launch discount missing ${plan.key}`);
    if (
      discount &&
      (!product || !launchDiscountMatches(discount, plan, product.id, window))
    ) throw Error(`Launch discount drift ${plan.key}`);
    selectedDiscounts.set(plan.key, discount);
  }
  // Existing legacy/composite promotions are never silently converted into the new offer.
  if (
    discounts.some((d) =>
      PRICES.plans.some((p) =>
        d.metadata?.vantare_offer_key?.startsWith(`${p.key}:`) &&
        d.metadata.vantare_offer_key !== `${p.key}:launch-once-v3`
      )
    )
  ) {
    throw Error(
      "Legacy launch discounts present; review manually before applying v3",
    );
  }
  const idsBefore = PRICES.plans.map((p) => selected.get(p.key)?.id).filter((
    id,
  ): id is string => !!id);
  const creatorDiscounts = discounts.filter((d) =>
    creator &&
    (d.id === map.creator_discounts?.[creator] ||
      d.metadata?.vantare_offer_key === `creator:${creator}`)
  );
  if (creatorDiscounts.length > 1) throw Error("Ambiguous creator discount");
  let creatorDiscount = creatorDiscounts[0] as Resource | undefined;
  if (
    creator &&
    discounts.some((d) =>
      d.code?.toUpperCase() === creator.toUpperCase() &&
      d.id !== creatorDiscount?.id
    )
  ) throw Error("Creator code already owned");
  if (
    creatorDiscount &&
    (!creator || idsBefore.length !== PRICES.plans.length ||
      !creatorMatches(creatorDiscount, creator, idsBefore))
  ) throw Error("Creator discount drift; review manually");
  let writes = 0;
  if (founders && !copyMatches(founders, productCopy("founders"))) {
    await patchProductCopy(http, founders, productCopy("founders"));
    writes++;
  }
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
  const normalIds: string[] = [];
  for (const plan of PRICES.plans) {
    const previous = map.checkout_keys[plan.key];
    const plus = plan.key.startsWith("pro_plus_");
    const config = previous ??
      {
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
    let product = selected.get(plan.key);
    for (const price of product?.prices ?? []) priceIds.add(price.id);
    if (!product) {
      product = await http("POST", "/products/", {
        ...productCopy(plan.key),
        visibility: "draft",
        recurring_interval: plan.interval,
        recurring_interval_count: 1,
        ...(config.trial.enabled
          ? { trial_interval: "day", trial_interval_count: 7 }
          : {}),
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
    if (!copyMatches(product, productCopy(plan.key))) {
      product = await patchProductCopy(http, product, productCopy(plan.key));
      writes++;
    }
    const price = currentPrice(product, plan.normal_cents);
    if (!price || product.organization_id !== map.organization_id) {
      throw Error(`Price response mismatch ${plan.key}`);
    }
    priceIds.add(price.id);
    normalIds.push(product.id);
    let discount = selectedDiscounts.get(plan.key);
    if (!discount) {
      discount = await http("POST", "/discounts/", {
        name: `Vantare ${plan.key} · Primer periodo beta pública`,
        type: "fixed",
        duration: "once",
        amounts: { eur: plan.normal_cents - plan.launch_cents },
        products: [product.id],
        starts_at: window.starts_at,
        ends_at: window.ends_at,
        metadata: { vantare_offer_key: `${plan.key}:launch-once-v3` },
      }) as Resource;
      writes++;
    }
    if (
      discount.organization_id !== map.organization_id ||
      !launchDiscountMatches(discount, plan, product.id, window)
    ) throw Error(`Launch discount response mismatch ${plan.key}`);
    map.checkout_keys[plan.key] = {
      ...config,
      channels: [...config.channels],
      polar_product_id: product.id,
      polar_launch_discount_id: discount.id,
      polar_price_ids: [...priceIds],
    };
    map.product_id_to_checkout_key[product.id] = plan.key;
    for (const id of priceIds) map.price_id_to_checkout_key[id] = plan.key;
    offers[`${plan.key}:launch`] = {
      product_id: product.id,
      discount_id: discount.id,
      code: null,
      final_cents: plan.launch_cents,
      renewal_cents: plan.normal_cents,
    };
  }
  if (creator) {
    if (!creatorDiscount) {
      creatorDiscount = await http("POST", "/discounts/", {
        name: `Vantare ${creator}`,
        type: "percentage",
        basis_points: PRICES.creator_discount_basis_points,
        duration: "repeating",
        duration_in_months: 2,
        products: normalIds,
        code: creator,
        metadata: { vantare_offer_key: `creator:${creator}` },
      }) as Resource;
      writes++;
    }
    if (
      creatorDiscount.organization_id !== map.organization_id ||
      !creatorMatches(creatorDiscount, creator, normalIds)
    ) throw Error("Creator discount response mismatch");
    map.creator_discounts = {
      ...map.creator_discounts,
      [creator]: creatorDiscount.id,
    };
    for (const plan of PRICES.plans) {
      offers[`${plan.key}:creator:${creator}`] = {
        product_id: map.checkout_keys[plan.key]!.polar_product_id,
        discount_id: creatorDiscount.id,
        code: creator,
        final_cents: creatorPrice(plan.normal_cents),
        renewal_cents: plan.normal_cents,
      };
    }
  }
  if (founders) {
    offers.founders = {
      product_id: founders.id,
      discount_id: null,
      code: null,
      final_cents: 5000,
      renewal_cents: 0,
    };
  }
  map.catalog_version = PRICES.catalog_version;
  return {
    writes,
    map,
    offers,
    creator_link: null,
    creator_link_pending: null,
    distribution: PRICES.distribution,
    creator_plan_changes: PRICES.creator_plan_changes,
    creator_commission: PRICES.creator_commission,
  };
}
export function planOffline(
  creator?: string,
  environment: BillingEnvironment = "production",
) {
  const window = PRICES.launch_windows[environment];
  const code = creatorCode(creator);
  return {
    ...PRICES,
    production_apply_ready: true,
    application_checkout: {
      automatic_launch_discount: true,
      allow_discount_codes: false,
      creator_code_server_validated: true,
      launch_creator_combination: "rejected",
      launch_trial: false,
    },
    creator_discount: code
      ? {
        code,
        type: "percentage",
        basis_points: PRICES.creator_discount_basis_points,
        duration: "repeating",
        duration_in_months: 2,
        scope: "normal_subscription_products_only",
        combinable_with_launch: false,
      }
      : null,
    plans: PRICES.plans.map((p) => ({
      ...p,
      normal_product: productCopy(p.key),
      launch_discount: {
        type: "fixed",
        duration: "once",
        amounts: { eur: p.normal_cents - p.launch_cents },
        ...window,
      },
      creator_cents: creatorPrice(p.normal_cents),
      creator_code: code ?? null,
      renewal_cents: p.normal_cents,
    })),
    founders: {
      ...productCopy("founders"),
      amount_cents: 5000,
      billing_type: "one_time",
      tax_behavior: null,
      ends_at: null,
      product_id_configuration:
        "POLAR_PRODUCT_MAP.checkout_keys.founders.polar_product_id",
    },
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
  const plan = planOffline(creator, environment);
  if (!flags.has("--apply")) {
    console.log(
      JSON.stringify(
        {
          environment,
          offline: true,
          ...plan,
          ...(environment === "production"
            ? {
              production_inventory: {
                ...productionInventory,
                founders: productionFounders,
              },
            }
            : {}),
        },
        null,
        2,
      ),
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
        creator_link_id: null,
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
