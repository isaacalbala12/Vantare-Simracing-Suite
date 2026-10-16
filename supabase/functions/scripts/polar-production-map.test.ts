import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import map from "./polar-production-map.json" with { type: "json" };
import prices from "./polar-launch-prices.json" with { type: "json" };
import { loadPolarProductMap } from "../_shared/mapping.ts";
import { prepareLaunchOffersSql } from "./prepare-launch-offers-sql.ts";
Deno.test("approved production configuration validates without network and feeds the canonical SQL registry", () => {
  const raw = JSON.stringify(map);
  const parsed = loadPolarProductMap(raw, { environment: "production" });
  assert(parsed.ok);
  const sql = prepareLaunchOffersSql(raw, "production");
  for (const plan of prices.plans) {
    const config =
      map.checkout_keys[plan.key as keyof typeof map.checkout_keys];
    assert("polar_launch_discount_id" in config);
    assert(sql.includes(config.polar_product_id));
    assert(sql.includes(config.polar_launch_discount_id));
    assert(sql.includes(prices.launch_windows.production.starts_at));
    assert(sql.includes(prices.launch_windows.production.ends_at));
  }
  assertEquals(map.checkout_keys.launch_lifetime.active, false);
  assertEquals(map.checkout_keys.founders.capabilities, [
    "vantare.plan.founders",
    "vantare.channel.nightly",
  ]);
  assertEquals(Object.keys(map.checkout_keys).length, 6);
});
