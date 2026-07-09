import { useCallback, useMemo, useState } from "react";
import { signOut, getSession } from "../../lib/supabase-auth";
import { useLicense } from "../../lib/license";
import { Events, Browser } from "@wailsio/runtime";
import {
  buildSummary,
  PLAN_LABELS,
  PLAN_STATUS_LABELS,
  sortedEntitlements,
} from "../../lib/plan";
import { useI18n } from "../../i18n/I18nProvider";
import { BILLING_ENABLED, openCustomerPortal } from "../../lib/billing-client";

const STATUS_TONE: Record<string, string> = {
  active: "text-vantare-success",
  grace: "text-vantare-warning",
  blocked: "text-vantare-red-400",
  free: "text-vantare-textDim",
  anonymous: "text-vantare-textDim",
};

export function AccountSettings() {
  const { t } = useI18n();
  const { result, refresh } = useLicense();
  const [portalError, setPortalError] = useState<string | null>(null);

  const handleLogout = useCallback(async () => {
    await signOut();
    refresh();
  }, [refresh]);

  const handleResetDevice = useCallback(async () => {
    try {
      const session = await getSession();
      const token = session?.access_token ?? "";
      Events.Emit("license:reset-device", { sessionToken: token });
    } catch (err) {
      console.error("Error retrieving session for reset-device:", err);
    }
  }, []);

  const handleManageSubscription = useCallback(async () => {
    setPortalError(null);
    const customerId = result?.providerCustomerId ?? "";
    const portal = await openCustomerPortal({ providerCustomerId: customerId });
    if (!portal.ok) {
      if (portal.reason === "billing_not_available") return;
      setPortalError(t("account.portalError"));
      return;
    }
    await Browser.OpenURL(portal.url);
  }, [result?.providerCustomerId, t]);

  const summary = useMemo(
    () =>
      buildSummary(result?.state ?? null, result?.entitlements ?? []),
    [result?.state, result?.entitlements],
  );

  const entitlements = useMemo(
    () => sortedEntitlements(result?.entitlements ?? []),
    [result?.entitlements],
  );

  const statusLabel = PLAN_STATUS_LABELS[summary.status];
  const statusTone = STATUS_TONE[summary.status] ?? "text-vantare-textDim";

  return (
    <section className="space-y-4 text-white" aria-label="account-settings">
      <h2 className="font-mono text-xs uppercase tracking-widest">{t("account.title")}</h2>
      <div className="rounded border border-white/10 bg-[#111] p-3">
        <p className="font-mono text-[10px] text-vantare-textDim">{t("account.email")}</p>
        <p className="font-mono text-xs">{result?.email ?? "—"}</p>
      </div>
      <div className="rounded border border-white/10 bg-[#111] p-3">
        <p className="font-mono text-[10px] text-vantare-textDim">{t("account.plan")}</p>
        <p
          data-testid="account-plan"
          className="font-mono text-xs uppercase"
        >
          {PLAN_LABELS[summary.label]}
        </p>
      </div>
      <div className="rounded border border-white/10 bg-[#111] p-3">
        <p className="font-mono text-[10px] text-vantare-textDim">{t("account.status")}</p>
        <p
          data-testid="account-status"
          className={`font-mono text-xs uppercase ${statusTone}`}
        >
          {statusLabel}
        </p>
        {summary.status === "grace" && result?.graceEndsAt ? (
          <p className="mt-1 font-mono text-[10px] text-vantare-warning">
            {t("account.graceUntil")} {new Date(result.graceEndsAt).toLocaleString()}
          </p>
        ) : null}
        {summary.status === "blocked" ? (
          <p className="mt-1 font-mono text-[10px] text-vantare-red-400">
            {t("account.blockedHint")}
          </p>
        ) : null}
        {result?.error ? (
          <p className="mt-1 font-mono text-[10px] text-vantare-textDim">
            {t("account.lastError")}: {result.error}
          </p>
        ) : null}
      </div>
      <div className="rounded border border-white/10 bg-[#111] p-3">
        <p className="font-mono text-[10px] text-vantare-textDim">
          {t("account.entitlements")}
        </p>
        {entitlements.length > 0 ? (
          <ul className="space-y-1">
            {entitlements.map((e) => (
              <li
                key={e}
                className="font-mono text-xs uppercase"
                data-testid={`account-entitlement-${e}`}
              >
                {e}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono text-xs text-vantare-textDim">—</p>
        )}
      </div>
      {portalError && (
        <p className="font-mono text-[10px] text-vantare-red-400">{portalError}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {BILLING_ENABLED && result?.providerCustomerId ? (
          <button
            type="button"
            onClick={handleManageSubscription}
            className="rounded border border-white/20 px-3 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5"
          >
            {t("account.manageSubscription")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleResetDevice}
          className="rounded border border-red-500/30 hover:bg-red-500/10 px-3 py-1.5 font-mono text-[10px] uppercase text-red-400"
        >
          {t("account.resetDevice")}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded border border-white/20 px-3 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5"
        >
          {t("account.logout")}
        </button>
      </div>
    </section>
  );
}
