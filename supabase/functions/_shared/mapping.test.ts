import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadPolarProductMap,
  resolveCheckoutKey,
  resolveCheckoutKeyByPriceId,
  resolveCheckoutKeyByProductId,
} from "./mapping.ts";
import {
  SANDBOX_ENVIRONMENT,
  VALID_POLAR_PRODUCT_MAP_JSON,
} from "./test-fixtures.ts";

function load(raw = VALID_POLAR_PRODUCT_MAP_JSON, trialConfirmed = false) {
  return loadPolarProductMap(raw, {
    environment: SANDBOX_ENVIRONMENT,
    trialAntiAbuseConfirmed: trialConfirmed,
  });
}

function mutate(
  change: (value: Record<string, unknown>) => void,
): string {
  const value = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON) as Record<
    string,
    unknown
  >;
  change(value);
  return JSON.stringify(value);
}

Deno.test("mapping v2: accepts exact sandbox contract", () => {
  const result = load();
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.map.schema_version, 2);
  assertEquals(result.map.environment, "sandbox");
  assertEquals(result.map.checkout_keys.launch_lifetime?.channels, [
    "stable",
    "testers",
  ]);
  assertEquals(result.map.checkout_keys.pro_monthly?.capabilities, [
    "vantare.plan.pro",
  ]);
});

Deno.test("mapping v2: rejects legacy schema", () => {
  const result = load(mutate((value) => value.schema_version = 1));
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "mapping_invalid_schema_version");
});

Deno.test("mapping v2: requires a declared runtime environment", () => {
  const result = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: null,
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "mapping_environment_missing");
});

Deno.test("mapping v2: fails closed across sandbox and production", () => {
  const result = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "production",
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "mapping_environment_mismatch");
});

Deno.test("mapping v2: requires Launch and Pro, but not an invented Pro Plus id", () => {
  const result = load();
  assertEquals(result.ok, true);
  if (!result.ok) return;
  const unavailable = resolveCheckoutKey(result.map, "pro_plus_monthly");
  assertEquals(unavailable.ok, false);
  if (!unavailable.ok) {
    assertEquals(unavailable.code, "mapping_checkout_unavailable");
  }
});

Deno.test("mapping v2: validates product inverse symmetry", () => {
  const result = load(mutate((value) => {
    const inverse = value.product_id_to_checkout_key as Record<string, string>;
    inverse["00000000-0000-0000-0000-000000000001"] = "pro_monthly";
  }));
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "mapping_product_id_mismatch");
});

Deno.test("mapping v2: rejects extra product inverse entries", () => {
  const result = load(mutate((value) => {
    const inverse = value.product_id_to_checkout_key as Record<string, string>;
    inverse["00000000-0000-0000-0000-000000000099"] = "pro_monthly";
  }));
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "mapping_product_id_mismatch");
});

Deno.test("mapping v2: validates price inverse symmetry", () => {
  const result = load(mutate((value) => {
    const inverse = value.price_id_to_checkout_key as Record<string, string>;
    inverse["00000000-0000-0000-0000-000000000004"] = "launch_lifetime";
  }));
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "mapping_price_id_mismatch");
});

Deno.test("mapping v2: rejects wrong capabilities, channels and Launch scope", () => {
  for (
    const field of ["capabilities", "channels", "launch_scope_version"] as const
  ) {
    const result = load(mutate((value) => {
      const keys = value.checkout_keys as Record<
        string,
        Record<string, unknown>
      >;
      keys.launch_lifetime[field] = field === "launch_scope_version"
        ? "latest"
        : ["stable"];
    }));
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.code, "mapping_invalid_key_meta");
  }
});

Deno.test("mapping v2: inactive catalog entries fail closed", () => {
  const result = load(mutate((value) => {
    const keys = value.checkout_keys as Record<string, Record<string, unknown>>;
    keys.pro_monthly.active = false;
  }));
  assertEquals(result.ok, true);
  if (!result.ok) return;
  const resolved = resolveCheckoutKey(result.map, "pro_monthly");
  assertEquals(resolved.ok, false);
  if (!resolved.ok) assertEquals(resolved.code, "mapping_checkout_unavailable");
});

Deno.test("mapping v2: seven-day trial requires explicit provider proof", () => {
  const raw = mutate((value) => {
    const keys = value.checkout_keys as Record<string, Record<string, unknown>>;
    keys.pro_monthly.trial = {
      enabled: true,
      interval: "day",
      interval_count: 7,
      provider_anti_abuse_confirmed: true,
    };
  });
  const rejected = load(raw);
  assertEquals(rejected.ok, false);
  if (!rejected.ok) assertEquals(rejected.code, "mapping_trial_unverified");
  assertEquals(load(raw, true).ok, true);
});

Deno.test("mapping v2: rejects a trial other than exactly seven days", () => {
  const result = load(
    mutate((value) => {
      const keys = value.checkout_keys as Record<
        string,
        Record<string, unknown>
      >;
      keys.pro_monthly.trial = {
        enabled: true,
        interval: "day",
        interval_count: 14,
        provider_anti_abuse_confirmed: true,
      };
    }),
    true,
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "mapping_invalid_key_meta");
});

Deno.test("mapping v2: resolves exact product and price ids", () => {
  const loaded = load();
  assertEquals(loaded.ok, true);
  if (!loaded.ok) return;
  assertEquals(
    resolveCheckoutKeyByProductId(
      loaded.map,
      "00000000-0000-0000-0000-000000000003",
    ).ok,
    true,
  );
  assertEquals(
    resolveCheckoutKeyByPriceId(
      loaded.map,
      "00000000-0000-0000-0000-000000000004",
    ).ok,
    true,
  );
  const unknown = resolveCheckoutKeyByPriceId(
    loaded.map,
    "00000000-0000-0000-0000-000000000099",
  );
  assertEquals(unknown.ok, false);
  if (!unknown.ok) assertEquals(unknown.code, "mapping_price_id_unknown");
});
