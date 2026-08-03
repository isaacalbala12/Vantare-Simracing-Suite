export const SANDBOX_ENVIRONMENT = "sandbox";

export const SANDBOX_IDS = {
  organization: "00000000-0000-0000-0000-000000000100",
  launchProduct: "00000000-0000-0000-0000-000000000001",
  launchPrice: "00000000-0000-0000-0000-000000000002",
  proProduct: "00000000-0000-0000-0000-000000000003",
  proPrice: "00000000-0000-0000-0000-000000000004",
  proPlusProduct: "00000000-0000-0000-0000-000000000005",
  proPlusPrice: "00000000-0000-0000-0000-000000000006",
} as const;

export const VALID_POLAR_PRODUCT_MAP_JSON = JSON.stringify({
  schema_version: 2,
  environment: SANDBOX_ENVIRONMENT,
  catalog_version: "test-2026-08-02.1",
  organization_id: "00000000-0000-0000-0000-000000000100",
  checkout_keys: {
    launch_lifetime: {
      polar_product_id: "00000000-0000-0000-0000-000000000001",
      polar_price_ids: ["00000000-0000-0000-0000-000000000002"],
      plan_sku: "launch_lifetime",
      billing_type: "one_time",
      lifetime: true,
      active: true,
      capabilities: ["vantare.edition.launch_v1", "vantare.channel.testers"],
      channels: ["stable", "testers"],
      launch_scope_version: "launch_v1",
      trial: { enabled: false },
    },
    pro_monthly: {
      polar_product_id: "00000000-0000-0000-0000-000000000003",
      polar_price_ids: ["00000000-0000-0000-0000-000000000004"],
      plan_sku: "pro_monthly",
      billing_type: "subscription",
      lifetime: false,
      active: true,
      capabilities: ["vantare.plan.pro"],
      channels: ["stable"],
      launch_scope_version: null,
      trial: { enabled: false },
    },
  },
  product_id_to_checkout_key: {
    "00000000-0000-0000-0000-000000000001": "launch_lifetime",
    "00000000-0000-0000-0000-000000000003": "pro_monthly",
  },
  price_id_to_checkout_key: {
    "00000000-0000-0000-0000-000000000002": "launch_lifetime",
    "00000000-0000-0000-0000-000000000004": "pro_monthly",
  },
});

/**
 * Complete synthetic catalog for cross-cutting billing lifecycle tests.
 * It must never be used as deploy configuration: all identifiers are reserved
 * zero UUIDs, the environment is always sandbox and Pro trial support requires
 * the explicit anti-abuse test option when loaded.
 */
export const FULL_SANDBOX_PRODUCT_MAP_JSON = JSON.stringify({
  schema_version: 2,
  environment: SANDBOX_ENVIRONMENT,
  catalog_version: "bil-09-lifecycle-v1",
  organization_id: SANDBOX_IDS.organization,
  checkout_keys: {
    launch_lifetime: {
      polar_product_id: SANDBOX_IDS.launchProduct,
      polar_price_ids: [SANDBOX_IDS.launchPrice],
      plan_sku: "launch_lifetime",
      billing_type: "one_time",
      lifetime: true,
      active: true,
      capabilities: ["vantare.edition.launch_v1", "vantare.channel.testers"],
      channels: ["stable", "testers"],
      launch_scope_version: "launch_v1",
      trial: { enabled: false },
    },
    pro_monthly: {
      polar_product_id: SANDBOX_IDS.proProduct,
      polar_price_ids: [SANDBOX_IDS.proPrice],
      plan_sku: "pro_monthly",
      billing_type: "subscription",
      lifetime: false,
      active: true,
      capabilities: ["vantare.plan.pro"],
      channels: ["stable"],
      launch_scope_version: null,
      trial: {
        enabled: true,
        interval: "day",
        interval_count: 7,
        provider_anti_abuse_confirmed: true,
      },
    },
    pro_plus_monthly: {
      polar_product_id: SANDBOX_IDS.proPlusProduct,
      polar_price_ids: [SANDBOX_IDS.proPlusPrice],
      plan_sku: "pro_plus_monthly",
      billing_type: "subscription",
      lifetime: false,
      active: true,
      capabilities: [
        "vantare.plan.pro",
        "vantare.channel.testers",
        "vantare.channel.nightly",
      ],
      channels: ["stable", "testers", "nightly"],
      launch_scope_version: null,
      trial: { enabled: false },
    },
  },
  product_id_to_checkout_key: {
    [SANDBOX_IDS.launchProduct]: "launch_lifetime",
    [SANDBOX_IDS.proProduct]: "pro_monthly",
    [SANDBOX_IDS.proPlusProduct]: "pro_plus_monthly",
  },
  price_id_to_checkout_key: {
    [SANDBOX_IDS.launchPrice]: "launch_lifetime",
    [SANDBOX_IDS.proPrice]: "pro_monthly",
    [SANDBOX_IDS.proPlusPrice]: "pro_plus_monthly",
  },
});
