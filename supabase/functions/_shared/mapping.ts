export const CHECKOUT_KEYS = [
  "launch_lifetime",
  "pro_monthly",
  "pro_plus_monthly",
] as const;

export const REQUIRED_CONFIGURED_CHECKOUT_KEYS = [
  "launch_lifetime",
  "pro_monthly",
] as const;

export type CheckoutKey = (typeof CHECKOUT_KEYS)[number];
export type RequiredCheckoutKey = CheckoutKey;
export type BillingEnvironment = "sandbox" | "production";
export type ReleaseChannel = "stable" | "testers" | "nightly";
export const V1_ENTITLEMENT_PRODUCT_KEY = "bundle" as const;

export type TrialConfig =
  | { enabled: false }
  | {
    enabled: true;
    interval: "day";
    interval_count: 7;
    provider_anti_abuse_confirmed: true;
  };

export interface CheckoutKeyConfig {
  polar_product_id: string;
  polar_price_ids: string[];
  plan_sku: CheckoutKey;
  billing_type: "one_time" | "subscription";
  lifetime: boolean;
  active: boolean;
  capabilities: string[];
  channels: ReleaseChannel[];
  launch_scope_version: string | null;
  trial: TrialConfig;
  entitlement_product_key: typeof V1_ENTITLEMENT_PRODUCT_KEY;
}

export interface PolarProductMap {
  schema_version: 2;
  environment: BillingEnvironment;
  catalog_version: string;
  organization_id: string;
  checkout_keys: Partial<Record<CheckoutKey, CheckoutKeyConfig>>;
  product_id_to_checkout_key: Record<string, CheckoutKey>;
  price_id_to_checkout_key: Record<string, CheckoutKey>;
}

export type MappingErrorCode =
  | "mapping_missing"
  | "mapping_invalid_json"
  | "mapping_invalid_shape"
  | "mapping_invalid_schema_version"
  | "mapping_environment_missing"
  | "mapping_environment_mismatch"
  | "mapping_missing_checkout_key"
  | "mapping_missing_product_id"
  | "mapping_missing_price_id"
  | "mapping_invalid_key_meta"
  | "mapping_trial_unverified"
  | "mapping_product_id_unknown"
  | "mapping_product_id_mismatch"
  | "mapping_price_id_unknown"
  | "mapping_price_id_mismatch"
  | "mapping_checkout_unavailable";

export type MappingLoadResult =
  | { ok: true; map: PolarProductMap }
  | { ok: false; code: MappingErrorCode; message: string };

export type CheckoutKeyResolveResult =
  | { ok: true; key: CheckoutKey; config: CheckoutKeyConfig }
  | {
    ok: false;
    code: "invalid_product_key" | "mapping_checkout_unavailable";
    message: string;
  };

export type ProductIdResolveResult =
  | { ok: true; key: CheckoutKey; config: CheckoutKeyConfig }
  | { ok: false; code: MappingErrorCode; message: string };

export type MappingLoadOptions = {
  environment?: string | null;
  trialAntiAbuseConfirmed?: boolean;
};

const EXPECTED_KEY_META: Record<
  CheckoutKey,
  Omit<
    CheckoutKeyConfig,
    | "polar_product_id"
    | "polar_price_ids"
    | "active"
    | "trial"
    | "entitlement_product_key"
  >
> = {
  launch_lifetime: {
    plan_sku: "launch_lifetime",
    billing_type: "one_time",
    lifetime: true,
    capabilities: ["vantare.edition.launch_v1", "vantare.channel.testers"],
    channels: ["stable", "testers"],
    launch_scope_version: "launch_v1",
  },
  pro_monthly: {
    plan_sku: "pro_monthly",
    billing_type: "subscription",
    lifetime: false,
    capabilities: ["vantare.plan.pro"],
    channels: ["stable"],
    launch_scope_version: null,
  },
  pro_plus_monthly: {
    plan_sku: "pro_plus_monthly",
    billing_type: "subscription",
    lifetime: false,
    capabilities: [
      "vantare.plan.pro",
      "vantare.channel.testers",
      "vantare.channel.nightly",
    ],
    channels: ["stable", "testers", "nightly"],
    launch_scope_version: null,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
}

function stringArray(value: unknown): string[] | null {
  if (
    !Array.isArray(value) || value.some((entry) => typeof entry !== "string")
  ) {
    return null;
  }
  const values = value.map((entry) => entry.trim());
  if (
    values.some((entry) => !entry) || new Set(values).size !== values.length
  ) {
    return null;
  }
  return values;
}

function sameSet(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length &&
    expected.every((value) => actual.includes(value));
}

function fail(code: MappingErrorCode, message: string): MappingLoadResult {
  return { ok: false, code, message };
}

function parseConfig(
  key: CheckoutKey,
  value: unknown,
): MappingLoadResult | CheckoutKeyConfig {
  if (!isRecord(value)) {
    return fail("mapping_invalid_shape", `checkout_keys.${key} is invalid`);
  }
  const priceIds = stringArray(value.polar_price_ids);
  const capabilities = stringArray(value.capabilities);
  const channels = stringArray(value.channels);
  if (!isUuid(value.polar_product_id)) {
    return fail(
      "mapping_missing_product_id",
      `checkout_keys.${key}.polar_product_id must be a UUID`,
    );
  }
  if (
    !priceIds || priceIds.length === 0 || priceIds.some((id) => !isUuid(id))
  ) {
    return fail(
      "mapping_missing_price_id",
      `checkout_keys.${key}.polar_price_ids must contain UUIDs`,
    );
  }
  if (!capabilities || !channels || !isRecord(value.trial)) {
    return fail(
      "mapping_invalid_shape",
      `checkout_keys.${key} contract is invalid`,
    );
  }
  const trial = value.trial.enabled === false
    ? { enabled: false } as const
    : value.trial.enabled === true && value.trial.interval === "day" &&
        value.trial.interval_count === 7 &&
        value.trial.provider_anti_abuse_confirmed === true
    ? {
      enabled: true,
      interval: "day",
      interval_count: 7,
      provider_anti_abuse_confirmed: true,
    } as const
    : null;
  if (!trial) {
    return fail(
      "mapping_invalid_key_meta",
      `checkout_keys.${key}.trial is invalid`,
    );
  }

  const config: CheckoutKeyConfig = {
    polar_product_id: value.polar_product_id,
    polar_price_ids: priceIds,
    plan_sku: value.plan_sku as CheckoutKey,
    billing_type: value.billing_type as "one_time" | "subscription",
    lifetime: value.lifetime as boolean,
    active: value.active as boolean,
    capabilities,
    channels: channels as ReleaseChannel[],
    launch_scope_version: value.launch_scope_version as string | null,
    trial,
    entitlement_product_key: V1_ENTITLEMENT_PRODUCT_KEY,
  };
  const expected = EXPECTED_KEY_META[key];
  if (
    config.plan_sku !== expected.plan_sku ||
    config.billing_type !== expected.billing_type ||
    config.lifetime !== expected.lifetime ||
    typeof config.active !== "boolean" ||
    !sameSet(config.capabilities, expected.capabilities) ||
    !sameSet(config.channels, expected.channels) ||
    config.launch_scope_version !== expected.launch_scope_version
  ) {
    return fail(
      "mapping_invalid_key_meta",
      `checkout_keys.${key} does not match the approved commercial contract`,
    );
  }
  if (key !== "pro_monthly" && trial.enabled) {
    return fail(
      "mapping_invalid_key_meta",
      `checkout_keys.${key} cannot enable the Pro trial`,
    );
  }
  return config;
}

export function loadPolarProductMap(
  raw = Deno.env.get("POLAR_PRODUCT_MAP"),
  options: MappingLoadOptions = {},
): MappingLoadResult {
  if (!raw?.trim()) {
    return fail("mapping_missing", "POLAR_PRODUCT_MAP is not configured");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("mapping_invalid_json", "POLAR_PRODUCT_MAP is not valid JSON");
  }
  if (!isRecord(parsed)) {
    return fail(
      "mapping_invalid_shape",
      "POLAR_PRODUCT_MAP must be a JSON object",
    );
  }
  if (parsed.schema_version !== 2) {
    return fail(
      "mapping_invalid_schema_version",
      "POLAR_PRODUCT_MAP schema_version must be 2",
    );
  }
  if (parsed.environment !== "sandbox" && parsed.environment !== "production") {
    return fail(
      "mapping_invalid_shape",
      "POLAR_PRODUCT_MAP environment is invalid",
    );
  }
  const expectedEnvironment = options.environment ??
    Deno.env.get("POLAR_ENVIRONMENT");
  if (
    expectedEnvironment !== "sandbox" && expectedEnvironment !== "production"
  ) {
    return fail(
      "mapping_environment_missing",
      "POLAR_ENVIRONMENT must be sandbox or production",
    );
  }
  if (parsed.environment !== expectedEnvironment) {
    return fail(
      "mapping_environment_mismatch",
      "POLAR_PRODUCT_MAP does not match POLAR_ENVIRONMENT",
    );
  }
  if (
    typeof parsed.catalog_version !== "string" ||
    !parsed.catalog_version.trim() || !isUuid(parsed.organization_id)
  ) {
    return fail(
      "mapping_invalid_shape",
      "catalog_version and organization_id are required",
    );
  }
  if (
    !isRecord(parsed.checkout_keys) ||
    !isRecord(parsed.product_id_to_checkout_key) ||
    !isRecord(parsed.price_id_to_checkout_key)
  ) {
    return fail(
      "mapping_invalid_shape",
      "POLAR_PRODUCT_MAP direct and inverse maps are required",
    );
  }

  const checkoutKeys: Partial<Record<CheckoutKey, CheckoutKeyConfig>> = {};
  for (const [rawKey, rawConfig] of Object.entries(parsed.checkout_keys)) {
    if (!isAllowedCheckoutProductKey(rawKey)) {
      return fail(
        "mapping_invalid_shape",
        `checkout_keys.${rawKey} is not recognized`,
      );
    }
    const config = parseConfig(rawKey, rawConfig);
    if ("ok" in config) return config;
    checkoutKeys[rawKey] = config;
  }
  for (const key of REQUIRED_CONFIGURED_CHECKOUT_KEYS) {
    if (!checkoutKeys[key]) {
      return fail(
        "mapping_missing_checkout_key",
        `checkout_keys.${key} is required`,
      );
    }
  }
  const pro = checkoutKeys.pro_monthly;
  if (
    pro?.trial.enabled &&
    !(options.trialAntiAbuseConfirmed ??
      Deno.env.get("POLAR_TRIAL_ANTI_ABUSE_CONFIRMED") === "true")
  ) {
    return fail(
      "mapping_trial_unverified",
      "Pro trial requires verified Polar anti-abuse configuration",
    );
  }

  const productInverse: Record<string, CheckoutKey> = {};
  for (
    const [id, rawKey] of Object.entries(parsed.product_id_to_checkout_key)
  ) {
    if (
      !isUuid(id) || typeof rawKey !== "string" ||
      !isAllowedCheckoutProductKey(rawKey)
    ) {
      return fail(
        "mapping_product_id_unknown",
        "product inverse map contains an unknown entry",
      );
    }
    productInverse[id] = rawKey;
  }
  const priceInverse: Record<string, CheckoutKey> = {};
  for (const [id, rawKey] of Object.entries(parsed.price_id_to_checkout_key)) {
    if (
      !isUuid(id) || typeof rawKey !== "string" ||
      !isAllowedCheckoutProductKey(rawKey)
    ) {
      return fail(
        "mapping_price_id_unknown",
        "price inverse map contains an unknown entry",
      );
    }
    priceInverse[id] = rawKey;
  }

  for (
    const [key, config] of Object.entries(checkoutKeys) as [
      CheckoutKey,
      CheckoutKeyConfig,
    ][]
  ) {
    if (productInverse[config.polar_product_id] !== key) {
      return fail(
        "mapping_product_id_mismatch",
        `checkout_keys.${key}.polar_product_id is not mapped back exactly`,
      );
    }
    for (const priceId of config.polar_price_ids) {
      if (priceInverse[priceId] !== key) {
        return fail(
          "mapping_price_id_mismatch",
          `checkout_keys.${key} price is not mapped back exactly`,
        );
      }
    }
  }
  for (const [id, key] of Object.entries(productInverse)) {
    if (checkoutKeys[key]?.polar_product_id !== id) {
      return fail(
        "mapping_product_id_mismatch",
        `product_id_to_checkout_key.${id} is not symmetric`,
      );
    }
  }
  for (const [id, key] of Object.entries(priceInverse)) {
    if (!checkoutKeys[key]?.polar_price_ids.includes(id)) {
      return fail(
        "mapping_price_id_mismatch",
        `price_id_to_checkout_key.${id} is not symmetric`,
      );
    }
  }

  return {
    ok: true,
    map: {
      schema_version: 2,
      environment: parsed.environment,
      catalog_version: parsed.catalog_version,
      organization_id: parsed.organization_id,
      checkout_keys: checkoutKeys,
      product_id_to_checkout_key: productInverse,
      price_id_to_checkout_key: priceInverse,
    },
  };
}

export function resolveCheckoutKey(
  map: PolarProductMap,
  productKey: string,
): CheckoutKeyResolveResult {
  if (!isAllowedCheckoutProductKey(productKey)) {
    return {
      ok: false,
      code: "invalid_product_key",
      message: "productKey is not allowed",
    };
  }
  const config = map.checkout_keys[productKey];
  if (!config || !config.active) {
    return {
      ok: false,
      code: "mapping_checkout_unavailable",
      message: "This checkout is not configured",
    };
  }
  return { ok: true, key: productKey, config };
}

export function resolveCheckoutKeyByProductId(
  map: PolarProductMap,
  productId: string,
): ProductIdResolveResult {
  const key = map.product_id_to_checkout_key[productId];
  if (!key) {
    return fail(
      "mapping_product_id_unknown",
      "product_id is not mapped",
    ) as ProductIdResolveResult;
  }
  const config = map.checkout_keys[key];
  if (!config || !config.active) {
    return {
      ok: false,
      code: "mapping_checkout_unavailable",
      message: "This checkout is not configured",
    };
  }
  return { ok: true, key, config };
}

export function resolveCheckoutKeyByPriceId(
  map: PolarProductMap,
  priceId: string,
): ProductIdResolveResult {
  const key = map.price_id_to_checkout_key[priceId];
  if (!key) {
    return fail(
      "mapping_price_id_unknown",
      "price_id is not mapped",
    ) as ProductIdResolveResult;
  }
  const config = map.checkout_keys[key];
  if (!config || !config.active) {
    return {
      ok: false,
      code: "mapping_checkout_unavailable",
      message: "This checkout is not configured",
    };
  }
  return { ok: true, key, config };
}

export function isAllowedCheckoutProductKey(
  productKey: string,
): productKey is CheckoutKey {
  return (CHECKOUT_KEYS as readonly string[]).includes(productKey);
}
