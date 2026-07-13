export const VALID_POLAR_PRODUCT_MAP_JSON = JSON.stringify({
  checkout_keys: {
    launch_lifetime: {
      polar_product_id: "00000000-0000-0000-0000-000000000001",
      entitlement_product_key: "bundle",
      plan_sku: "launch_lifetime",
      billing_type: "one_time",
      lifetime: true,
    },
    pro_monthly: {
      polar_product_id: "00000000-0000-0000-0000-000000000003",
      entitlement_product_key: "bundle",
      plan_sku: "pro_monthly",
      billing_type: "subscription",
      lifetime: false,
    },
  },
  product_id_to_checkout_key: {
    "00000000-0000-0000-0000-000000000001": "launch_lifetime",
    "00000000-0000-0000-0000-000000000003": "pro_monthly",
  },
});