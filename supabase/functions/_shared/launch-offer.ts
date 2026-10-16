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
  creatorCode: string | null;
  creatorDiscountId: string | null;
  trial: TrialConfig;
  fingerprint: string;
} | { ok: false; reason: string; status: number } {
  const window = table.launch_windows[map.environment];
  const plan = table.plans.find((plan) => plan.key === key);
  const active = !!plan &&
    now.getTime() >= Date.parse(window.starts_at) &&
    now.getTime() < Date.parse(window.ends_at);
  let creatorDiscountId: string | null = null;
  if (creatorCode) {
    const codes = key.endsWith("annual")
      ? map.creator_annual_discounts
      : map.creator_discounts;
    const id = codes && Object.hasOwn(codes, creatorCode)
      ? codes[creatorCode]
      : null;
    if (
      !plan || !/^[A-Za-z0-9]{3,32}$/.test(creatorCode) ||
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      return { ok: false, reason: "invalid_creator_code", status: 400 };
    }
    creatorDiscountId = id;
  }
  if (active && !config.polar_launch_discount_id) {
    return { ok: false, reason: "launch_discount_not_configured", status: 503 };
  }
  const discountId = active ? config.polar_launch_discount_id! : null;
  return {
    ok: true,
    discountId,
    creatorCode: creatorCode ?? null,
    creatorDiscountId,
    trial: active || creatorCode ? { enabled: false } : config.trial,
    fingerprint: `${discountId ? "launch:" + discountId : "standard"}:creator:${
      creatorCode ?? ""
    }:${creatorDiscountId ?? ""}`,
  };
}
