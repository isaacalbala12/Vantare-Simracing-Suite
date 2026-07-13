import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadPolarProductMap,
  resolveCheckoutKey,
  resolveCheckoutKeyByProductId,
} from "./mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "./test-fixtures.ts";

Deno.test("loadPolarProductMap: valid mapping with polar_product_id works", () => {
  const result = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON);
  assertEquals(result.ok, true);
  if (!result.ok) return;

  assertEquals(
    result.map.checkout_keys.launch_lifetime.polar_product_id,
    "00000000-0000-0000-0000-000000000001",
  );
  assertEquals(result.map.checkout_keys.launch_lifetime.entitlement_product_key, "bundle");
  assertEquals(result.map.checkout_keys.pro_monthly.entitlement_product_key, "bundle");
});

Deno.test("loadPolarProductMap: price_id_to_checkout_key only mapping fails", () => {
  const legacy = JSON.stringify({
    checkout_keys: {
      launch_lifetime: {
        polar_product_id: "p1",
        polar_price_id: "pr1",
        entitlement_product_key: "bundle",
        plan_sku: "launch_lifetime",
        billing_type: "one_time",
        lifetime: true,
      },
      pro_monthly: {
        polar_product_id: "p2",
        polar_price_id: "pr2",
        entitlement_product_key: "bundle",
        plan_sku: "pro_monthly",
        billing_type: "subscription",
        lifetime: false,
      },
    },
    price_id_to_checkout_key: {
      pr1: "launch_lifetime",
      pr2: "pro_monthly",
    },
  });
  const result = loadPolarProductMap(legacy);
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, "mapping_invalid_shape");
});

Deno.test("loadPolarProductMap: invalid JSON fails", () => {
  const result = loadPolarProductMap("{not-json");
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, "mapping_invalid_json");
});

Deno.test("loadPolarProductMap: missing launch_lifetime fails", () => {
  const parsed = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON) as Record<string, unknown>;
  const checkoutKeys = parsed.checkout_keys as Record<string, unknown>;
  delete checkoutKeys.launch_lifetime;
  const result = loadPolarProductMap(JSON.stringify(parsed));
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, "mapping_missing_checkout_key");
});

Deno.test("loadPolarProductMap: missing pro_monthly fails", () => {
  const parsed = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON) as Record<string, unknown>;
  const checkoutKeys = parsed.checkout_keys as Record<string, unknown>;
  delete checkoutKeys.pro_monthly;
  const result = loadPolarProductMap(JSON.stringify(parsed));
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, "mapping_missing_checkout_key");
});

Deno.test("loadPolarProductMap: missing polar_product_id fails", () => {
  const parsed = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON) as {
    checkout_keys: Record<string, { polar_product_id: string }>;
  };
  parsed.checkout_keys.launch_lifetime.polar_product_id = "   ";
  const result = loadPolarProductMap(JSON.stringify(parsed));
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, "mapping_missing_product_id");
});

Deno.test("loadPolarProductMap: product_id_to_checkout_key incoherent fails", () => {
  const parsed = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON) as {
    product_id_to_checkout_key: Record<string, string>;
  };
  parsed.product_id_to_checkout_key["00000000-0000-0000-0000-000000000001"] =
    "pro_monthly";
  const result = loadPolarProductMap(JSON.stringify(parsed));
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, "mapping_product_id_mismatch");
});

Deno.test("resolveCheckoutKeyByProductId: unknown product_id fails", () => {
  const loaded = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON);
  assertEquals(loaded.ok, true);
  if (!loaded.ok) return;

  const result = resolveCheckoutKeyByProductId(loaded.map, "product-unknown");
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, "mapping_product_id_unknown");
});

Deno.test("loadPolarProductMap: entitlement other than bundle fails in v1", () => {
  const parsed = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON) as {
    checkout_keys: Record<string, { entitlement_product_key: string }>;
  };
  parsed.checkout_keys.pro_monthly.entitlement_product_key = "overlays";
  const result = loadPolarProductMap(JSON.stringify(parsed));
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.code, "mapping_invalid_entitlement");
});

Deno.test("resolveCheckoutKey: known product key resolves config", () => {
  const loaded = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON);
  assertEquals(loaded.ok, true);
  if (!loaded.ok) return;

  const result = resolveCheckoutKey(loaded.map, "launch_lifetime");
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.config.plan_sku, "launch_lifetime");
});