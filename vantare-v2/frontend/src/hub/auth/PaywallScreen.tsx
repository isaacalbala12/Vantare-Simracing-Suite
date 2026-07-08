import { useCallback, useMemo, useState } from "react";
import { FOUNDER_PLANS, PAYWALL_PLANS } from "./paywall-plans";
import type { LicenseResult } from "../../lib/license-types";
import {
  buildSummary,
  PLAN_LABELS,
  PLAN_STATUS_LABELS,
} from "../../lib/plan";
import { useI18n } from "../../i18n/I18nProvider";
import { Browser } from "@wailsio/runtime";

type PaywallScreenProps = {
  email: string;
  result?: LicenseResult | null;
  onContinueFree?: () => void;
};

// PaywallScreen se muestra cuando el usuario está autenticado pero no tiene
// entitlements (o los perdió). La beta pública aún no expone Stripe Checkout
// embebido: el botón "Suscribirse" deja el flujo a la URL externa del portal
// cuando esté disponible; mientras tanto muestra un aviso claro.
export function PaywallScreen({ email, result, onContinueFree }: PaywallScreenProps) {
  const { t } = useI18n();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const summary = useMemo(
    () =>
      buildSummary(result?.state ?? null, result?.entitlements ?? []),
    [result?.state, result?.entitlements],
  );

  const handleSubscribe = useCallback(async (planKey: string) => {
    setPendingPlan(planKey);
    setCheckoutError(null);
    try {
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
      const efUrl = `${supabaseUrl}/functions/v1/create-checkout-session`;
      const res = await fetch(efUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceKey: planKey,
          userId: result?.userId ?? "",
          email,
          successUrl: "http://127.0.0.1:39261/checkout/callback",
          cancelUrl: "http://127.0.0.1:39261/checkout/callback",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCheckoutError(err.error ?? t("auth.serverError"));
        return;
      }
      const data = await res.json();
      if (data.url) {
        setPendingPlan(null);
        await Browser.OpenURL(data.url);
      }
    } catch {
      setCheckoutError(t("auth.serverError"));
    }
  }, [email, result?.userId, t]);

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PAYWALL_PLANS.map((plan) => (
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
                  handleSubscribe(plan.key);
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
    </div>
  );
}
