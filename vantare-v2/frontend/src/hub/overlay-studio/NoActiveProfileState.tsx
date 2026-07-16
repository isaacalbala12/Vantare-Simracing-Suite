import { useI18n } from "../../i18n/I18nProvider";

export type NoActiveProfileStateProps = {
  onCreateProfile: () => void;
  onSelectProfile: () => void;
  onOpenRecommended: () => void;
};

export function NoActiveProfileState(props: NoActiveProfileStateProps): React.ReactElement {
  const { onCreateProfile, onSelectProfile, onOpenRecommended } = props;
  const { t } = useI18n();

  return (
    <div
      data-testid="no-active-profile-state"
      className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[720px] flex-col items-center justify-center gap-6 px-6 py-12 text-center"
    >
      <div>
        <h1 className="text-2xl font-semibold text-white">{t("studio.v3.empty.title")}</h1>
        <p className="mt-2 text-sm text-vantare-textMuted">
          {t("studio.v3.empty.description")}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          className="rounded-lg bg-vantare-red-600 px-4 py-2 text-sm font-semibold text-white"
          onClick={onCreateProfile}
        >
          {t("studio.v3.empty.createProfile")}
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white"
          onClick={onSelectProfile}
        >
          {t("studio.v3.empty.selectProfile")}
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white"
          onClick={onOpenRecommended}
        >
          {t("studio.v3.empty.viewRecommended")}
        </button>
      </div>
    </div>
  );
}
