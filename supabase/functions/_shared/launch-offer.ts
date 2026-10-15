import table from "../scripts/polar-launch-prices.json" with { type: "json" };
import type {
  CheckoutKey,
  CheckoutKeyConfig,
  PolarProductMap,
  TrialConfig,
} from "./mapping.ts";
export function selectCheckoutOffer(
  map: PolarProductMap,
  key: CheckoutKey,
  config: CheckoutKeyConfig,
  now: Date,
  creatorCode?: string,
): {
  ok: true;
  discountId: string | null;
  trial: TrialConfig;
  fingerprint: string;
} | { ok: false; reason: string; status: number } {
  const window = table.launch_windows[map.environment];
  const plan = table.plans.find((plan) => plan.key === key);
  const active = !!plan &&
    now.getTime() >= Date.parse(window.starts_at) &&
    now.getTime() < Date.parse(window.ends_at);
  if (active) {
    if (creatorCode) {
      return {
        ok: false,
        reason: "launch_creator_not_combinable",
        status: 409,
      };
    }
    if (!config.polar_launch_discount_id) {
      return {
        ok: false,
        reason: "launch_discount_not_configured",
        status: 503,
      };
    }
    return {
      ok: true,
      discountId: config.polar_launch_discount_id,
      trial: { enabled: false },
      fingerprint: "launch:" + config.polar_launch_discount_id,
    };
  }
  if (creatorCode) {
    if (!plan || !/^[A-Za-z0-9]{3,32}$/.test(creatorCode)) {
      return { ok: false, reason: "invalid_creator_code", status: 400 };
    }
    const codes = map.creator_discounts;
    const id = codes && Object.hasOwn(codes, creatorCode)
      ? codes[creatorCode]
      : null;
    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) return { ok: false, reason: "invalid_creator_code", status: 400 };
    return {
      ok: true,
      discountId: id,
      trial: { enabled: false },
      fingerprint: "creator:" + id,
    };
  }
  return {
    ok: true,
    discountId: null,
    trial: config.trial,
    fingerprint: "standard",
  };
}
