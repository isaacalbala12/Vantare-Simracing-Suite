// Offline operator projection: never connects to Polar or a database.
import prices from "./polar-launch-prices.json" with { type: "json" };
import {
  type BillingEnvironment,
  type CheckoutKey,
  loadPolarProductMap,
} from "../_shared/mapping.ts";
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zero = "00000000-0000-0000-0000-000000000000";
export function prepareLaunchOffersSql(
  raw: string,
  environment: BillingEnvironment,
  trialAntiAbuseConfirmed = false,
): string {
  const result = loadPolarProductMap(raw, {
    environment,
    trialAntiAbuseConfirmed,
  });
  if (!result.ok) throw new Error(result.code);
  if (prices.launch_model !== "fixed_discount_once_on_normal_products") {
    throw new Error("launch_model_invalid");
  }
  const window = prices.launch_windows[environment];
  const creator = new Set(
    [
      ...Object.values(result.map.creator_discounts ?? {}),
      ...Object.values(result.map.creator_annual_discounts ?? {}),
    ].map((x) => x.toLowerCase()),
  );
  const discounts = new Set<string>();
  const products = new Set<string>();
  const rows: string[] = [];
  for (const plan of prices.plans) {
    const config = result.map.checkout_keys[plan.key as CheckoutKey];
    if (!config?.active) continue;
    const product = config.polar_product_id.toLowerCase();
    const discount = config.polar_launch_discount_id?.toLowerCase();
    if (
      !discount || !uuid.test(discount) || discount === zero ||
      product === zero || discount === product ||
      creator.has(discount) || discounts.has(discount) || products.has(product)
    ) throw new Error("launch_offer_invalid");
    discounts.add(discount);
    products.add(product);
    rows.push(
      "(" +
        [
          environment,
          plan.key,
          product,
          discount,
          window.starts_at,
          window.ends_at,
          prices.catalog_version,
        ].map(quote).join(",") + ")",
    );
  }
  if (!rows.length) throw new Error("launch_offers_missing");
  // No silent updates/rotation: drift requires a separately reviewed migration.
  const expected =
    "select environment,checkout_key,product_id::uuid,discount_id::uuid,starts_at::timestamptz,ends_at::timestamptz,catalog_version from (values " +
    rows.join(",\n") +
    ") as offer(environment,checkout_key,product_id,discount_id,starts_at,ends_at,catalog_version)";
  return [
    "-- Generated offline from #1661 catalogue and a validated product map.",
    "-- Operator must verify Polar once duration, fixed amount and product scope first.",
    "begin;",
    "insert into private.billing_launch_offers(environment,checkout_key,product_id,discount_id,starts_at,ends_at,catalog_version)",
    expected,
    "on conflict(environment,checkout_key) do nothing;",
    "do $registry$ begin if exists(",
    "(select environment,checkout_key,product_id,discount_id,starts_at,ends_at,catalog_version",
    "from private.billing_launch_offers where environment=" +
    quote(environment),
    "except " + expected + ")",
    ") then raise exception 'launch_offer_registry_drift'; end if; end $registry$;",
    "commit;",
    "",
  ].join("\n");
}
if (import.meta.main) {
  const args = [...Deno.args];
  const trial = args.includes("--trial-anti-abuse-confirmed");
  if (trial) args.splice(args.indexOf("--trial-anti-abuse-confirmed"), 1);
  if (
    args.length !== 6 || args[0] !== "--map" || args[2] !== "--environment" ||
    !["sandbox", "production"].includes(args[3]) || args[4] !== "--output"
  ) {
    throw new Error(
      "Usage: --map approved-map.json --environment sandbox|production --output reviewed.sql [--trial-anti-abuse-confirmed]",
    );
  }
  const sql = prepareLaunchOffersSql(
    await Deno.readTextFile(args[1]),
    args[3] as BillingEnvironment,
    trial,
  );
  await Deno.writeTextFile(args[5], sql, { createNew: true });
}
