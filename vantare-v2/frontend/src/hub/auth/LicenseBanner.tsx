import { useLicense } from "../../lib/license";
import { useI18n } from "../../i18n/I18nProvider";

type BannerMessage = {
  state: "grace" | "expired" | "device-limit";
  text: string;
};

function getMessage(
  t: (key: string) => string,
  state: BannerMessage["state"] | "active" | "anonymous" | "authenticated-no-entitlement" | "unconfigured",
  graceEndsAt?: string,
): BannerMessage | null {
  if (state === "grace") {
    return {
      state,
      text: graceEndsAt
        ? t("license.graceCountdown").replace("{date}", new Date(graceEndsAt).toLocaleString())
        : t("license.graceNoDate"),
    };
  }
  if (state === "expired") {
    return { state, text: t("license.expiredMsg") };
  }
  if (state === "device-limit") {
    return { state, text: t("license.deviceLimitMsg") };
  }
  return null;
}

export function LicenseBanner() {
  const { result, loading } = useLicense();
  const { t } = useI18n();
  if (loading || !result) return null;
  if (result.state === "active") return null;
  if (result.state === "anonymous") return null;

  const msg = getMessage(t, result.state, result.graceEndsAt);
  if (!msg) return null;

  return (
    <div
      data-testid="license-banner"
      role="status"
      className="border-b border-vantare-red-500/20 bg-vantare-red-500/10 px-4 py-2 text-center"
    >
      <p className="font-mono text-[10px] uppercase text-vantare-red-400">
        {msg.text}
      </p>
    </div>
  );
}
