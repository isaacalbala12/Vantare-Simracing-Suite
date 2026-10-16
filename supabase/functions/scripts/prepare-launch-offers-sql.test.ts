import {
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import { prepareLaunchOffersSql } from "./prepare-launch-offers-sql.ts";
function fixture() {
  const map = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
  map.checkout_keys.pro_monthly.polar_launch_discount_id =
    "1593eeee-0000-4000-8000-000000000011";
  return map;
}
Deno.test("P3-D operator projection uses the canonical window and binds UUIDs without network or overwrite", () => {
  const map = fixture();
  const sql = prepareLaunchOffersSql(JSON.stringify(map), "sandbox");
  assertStringIncludes(sql, "2026-10-26T18:00:00Z");
  assertStringIncludes(sql, "2026-11-26T18:00:00Z");
  assertStringIncludes(sql, "vanta-83-creator-renewals-v4");
  assertStringIncludes(
    sql,
    "'pro_monthly','00000000-0000-0000-0000-000000000003','1593eeee-0000-4000-8000-000000000011'",
  );
  assertStringIncludes(sql, "on conflict(environment,checkout_key) do nothing");
  assertStringIncludes(sql, "launch_offer_registry_drift");
  assertStringIncludes(
    sql,
    "select environment,checkout_key,product_id,discount_id,starts_at,ends_at,catalog_version,registered_at",
  );
  assertStringIncludes(sql, "order by checkout_key;");
  assertEquals(sql.includes("update set"), false);
  assertEquals(sql, prepareLaunchOffersSql(JSON.stringify(map), "sandbox"));
});
Deno.test("P3-D invalid, missing, zero and creator coupons cannot enter the SQL registry", () => {
  for (
    const discount of [
      undefined,
      "bad",
      "00000000-0000-0000-0000-000000000000",
      "00000000-0000-0000-0000-000000000003",
    ]
  ) {
    const map = fixture();
    map.checkout_keys.pro_monthly.polar_launch_discount_id = discount;
    assertThrows(() => prepareLaunchOffersSql(JSON.stringify(map), "sandbox"));
  }
  const map = fixture();
  map.creator_discounts = {
    ISAAC: map.checkout_keys.pro_monthly.polar_launch_discount_id,
  };
  assertThrows(() => prepareLaunchOffersSql(JSON.stringify(map), "sandbox"));
  assertThrows(() =>
    prepareLaunchOffersSql(JSON.stringify(fixture()), "production")
  );
  assertThrows(() => prepareLaunchOffersSql("{}", "sandbox"));
});
