import { useI18n } from "../../i18n/I18nProvider";

// UnconfiguredScreen is shown when the backend reports StateUnconfigured:
// the release build is missing the Supabase URL/anon key, so license
// validation cannot run. This is a configuration error, not a paywall
// block. The screen tells the user what happened and offers a retry.
export function UnconfiguredScreen() {
  const { t } = useI18n();
  return (
    <div
      data-testid="unconfigured-screen"
      className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] p-4 text-white"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg border border-white/10 bg-[#111] p-6 text-center">
        <h1 className="font-mono text-sm uppercase tracking-widest">
          {t("license.unconfiguredTitle")}
        </h1>
        <p className="font-mono text-[10px] text-vantare-textDim">
          {t("license.unconfiguredDesc1")}
        </p>
        <p className="font-mono text-[10px] text-vantare-textDim">
          {t("license.unconfiguredDesc2")}
        </p>
        <button
          type="button"
          data-testid="unconfigured-retry"
          onClick={() => window.location.reload()}
          className="w-full rounded border border-white/20 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-white/5"
        >
          {t("paywall.retry")}
        </button>
      </div>
    </div>
  );
}
