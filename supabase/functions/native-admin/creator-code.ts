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
  ).map((p) => p.polar_launch_product_id);
  if (
    products.length !== 4 || products.some((p) => !p) ||
    new Set(products).size !== 4
  ) {
    throw new NativeError(503, "catalog_unavailable");
  }
  const all = await polarAdminRequest(
    "GET",
    "/discounts/",
    undefined,
    "sandbox",
    polar,
  );
  if (!Array.isArray(all.items)) {
    throw new NativeError(503, "bridge_unavailable");
  }
  // Fail closed on incomplete pages. Never create a duplicate after an uncertain POST.
  if (
    !all.pagination || typeof all.pagination !== "object" ||
    (all.pagination as Record<string, unknown>).max_page !== 1
  ) throw new NativeError(503, "catalog_unavailable");
  const matching = all.items.filter((d) =>
    d && typeof d === "object" && String(d.code).toUpperCase() === code
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
        duration_in_months: 2,
        code,
        products,
        organization_id: loaded.map.organization_id,
        metadata: {
          vantare_offer_key: `creator:${code}`,
          vantare_creator_id: id,
        },
      },
      "sandbox",
      polar,
    );
  const scope = Array.isArray(discount.products)
    ? discount.products.map((p: unknown) =>
      typeof p === "string" ? p : (p as Record<string, unknown>).id
    )
    : [];
  if (
    typeof discount.id !== "string" ||
    discount.organization_id !== loaded.map.organization_id ||
    discount.code !== code || discount.type !== "percentage" ||
    discount.basis_points !== 2000 || discount.duration !== "repeating" ||
    discount.duration_in_months !== 2 ||
    discount.metadata?.vantare_creator_id !== id ||
    scope.length !== products.length ||
    !products.every((p) => scope.includes(p))
  ) throw new NativeError(409, "account_conflict");
  return discount.id;
}
