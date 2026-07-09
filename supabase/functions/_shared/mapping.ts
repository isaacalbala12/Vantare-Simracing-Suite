export const REQUIRED_CHECKOUT_KEYS = [
  "launch_lifetime",
  "pro_monthly",
] as const;

export type RequiredCheckoutKey = (typeof REQUIRED_CHECKOUT_KEYS)[number];

export const V1_ENTITLEMENT_PRODUCT_KEY = "bundle";

const EXPECTED_KEY_META: Record<
  RequiredCheckoutKey,
  {
    plan_sku: string;
    billing_type: "one_time" | "subscription";
    lifetime: boolean;
  }
> = {
  launch_lifetime: {
    plan_sku: "launch_lifetime",
    billing_type: "one_time",
    lifetime: true,
  },
  pro_monthly: {
    plan_sku: "pro_monthly",
    billing_type: "subscription",
    lifetime: false,
  },
};

export interface CheckoutKeyConfig {
  polar_product_id: string;
  entitlement_product_key: string;
  plan_sku: string;
  billing_type: "one_time" | "subscription";
  lifetime: boolean;
}

export interface PolarProductMap {
  checkout_keys: Record<string, CheckoutKeyConfig>;
  product_id_to_checkout_key: Record<string, string>;
}

export type MappingErrorCode =
  | "mapping_missing"
  | "mapping_invalid_json"
  | "mapping_invalid_shape"
  | "mapping_missing_checkout_key"
  | "mapping_invalid_entitlement"
  | "mapping_missing_product_id"
  | "mapping_invalid_key_meta"
  | "mapping_product_id_unknown"
  | "mapping_product_id_mismatch";

export type MappingLoadResult =
  | { ok: true; map: PolarProductMap }
  | { ok: false; code: MappingErrorCode; message: string };

export type CheckoutKeyResolveResult =
  | { ok: true; key: RequiredCheckoutKey; config: CheckoutKeyConfig }
  | { ok: false; code: "invalid_product_key"; message: string };

export type ProductIdResolveResult =
  | { ok: true; key: RequiredCheckoutKey; config: CheckoutKeyConfig }
  | { ok: false; code: MappingErrorCode; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCheckoutKeyConfig(value: unknown): value is CheckoutKeyConfig {
  if (!isRecord(value)) return false;
  return (
    typeof value.polar_product_id === "string" &&
    typeof value.entitlement_product_key === "string" &&
    typeof value.plan_sku === "string" &&
    (value.billing_type === "one_time" ||
      value.billing_type === "subscription") &&
    typeof value.lifetime === "boolean"
  );
}

function validateRequiredKeyConfig(
  checkoutKey: RequiredCheckoutKey,
  config: CheckoutKeyConfig,
): MappingLoadResult | null {
  if (!config.polar_product_id.trim()) {
    return {
      ok: false,
      code: "mapping_missing_product_id",
      message: `checkout_keys.${checkoutKey}.polar_product_id is required`,
    };
  }

  const expected = EXPECTED_KEY_META[checkoutKey];
  if (config.plan_sku !== expected.plan_sku) {
    return {
      ok: false,
      code: "mapping_invalid_key_meta",
      message:
        `checkout_keys.${checkoutKey}.plan_sku must be "${expected.plan_sku}"`,
    };
  }
  if (config.billing_type !== expected.billing_type) {
    return {
      ok: false,
      code: "mapping_invalid_key_meta",
      message:
        `checkout_keys.${checkoutKey}.billing_type must be "${expected.billing_type}"`,
    };
  }
  if (config.lifetime !== expected.lifetime) {
    return {
      ok: false,
      code: "mapping_invalid_key_meta",
      message:
        `checkout_keys.${checkoutKey}.lifetime must be ${expected.lifetime}`,
    };
  }

  return null;
}

export function loadPolarProductMap(
  raw = Deno.env.get("POLAR_PRODUCT_MAP"),
): MappingLoadResult {
  if (!raw || raw.trim() === "") {
    return {
      ok: false,
      code: "mapping_missing",
      message: "POLAR_PRODUCT_MAP is not configured",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      code: "mapping_invalid_json",
      message: "POLAR_PRODUCT_MAP is not valid JSON",
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      code: "mapping_invalid_shape",
      message: "POLAR_PRODUCT_MAP must be a JSON object",
    };
  }

  const checkoutKeysRaw = parsed.checkout_keys;
  const productMapRaw = parsed.product_id_to_checkout_key;

  if (!isRecord(checkoutKeysRaw) || !isRecord(productMapRaw)) {
    return {
      ok: false,
      code: "mapping_invalid_shape",
      message:
        "POLAR_PRODUCT_MAP must include checkout_keys and product_id_to_checkout_key",
    };
  }

  const checkout_keys: Record<string, CheckoutKeyConfig> = {};
  for (const [key, value] of Object.entries(checkoutKeysRaw)) {
    if (!isCheckoutKeyConfig(value)) {
      return {
        ok: false,
        code: "mapping_invalid_shape",
        message: `checkout_keys.${key} is invalid`,
      };
    }
    checkout_keys[key] = value;
  }

  const product_id_to_checkout_key: Record<string, string> = {};
  for (const [productId, checkoutKey] of Object.entries(productMapRaw)) {
    if (typeof checkoutKey !== "string") {
      return {
        ok: false,
        code: "mapping_invalid_shape",
        message: `product_id_to_checkout_key.${productId} must be a string`,
      };
    }
    product_id_to_checkout_key[productId] = checkoutKey;
  }

  for (const requiredKey of REQUIRED_CHECKOUT_KEYS) {
    if (!checkout_keys[requiredKey]) {
      return {
        ok: false,
        code: "mapping_missing_checkout_key",
        message: `checkout_keys.${requiredKey} is required`,
      };
    }
    if (
      checkout_keys[requiredKey].entitlement_product_key !==
        V1_ENTITLEMENT_PRODUCT_KEY
    ) {
      return {
        ok: false,
        code: "mapping_invalid_entitlement",
        message:
          `checkout_keys.${requiredKey}.entitlement_product_key must be "${V1_ENTITLEMENT_PRODUCT_KEY}" in v1`,
      };
    }

    const keyError = validateRequiredKeyConfig(
      requiredKey,
      checkout_keys[requiredKey],
    );
    if (keyError) return keyError;
  }

  for (
    const [productId, checkoutKey] of Object.entries(product_id_to_checkout_key)
  ) {
    const config = checkout_keys[checkoutKey];
    if (!config) {
      return {
        ok: false,
        code: "mapping_product_id_unknown",
        message:
          `product_id_to_checkout_key.${productId} references unknown checkout key "${checkoutKey}"`,
      };
    }
    if (config.polar_product_id !== productId) {
      return {
        ok: false,
        code: "mapping_product_id_mismatch",
        message:
          `product_id_to_checkout_key.${productId} does not match checkout_keys.${checkoutKey}.polar_product_id`,
      };
    }
  }

  return {
    ok: true,
    map: { checkout_keys, product_id_to_checkout_key },
  };
}

export function resolveCheckoutKey(
  map: PolarProductMap,
  productKey: string,
): CheckoutKeyResolveResult {
  if (
    !(REQUIRED_CHECKOUT_KEYS as readonly string[]).includes(productKey)
  ) {
    return {
      ok: false,
      code: "invalid_product_key",
      message: `productKey "${productKey}" is not allowed`,
    };
  }

  const config = map.checkout_keys[productKey];
  if (!config) {
    return {
      ok: false,
      code: "invalid_product_key",
      message: `productKey "${productKey}" is not configured`,
    };
  }

  return {
    ok: true,
    key: productKey as RequiredCheckoutKey,
    config,
  };
}

export function resolveCheckoutKeyByProductId(
  map: PolarProductMap,
  productId: string,
): ProductIdResolveResult {
  const checkoutKey = map.product_id_to_checkout_key[productId];
  if (!checkoutKey) {
    return {
      ok: false,
      code: "mapping_product_id_unknown",
      message: `product_id "${productId}" is not mapped`,
    };
  }

  const resolved = resolveCheckoutKey(map, checkoutKey);
  if (!resolved.ok) {
    return {
      ok: false,
      code: "mapping_product_id_unknown",
      message: resolved.message,
    };
  }

  return resolved;
}

export function isAllowedCheckoutProductKey(productKey: string): boolean {
  return (REQUIRED_CHECKOUT_KEYS as readonly string[]).includes(productKey);
}