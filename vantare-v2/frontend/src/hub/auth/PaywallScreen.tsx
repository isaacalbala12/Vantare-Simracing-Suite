import { useCallback, useMemo, useState } from "react";
import {
  BILLING_PAYWALL_PLANS,
  FOUNDER_PLANS,
  PAYWALL_PLANS,
} from "./paywall-plans";
import type { BillingPlanKey } from "./paywall-plans";
import type { LicenseResult } from "../../lib/license-types";
import {
  buildSummary,
  PLAN_LABELS,
  PLAN_STATUS_LABELS,
} from "../../lib/plan";
import { useI18n } from "../../i18n/I18nProvider";
import {
  BILLING_ENABLED,
  createBillingCheckout,
  type BillingProductKey,
} from "../../lib/billing-client";
import { refreshCurrentUserEntitlements } from "../../lib/entitlements-refresh";

type PostCheckoutAccessState =
  | "idle"
  | "checking"
  | "success"
  | "pending"
  | "deviceLimit"
  | "error";

type PaywallScreenProps = {
  email: string;
  result?: LicenseResult | null;
  onContinueFree?: () => void;
};

const BILLING_PRODUCT_KEYS = new Set<BillingProductKey>([
  "launch_lifetime",
  "pro_monthly",
]);

function isBillingProductKey(key: string): key is BillingProductKey {
  return BILLING_PRODUCT_KEYS.has(key as BillingProductKey);
}

export function PaywallScreen({ email, result, onContinueFree }: PaywallScreenProps) {
  const { t } = useI18n();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState(false);
  const [checkoutOpened, setCheckoutOpened] = useState(false);

  const [accessCheckState, setAccessCheckState] =
    useState<PostCheckoutAccessState>("idle");

  const summary = useMemo(
    () =>
      buildSummary(result?.state ?? null, result?.entitlements ?? []),
    [result?.state, result?.entitlements],
  );

  const visiblePlans = useMemo(() => {
    if (BILLING_ENABLED) {
      return [PAYWALL_PLANS[0], ...BILLING_PAYWALL_PLANS];
    }
    return PAYWALL_PLANS;
  }, []);

  const handleSubscribe = useCallback(async (planKey: string) => {
    setCheckoutError(null);
    setComingSoon(false);
    setCheckoutOpened(false);
    setAccessCheckState("idle");

    if (!BILLING_ENABLED) {
      setComingSoon(true);
      return;
    }

    if (!isBillingProductKey(planKey)) {
      setComingSoon(true);
      return;
    }

    setPendingPlan(planKey);
    const checkout = await createBillingCheckout(planKey);
    setPendingPlan(null);

    if (!checkout.ok) {
      if (checkout.reason === "billing_not_available") {
        setComingSoon(true);
        return;
      }
      if (checkout.reason === "login_required") {
        setCheckoutError(t("paywall.loginRequired"));
        return;
      }
      setCheckoutError(t("paywall.checkoutError"));
      return;
    }

    setCheckoutOpened(true);
    setAccessCheckState("idle");
  }, [t]);

  const handleCheckAccess = useCallback(async () => {
    setAccessCheckState("checking");
    const refreshed = await refreshCurrentUserEntitlements();
    if (!refreshed.ok) {
      setAccessCheckState("error");
      return;
    }
    if (refreshed.unlocked) {
      setAccessCheckState("success");
      return;
    }
    if (
      refreshed.hasBundle &&
      refreshed.license.state === "device-limit"
    ) {
      setAccessCheckState("deviceLimit");
      return;
    }
    setAccessCheckState("pending");
  }, []);

  return (
    <div
      data-testid="paywall-screen"
      className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] p-4 text-white"
    >
      <h1 className="mb-2 font-mono text-sm uppercase tracking-widest">
        {t("paywall.title")}
      </h1>
      <p className="mb-2 font-mono text-[10px] text-vantare-textDim">
        {t("paywall.loggingIn")} <span className="text-white">{email}</span>
      </p>
      <p
        data-testid="paywall-status"
        className="font-mono text-[10px] uppercase tracking-widest text-vantare-textMuted"
      >
        {t("paywall.status")}: {PLAN_LABELS[summary.label]} ·{" "}
        {PLAN_STATUS_LABELS[summary.status]}
      </p>
      {summary.status === "free" ? (
        <p
          data-testid="paywall-free-note"
          className="mb-6 font-mono text-[10px] text-vantare-textDim"
        >
          {t("paywall.freeActive")}
        </p>
      ) : (
        <div className="mb-6" />
      )}
      {comingSoon && (
        <div data-testid="paywall-coming-soon" className="mb-6 rounded border border-white/10 bg-[#111] px-4 py-2 font-mono text-[10px] text-vantare-textDim">
          {t("paywall.comingSoon")}
        </div>
      )}
      {checkoutError && (
        <div data-testid="paywall-error" className="mb-6 rounded border border-vantare-red-500/20 bg-vantare-red-500/10 px-4 py-2 font-mono text-[10px] text-vantare-red-400">
          {checkoutError}{" "}
          <button
            onClick={() => setCheckoutError(null)}
            className="ml-2 underline hover:text-white"
          >
            {t("paywall.retry")}
          </button>
        </div>
      )}
      {pendingPlan && !checkoutError && (
        <div data-testid="paywall-loading" className="mb-6 rounded border border-white/10 bg-[#111] px-4 py-2 font-mono text-[10px] text-vantare-textDim">
          {t("paywall.redirecting")}
        </div>
      )}
      {BILLING_ENABLED && checkoutOpened && (
        <div
          data-testid="paywall-post-checkout"
          className="mb-6 w-full max-w-md rounded border border-vantare-red-500/30 bg-[#111] p-4"
        >
          <p className="font-mono text-[10px] text-white">
            {t("paywall.checkoutOpened")}
          </p>
          <p className="mt-1 font-mono text-[10px] text-vantare-textDim">
            {t("paywall.returnToVantare")}
          </p>

          {accessCheckState === "success" ? (
            <p
              data-testid="paywall-access-success"
              className="mt-3 font-mono text-[10px] text-vantare-success"
            >
              {t("paywall.accessActivated")}
            </p>
          ) : null}
          {accessCheckState === "deviceLimit" ? (
            <p
              data-testid="paywall-access-device-limit"
              className="mt-3 font-mono text-[10px] text-vantare-warning"
            >
              {t("license.deviceLimitMsg")}
            </p>
          ) : null}
          {accessCheckState === "pending" ? (
            <p
              data-testid="paywall-access-pending"
              className="mt-3 font-mono text-[10px] text-vantare-warning"
            >
              {t("paywall.paymentNotDetected")}
            </p>
          ) : null}
          {accessCheckState === "error" ? (
            <p
              data-testid="paywall-access-error"
              className="mt-3 font-mono text-[10px] text-vantare-red-400"
            >
              {t("paywall.refreshAccessError")}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="paywall-check-access"
            onClick={handleCheckAccess}
            disabled={accessCheckState === "checking"}
            className="mt-4 w-full rounded border border-white/20 py-2 font-mono text-[10px] uppercase hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {accessCheckState === "checking"
              ? t("paywall.checkingAccess")
              : t("paywall.checkAccess")}
          </button>
        </div>
      )}
      <div
        className={[
          "grid gap-4",
          BILLING_ENABLED ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4",
        ].join(" ")}
      >
        {visiblePlans.map((plan) => (
          <div
            key={plan.key}
            data-testid={`paywall-plan-${plan.key}`}
            className={[
              "w-64 rounded-lg border bg-[#111] p-4",
              plan.recommended
                ? "border-vantare-red-500"
                : "border-white/10",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase">{plan.name}</h2>
              {plan.recommended ? (
                <span className="font-mono text-[9px] uppercase text-vantare-red-400">
                  {t("paywall.recommended")}
                </span>
              ) : null}
            </div>
            <p className="font-mono text-[10px] text-vantare-textDim">
              {plan.price}
            </p>
            <ul className="my-3 space-y-1">
              {plan.features.map((f) => (
                <li
                  key={f}
                  className="font-mono text-[10px] text-vantare-textMuted"
                >
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                if (plan.key === "free" && summary.status === "free") {
                  onContinueFree?.();
                } else {
                  handleSubscribe(plan.key as BillingPlanKey | "free");
                }
              }}
              disabled={plan.key === "free" && summary.status !== "free"}
              className="w-full rounded border border-white/20 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {plan.key === "free"
                ? summary.status === "free"
                  ? t("paywall.continueFree")
                  : t("paywall.currentPlan")
                : t("paywall.subscribe")}
            </button>
          </div>
        ))}
      </div>
      {!BILLING_ENABLED ? (
        <details className="mt-8 w-full max-w-3xl text-vantare-textMuted">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest">
            {t("paywall.founderTiers")} (histórico)
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {FOUNDER_PLANS.map((plan) => (
              <div
                key={plan.key}
                className="rounded border border-white/10 bg-[#0d0d0d] p-3"
              >
                <h3 className="font-mono text-[11px] uppercase">{plan.name}</h3>
                <p className="font-mono text-[10px] text-vantare-textDim">
                  {plan.price}
                </p>
                <ul className="mt-2 space-y-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="font-mono text-[10px] text-vantare-textDim"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}