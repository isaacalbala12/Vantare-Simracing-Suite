import { useCallback, useMemo, useState } from "react";
import { signOut } from "../../lib/supabase-auth";
import { useLicense } from "../../lib/license";
import {
  buildSummary,
  PLAN_LABELS,
  PLAN_STATUS_LABELS,
  sortedEntitlements,
} from "../../lib/plan";
import { useI18n } from "../../i18n/I18nProvider";
import { BILLING_ENABLED, openBillingPortal } from "../../lib/billing-client";
import {
  isPremiumUnlocked,
  refreshCurrentUserEntitlements,
  resetActiveDevice,
  type DeviceResetReason,
  type EntitlementRefreshReason,
} from "../../lib/entitlements-refresh";
import type { LicenseResult } from "../../lib/license-types";
import { LicenseDiagnosticsPanel } from "./LicenseDiagnosticsPanel";

type LicenseRefreshFeedback =
  | "idle"
  | "checking"
  | "active"
  | "noPremium"
  | "deviceLimit"
  | "error";

type DeviceResetFeedback = "idle" | "resetting" | "success" | "error";

function formatLicenseRefreshSuccess(
  license: LicenseResult,
  t: (key: string) => string,
): string {
  const summary = buildSummary(license.state, license.entitlements);
  if (license.state === "grace" && license.graceEndsAt) {
    return t("account.licenseMonthlyUntil").replace(
      "{date}",
      new Date(license.graceEndsAt).toLocaleString(),
    );
  }
  if (summary.label === "suite") {
    return t("account.licenseLifetimeActive");
  }
  return t("account.accessActivated");
}

function refreshFailureDetail(reason: EntitlementRefreshReason): string {
  switch (reason) {
    case "login_required":
      return "Motivo: no hay sesión Supabase en el WebView. Cierra sesión e inicia de nuevo.";
    case "timeout":
      return "Motivo: timeout — el backend Go no respondió con license:changed.";
    case "validation_error":
      return "Motivo: license:error desde Go o Supabase.";
  }
}

function resetFailureDetail(reason: DeviceResetReason): string {
  switch (reason) {
    case "login_required":
      return "Motivo: no hay sesión Supabase en el WebView.";
    case "rate_limit":
      return "Motivo: límite de 1 reset cada 24 h.";
    case "error":
      return "Motivo: timeout o license:error tras license:reset-device.";
  }
}

const STATUS_TONE: Record<string, string> = {
  active: "text-vantare-success",
  grace: "text-vantare-warning",
  blocked: "text-vantare-red-400",
  free: "text-vantare-textDim",
  anonymous: "text-vantare-textDim",
};

export function AccountSettings() {
  const { t } = useI18n();
  const { result, clearLicense } = useLicense();
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [licenseRefreshState, setLicenseRefreshState] =
    useState<LicenseRefreshFeedback>("idle");
  const [licenseRefreshNote, setLicenseRefreshNote] = useState<string | null>(
    null,
  );
  const [deviceResetState, setDeviceResetState] =
    useState<DeviceResetFeedback>("idle");
  const [deviceResetError, setDeviceResetError] = useState<string | null>(null);
  const [refreshFailureReason, setRefreshFailureReason] = useState<
    EntitlementRefreshReason | null
  >(null);
  const [resetFailureReason, setResetFailureReason] =
    useState<DeviceResetReason | null>(null);

  const handleLogout = useCallback(async () => {
    await signOut();
    clearLicense();
  }, [clearLicense]);

  const handleResetDevice = useCallback(async () => {
    setDeviceResetError(null);
    setResetFailureReason(null);
    setDeviceResetState("resetting");
    const reset = await resetActiveDevice();
    if (!reset.ok) {
      setDeviceResetState("error");
      setResetFailureReason(reset.reason);
      if (reset.reason === "login_required") {
        setDeviceResetError(t("account.resetLoginRequired"));
        return;
      }
      if (reset.reason === "rate_limit") {
        setDeviceResetError(t("account.resetRateLimit"));
        return;
      }
      setDeviceResetError(t("account.resetError"));
      return;
    }
    setDeviceResetState("success");
    setLicenseRefreshState("checking");
    setLicenseRefreshNote(null);
    const refreshed = await refreshCurrentUserEntitlements();
    if (!refreshed.ok) {
      setLicenseRefreshState("error");
      setRefreshFailureReason(refreshed.reason);
      return;
    }
    setRefreshFailureReason(null);
    if (isPremiumUnlocked(refreshed.license)) {
      setLicenseRefreshNote(formatLicenseRefreshSuccess(refreshed.license, t));
      setLicenseRefreshState("active");
      return;
    }
    if (
      refreshed.hasBundle &&
      refreshed.license.state === "device-limit"
    ) {
      setLicenseRefreshState("deviceLimit");
      return;
    }
    setLicenseRefreshState("noPremium");
  }, [t]);

  const handleRefreshLicense = useCallback(async () => {
    setLicenseRefreshState("checking");
    setLicenseRefreshNote(null);
    setRefreshFailureReason(null);
    const refreshed = await refreshCurrentUserEntitlements();
    if (!refreshed.ok) {
      setLicenseRefreshState("error");
      setRefreshFailureReason(refreshed.reason);
      return;
    }
    if (isPremiumUnlocked(refreshed.license)) {
      setLicenseRefreshNote(formatLicenseRefreshSuccess(refreshed.license, t));
      setLicenseRefreshState("active");
      return;
    }
    if (
      refreshed.hasBundle &&
      refreshed.license.state === "device-limit"
    ) {
      setLicenseRefreshState("deviceLimit");
      return;
    }
    setLicenseRefreshState("noPremium");
  }, [t]);

  const handleManageBilling = useCallback(async () => {
    setPortalError(null);
    setPortalLoading(true);
    const portal = await openBillingPortal();
    setPortalLoading(false);

    if (!portal.ok) {
      if (portal.reason === "billing_not_available") return;
      if (portal.reason === "login_required") {
        setPortalError(t("paywall.loginRequired"));
        return;
      }
      if (portal.reason === "billing_customer_not_found") {
        setPortalError(t("account.portalNoCustomer"));
        return;
      }
      setPortalError(t("account.portalOpenError"));
      return;
    }
  }, [t]);

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
      {licenseRefreshState === "active" && licenseRefreshNote ? (
        <p
          data-testid="account-license-refresh-active"
          className="font-mono text-[10px] text-vantare-success"
        >
          {licenseRefreshNote}
        </p>
      ) : null}
      {licenseRefreshState === "deviceLimit" ? (
        <p
          data-testid="account-license-refresh-device-limit"
          className="font-mono text-[10px] text-vantare-warning"
        >
          {t("license.deviceLimitMsg")}
        </p>
      ) : null}
      {licenseRefreshState === "noPremium" ? (
        <p
          data-testid="account-license-refresh-none"
          className="font-mono text-[10px] text-vantare-textDim"
        >
          {t("account.noPremiumAccess")}
        </p>
      ) : null}
      {licenseRefreshState === "error" ? (
        <div data-testid="account-license-refresh-error">
          <p className="font-mono text-[10px] text-vantare-red-400">
            {t("account.refreshAccessError")}
          </p>
          {refreshFailureReason ? (
            <p className="mt-1 font-mono text-[10px] text-vantare-textDim">
              {refreshFailureDetail(refreshFailureReason)}
            </p>
          ) : null}
        </div>
      ) : null}
      {deviceResetState === "success" ? (
        <p
          data-testid="account-reset-success"
          className="font-mono text-[10px] text-vantare-success"
        >
          {t("account.resetSuccess")}
        </p>
      ) : null}
      {deviceResetError ? (
        <div data-testid="account-reset-error">
          <p className="font-mono text-[10px] text-vantare-red-400">
            {deviceResetError}
          </p>
          {resetFailureReason ? (
            <p className="mt-1 font-mono text-[10px] text-vantare-textDim">
              {resetFailureDetail(resetFailureReason)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="account-refresh-license"
          onClick={handleRefreshLicense}
          disabled={licenseRefreshState === "checking"}
          className="rounded border border-white/20 px-3 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5 disabled:opacity-50"
        >
          {licenseRefreshState === "checking"
            ? t("paywall.checkingAccess")
            : t("account.refreshLicense")}
        </button>
        {BILLING_ENABLED ? (
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="rounded border border-white/20 px-3 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5 disabled:opacity-50"
          >
            {t("account.manageBilling")}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="account-reset-device"
          onClick={handleResetDevice}
          disabled={deviceResetState === "resetting"}
          className="rounded border border-red-500/30 hover:bg-red-500/10 px-3 py-1.5 font-mono text-[10px] uppercase text-red-400 disabled:opacity-50"
        >
          {deviceResetState === "resetting"
            ? t("account.resettingDevice")
            : t("account.resetDevice")}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded border border-white/20 px-3 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5"
        >
          {t("account.logout")}
        </button>
      </div>
      <LicenseDiagnosticsPanel license={result} />
    </section>
  );
}