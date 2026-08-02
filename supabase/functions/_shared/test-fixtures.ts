export const SANDBOX_ENVIRONMENT = "sandbox";

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
