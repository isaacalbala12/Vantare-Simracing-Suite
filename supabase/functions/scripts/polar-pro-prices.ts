// ISA-1499: deja el catálogo Pro de Polar en 5,99 €/mes y 59,90 €/año (IVA incluido).
//
// Idempotente: si los precios ya están como deben, no escribe nada.
//   - Pro mensual: mismo producto; se sustituye el precio activo. Polar archiva
//     el precio omitido y mantiene a los suscriptores actuales en su precio.
//   - Pro anual: producto recurrente anual nuevo, localizado por la metadata
//     vantare_checkout_key=pro_annual.
//
// Uso (desde supabase/functions):
//   deno run --allow-env=POLAR_ACCESS_TOKEN,POLAR_ENVIRONMENT --allow-net=sandbox-api.polar.sh,api.polar.sh \
//     scripts/polar-pro-prices.ts --organization-id <uuid> --pro-monthly-product-id <uuid> [--dry-run]
// Entorno: POLAR_ENVIRONMENT=sandbox|production, POLAR_ACCESS_TOKEN (no en --dry-run).
// Producción exige además --confirm-production. --dry-run no usa red.

export const PRO_MONTHLY_CENTS = 599;
export const PRO_ANNUAL_CENTS = 5990;
export const CURRENCY = "eur";
export const ANNUAL_METADATA_KEY = "vantare_checkout_key";
const API_BASE = {
  sandbox: "https://sandbox-api.polar.sh/v1",
  production: "https://api.polar.sh/v1",
} as const;

type Price = {
  id: string;
  is_archived?: boolean;
  amount_type?: string;
  price_amount?: number;
  price_currency?: string;
  tax_behavior?: string | null;
};
type Product = {
  id: string;
  recurring_interval?: string | null;
  is_archived?: boolean;
  prices?: Price[];
};
export type Http = (
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
) => Promise<unknown>;

export type Options = {
  organizationId: string;
  proMonthlyProductId: string;
};

export type Result = {
  writes: number;
  pro_monthly: { product_id: string; price_id: string };
  pro_annual: { product_id: string; price_id: string };
};

const fixedPrice = (cents: number) => ({
  amount_type: "fixed",
  price_amount: cents,
  price_currency: CURRENCY,
  tax_behavior: "inclusive",
});

/** Returns the single active price if it already matches, else null. */
export function matchingPrice(product: Product, cents: number): Price | null {
  const active = (product.prices ?? []).filter((price) => !price.is_archived);
  const [price] = active;
  return active.length === 1 && price.amount_type === "fixed" &&
      price.price_amount === cents && price.price_currency === CURRENCY &&
      price.tax_behavior === "inclusive"
    ? price
    : null;
}

async function ensurePrice(
  http: Http,
  product: Product,
  cents: number,
): Promise<{ priceId: string; wrote: boolean }> {
  const current = matchingPrice(product, cents);
  if (current) return { priceId: current.id, wrote: false };
  const updated = await http("PATCH", `/products/${product.id}`, {
    prices: [fixedPrice(cents)],
  }) as Product;
  const fresh = matchingPrice(updated, cents);
  if (!fresh) throw new Error(`product ${product.id} did not keep the price`);
  return { priceId: fresh.id, wrote: true };
}

export async function syncProPrices(
  http: Http,
  options: Options,
): Promise<Result> {
  let writes = 0;

  const monthly = await http(
    "GET",
    `/products/${options.proMonthlyProductId}`,
  ) as Product;
  if (monthly.recurring_interval !== "month" || monthly.is_archived) {
    throw new Error("Pro monthly product must be an active monthly product");
  }
  const monthlyPrice = await ensurePrice(http, monthly, PRO_MONTHLY_CENTS);
  if (monthlyPrice.wrote) writes++;

  const query = new URLSearchParams({
    organization_id: options.organizationId,
    is_archived: "false",
    [`metadata[${ANNUAL_METADATA_KEY}]`]: "pro_annual",
  });
  const listed = await http("GET", `/products/?${query}`) as {
    items?: Product[];
  };
  const candidates = listed.items ?? [];
  if (candidates.length > 1) {
    throw new Error("more than one active Pro annual product; fix by hand");
  }
  let annual = candidates[0];
  let annualPriceId: string;
  if (!annual) {
    annual = await http("POST", "/products/", {
      organization_id: options.organizationId,
      name: "Vantare Pro (anual)",
      recurring_interval: "year",
      recurring_interval_count: 1,
      prices: [fixedPrice(PRO_ANNUAL_CENTS)],
      metadata: { [ANNUAL_METADATA_KEY]: "pro_annual" },
    }) as Product;
    writes++;
    const created = matchingPrice(annual, PRO_ANNUAL_CENTS);
    if (!created) throw new Error("created Pro annual product has no price");
    annualPriceId = created.id;
  } else {
    if (annual.recurring_interval !== "year") {
      throw new Error("Pro annual product is not yearly; fix by hand");
    }
    const ensured = await ensurePrice(http, annual, PRO_ANNUAL_CENTS);
    if (ensured.wrote) writes++;
    annualPriceId = ensured.priceId;
  }

  return {
    writes,
    pro_monthly: {
      product_id: monthly.id,
      price_id: monthlyPrice.priceId,
    },
    pro_annual: { product_id: annual.id, price_id: annualPriceId },
  };
}

/** Prints every request and fakes Polar so the full plan runs offline. */
export function dryRunHttp(log: (line: string) => void): Http {
  return (method, path, body) => {
    log(`DRY-RUN ${method} ${path}${body ? " " + JSON.stringify(body) : ""}`);
    if (method === "GET" && path.startsWith("/products/?")) {
      return Promise.resolve({ items: [] });
    }
    const id = method === "GET" ? path.split("/")[2] : "<new-product-id>";
    const product: Product = {
      id,
      recurring_interval: method === "GET"
        ? "month"
        : (body as { recurring_interval?: string }).recurring_interval ??
          "month",
      prices: method === "GET"
        ? []
        : (body as { prices: Omit<Price, "id">[] }).prices.map((price) => ({
          ...price,
          id: "<new-price-id>",
        })),
    };
    return Promise.resolve(product);
  };
}

function liveHttp(base: string, token: string): Http {
  return async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      // Polar error bodies carry no secrets; the token never reaches stdout.
      throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
    }
    return JSON.parse(text);
  };
}

function arg(name: string): string | undefined {
  const index = Deno.args.indexOf(name);
  return index >= 0 ? Deno.args[index + 1] : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (import.meta.main) {
  const environment = Deno.env.get("POLAR_ENVIRONMENT");
  const dryRun = Deno.args.includes("--dry-run");
  const organizationId = arg("--organization-id") ?? "";
  const proMonthlyProductId = arg("--pro-monthly-product-id") ?? "";
  if (environment !== "sandbox" && environment !== "production") {
    console.error("POLAR_ENVIRONMENT must be sandbox or production");
    Deno.exit(2);
  }
  if (!UUID.test(organizationId) || !UUID.test(proMonthlyProductId)) {
    console.error(
      "--organization-id and --pro-monthly-product-id must be UUIDs",
    );
    Deno.exit(2);
  }
  if (
    environment === "production" && !dryRun &&
    !Deno.args.includes("--confirm-production")
  ) {
    console.error("production writes require --confirm-production");
    Deno.exit(2);
  }
  const base = API_BASE[environment];
  let http: Http;
  if (dryRun) {
    console.log(`DRY-RUN environment=${environment} base=${base}`);
    http = dryRunHttp(console.log);
  } else {
    const token = Deno.env.get("POLAR_ACCESS_TOKEN");
    if (!token) {
      console.error("POLAR_ACCESS_TOKEN is not set");
      Deno.exit(2);
    }
    http = liveHttp(base, token);
  }
  const result = await syncProPrices(http, {
    organizationId,
    proMonthlyProductId,
  });
  console.log(
    JSON.stringify({ environment, dry_run: dryRun, ...result }, null, 2),
  );
}
