import { polarPages } from "./payment-sync.ts";
import { NativeError } from "../_shared/native-auth.ts";
import {
  loadPolarProductMap,
  type PolarProductMap,
} from "../_shared/mapping.ts";
import { polarAdminRequest, type PolarClientDeps } from "../_shared/polar.ts";
import prices from "../scripts/polar-launch-prices.json" with { type: "json" };

// Reconcile only this code, never modify products or another creator's discount.
export async function ensureCreatorCode(
  id: string,
  code: string,
  map: PolarProductMap | undefined,
  polar: PolarClientDeps | undefined,
): Promise<string> {
  const loaded = map
    ? { ok: true as const, map }
    : loadPolarProductMap(undefined, { environment: "sandbox" });
  if (!loaded.ok || loaded.map.environment !== "sandbox") {
    throw new NativeError(503, "catalog_unavailable");
  }
  const products = Object.values(loaded.map.checkout_keys).filter((p) =>
    p.billing_type === "subscription"
  ).map((p) => p.polar_product_id);
  if (
    products.length !== 4 || products.some((p) => !p) ||
    new Set(products).size !== 4
  ) {
    throw new NativeError(503, "catalog_unavailable");
  }
  const organization = await polarAdminRequest(
    "GET",
    `/organizations/${loaded.map.organization_id}`,
    undefined,
    "sandbox",
    polar,
  );
  const settings = organization.customer_portal_settings as {
    subscription?: { update_plan?: boolean };
  } | undefined;
  if (
    organization.id !== loaded.map.organization_id ||
    settings?.subscription?.update_plan !== false
  ) throw new NativeError(503, "catalog_unavailable");
  const all = await polarPages("discounts", loaded.map.organization_id, polar);
  let monthlyId = "";
  for (const annual of [false, true]) {
    const offerKey = annual
      ? `creator:${code}:annual-renewals-v4`
      : `creator:${code}:renewals-v4`;
    const duration = annual
      ? prices.creator_renewals.annual_duration_months
      : prices.creator_renewals.monthly_duration_months;
    const matching = all.filter((d) =>
      d && typeof d === "object" &&
      (d.metadata as Record<string, unknown> | undefined)?.vantare_offer_key ===
        offerKey
    );
    if (matching.length > 1) throw new NativeError(409, "account_conflict");
    const discount = matching[0] ??
      await polarAdminRequest(
        "POST",
        "/discounts/",
        {
          name: `Vantare ${code}`,
          type: "percentage",
          basis_points: prices.creator_discount_basis_points,
          duration: "repeating",
          duration_in_months: duration,
          products: products.filter((p) =>
            Object.entries(loaded.map.checkout_keys).some(([key, value]) =>
              key.endsWith(annual ? "annual" : "monthly") &&
              value.polar_product_id === p
            )
          ),
          metadata: {
            vantare_offer_key: offerKey,
            vantare_creator_id: id,
          },
        },
        "sandbox",
        polar,
      );
    const metadata =
      (discount.metadata && typeof discount.metadata === "object" &&
          !Array.isArray(discount.metadata))
        ? discount.metadata as Record<string, unknown>
        : {};
    const scope = Array.isArray(discount.products)
      ? discount.products.map((p: unknown) =>
        typeof p === "string" ? p : (p as Record<string, unknown>).id
      )
      : [];
    if (
      typeof discount.id !== "string" ||
      discount.organization_id !== loaded.map.organization_id ||
      !!discount.code ||
      discount.type !== "percentage" ||
      discount.basis_points !== prices.creator_discount_basis_points ||
      discount.duration !== "repeating" ||
      discount.duration_in_months !==
        duration ||
      (metadata.vantare_creator_id
        ? metadata.vantare_creator_id !== id
        : String(metadata.vantare_offer_key).toUpperCase() !==
          offerKey.toUpperCase()) ||
      discount.starts_at || discount.ends_at || discount.max_redemptions ||
      scope.length !== 2 ||
      !Object.entries(loaded.map.checkout_keys).filter(([key]) =>
        key.endsWith(annual ? "annual" : "monthly")
      ).every(([, p]) => scope.includes(p.polar_product_id))
    ) throw new NativeError(409, "account_conflict");
    if (!annual) monthlyId = String(discount.id);
  }
  return monthlyId;
}
